import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Audio,Sequence,AbsoluteFill,staticFile,useCurrentFrame,useVideoConfig,getRemotionEnvironment,delayRender,continueRender,cancelRender,Internals} from 'remotion';
import {audioClockProjectSegments,audioClockEvidenceIssues,audioClockOwnershipAtFrame,audioClockDecodedReport,verifyAudioClockWav,registerAudioClockMediaElement,type AudioClockEvidence,type AudioClockActualReport,type AudioClockSegment} from './audio-clock-integration.mjs';
import type {AudioClockConfig,AudioClockRuntime} from './audio-clock.mjs';
import type {StoryScene} from './storyboard.mjs';
import type {Clip} from './timeline';
import {audioClockLiveSelectionIssues,type DynamicMotionState} from './scene-dynamic-motion.mjs';
import type {FullFrameSourceSlotReport} from './FullFrameHandoffScene';
import {observePreviewMedia} from './preview-media-events.mjs';
import {createPreviewAudioPrewarmController,type PreviewAudioPrewarmSnapshot} from './preview-audio-prewarm.mjs';

type Mixer={forceMuteOriginal:boolean;forceMuteMusic:boolean;runtimeFor:(projectionId:string,elapsed:number)=>AudioClockRuntime|undefined;reportSpeaker:(projectionId:string,report:FullFrameSourceSlotReport)=>void};
export const AudioClockMixerContext=createContext<Mixer>({forceMuteOriginal:false,forceMuteMusic:false,runtimeFor:()=>undefined,reportSpeaker:()=>{}});
export const useAudioClockMixer=()=>useContext(AudioClockMixerContext);
type Material={sceneId:string;evidence:AudioClockEvidence[];verified:{takeId:'A'|'B';wavSha256:string;segmentPcmSha256:string;sampleCount:number}[]};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type PreviewRootClock={frame:number;timeline:React.ContextType<typeof Internals.TimelineContext>};
// Candidate preparation budget, not a playback tolerance or decoder proof.
// A late load simply cannot warm; the actual cue must still pass every gate.
const prewarmBudget={minLeadMs:700,maxWarmMs:400,cueSafetyMs:150};

