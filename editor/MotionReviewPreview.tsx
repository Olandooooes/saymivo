import React,{useCallback,useEffect,useMemo,useRef,useState}from'react';
import{Player,type PlayerRef}from'@remotion/player';
import{MultiClipVideo}from'../src/MultiClipVideo';
import{DynamicRenderReportContext,type DynamicRenderReadiness}from'../src/DynamicMotionRenderer';
import{loadDisplayFont}from'../src/DisplayFont';
import{prepareMotionReviewPreview,motionReviewPlaybackCommand,observeMotionReviewPlayback,type MotionReviewPreviewFixture,type MotionReviewPlaybackCommand,type MotionReviewPlaybackState}from'./motion-review-preview-model.mjs';
export type{MotionReviewPlaybackCommand,MotionReviewPlaybackState}from'./motion-review-preview-model.mjs';

export type MotionReviewPreviewReadiness={entryId:string;status:'unavailable'|'loading'|'waiting'|'blocked'|'ready';issues:string[];native?:DynamicRenderReadiness;canApply:false;scope:'actual-preview-frame-only'};
export type MotionReviewPreviewProps={fixture:MotionReviewPreviewFixture|null|undefined;command?:MotionReviewPlaybackCommand;onPlaybackState?:(state:MotionReviewPlaybackState)=>void;onReadiness?:(report:MotionReviewPreviewReadiness)=>void};
function RenderFailure({error,onError}:{error:Error;onError:(message:string)=>void}){useEffect(()=>onError(error.message),[error.message,onError]);return<div role="alert" className="p-6 text-sm">实际播放器未能完成：{error.message}</div>;}

/** Read-only review surface. The existing composition executes actual library
 * components. No apply/store/project mutation, exported video or UI receipt. */
