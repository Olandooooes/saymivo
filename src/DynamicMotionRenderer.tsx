import {DynamicMattePerson,useDynamicMatteFrame} from './DynamicMattePerson';
import {requiresDynamicMatte,dynamicMatteEvidenceIssues,dynamicPersonFraming,type DynamicMatteEvidence} from './dynamic-matte.mjs';
import React,{createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,OffthreadVideo,Video,getRemotionEnvironment,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {DynamicMechanismScene} from './DynamicMechanismScene';
import {PhraseChoreographyScene} from './PhraseChoreographyScene';
import {SourceTokenTransferScene} from './SourceTokenTransferScene';
import {PersistentEntitiesScene} from './PersistentEntitiesScene';
import {TypedDataClockScene} from './TypedDataClockScene';
import {ConditionalSetScene} from './ConditionalSetScene';
import {FieldRollBoardScene} from './FieldRollBoardScene';
import {conditionalSetCurrentContext} from './conditional-set-integration.mjs';
import {PathRunnerScene} from './PathRunnerScene';
import {FunnelFlowScene} from './FunnelFlowScene';
import {QuantitativeChartScene} from './QuantitativeChartScene';
import {ProgressiveUiScene} from './ProgressiveUiScene';
import {TaskTracksScene} from './TaskTracksScene';
import {PairedRelationsScene} from './PairedRelationsScene';
import {VeilStateScene} from './VeilStateScene';
import {FullFrameHandoffScene,type FullFrameSourceRenderer,type FullFrameSourceSlotReport} from './FullFrameHandoffScene';
import {AudioClockScene} from './AudioClockScene';
import {useAudioClockMixer} from './AudioClockPlayback';
import {dynamicSourceSlotReport,dynamicRenderedSourceSlotReport} from './dynamic-source-slot.mjs';
import {observePreviewMedia} from './preview-media-events.mjs';
import {completeSourceCopySpeaker} from './complete-source-copy.mjs';
import {sampleSceneWindow,sceneSpeakerLayout,storyboardFrameRange,type StoryScene} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';
import {sampleTransform,type Clip} from './timeline';
import type {DynamicMechanismConfig,StageRect} from './dynamic-mechanisms.mjs';
import type {PhraseChoreographyConfig} from './phrase-choreography.mjs';
import type {SourceTokenTransferConfig} from './source-token-transfer.mjs';
import type {PathRunnerConfig} from './path-runner.mjs';
import type {FunnelFlowConfig} from './funnel-flow.mjs';
import type {QuantitativeChartConfig} from './quantitative-chart.mjs';
import type {ProgressiveUiConfig,TaskTracksConfig} from './progressive-scenes.mjs';

import type {SceneDynamicMotionConfig} from './scene-dynamic-motion.mjs';
export type {SceneDynamicMotionConfig} from './scene-dynamic-motion.mjs';
export type DynamicSourceIdentity={src:string;sha256:string;width:number;height:number;kind:'image'|'video';durationSec?:number};
export type DynamicRenderReadiness={status:'waiting'|'blocked'|'ready';issues:string[];nativeStatus:'waiting'|'blocked'|'ready';sourceStatus:'waiting'|'blocked'|'ready';assetStatus:'waiting'|'blocked'|'ready';projectionId:string};
export const DynamicRenderReportContext=createContext<((report:DynamicRenderReadiness)=>void)|null>(null);
const oldKinds=new Set(['flip-board','number-counter','evidence-handoff','glass-capsules','orbit-flow-variant','bar-group-variant','hub-branch-flow','screenshot-region-focus','bilingual-board-transition']);
const phraseKinds=new Set(['emphasis-phrase','caret-phrase','cumulative-phrases','identity-sweep']);
const ignoreSourceStatus=()=>{};
const sha=(value:string)=>/^[a-f0-9]{64}$/i.test(value);

function useLoadedAssets(scene:StoryScene){
 const sources=useMemo(()=>[...new Set([scene.media?.src,...(scene.nodes??[]).map(node=>node.assetSrc)].filter((value):value is string=>!!value))],[scene.media?.src,JSON.stringify(scene.nodes?.map(node=>node.assetSrc))]);
 const key=JSON.stringify(sources),[result,setResult]=useState<{key:string;status:'waiting'|'blocked'|'ready';issues:string[]}>({key:'',status:'waiting',issues:[]});
 useEffect(()=>{
  let alive=true;const cleanup:(()=>void)[]=[];
  setResult({key,status:sources.length?'waiting':'ready',issues:[]});
  const done=new Set<string>(),failed:string[]=[];
  const settle=(src:string,ok:boolean)=>{if(!alive)return;done.add(src);if(!ok)failed.push('资料素材未成功解码：'+src);setResult({key,status:failed.length?'blocked':done.size===sources.length?'ready':'waiting',issues:[...failed]});};
  for(const src of sources){
   if(scene.media?.src===src&&scene.media.kind==='video'){
    const video=document.createElement('video');video.preload='auto';video.muted=true;video.onloadeddata=()=>settle(src,video.videoWidth>0&&video.videoHeight>0);video.onerror=()=>settle(src,false);video.src=staticFile(src);video.load();cleanup.push(()=>{video.removeAttribute('src');video.load();});
   }else{const image=new Image();image.onload=()=>settle(src,image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>settle(src,false);image.src=staticFile(src);cleanup.push(()=>{image.onload=null;image.onerror=null;});}
  }
  return()=>{alive=false;cleanup.forEach(stop=>stop());};
 },[key]);
 return result.key===key?result:{key,status:'waiting' as const,issues:[]};
}

/** The source clock is tied to the retained projection, never a fresh 0-second clip. */
function DynamicSpeakerVideo({scene,rawScene,clip,identity,onStatus,baseSpeaker,onSourceReport,realSpeaker=true,alphaMask,strictPreviewClock=false}:{scene:StoryScene;rawScene:StoryScene;clip:Clip;identity:DynamicSourceIdentity;onStatus:(status:'waiting'|'blocked'|'ready')=>void;baseSpeaker?:{x?:number;y?:number;scale?:number};onSourceReport?:(report:FullFrameSourceSlotReport)=>void;realSpeaker?:boolean;alphaMask?:string;strictPreviewClock?:boolean}){
 const {fps}=useVideoConfig(),frame=useCurrentFrame(),ref=useRef<HTMLVideoElement>(null),rendering=getRemotionEnvironment().isRendering,speed=scene.speed??1;
 const range=storyboardFrameRange(scene,fps),sourceStartMs=rawScene.startMs+(range.from/fps*1000-(scene.phaseStartMs??scene.startMs))*speed,durationFrames=range.durationInFrames,start=Math.round(sourceStartMs/1000*fps),framing={x:50,y:50,scale:1,shiftY:0,...baseSpeaker,...rawScene.speaker},manual=sampleTransform(clip.transform,(sourceStartMs+frame/fps*1000*speed)/1000);
 const expectedSec=(sourceStartMs+frame/fps*1000*speed)/1000,expected=useRef(expectedSec);expected.current=expectedSec;
 const callbacks=useRef({onStatus,onSourceReport,identity,fps});callbacks.current={onStatus,onSourceReport,identity,fps};
 // OffthreadVideo refetches and clears its decoded image when onError changes.
 // Readiness rerenders must keep callbacks stable while reading the current slot.
 const handleSourceError=useCallback(()=>{const current=callbacks.current;current.onStatus('blocked');current.onSourceReport?.({...dynamicSourceSlotReport(ref.current,current.identity,expected.current*1000,current.fps),status:'blocked'});},[]);
 const handleRenderedFrame=useCallback((image:CanvasImageSource)=>{const current=callbacks.current;if(current.onSourceReport){const report=dynamicRenderedSourceSlotReport(image,current.identity,expected.current*1000);current.onSourceReport(report);current.onStatus(report.status);}else current.onStatus('ready');},[]);
 const check=useCallback(()=>{const video=ref.current;if(!video)return;if(onSourceReport){const report=dynamicSourceSlotReport(video,identity,expected.current*1000,fps);onSourceReport(report);onStatus(report.status);return;}const current=video.readyState>=2&&video.videoWidth===identity.width&&video.videoHeight===identity.height&&Math.abs(video.currentTime-expected.current)<.6;onStatus(video.error?'blocked':current?'ready':'waiting');},[identity.width,identity.height,identity.src,identity.sha256,onStatus,onSourceReport,fps]);
 useLayoutEffect(()=>{if(!rendering)check();},[frame,check,rendering]);
 useLayoutEffect(()=>{if(!rendering&&strictPreviewClock)return observePreviewMedia(ref.current,check);},[frame,check,rendering,strictPreviewClock]);
 useEffect(()=>{if(!rendering&&strictPreviewClock)check();},[frame,check,rendering,strictPreviewClock]);
 useEffect(()=>{onStatus('waiting');},[identity.src,identity.sha256,sourceStartMs,onStatus]);
 const common={src:staticFile(identity.src),trimBefore:start,trimAfter:start+Math.round(durationFrames*speed),playbackRate:speed,muted:true,volume:0,style:{width:'100%',height:'100%',objectFit:clip.fit??'cover',objectPosition:`${framing.x-manual.x}% ${framing.y-manual.y}%`,...(alphaMask?{maskImage:`url(${alphaMask})`,WebkitMaskImage:`url(${alphaMask})`,maskSize:clip.fit??'cover',WebkitMaskSize:clip.fit??'cover',maskPosition:`${framing.x-manual.x}% ${framing.y-manual.y}%`,WebkitMaskPosition:`${framing.x-manual.x}% ${framing.y-manual.y}%`,maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat'}:{})} as React.CSSProperties,onError:handleSourceError};
 return <div data-dynamic-person="true" data-source-src={identity.src} data-dynamic-real-source={realSpeaker?identity.src:undefined} style={{width:'100%',height:'100%',overflow:'hidden'}}><div style={{width:'100%',height:'100%',transform:`translateY(${framing.shiftY}%) scale(${framing.scale*manual.scale})`,transformOrigin:'center'}}>{rendering?<OffthreadVideo {...common} onVideoFrame={handleRenderedFrame}/>:<Video {...common} ref={ref} {...(strictPreviewClock?{pauseWhenBuffering:true}:{})} onLoadedData={check} onSeeked={check} onTimeUpdate={check} onCanPlay={check}/>}</div></div>;
}

export function DynamicMotionRenderer({scene,rawScene,config,clips,identity,assetIdentities=[],matteEvidence,draftKey,baseSpeaker,unavailableIssues=[],onReadiness}:{scene:StoryScene;rawScene:StoryScene;config:SceneDynamicMotionConfig;clips:Clip[];identity:DynamicSourceIdentity;assetIdentities?:DynamicSourceIdentity[];matteEvidence?:DynamicMatteEvidence;draftKey?:string;baseSpeaker?:{x?:number;y?:number;scale?:number};unavailableIssues?:string[];onReadiness?:(report:DynamicRenderReadiness)=>void}){
 const {width,height,fps}=useVideoConfig(),frame=useCurrentFrame(),outerReport=useContext(DynamicRenderReportContext),audioMixer=useAudioClockMixer(),elapsed=(storyboardFrameRange(scene,fps).from/fps*1000-(scene.phaseStartMs??scene.startMs)+frame/fps*1000)*(scene.speed??1);
 const needsMatte=requiresDynamicMatte(config),matteProblems=dynamicMatteEvidenceIssues(rawScene,config,{sourceIdentity:identity,matteEvidence}),matte=useDynamicMatteFrame(needsMatte&&!matteProblems.length?matteEvidence:undefined,rawScene.startMs+elapsed),[matteStatus,setMatteStatus]=useState<{key:string;status:'waiting'|'blocked'|'ready'}>({key:'',status:'waiting'}),[background,setBackground]=useState<{status:'waiting'|'blocked'|'ready';sourceMs:number}>({status:'waiting',sourceMs:-1});
 const reportMatte=useCallback((v:{key:string;status:'waiting'|'blocked'|'ready'})=>setMatteStatus(p=>p.key===v.key&&p.status===v.status?p:v),[]),reportBackground=useCallback((v:FullFrameSourceSlotReport)=>setBackground(p=>p.status===v.status&&p.sourceMs===v.sourceMs?p:{status:v.status,sourceMs:v.sourceMs}),[]);
 const clip=clips.find(item=>item.id===scene.clipId),signature=JSON.stringify([scene,rawScene,config,clips,identity,assetIdentities,matteEvidence,width,height,fps]),[source,setSource]=useState<{key:string;status:'waiting'|'blocked'|'ready'}>({key:'',status:'waiting'}),[native,setNative]=useState<{key:string;status:'waiting'|'blocked'|'ready';issues:string[]}>({key:'',status:'waiting',issues:[]}),assets=useLoadedAssets(rawScene);
 const sourceStatus=useCallback((status:'waiting'|'blocked'|'ready')=>setSource(previous=>previous.key===signature&&previous.status===status?previous:{key:signature,status}),[signature]);
 const nativeReport=useCallback((value:{status:'waiting'|'blocked'|'ready';issues:string[]})=>setNative(previous=>previous.key===signature&&previous.status===value.status&&JSON.stringify(previous.issues)===JSON.stringify(value.issues)?previous:{key:signature,status:value.status,issues:value.issues}),[signature]);
 const invalid=!!unavailableIssues.length||!!matteProblems.length||!clip||!identity||identity.kind!=='video'||identity.src!==rawScene.src||scene.src!==rawScene.src||!sha(identity.sha256)||!(identity.width>0)||!(identity.height>0);
 const ordinarySource=source.key===signature?source.status:'waiting',hasBackground=needsMatte&&!!('matchToLive' in config&&config.matchToLive||'matchToDiagram' in config&&config.matchToDiagram),matteReady=!!matte.resource&&matteStatus.key===matte.resource.key&&matteStatus.status==='ready',backgroundReady=background.status==='ready'&&Math.abs(background.sourceMs-(rawScene.startMs+elapsed))<=1000/fps+.1,currentSource=needsMatte?(matte.error||matte.resource&&matteStatus.key===matte.resource.key&&matteStatus.status==='blocked'||background.status==='blocked'?'blocked':matteReady&&(!hasBackground||backgroundReady)?'ready':'waiting'):ordinarySource,currentNative=native.key===signature?native.status:'waiting',issues=[...unavailableIssues,...matteProblems,...(matte.error?[matte.error]:[]),...(invalid&&!unavailableIssues.length?['当前原片身份、尺寸或保留实例未绑定']:[]),...(native.key===signature?native.issues:[]),...assets.issues],status=invalid||currentSource==='blocked'||currentNative==='blocked'||assets.status==='blocked'?'blocked':currentSource==='ready'&&currentNative==='ready'&&assets.status==='ready'?'ready':'waiting',issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{const report={status,issues:JSON.parse(issueKey),nativeStatus:currentNative,sourceStatus:currentSource,assetStatus:assets.status,projectionId:scene.id} as DynamicRenderReadiness;onReadiness?.(report);outerReport?.(report);},[status,issueKey,currentNative,currentSource,assets.status,scene.id,onReadiness,outerReport]);
 const fallbackIdentity:DynamicSourceIdentity={src:clip?.src??rawScene.src??'',sha256:'',kind:'video',width:clip?.sourceWidth??0,height:clip?.sourceHeight??0},currentIdentity=invalid?(identity&&identity.src===clip?.src?identity:fallbackIdentity):identity;
 const projectionProof={rawScene,clips,fps},speakerProof={kind:'same-source-video' as const,src:currentIdentity?.src??'',sha256:currentIdentity?.sha256??'',startMs:rawScene.startMs,endMs:rawScene.endMs};
 const audioSpeakerReport=useCallback((report:FullFrameSourceSlotReport)=>audioMixer.reportSpeaker(scene.id,invalid?{...report,status:'blocked'}:report),[audioMixer.reportSpeaker,scene.id,invalid]);
 const renderRgb=()=>clip?<DynamicSpeakerVideo scene={scene} rawScene={rawScene} clip={clip} identity={currentIdentity} onStatus={sourceStatus} onSourceReport={config.kind==='audio-clock-ab'?audioSpeakerReport:undefined} strictPreviewClock={config.kind==='audio-clock-ab'} baseSpeaker={baseSpeaker}/>:null;
 const personCamera=clip?dynamicPersonFraming(rawScene,clip,baseSpeaker,sampleTransform(clip.transform,(rawScene.startMs+elapsed)/1000)):null;
 const renderSpeaker=(request?:{mode?:string})=>needsMatte&&request?.mode==='cutout'&&matteEvidence&&personCamera?<DynamicMattePerson resource={matte.resource} draftKey={draftKey??''} sequenceSha256={matteEvidence.sequenceSha256} style={personCamera.image} outerStyle={personCamera.outer} fallback={renderRgb()} onStatus={reportMatte}/>:renderRgb();
 const liveBackground=hasBackground&&clip?<DynamicSpeakerVideo scene={scene} rawScene={rawScene} clip={clip} identity={currentIdentity} onStatus={ignoreSourceStatus} onSourceReport={reportBackground} realSpeaker={false} baseSpeaker={baseSpeaker} alphaMask={matte.resource?.inverseUrl}/>:undefined;
 const renderFullFrameSource:FullFrameSourceRenderer=request=>clip?<DynamicSpeakerVideo key={request.slotId} scene={scene} rawScene={rawScene} clip={clip} identity={currentIdentity} onStatus={request.slotId==='speaker'?sourceStatus:ignoreSourceStatus} onSourceReport={request.onSourceStatus} realSpeaker={request.slotId==='speaker'} baseSpeaker={baseSpeaker}/>:null;
 const handoffProof={...speakerProof,width:currentIdentity.width,height:currentIdentity.height,status:currentSource,sourceMs:rawScene.startMs+elapsed,fps,muted:true as const,audioOwner:'external-single-track' as const,preservesFraming:true as const};
 const handoffTarget=config.kind==='full-frame-blur-zoom'&&config.target?.kind==='scene-image'?config.target.identity:undefined,handoffAsset=handoffTarget?assetIdentities.find(a=>a.kind==='image'&&a.src===handoffTarget.src):undefined;
 const point=sampleSceneWindow(rawScene,elapsed),layoutBox=speakerBox(sceneSpeakerLayout({...rawScene,visualPreset:undefined}),width,height),fallback:StageRect=point?{x:point.x,y:point.y,width:point.size,height:point.size*width/height}:{x:layoutBox.left/width,y:layoutBox.top/height,width:layoutBox.width/width,height:layoutBox.height/height};
 const old=oldKinds.has(config.kind),owns=config.kind==='evidence-handoff'||config.kind==='hub-branch-flow'&&!!config.matchToDiagram||['closed-loop-runner','bounded-agent-runner','quantified-funnel-flow','quantitative-chart','paired-relations','full-frame-blur-zoom','field-roll-board'].includes(config.kind),rect=old&&!invalid?completeSourceCopySpeaker(scene,config as DynamicMechanismConfig,elapsed,{width,height})??fallback:fallback;
 let content:React.ReactNode;
 if(phraseKinds.has(config.kind))content=<PhraseChoreographyScene scene={scene} config={config as PhraseChoreographyConfig} elapsed={elapsed} onReadiness={nativeReport}/>;
 else if(old)content=<DynamicMechanismScene scene={scene} config={config as DynamicMechanismConfig} elapsed={elapsed} renderSpeaker={renderSpeaker} liveBackground={liveBackground} hasRealCutout={needsMatte&&!matteProblems.length} speakerRenderedExternally={!owns} onReadiness={nativeReport}/>;
 else if(config.kind==='source-token-transfer')content=<SourceTokenTransferScene scene={scene} config={config} elapsed={elapsed} onReadiness={nativeReport}/>;
 else if(config.kind==='persistent-entities')content=<PersistentEntitiesScene scene={scene} rawScene={rawScene} config={config} elapsed={elapsed} identity={identity} assets={assetIdentities} projectionProof={{...projectionProof,captions:(rawScene.dynamicMotion?.contextSnapshot as {captions?:import('./captions').Caption[]}|undefined)?.captions??[]}} onReadiness={nativeReport}/>;
 else if(config.kind==='typed-data-clock')content=<TypedDataClockScene scene={scene} rawScene={rawScene} config={config} elapsed={elapsed} identity={identity} proof={{...projectionProof,captions:(rawScene.dynamicMotion?.contextSnapshot as {captions?:import('./captions').Caption[]}|undefined)?.captions??[]}} onReadiness={nativeReport}/>;
 else if(config.kind==='conditional-set')content=<ConditionalSetScene config={config} context={conditionalSetCurrentContext(rawScene,scene,identity,assetIdentities,clips,fps,(rawScene.dynamicMotion?.contextSnapshot as {captions?:import('./captions').Caption[]}|undefined)?.captions??[],{width,height})} sourceMs={rawScene.startMs+elapsed} onReadiness={nativeReport}/>;
 else if(config.kind==='field-roll-board')content=<FieldRollBoardScene scene={scene} config={config} elapsed={elapsed} projectionProof={{...projectionProof,captions:(rawScene.dynamicMotion?.contextSnapshot as {captions?:import('./captions').Caption[]}|undefined)?.captions??[]}} speakerProof={speakerProof} renderSpeaker={renderSpeaker} onReadiness={nativeReport}/>;
 else if(config.kind==='closed-loop-runner'||config.kind==='bounded-agent-runner')content=<PathRunnerScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} speakerProof={speakerProof} renderSpeaker={renderSpeaker} onReadiness={nativeReport}/>;
 else if(config.kind==='quantified-funnel-flow')content=<FunnelFlowScene scene={scene} config={config} elapsed={elapsed} renderSpeaker={renderSpeaker} onReadiness={nativeReport}/>;
 else if(config.kind==='quantitative-chart')content=<QuantitativeChartScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} speakerProof={speakerProof} renderSpeaker={renderSpeaker} onReadiness={nativeReport}/>;
 else if(config.kind==='progressive-ui')content=<ProgressiveUiScene scene={scene} config={config} elapsed={elapsed} onReadiness={nativeReport}/>;
 else if(config.kind==='paired-relations')content=<PairedRelationsScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} speakerProof={speakerProof} renderSpeaker={renderSpeaker} onReadiness={nativeReport}/>;
 else if(config.kind==='veil-state')content=<VeilStateScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} onReadiness={nativeReport}/>;
 else if(config.kind==='full-frame-blur-zoom')content=<FullFrameHandoffScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} sourceProof={handoffProof} assetIdentity={handoffAsset?.kind==='image'?{...handoffAsset,kind:'image'}:undefined} renderSpeaker={renderFullFrameSource} onReadiness={nativeReport}/>;
 else if(config.kind==='audio-clock-ab')content=<AudioClockScene scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} runtime={audioMixer.runtimeFor(scene.id,elapsed)} onReadiness={nativeReport}/>;
 else content=<TaskTracksScene scene={scene} config={config as TaskTracksConfig} elapsed={elapsed} onReadiness={nativeReport}/>;
 return <AbsoluteFill data-dynamic-draft-key={draftKey} data-dynamic-projection-id={scene.id} data-dynamic-source-ms={rawScene.startMs+elapsed} data-dynamic-preview-status={status} data-dynamic-preview-kind={config.kind} data-dynamic-preview-issues={issues.join('；')} style={{pointerEvents:'none'}}>{(!owns||invalid)&&<div style={{position:'absolute',left:rect.x*width,top:rect.y*height,width:rect.width*width,height:rect.height*height,borderRadius:point?'50%':layoutBox.radius,overflow:'hidden'}}>{renderSpeaker()}</div>}{!invalid&&content}</AbsoluteFill>;
}