function DecodedSegment({segment,evidence,gain,onReport,rootClock}:{segment:AudioClockSegment;evidence:AudioClockEvidence;gain:number;onReport:(report:AudioClockActualReport)=>void;rootClock:React.MutableRefObject<PreviewRootClock>}){
 const ref=useRef<HTMLAudioElement>(null),slot=useRef<HTMLDivElement>(null),{fps}=useVideoConfig(),frame=useCurrentFrame(),rendering=getRemotionEnvironment().isRendering,expected=useRef(0);expected.current=segment.sourceStartMs+frame/fps*1000*segment.speed;
 const timeline=useContext(Internals.TimelineContext),sequence=useContext(Internals.SequenceContext),previewPlaybackRate=rendering?1:timeline.playbackRate;
 const prewarm=useRef<ReturnType<typeof createPreviewAudioPrewarmController>|null>(null),prewarmCommitted=useRef(false),readPrewarm=useRef<()=>PreviewAudioPrewarmSnapshot|null>(()=>null);
 // This ref is supplied by the owner OUTSIDE Sequence's premount Freeze. The
 // child's frozen Timeline says paused even while the actual Player advances.
 readPrewarm.current=()=>{const root=rootClock.current;return {phase:root.frame<segment.fromFrame?'premount':root.frame<segment.endFrame?'active':'after',sequencePremounting:sequence?.premounting===true,rootPlaying:root.timeline.playing===true&&root.timeline.imperativePlaying?.current===true,rootFrame:root.frame,fromFrame:segment.fromFrame,premountFrames:fps,fps,previewRate:root.timeline.playbackRate,segmentId:segment.projectionId+':'+segment.takeId,src:evidence.playbackAsset.src,durationMs:evidence.playbackAsset.durationMs,materialReady:true,gain,element:ref.current,slot:slot.current};};
 const prepare=useCallback(()=>{const controller=prewarm.current;if(controller&&prewarmCommitted.current){controller.reconcile();const snapshot=readPrewarm.current();if(snapshot?.phase==='premount'&&snapshot.sequencePremounting&&snapshot.rootPlaying)void controller.request();}},[]);
 const check=useCallback(()=>{if(!rendering)onReport(audioClockDecodedReport(ref.current,{playbackAsset:evidence.playbackAsset,take:{id:segment.takeId,startMs:segment.sourceStartMs,endMs:segment.sourceEndMs} as any,projectionId:segment.projectionId,expectedMediaMs:expected.current,speed:segment.speed,previewPlaybackRate,fps}));},[segment.projectionId,segment.takeId,segment.speed,previewPlaybackRate,evidence,fps,onReport,rendering]);
 const observe=useCallback(()=>{check();prepare();},[check,prepare]);
 // SDK seek correction uses its normal playback tolerance. Independent native
 // and DOM proof still require the actual decoded clock within one frame.
 // The shared pool may change its forwarded element when mute/source changes.
 // Rebind on each timeline/mute commit, then sample after child playback effects.
 // Readiness-only rerenders must not feed continuously advancing time back into
 // another layout update at the same frame.
 useLayoutEffect(()=>{if(rendering)return;const unregister=registerAudioClockMediaElement(slot.current,ref.current,previewPlaybackRate),stop=observePreviewMedia(ref.current,observe);return()=>{stop();unregister();};},[frame,observe,gain,previewPlaybackRate,rendering]);
 // Descendant SDK passive effects run first, including Freeze's initial pause.
 // One controller survives frame/report updates and disposes with this slot.
 // StrictMode replays setup/cleanup synchronously: defer its first attempt so
 // the discarded setup never consumes this native ref/source's one attempt.
 useEffect(()=>{if(rendering)return;const controller=createPreviewAudioPrewarmController({...prewarmBudget,getSnapshot:()=>readPrewarm.current()});prewarm.current=controller;prewarmCommitted.current=false;queueMicrotask(()=>{if(prewarm.current===controller){prewarmCommitted.current=true;prepare();}});return()=>{if(prewarm.current===controller){prewarm.current=null;prewarmCommitted.current=false;}controller.dispose();};},[rendering,prepare]);
 const root=rootClock.current;
 useEffect(()=>{if(!rendering)prepare();},[root.frame,root.timeline.playing,root.timeline.playbackRate,root.timeline.imperativePlaying?.current,sequence?.premounting,gain,prepare,rendering]);
 useEffect(()=>{if(!rendering)check();},[frame,check,rendering]);
 return <div ref={slot} data-audio-playback-projection={segment.projectionId} data-audio-playback-take={segment.takeId} data-audio-replacement-gain={gain} data-audio-prewarm-status={rendering?undefined:prewarm.current?.getState().status}><Audio ref={ref} src={staticFile(evidence.playbackAsset.src)} volume={gain} muted={gain===0} playbackRate={segment.speed} pauseWhenBuffering onError={()=>onReport({key:segment.projectionId+':'+segment.takeId,status:'blocked',actualMediaMs:NaN})}/></div>;
}

/** One composition-level replacement owner. Normal clip/music settings pass
 * through unless a current actual A/B decoder (or verified export PCM) is ready. */
