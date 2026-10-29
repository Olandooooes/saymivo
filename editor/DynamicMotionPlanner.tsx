import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {useEditor} from './store';
import {dynamicEditorAssetSources,fetchDynamicEditorAssets,type EditorAssetIdentity} from './dynamic-editor-model.mjs';
import {generateDynamicMotionPlan,updateDynamicMotionPlanSelection,dynamicMotionEditorRequest,type DynamicMotionPlan,type DynamicMotionPlanRow,type DynamicMotionPlanningOptions,type DynamicMotionPlanEvidence} from '../src/dynamic-motion-planner.mjs';
import {motionPlanSignature} from '../src/motion-planner.mjs';
import {dynamicMotionLibrary,type DynamicLibraryIdentity} from '../src/dynamic-motion-library.mjs';
import type {StoryScene} from '../src/storyboard.mjs';

type AssetError={src:string;message:string};
type IdentityRead={assets:EditorAssetIdentity[];errors:AssetError[];total:number};
type PlanState={plan:DynamicMotionPlan;options:DynamicMotionPlanningOptions;projectId:string|null;stateSignature:string;errors:AssetError[];totalAssets:number;readAssets:number};
type Pending={id:number;kind:'generate'|'preview';controller:AbortController};
const seconds=(ms:number)=>(ms/1000).toFixed(2);
const unique=(items:string[])=>[...new Set(items)];
const identity=(asset:DynamicLibraryIdentity):DynamicLibraryIdentity=>({src:asset.src,sha256:asset.sha256,width:asset.width,height:asset.height,kind:asset.kind,...(asset.durationSec===undefined?{}:{durationSec:asset.durationSec})});
const identityKey=(assets:DynamicLibraryIdentity[])=>JSON.stringify(assets.map(identity).sort((a,b)=>a.src.localeCompare(b.src)));
const candidateName=(row:DynamicMotionPlanRow,id:string|null)=>id==='keep'||!id?'保留当前编排':row.candidates.find(c=>c.entryId===id)?.name??'未选择';

/** Request cache is scoped to ONE read. Regenerating revalidates files, while
 * repeated sources across scenes share one local request and cloned responses. */
export async function loadDynamicPlanIdentities(scenes:StoryScene[],{fetcher=fetch,signal}:{fetcher?:typeof fetch;signal?:AbortSignal}={}):Promise<IdentityRead>{
 signal?.throwIfAborted();
 const requests=new Map<string,Promise<Response>>();
 const cached:typeof fetch=async(input,init)=>{
  const url=String(input);
  if(!url.startsWith('/api/dynamic-asset?'))throw Error('仅允许读取本地素材身份接口。');
  if(!requests.has(url))requests.set(url,fetcher(input,{...init,signal,cache:'no-store'}));
  return (await requests.get(url)!).clone();
 };
 const results=await Promise.all(scenes.map(scene=>fetchDynamicEditorAssets(scene,{fetcher:cached,signal})));
 signal?.throwIfAborted();
 const assets=new Map<string,EditorAssetIdentity>(),errors=new Map<string,AssetError>();
 for(const result of results){for(const asset of result.assets)assets.set(asset.src,asset);for(const error of result.errors)errors.set(error.src+'\n'+error.message,error);}
 return {assets:[...assets.values()],errors:[...errors.values()],total:new Set(scenes.flatMap(dynamicEditorAssetSources)).size};
}

const requiredNames:Record<string,string>={sourceIdentity:'当前原片身份与实际尺寸',assetIdentity:'当前资料身份与实际尺寸',sourceScene:'完整的原片场景',safeTextRect:'文字与人物安全区域','scene.window':'人物位置与移动路径','scene.durationMs':'足够的保留与阅读时长','scene.nodes':'完整原文对象','scene.media':'真实资料素材',evidenceComposition:'保留本场真实证据的构图',provenance:'明确来源',focusRegion:'在实际原图圈选区域',sourceKind:'资料类别',dataKind:'数据或示意性质',edges:'明确连接关系',hubNodeId:'中心对象',inputNodeIds:'输入对象',outputNodeIds:'输出对象',tokens:'原词范围与目标槽',unit:'数值单位',from:'明确起值',to:'明确终值',decimals:'数值精度',direction:'变化方向',countMs:'数值变化时长',path:'明确闭合路径',runner:'路径中的角色',stages:'对应阶段',boundary:'规则边界',rules:'明确规则'};
function requiredLabel(key:string,entryId:string){
 if(requiredNames[key])return requiredNames[key];
 let fields=dynamicMotionLibrary.find(entry=>entry.id===entryId)?.fields??[],label='';
 for(const part of key.replace(/\[\]/g,'').split('.')){const field=fields.find((f:{key:string})=>f.key===part);if(!field){label='';break;}label=field.label;fields=field.itemFields??field.fields??[];}
 return label||requiredNames[key.split('.').at(-1)!]||'对应资料与参数（'+key+'）';
}
function Evidence({items}:{items:DynamicMotionPlanEvidence[]}){
 const groups=new Map<string,{text:string;startMs?:number;endMs?:number}>();
 for(const item of items){if(!item.text)continue;const key=item.captionId??[item.source,item.nodeId,item.linkId].join(':');const previous=groups.get(key);groups.set(key,{text:(previous?.text??'')+item.text,startMs:Math.min(previous?.startMs??Infinity,item.startMs??Infinity),endMs:Math.max(previous?.endMs??-Infinity,item.endMs??-Infinity)});}
 return <ul className="space-y-2">{[...groups.entries()].map(([key,item])=><li key={key} className="break-words"><span className="opacity-60">{Number.isFinite(item.startMs)&&Number.isFinite(item.endMs)?`原片 ${seconds(item.startMs!)}–${seconds(item.endMs!)} 秒 · `:'场景原文 · '}</span><span className="whitespace-pre-wrap">{item.text}</span></li>)}</ul>;
}

