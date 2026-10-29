import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,Img,staticFile,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import {fullFrameHandoffCopy,fullFrameHandoffIssues,fullFrameHandoffMeasurementKey,fullFrameHandoffReadiness,fullFrameHandoffState,type FullFrameHandoffConfig,type FullFrameHandoffProjectionProof,type FullFrameHandoffSourceProof,type HandoffImageIdentity} from './full-frame-handoff.mjs';

export type FullFrameSourceSlotReport={status:'waiting'|'blocked'|'ready';src:string;sha256:string;width:number;height:number;sourceMs:number;muted:boolean};
export type FullFrameSourceRenderer=(request:{width:number;height:number;elapsed:number;sourceMs:number;mode:'full-frame'|'inset';slotId:'full-frame'|'speaker';muted:true;volume:0;preserveFraming:true;onSourceStatus:(report:FullFrameSourceSlotReport)=>void})=>React.ReactNode;
export type FullFramePreviewReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;automaticAllowed:false;needsFaceReview:true};
const px=(r:StageRect,w:number,h:number)=>({left:r.x*w,top:r.y*h,width:r.width*w,height:r.height*h});
export function fullFrameSpeakerHasContent(value:React.ReactNode):boolean{
 if(Array.isArray(value))return value.some(fullFrameSpeakerHasContent);
 if(!React.isValidElement<{children?:React.ReactNode}>(value))return false;
 if(value.type===React.Fragment)return fullFrameSpeakerHasContent(value.props.children);
 return typeof value.type==='string'?['video','canvas'].includes(value.type)||fullFrameSpeakerHasContent(value.props.children):true;
}