export function MotionReviewPreview({fixture,command,onPlaybackState,onReadiness}:MotionReviewPreviewProps){
 const fixtureKey=JSON.stringify(fixture),model=useMemo(()=>prepareMotionReviewPreview(fixture),[fixtureKey]),player=useRef<PlayerRef>(null),notify=useRef(onReadiness),notifyPlayback=useRef(onPlaybackState),controller=useRef<ReturnType<typeof observeMotionReviewPlayback>|null>(null),receivedCommand=useRef<number|null>(null),pendingCommand=useRef<{key:string;command:MotionReviewPlaybackCommand}|null>(null),[loop,setLoop]=useState(true),[rate,setRate]=useState(1),[playback,setPlayback]=useState<MotionReviewPlaybackState|null>(null),[commandIssue,setCommandIssue]=useState<{key:string;issues:string[]}|null>(null),[font,setFont]=useState<{key:string;status:'loading'|'ready'|'error';error?:string}>({key:'',status:'loading'}),[native,setNative]=useState<{key:string;value:DynamicRenderReadiness}|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null);notify.current=onReadiness;notifyPlayback.current=onPlaybackState;
 const key=model.status==='prepared'?model.key:JSON.stringify([fixture?.entryId,model.status,model.issues]),fontId=model.status==='prepared'?model.fontId:undefined;
 useEffect(()=>{let active=true;player.current?.pause();pendingCommand.current=null;setRate(1);setPlayback(null);setCommandIssue(null);setNative(null);setFailure(null);setFont({key,status:'loading'});if(model.status==='prepared')loadDisplayFont(fontId).then(()=>{if(active)setFont({key,status:'ready'});}).catch(error=>{if(active)setFont({key,status:'error',error:error instanceof Error?error.message:String(error)});});return()=>{active=false;};},[key,fontId]);
 const report=useCallback((value:DynamicRenderReadiness)=>setNative(previous=>previous?.key===key&&JSON.stringify(previous.value)===JSON.stringify(value)?previous:{key,value}),[key]),renderError=useCallback((message:string)=>{setFailure({key,message});player.current?.pause();},[key]);
 const current=native?.key===key?native.value:undefined,fontReady=font.key===key&&font.status==='ready',error=failure?.key===key?failure.message:font.key===key&&font.status==='error'?font.error:undefined,status=model.status!=='prepared'?model.status:error?'blocked':!fontReady?'loading':current?.status??'waiting',issues=model.status!=='prepared'?model.issues:error?[error]:!fontReady?['正在加载当前实际字体。']:current?.issues??['等待实际组件、来源解码与字体测量回报。'],issueKey=JSON.stringify(issues);
 useEffect(()=>notify.current?.({entryId:fixture?.entryId??'',status,issues:JSON.parse(issueKey),...(current?{native:current}:{}),canApply:false,scope:'actual-preview-frame-only'}),[fixture?.entryId,status,issueKey,current]);
 useEffect(()=>{
  const p=player.current;
  if(!p||!fontReady||model.status!=='prepared'||error){const value:MotionReviewPlaybackState={entryId:fixture?.entryId??'',previewKey:key,available:false,frame:null,fps:model.status==='prepared'?model.fps:null,currentTimeSec:null,inFrame:model.status==='prepared'?model.window.inFrame:null,outFrame:model.status==='prepared'?model.window.outFrame:null,playing:false,muted:true,rate:1,waiting:false,lastCommandId:null,issues:[...(model.status==='prepared'?[error??'实际播放器尚未挂载，等待字体。']:model.issues)]};setPlayback(value);return;}
  const observer=observeMotionReviewPlayback(p,{entryId:model.entryId,key,fps:model.fps,inFrame:model.window.inFrame,outFrame:model.window.outFrame,onState:setPlayback,onRate:setRate});controller.current=observer;
  return()=>{observer.dispose();if(controller.current===observer)controller.current=null;};
 },[key,fontReady,error]);
 // Receive each parent command once. A command waiting for font loading belongs
 // only to this fixture; switching examples never replays an old play request.
 useEffect(()=>{if(!command||receivedCommand.current===command.id)return;receivedCommand.current=command.id;const checked=motionReviewPlaybackCommand(command);setCommandIssue({key,issues:checked.issues});pendingCommand.current=checked.ok&&model.status==='prepared'?{key,command:checked.command}:null;},[key,command?.id,command?.action,command?.rate]);
 useEffect(()=>{const pending=pendingCommand.current;if(!pending||pending.key!==key||!fontReady||error||!controller.current)return;pendingCommand.current=null;const result=controller.current.command(pending.command);setCommandIssue({key,issues:result.issues});},[key,fontReady,error,command?.id,command?.action,command?.rate]);
 const replay=()=>{if(model.status!=='prepared'||!fontReady)return;player.current?.pause();player.current?.seekTo(model.window.inFrame);player.current?.play();};
 const currentPlayback=playback?.previewKey===key?playback:undefined,playing=currentPlayback?.playing??false,playbackIssues=[...(currentPlayback?.issues??[]),...(commandIssue?.key===key?commandIssue.issues:[])];
 const playbackIssueKey=JSON.stringify([...new Set(playbackIssues)]);
 useEffect(()=>{if(currentPlayback)notifyPlayback.current?.({...currentPlayback,issues:JSON.parse(playbackIssueKey)});},[currentPlayback,playbackIssueKey]);
 return<section aria-label="我们的实际动效" className="space-y-3" data-motion-review-entry={fixture?.entryId} data-motion-review-status={status}>
  <div className="flex flex-wrap gap-2 items-center"><strong className="text-sm">{fixture?.name??'请选择动效'}</strong><span role="status" className="text-xs">{status==='ready'?'当前实际帧已就绪':status==='loading'?'字体加载中':status==='waiting'?'等待实际组件就绪':status==='blocked'?'尚未完成：实际条件未满足':'尚未配置完整'}</span></div>
  <div className="bg-black rounded overflow-hidden">{model.status==='prepared'&&fontReady?<DynamicRenderReportContext.Provider value={report}><Player ref={player} key={key} component={MultiClipVideo} inputProps={model.inputProps} compositionWidth={model.width} compositionHeight={model.height} fps={model.fps} durationInFrames={model.window.durationInFrames} inFrame={model.window.inFrame} outFrame={model.window.outFrame} initialFrame={model.window.inFrame} playbackRate={rate} controls loop={loop} initiallyMuted autoPlay={false} showPlaybackRateControl={[0.5,0.75,1]} errorFallback={({error})=><RenderFailure error={error} onError={renderError}/>} style={{width:'100%',maxHeight:'60vh',aspectRatio:`${model.width}/${model.height}`}}/></DynamicRenderReportContext.Provider>:<div className="p-8 text-sm min-h-40 flex items-center justify-center">{model.status==='prepared'?'正在加载真实字体…':'该示例暂未呈现实际动效，请查看下方具体缺项。'}</div>}</div>
  <div className="flex flex-wrap gap-3 items-center"><button type="button" className="border rounded px-3 py-1 text-sm disabled:opacity-40" disabled={model.status!=='prepared'||!fontReady||!!error} onClick={()=>{if(playing)player.current?.pause();else player.current?.play();}}>{playing?'暂停':'播放'}</button><button type="button" className="border rounded px-3 py-1 text-sm disabled:opacity-40" disabled={model.status!=='prepared'||!fontReady||!!error} onClick={replay}>重播本段</button><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={loop} onChange={event=>setLoop(event.target.checked)}/>循环播放</label></div>
  {model.status==='prepared'&&<p className="text-xs opacity-70">本段 {((model.window.outFrame-model.window.inFrame+1)/model.fps).toFixed(0)} 秒 · 默认静音，可用音量控件试听。</p>}
  {!!playbackIssues.length&&<p role="alert" className="text-xs">{[...new Set(playbackIssues)].join('；')}</p>}
  {!!issues.length&&<div role="status" className="text-xs space-y-1"><p>当前未完成项：</p><ul className="list-disc pl-4">{issues.map((issue,i)=><li key={i} className="break-words">{issue}</li>)}</ul></div>}
  <details className="text-xs opacity-70"><summary>播放诊断与示例说明</summary>
   {currentPlayback?.available&&<p className="mt-2" data-motion-review-frame={currentPlayback.frame??undefined}>实际播放器：第 {currentPlayback.frame??'—'} 帧 · {currentPlayback.currentTimeSec?.toFixed(3)??'—'} 秒 · {currentPlayback.rate}× · {currentPlayback.muted?'静音':'有声'}{currentPlayback.waiting?' · 缓冲等待':''}</p>}
   {current&&<p className="mt-2">组件：{current.nativeStatus} · 来源解码：{current.sourceStatus} · 资料：{current.assetStatus}</p>}
   <p className="mt-2">承载素材用于人物或资料槽，不是官方参考视频。这里只播放已有组件，不保存或应用到工程。当前帧就绪不代表完整动效或最终成片已验收。</p>
  </details>
 </section>;
}