/** A persistent review surface; all committing remains inside the scene editor. */
export function DynamicMotionPlanner({onPreview}:{onPreview:(sceneId:string,entryId:string)=>void}){
 const s=useEditor(),id=useId(),root=useRef<HTMLElement>(null),mounted=useRef(false),sequence=useRef(0),pending=useRef<Pending|null>(null);
 const [preserveExisting,setPreserveExisting]=useState(true),[bundle,setBundle]=useState<PlanState|null>(null),[busy,setBusy]=useState<'generate'|'preview'|null>(null),[message,setMessage]=useState(''),[identityStale,setIdentityStale]=useState(false);
 const stateSignature=useMemo(()=>motionPlanSignature(s),[s.clips,s.captions,s.presentation,s.meta,s.brolls,s.accentColor]);
 const stale=!!bundle&&(identityStale||bundle.projectId!==s.projectId||bundle.stateSignature!==stateSignature||bundle.options.preserveExisting!==preserveExisting);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;pending.current?.controller.abort();pending.current=null;};},[]);
 const begin=(kind:Pending['kind'])=>{if(pending.current)return null;const job={id:++sequence.current,kind,controller:new AbortController()};pending.current=job;setBusy(kind);setMessage('');return job;};
 const active=(job:Pending)=>mounted.current&&pending.current?.id===job.id&&!job.controller.signal.aborted;
 const finish=(job:Pending)=>{if(mounted.current&&pending.current?.id===job.id){pending.current=null;setBusy(null);}};
 const cancel=()=>{pending.current?.controller.abort();pending.current=null;sequence.current++;setBusy(null);setMessage('已取消读取，工程没有改动。');};
 const generate=async()=>{
  const job=begin('generate');if(!job)return;
  const snapshot=useEditor.getState(),signature=motionPlanSignature(snapshot),projectId=snapshot.projectId,keep=preserveExisting;
  try{
   const scenes=snapshot.presentation.scenes??[],read=await loadDynamicPlanIdentities(scenes,{signal:job.controller.signal});if(!active(job))return;
   const current=useEditor.getState();if(current.projectId!==projectId||motionPlanSignature(current)!==signature)throw Error('读取素材期间工程已变化，请重新生成建议。');
   const sourcePaths=new Set(scenes.map(scene=>scene.src)),options:DynamicMotionPlanningOptions={preserveExisting:keep,sourceIdentities:read.assets.filter(asset=>sourcePaths.has(asset.src)).map(identity),assetIdentities:read.assets.map(identity)};
   const plan=generateDynamicMotionPlan(snapshot,options);
   if(!active(job))return;
   setBundle({plan,options,projectId,stateSignature:signature,errors:read.errors,totalAssets:read.total,readAssets:read.assets.length});setIdentityStale(false);
   setMessage(`已生成 ${plan.rows.length} 场本地建议${read.errors.length?'；部分资料未能读取，已列为待补':''}。选择只改这份建议，逐场完整预览通过后才应用。`);
  }catch(error){if(active(job))setMessage(error instanceof Error?error.message:'建议生成失败，请重试。');}
  finally{finish(job);}
 };
 const choose=(row:DynamicMotionPlanRow,entryId:string,unlockManual=false)=>{
  if(!bundle||stale||busy)return;
  const result=updateDynamicMotionPlanSelection(bundle.plan,row.sceneId,entryId,{unlockManual});
  if(result.ok)setBundle({...bundle,plan:result.plan});else setMessage(result.error);
 };
 const preview=async(sceneId:string)=>{
  if(!bundle||stale)return;const job=begin('preview');if(!job)return;
  const captured=bundle;
  try{
   const current=useEditor.getState(),scene=current.presentation.scenes?.find(scene=>scene.id===sceneId);
   if(!scene||current.projectId!==captured.projectId||motionPlanSignature(current)!==captured.stateSignature)throw Error('工程已变化，旧建议不能打开，请重新生成。');
   // Re-read this scene before opening: unchanged project JSON does not prove
   // that a file at the same relative path still contains the same bytes.
   const fresh=await fetchDynamicEditorAssets(scene,{signal:job.controller.signal,fetcher:(input,init)=>fetch(input,{...init,cache:'no-store'})});if(!active(job))return;
   const sources=new Set(dynamicEditorAssetSources(scene)),expected=[...(captured.options.assetIdentities??[]),...(captured.options.sourceIdentities??[])],uniqueExpected=new Map(expected.filter(asset=>sources.has(asset.src)).map(asset=>[asset.src,asset]));
   if(fresh.errors.length||identityKey(fresh.assets)!==identityKey([...uniqueExpected.values()])){setIdentityStale(true);throw Error('本场素材身份已变化或尚未读取，旧建议已失效，请重新生成。');}
   const live=useEditor.getState();if(live.projectId!==captured.projectId)throw Error('当前工程已切换，请重新生成建议。');
   const request=dynamicMotionEditorRequest(captured.plan,sceneId,live,captured.options);if(!request.ok)throw Error(request.error);
   if(!active(job))return;
   if(root.current?.closest('[hidden]')){setMessage('建议仍已保留；返回此页后再打开本场预览。');return;}
   onPreview(request.sceneId,request.entryId);
  }catch(error){if(active(job))setMessage(error instanceof Error?error.message:'无法打开旧建议，请重新核对。');}
  finally{finish(job);}
 };
 return <section ref={root} aria-labelledby={id+'-title'} className="p-4 space-y-4">
  <header className="space-y-2"><h3 id={id+'-title'} className="font-bold">按保留口播生成动效建议</h3><p className="text-sm opacity-80">依据当前保留字幕、完整论点和真实资料选择表达。读取只在本地完成，不上传口播；建议不直接写入工程。</p>
   <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={preserveExisting} disabled={!!busy} onChange={event=>setPreserveExisting(event.target.checked)}/>生成时锁定已有人工动效与后景字</label><button type="button" disabled={!!busy||!s.presentation.scenes?.length} className="rounded px-4 py-2 bg-primary-container text-on-primary-container disabled:opacity-40" onClick={generate}>{busy==='generate'?'正在读取本地资料…':'生成动效建议'}</button>{busy&&<button type="button" className="underline text-sm" onClick={cancel}>取消读取</button>}</div>
   {!preserveExisting&&<p className="text-xs text-amber-300">本次生成允许改选已有动效建议；仍只生成草稿，不应用工程。</p>}
  </header>
  {stale&&<p role="alert" className="text-sm text-amber-300 border border-amber-300/40 rounded p-3">工程、生成选项或资料已变化，旧建议已失效。请重新生成后再配置预览。</p>}
  <p role="status" className="text-sm whitespace-pre-wrap">{message||(!bundle?'先生成建议，再逐场查看依据、选择和待补内容。':'建议会保留在此页；切换标签不会自动应用或丢弃。')}</p>
  {bundle&&<>
   <p className="text-xs opacity-70">{bundle.plan.rows.length} 场 · 已读取 {bundle.readAssets}/{bundle.totalAssets} 个本地素材身份。有效阅读时窗按实际保留与速度估算，重复源区间不重复加时；字体、逐页阅读与人物安全仍需完整预览。</p>
   {bundle.errors.length>0&&<details className="rounded border border-outline-variant/50 p-3 text-sm"><summary className="cursor-pointer text-amber-300">{bundle.errors.length} 项资料待补</summary><ul className="space-y-2 mt-2">{bundle.errors.map(error=><li key={error.src+error.message} className="break-words">{error.src.split('/').at(-1)}：{error.message}</li>)}</ul></details>}
   <ol className="grid gap-3 xl:grid-cols-2 items-start">{bundle.plan.rows.map((row,index)=>{
    const selected=row.candidates.find(candidate=>candidate.entryId===row.selectedEntryId),recommended=row.candidates.find(candidate=>candidate.entryId===row.recommendedEntryId),displayCandidate=selected??recommended,warnings=unique([...row.warnings,...(displayCandidate?.issues??[])]),requirements=displayCandidate?.requiredData??[];
    return <li key={row.sceneId} className="rounded-lg border border-outline-variant/50 p-3 space-y-2 min-w-0">
     <h4 className="font-semibold text-sm break-words">{index+1}. {row.title}</h4><p className="text-xs opacity-70">原片 {seconds(row.sourceStartMs)}–{seconds(row.sourceEndMs)} 秒 · 有效阅读时窗 {seconds(row.retainedMs)} 秒 · {row.projections.length} 个保留实例</p>
     <p className="text-sm">建议：{candidateName(row,row.recommendedEntryId)}</p><p className="text-xs opacity-80 whitespace-pre-wrap">{(recommended?.reasons??row.reasons).join('；')}</p>
     {row.locked&&<div className="text-xs rounded bg-surface-container-lowest p-2 space-y-2"><p>{row.lockReason}</p><button type="button" disabled={stale||!!busy} className="underline disabled:opacity-40" onClick={()=>choose(row,'keep',true)}>明确解锁本场建议</button></div>}
     <label className="block text-xs">本场选择<select aria-label={`分镜${index+1}动效建议`} value={row.selectedEntryId} disabled={row.locked||stale||!!busy} onChange={event=>choose(row,event.target.value)} className="w-full mt-1 rounded border border-outline-variant bg-surface-container-lowest p-2 text-sm disabled:opacity-50"><option value="keep">保留当前编排</option>{row.candidates.map(candidate=><option key={candidate.entryId} value={candidate.entryId}>{candidate.name}{candidate.requiredData.length?' · 待补参数':''}</option>)}</select></label>
     {row.contextReviewRequired&&<p className="text-xs text-amber-300">字幕、语义或保留范围需要复核，默认保留原编排；候选不是自动应用结果。</p>}
     {requirements.length>0&&<p className="text-xs text-amber-300">{selected?'所选待补':'建议待补'}：{unique(requirements.map(key=>requiredLabel(key,displayCandidate!.entryId))).join('、')}</p>}
     {warnings.length>0&&<details className="text-xs"><summary className="cursor-pointer text-amber-300">{warnings.length} 项范围或前置提醒</summary><ul className="space-y-1 mt-2">{warnings.map(warning=><li key={warning} className="whitespace-pre-wrap break-words">{warning}</li>)}</ul></details>}
     <details className="text-xs"><summary className="cursor-pointer underline">口播原词、源时段与候选依据</summary><div className="space-y-3 mt-2">
      {row.originalEvidence.length?<Evidence items={row.originalEvidence}/>:<p>没有可确认的当前保留字幕，仅能依据场景原文列草稿。</p>}
      {row.boundaryContext.length>0&&<div className="border-l-2 border-amber-300 pl-2"><p className="text-amber-300 mb-1">相邻保留字幕中的限定引句：</p><Evidence items={row.boundaryContext}/></div>}
      <details><summary className="cursor-pointer">各保留实例的实际范围</summary><ul className="mt-2 space-y-1">{row.projections.map((projection,i)=><li key={projection.id}>实例 {i+1}：原片 {seconds(projection.sourceStartMs)}–{seconds(projection.sourceEndMs)} 秒，{projection.speed} 倍速；分别核验完整阅读。</li>)}</ul></details>
      {row.candidates.map(candidate=><details key={candidate.entryId} className="border-t border-outline-variant/30 pt-2"><summary className="cursor-pointer">{candidate.name}{candidate.entryId===row.recommendedEntryId?' · 建议':''}</summary><p className="mt-1">{candidate.reasons.join('；')}</p>{candidate.originalEvidence.some(item=>item.text)&&<details className="mt-2"><summary className="cursor-pointer">本候选的原词出处</summary><div className="mt-2"><Evidence items={candidate.originalEvidence}/></div></details>}{candidate.requiredData.length>0&&<p className="mt-1 text-amber-300">待补：{unique(candidate.requiredData.map(key=>requiredLabel(key,candidate.entryId))).join('、')}</p>}{candidate.issues.map(issue=><p key={issue} className="mt-1 text-amber-300">{issue}</p>)}</details>)}
      {row.excluded.length>0&&<details><summary className="cursor-pointer">为何没有建议某些机制</summary><ul className="mt-2 space-y-1">{row.excluded.map((item,i)=><li key={item.entryId+':'+i}>{dynamicMotionLibrary.find(entry=>entry.id===item.entryId)?.name??'其他机制'}：{item.reason}</li>)}</ul></details>}
     </div></details>
     <button type="button" disabled={stale||!!busy||row.locked||row.selectedEntryId==='keep'} className="w-full sm:w-auto rounded border border-outline-variant px-3 py-2 text-sm disabled:opacity-40" onClick={()=>preview(row.sceneId)}>配置并完整预览本场</button>
    </li>;
   })}</ol>
  </>}
  <p className="text-xs opacity-60">选择只更新建议。每场须在独立编辑器补齐真实资料、完整观看全部保留实例并取得当前预览凭据，才能应用；本页没有一键应用。</p>
 </section>;
}