export function AudioClockPlayback({scenes,clips,brollAssets,validationState,children}:{scenes:StoryScene[];clips:Clip[];brollAssets?:unknown[];validationState:DynamicMotionState;children:React.ReactNode}){
 const {fps,width,height}=useVideoConfig(),frame=useCurrentFrame(),rendering=getRemotionEnvironment().isRendering,audioScenes=scenes.filter(s=>s.dynamicMotion?.config.kind==='audio-clock-ab'),signature=JSON.stringify([scenes,clips,brollAssets,validationState,fps,width,height]),currentKey=useRef(signature);currentKey.current=signature;
 const rootTimeline=useContext(Internals.TimelineContext),rootClock=useRef<PreviewRootClock>({frame,timeline:rootTimeline});rootClock.current={frame,timeline:rootTimeline};
 const liveIssues=useMemo(()=>audioScenes.flatMap(s=>audioClockLiveSelectionIssues(validationState,s)),[signature]),schedule=useMemo(()=>audioClockProjectSegments(scenes,clips,fps,{width,height}),[signature]),[materials,setMaterials]=useState<{key:string;status:'waiting'|'blocked'|'ready';items:Material[];error?:string}>({key:'',status:'waiting',items:[]});
 const [reports,setReports]=useState<{key:string;audio:Record<string,AudioClockActualReport>;speaker:Record<string,FullFrameSourceSlotReport>}>({key:'',audio:{},speaker:{}});
 useEffect(()=>{
  let active=true;const controller=new AbortController(),handle=rendering&&audioScenes.length?delayRender('Verify actual A/B PCM playback assets'):null;
  let finished=false;const finish=()=>{if(!finished&&handle!==null){finished=true;continueRender(handle);}};
  setMaterials({key:signature,status:audioScenes.length?'waiting':'ready',items:[]});
  (async()=>{
   if(schedule.issues.length||liveIssues.length)throw Error([...schedule.issues,...liveIssues].join('；'));const items:Material[]=[];
   for(const scene of audioScenes){
    const saved=scene.dynamicMotion!;
    // Offline Remotion bundles have no API server. Export preflight re-hashes
    // source/video evidence; every worker still verifies actual bundled PCM.
    if(!rendering){const sourceResponse=await fetch('/api/dynamic-asset?'+new URLSearchParams({src:scene.src!}),{signal:controller.signal,cache:'no-store'}),sourceIdentity=await sourceResponse.json();if(!sourceResponse.ok||!same(sourceIdentity,saved.sourceIdentity))throw Error('当前原片身份已变化，保留原声并请重新预览');}
    const config=saved.config as AudioClockConfig,evidence=saved.audioEvidence??[],issues=audioClockEvidenceIssues({clips,brollAssets},config,evidence);if(issues.length)throw Error(issues.join('；'));
    const actual:AudioClockEvidence[]=[];
    for(const entry of evidence){
     if(rendering)actual.push(entry);
     else{const t=config.takes.find(t=>t.id===entry.takeId)!,query=new URLSearchParams({src:t.source.src,startMs:String(t.startMs),endMs:String(t.endMs),bins:String(entry.analysis.bins.length)}),response=await fetch('/api/dynamic-audio/materialize?'+query,{method:'POST',signal:controller.signal,cache:'no-store'}),value=await response.json();if(!response.ok)throw Error(value.error??'A/B音轨复核失败');const current={takeId:t.id,...value};if(!same(current,entry))throw Error('A/B源视频、PCM或播放文件已变化，请重新分析并预览');actual.push(current);}
    }
    const verified=[];for(const e of actual){const response=await fetch(staticFile(e.playbackAsset.src),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('实际PCM播放文件不可用');verified.push({takeId:e.takeId,...await verifyAudioClockWav(await response.arrayBuffer(),e.playbackAsset)});}
    items.push({sceneId:scene.id,evidence:actual,verified});
   }
   if(active&&currentKey.current===signature)setMaterials({key:signature,status:'ready',items});
  })().catch(error=>{if(!active)return;const message=error instanceof Error?error.message:'实际音轨加载失败';setMaterials({key:signature,status:'blocked',items:[],error:message});if(rendering)cancelRender(Error(message));}).finally(finish);
  return()=>{active=false;controller.abort();finish();};
 },[signature,rendering]);
 const audioReport=useCallback((report:AudioClockActualReport)=>{if(currentKey.current!==signature)return;setReports(p=>{const s=p.key===signature?p:{key:signature,audio:{},speaker:{}};return same(s.audio[report.key],report)?p:{...s,audio:{...s.audio,[report.key]:report}};});},[signature]);
 const reportSpeaker=useCallback((id:string,report:FullFrameSourceSlotReport)=>{if(currentKey.current!==signature)return;setReports(p=>{const s=p.key===signature?p:{key:signature,audio:{},speaker:{}};return same(s.speaker[id],report)?p:{...s,speaker:{...s.speaker,[id]:report}};});},[signature]);
 const current=materials.key===signature?materials:undefined,actual=reports.key===signature?reports:undefined,activeSegments=schedule.segments.filter(s=>frame>=s.fromFrame&&frame<s.endFrame),segment=activeSegments.length===1?activeSegments[0]:undefined,decoded=segment?actual?.audio[segment.projectionId+':'+segment.takeId]:undefined,speaker=segment?actual?.speaker[segment.projectionId]:undefined,scene=segment?audioScenes.find(s=>s.id===segment.sceneId):undefined;
 const expected=segment?segment.sourceStartMs+(frame-segment.fromFrame)/fps*1000*segment.speed:NaN,projectionStart=segment&&scene?segment.fromFrame/fps*1000-(scene.dynamicMotion!.config as AudioClockConfig).takes.find(t=>t.id===segment.takeId)!.playAtMs/segment.speed:NaN,expectedSpeaker=scene&&segment?scene.startMs+(frame/fps*1000-projectionStart)*segment.speed:NaN;
 const liveDecoded=decoded&&speaker?.status==='ready'&&Math.abs(speaker.sourceMs-expectedSpeaker)<=1000/fps+.1&&Math.abs(decoded.actualMediaMs-expected)<=1000/fps+.1?decoded:undefined;
 const policy=audioClockOwnershipAtFrame(schedule.segments,frame,{evidenceOk:current?.status==='ready'&&!schedule.issues.length&&!liveIssues.length,decoded:liveDecoded,renderVerified:rendering&&current?.status==='ready'});
 const runtimeFor=useCallback((projectionId:string,elapsed:number):AudioClockRuntime|undefined=>{
  const raw=audioScenes.find(s=>schedule.segments.some(p=>p.sceneId===s.id&&p.projectionId===projectionId)),item=current?.items.find(i=>i.sceneId===raw?.id);if(!raw)return undefined;
  const config=raw.dynamicMotion!.config as AudioClockConfig,result:AudioClockRuntime={ownerPolicy:'comparison-only',analyses:item?.evidence.map(e=>e.analysis)??[],mixerPolicy:policy,verifiedPlayback:item?.verified,error:current?.error};
  if(policy.activeSegment?.projectionId===projectionId&&item){const take=config.takes.find(t=>t.id===policy.activeSegment!.takeId)!,e=item.evidence.find(e=>e.takeId===take.id)!;
   if(rendering){const verified=item.verified.find(v=>v.takeId===take.id)!;result.renderProof={kind:'verified-pcm-frame',takeId:take.id,src:take.source.src,sha256:take.source.sha256,analysisSha256:take.source.analysisSha256,playbackSha256:verified.wavSha256,segmentPcmSha256:verified.segmentPcmSha256,sampleCount:verified.sampleCount,sampleOffset:Math.round((elapsed-take.playAtMs)*16)};}
   else if(liveDecoded&&speaker)result.audioProof={ownerId:config.audioOwner.id,takeId:take.id,src:e.sourceIdentity.src,sha256:e.sourceIdentity.sha256,sourceClock:'source-zero-ms',mediaMs:liveDecoded.actualMediaMs,playbackRate:policy.activeSegment.speed,sceneSourceMs:speaker.sourceMs,activeAudioTracks:1,otherTracksMuted:true,status:'ready',fps};
  }
  return result;
 },[signature,current,reports,frame,rendering,policy.mode,policy.activeSegment?.projectionId,policy.activeSegment?.takeId]);
 const value={forceMuteOriginal:policy.forceMuteOriginal,forceMuteMusic:policy.forceMuteMusic,runtimeFor,reportSpeaker};
 return <AudioClockMixerContext.Provider value={value}><AbsoluteFill data-audio-clock-scope="true" data-audio-clock-diagnostics={JSON.stringify({frame,expectedAudioMs:expected,expectedSpeakerMs:expectedSpeaker,materialStatus:current?.status,decoded,speaker,liveDecoded:!!liveDecoded,policyStatus:policy.status})} data-audio-owner-mode={policy.mode} data-audio-original-muted={policy.forceMuteOriginal} data-audio-music-muted={policy.forceMuteMusic}>{children}{current?.status==='ready'&&schedule.segments.map(s=>{const e=current.items.find(i=>i.sceneId===s.sceneId)?.evidence.find(e=>e.takeId===s.takeId);return e?<Sequence key={s.projectionId+':'+s.takeId} from={s.fromFrame} durationInFrames={s.endFrame-s.fromFrame} premountFor={fps} style={{pointerEvents:'none'}}><DecodedSegment segment={s} evidence={e} onReport={audioReport} rootClock={rootClock} gain={policy.activeSegment?.projectionId===s.projectionId&&policy.activeSegment?.takeId===s.takeId?policy.replacementGain:0}/></Sequence>:null;})}</AbsoluteFill></AudioClockMixerContext.Provider>;
}
