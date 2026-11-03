import React,{useEffect,useRef,useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import type {PersonMatte} from '../src/person-matte.mjs';
import {matteSceneSnapshot,validateMatteBinding,type MatteSceneSnapshot} from './matte-binding.mjs';

type MatteJob={id?:string;status:string;progress?:number;label?:string;error?:string;
 result?:{personMatte:PersonMatte&{src?:string;sourceSha256?:string;width?:number;height?:number;endMs?:number}}};
async function read(response:Response){const data=await response.json();if(!response.ok)throw Error(data.error??'人物分层未完成');return data;}

export function MatteTools({scene,onBind}:{scene:StoryScene;onBind:(matte:PersonMatte)=>void}){
 const [job,setJob]=useState<MatteJob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[bound,setBound]=useState(false);
 const latest=useRef(scene),bind=useRef(onBind),alive=useRef(true),token=useRef(0),jobId=useRef<string|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),request=useRef<AbortController|null>(null);
 const sceneKey=JSON.stringify(matteSceneSnapshot(scene)),scope=useRef(sceneKey);
 latest.current=scene;bind.current=onBind;
 const current=(generation:number)=>alive.current&&generation===token.current;
 const stopWaiting=()=>{request.current?.abort();if(timer.current)clearTimeout(timer.current);timer.current=null;};
 const stopRemote=async(id:string)=>{
  const reply=await read(await fetch(`/api/person-matte/${encodeURIComponent(id)}/cancel`,{method:'POST'}));
  if(!['cancelled','done','error'].includes(reply.status))throw Error('后台没有确认取消。');
  return reply;
 };
 const cancelledLabel=(status:string)=>status==='cancelled'?'后台任务已取消，未应用新的分层。':status==='done'?'后台已完成，本次未应用新的分层。':'后台任务已结束，未应用新的分层。';
 const cancelKnown=async(id:string,generation:number)=>{
  try{
   const reply=await stopRemote(id);if(!current(generation))return;
   if(jobId.current===id)jobId.current=null;
   setJob({status:'cancelled',label:cancelledLabel(reply.status)});
  }catch(e){if(current(generation)){jobId.current=id;setError('后台取消未确认，可重试取消：'+(e instanceof Error?e.message:String(e)));}}
 };
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;token.current++;stopWaiting();if(jobId.current)void stopRemote(jobId.current).catch(()=>undefined);};},[]);
 useEffect(()=>{
  if(scope.current===sceneKey)return;
  scope.current=sceneKey;const generation=++token.current;stopWaiting();request.current=null;
  setBusy(false);setBound(false);setError('');
  const id=jobId.current;
  setJob(id?{status:'stopping',label:'场景原片或时间已改变，正在取消上一段任务。'}:null);
  if(id)void cancelKnown(id,generation);
 },[sceneKey]);
 const poll=async(id:string,generation:number,original:MatteSceneSnapshot,signal:AbortSignal)=>{
  try{
   const next:MatteJob=await read(await fetch(`/api/person-matte/${encodeURIComponent(id)}`,{signal}));
   if(!current(generation))return;
   if(next.id!==id)throw Error('服务返回了不同的人物分层任务，未绑定。');
   if(next.status==='done'){
    jobId.current=null;setBusy(false);
    const validation=validateMatteBinding(next.result?.personMatte,original,matteSceneSnapshot(latest.current));
    if(!validation.ok){setJob({...next,label:'分层已生成，但未绑定当前场景。'});setError(validation.error);return;}
    try{bind.current(validation.matte);}catch(e){setJob({...next,label:'分层已生成，但未绑定当前场景。'});throw e;}
    setBound(true);setJob({...next,label:'分层已生成并绑定，请预览检查头发、眼镜和手部边缘。'});return;
   }
   setJob(next);
   if(['error','cancelled'].includes(next.status)){jobId.current=null;setBusy(false);if(next.status==='error')setError(next.error??next.label??'本机人物分层未完成。');return;}
   timer.current=setTimeout(()=>void poll(id,generation,original,signal),1200);
  }catch(e){if(current(generation)&&!signal.aborted){setBusy(false);setError(e instanceof Error?e.message:String(e));}}
 };
 const start=async()=>{
  if(jobId.current){setError('请先取消上一段后台任务，再开始生成。');return;}
  const original=matteSceneSnapshot(latest.current),generation=++token.current;
  setError('');setJob(null);setBound(false);setBusy(true);
  const controller=new AbortController();request.current=controller;
  try{
   const created=await read(await fetch('/api/person-matte/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src:original.src,startMs:original.startMs,endMs:original.endMs,fps:30})}));
   if(typeof created.jobId!=='string')throw Error('服务没有返回人物分层任务编号。');
   if(!current(generation)){
    const cancellationGeneration=token.current;
    // Keep the receipt for a POST that finished after cancel/unmount. Its
    // cancellation may report only while this same request still owns the UI.
    if(alive.current&&request.current===controller){jobId.current=created.jobId;await cancelKnown(created.jobId,cancellationGeneration);}
    else void stopRemote(created.jobId).catch(()=>undefined);
    return;
   }
   jobId.current=created.jobId;await poll(created.jobId,generation,original,controller.signal);
  }catch(e){if(current(generation)){setBusy(false);setError(e instanceof Error?e.message:String(e));}}
 };
 const cancel=async()=>{
  const generation=++token.current;stopWaiting();setBusy(false);setBound(false);setError('');const id=jobId.current;
  setJob({status:'stopping',label:id?'已停止等待，正在取消后台任务。':'已停止等待，任务编号返回后将取消后台任务。'});
  if(id)await cancelKnown(id,generation);
 };
 const duration=(scene.endMs-scene.startMs)/1000,canGenerate=!!scene.src&&duration>0&&duration<=10;
 return <section aria-label={`人物分层 ${scene.id}`} className="my-3 p-3 rounded border border-outline-variant/40">
  <strong>人物与背景文字分层</strong>
  <p className="muted">从本段真人原片提取透明人物层，让背景大字被头肩遮挡。保留真实面容与动作，原声不变。</p>
  <button type="button" disabled={busy||!!jobId.current||!canGenerate} onClick={()=>void start()}>{busy?'本机分层中…':scene.personMatte?'重新生成人物分层':'生成本段人物分层'}</button>
  {(busy||!!jobId.current)&&<button type="button" onClick={()=>void cancel()}>{error&&jobId.current?'重试取消后台任务':'取消分层'}</button>}
  {!canGenerate&&<p role="status">请选择不超过 10 秒的原片场景生成人物分层。</p>}
  {job&&<p role="status">{job.status==='done'&&!bound?'分层已生成，但未绑定当前场景。':job.label??job.status}{busy&&typeof job.progress==='number'?` ${Math.round(job.progress*100)}%`:''}</p>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