function PreparedHandoff({scene,config,elapsed,sourceProof,assetIdentity,projectionProof,renderSpeaker,onReadiness}:{scene:StoryScene;config:FullFrameHandoffConfig;elapsed:number;sourceProof:FullFrameHandoffSourceProof;assetIdentity?:HandoffImageIdentity;projectionProof:FullFrameHandoffProjectionProof;renderSpeaker:FullFrameSourceRenderer;onReadiness?:(value:FullFramePreviewReadiness)=>void}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',text=fullFrameHandoffCopy(scene,config),window=config.copyWindow,{fit,family}=useMeasuredText(text,window.rect.width*width*.94,window.rect.height*height*.90,{minFont:height*.029,maxFont:height*.065,weight:600,protectedPhrases:text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 const key=fullFrameHandoffMeasurementKey(scene,config,{width,height},fontKey),assetKey=JSON.stringify(assetIdentity),sourceKey=JSON.stringify([config.binding,scene,config.target,config.speakerRect,width,height]),image=config.target.kind==='scene-image'?config.target.identity:null;
 const [decoded,setDecoded]=useState<{key:string;status:'waiting'|'blocked'|'ready'}>({key:'',status:'waiting'}),[slots,setSlots]=useState<{key:string;reports:Record<string,FullFrameSourceSlotReport>}>({key:'',reports:{}});
 const reportSlot=useCallback((slotId:string,value:FullFrameSourceSlotReport)=>setSlots(previous=>{const current=previous.key===sourceKey?previous:{key:sourceKey,reports:{}};return JSON.stringify(current.reports[slotId])===JSON.stringify(value)?previous:{key:sourceKey,reports:{...current.reports,[slotId]:value}};}),[sourceKey]);
 const reportFull=useCallback((value:FullFrameSourceSlotReport)=>reportSlot('full-frame',value),[reportSlot]),reportSpeaker=useCallback((value:FullFrameSourceSlotReport)=>reportSlot('speaker',value),[reportSlot]);
 let speaker:React.ReactNode=null,full:React.ReactNode=null;const outputIssues:string[]=[];
 const request={elapsed,sourceMs:config.binding.startMs+elapsed,muted:true as const,volume:0 as const,preserveFraming:true as const};
 try{speaker=renderSpeaker({...request,width:config.speakerRect.width*width,height:config.speakerRect.height*height,mode:'inset',slotId:'speaker',onSourceStatus:reportSpeaker});if(!fullFrameSpeakerHasContent(speaker))outputIssues.push('actual-clear-source-speaker-output-empty');}catch{outputIssues.push('actual-clear-source-speaker-render-failed');}
 if(config.target.kind==='source-video')try{full=renderSpeaker({...request,width,height,mode:'full-frame',slotId:'full-frame',onSourceStatus:reportFull});if(!fullFrameSpeakerHasContent(full))outputIssues.push('actual-full-frame-source-output-empty');}catch{outputIssues.push('actual-full-frame-source-render-failed');}
 const currentSlots=slots.key===sourceKey?slots.reports:{},requiredSlots=image?['speaker']:['speaker','full-frame'],slotChecks=requiredSlots.map(id=>{const p=currentSlots[id],b=config.binding;if(!p)return {status:'waiting',issue:'waiting-for-loaded-current-source-slot:'+id};if(p.status==='blocked')return {status:'blocked',issue:'actual-source-slot-decode-failed:'+id};if(p.status==='waiting')return {status:'waiting',issue:'waiting-for-loaded-current-source-slot:'+id};if(p.src!==b.src||p.sha256!==b.sha256||p.width!==b.width||p.height!==b.height||p.muted!==true||!Number.isFinite(p.sourceMs))return {status:'blocked',issue:'source-slot-identity-dimensions-or-muted-mismatch:'+id};return p.status==='ready'&&Math.abs(p.sourceMs-request.sourceMs)<=1000/sourceProof.fps+.1?{status:'ready',issue:''}:{status:'waiting',issue:'waiting-for-current-source-slot-clock:'+id};});
 const imageStatus=decoded.key===assetKey?decoded.status:'waiting',assetProof=image&&assetIdentity?{...assetIdentity,status:imageStatus}:undefined,state=fullFrameHandoffState(scene,config,elapsed,{key,fontKey,text,fit},sourceProof,assetProof,{width,height},projectionProof),issues=[...state.issues,...outputIssues,...slotChecks.filter(p=>p.issue).map(p=>p.issue)],status=state.status==='blocked'||outputIssues.length||slotChecks.some(p=>p.status==='blocked')?'blocked':state.status==='waiting'||slotChecks.some(p=>p.status==='waiting')?'waiting':'ready',enabled=status==='ready',motion=state.motion,issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true}),[status,issueKey,onReadiness]);
 useLayoutEffect(()=>()=>onReadiness?.({status:'waiting',issues:['full-frame-handoff-unmounted-or-binding-reset'],canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true}),[key,onReadiness]);
 const fitPages=fit?.pages??[],page=state.copy.index;
 return <AbsoluteFill data-experimental-mechanism="full-frame-blur-zoom" data-layout-status={status} data-mechanism-unavailable={status==='blocked'?issues.join('；'):undefined} data-needs-face-review="true" style={{pointerEvents:'none'}}>
  <AbsoluteFill data-full-frame-source-layer="true" data-full-frame-original-src={image?.src??config.binding.src} data-full-frame-phase={enabled?motion?.phase:undefined} data-media-source={image?.src??config.binding.src} style={{opacity:enabled?1:0,overflow:'hidden'}}>
   <AbsoluteFill style={{scale:enabled?motion?.scale:1,filter:`blur(${enabled?motion?.blurPx??0:0}px)`,transformOrigin:`${(config.transition.origin.x)*100}% ${(config.transition.origin.y)*100}%`}}>
    {image?<Img src={staticFile(image.src)} data-handoff-real-image="true" data-source-src={image.src} data-source-width={image.width} data-source-height={image.height} onLoad={event=>{const actual=event.currentTarget;setDecoded({key:assetKey,status:actual.naturalWidth===image.width&&actual.naturalHeight===image.height?'ready':'blocked'});}} onError={()=>setDecoded({key:assetKey,status:'blocked'})} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:full}
   </AbsoluteFill>
  </AbsoluteFill>
  {enabled&&state.copy.visible&&fit&&<div data-full-frame-copy="true" data-full-frame-copy-page={page} style={{position:'absolute',...px(window.rect,width,height),boxSizing:'border-box',borderRadius:height*.012,background:'#11243bee'}}><div style={{position:'absolute',inset:'5% 3%',fontFamily:family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#f2f7ff'}}>{fitPages.map((lines,index)=><div key={index} data-handoff-text-page={index} aria-hidden={index!==page} style={{position:'absolute',inset:0,opacity:index===page?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div></div>}
  {speaker&&<div data-handoff-clear-speaker="true" data-dynamic-real-source={config.binding.src} style={{position:'absolute',...px(config.speakerRect,width,height),borderRadius:height*.015,overflow:'hidden'}}>{speaker}</div>}
 </AbsoluteFill>;
}

/** Independent only: renders no audio, creates no replacement footage. */
export function FullFrameHandoffScene({scene,config,elapsed,sourceProof,assetIdentity,projectionProof,renderSpeaker,onReadiness}:{scene:StoryScene;config:FullFrameHandoffConfig;elapsed:number;sourceProof?:FullFrameHandoffSourceProof;assetIdentity?:HandoffImageIdentity;projectionProof?:FullFrameHandoffProjectionProof;renderSpeaker?:FullFrameSourceRenderer;onReadiness?:(value:FullFramePreviewReadiness)=>void}){
 const viewport=useVideoConfig(),issues=fullFrameHandoffIssues(scene,config,viewport,projectionProof);
 if(!sourceProof||!renderSpeaker)issues.push('current-real-source-proof-and-renderer-required');
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=(config?.binding?.endMs??0)-(config?.binding?.startMs??0))issues.push('source-elapsed-outside-original-scene');
 if(config?.target?.kind==='scene-image'){
  const expected=config.target.identity;if(!expected||!assetIdentity||assetIdentity.src!==expected.src||assetIdentity.sha256!==expected.sha256||assetIdentity.width!==expected.width||assetIdentity.height!==expected.height||assetIdentity.kind!=='image')issues.push('current-authoritative-image-identity-required');
 }
 if(!issues.length&&sourceProof){const current=fullFrameHandoffReadiness(scene,config,elapsed,null,sourceProof,assetIdentity?{...assetIdentity,status:'waiting'}:undefined,viewport,projectionProof);if(current.status==='blocked')issues.push(...current.issues);}
 const issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true});},[issueKey,onReadiness]);
 if(issues.length||!sourceProof||!projectionProof||!renderSpeaker)return <AbsoluteFill data-experimental-mechanism="full-frame-blur-zoom" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedHandoff scene={scene} config={config} elapsed={elapsed} sourceProof={sourceProof} assetIdentity={assetIdentity} projectionProof={projectionProof} renderSpeaker={renderSpeaker} onReadiness={onReadiness}/>;
}
