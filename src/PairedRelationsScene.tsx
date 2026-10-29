import React,{useCallback,useContext,useId,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import type {StoryScene} from './storyboard.mjs';
import type {TextFit} from './text-fit.mjs';
import {pairedRelationsFieldPlan,pairedRelationsIssues,pairedRelationsMeasurementKey,pairedRelationsPage,pairedRelationsReadiness,pairedRelationsState,type PairedRelationsConfig,type PairedField,type PairedMeasurement,type PairedSpeakerProof,type PairedProjectionProof,type PairedWindow} from './paired-relations.mjs';
export type PairedNativeReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true};
export type PairedSpeakerRenderer=(props:{width:number;height:number;elapsed:number;sourceMs:number;mode:'inset'})=>React.ReactNode;
export type PairedMeasuredField={id:string;text:string;fit:TextFit|null;family:string};
const px=(r:StageRect,w:number,h:number)=>({left:r.x*w,top:r.y*h,width:r.width*w,height:r.height*h});
function MeasureField({field,onReport}:{field:PairedField;onReport:(report:PairedMeasuredField)=>void}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width,field.rect.height*height,{minFont:height*(field.role==='copy'?.032:.024),maxFont:height*(field.role==='copy'?.067:field.role==='title'?.045:.048),weight:600,protectedPhrases:field.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
/** Same renderer-owned complete-copy plane and real measured-page contract as
 * SourceCopyWindow; paired native fields have their own explicit readiness plan. */
export function PairedTextPlane({field,measured,elapsed,window}:{field:PairedField;measured:PairedMeasuredField;elapsed:number;window:PairedWindow}){
 const fit=measured.fit;if(!fit)return null;const page=pairedRelationsPage(fit,elapsed,window);
 return <div data-measured-text="true" data-paired-field={field.id} data-paired-page={page.index} data-text-pages={fit.pages.length} data-layout-error={fit.unplaceable?'paired-full-text-unplaceable':undefined} style={{position:'relative',width:'100%',height:'100%',fontFamily:measured.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#e9f4ff'}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={index!==page.index} style={{position:'absolute',inset:0,opacity:index===page.index?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div>;
}
/** Pure drawing export for synthetic rendering checks. Production mounting goes
 * through PairedRelationsScene's source/geometry/loaded-font readiness gate. */
export function PairedRelationsGraphics({scene,config,elapsed,measured}:{scene:StoryScene;config:PairedRelationsConfig;elapsed:number;measured:Record<string,PairedMeasuredField>}){
 const {width,height}=useVideoConfig(),state=pairedRelationsState(scene,config,elapsed),plan=pairedRelationsFieldPlan(scene,config),field=(id:string)=>plan.find(f=>f.id===id)!,marker='paired-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),line=state.connector;
 return <>
  {state.copyVisible&&<div data-source-copy-window="true" data-paired-complete-source-copy="true" style={{position:'absolute',...px(config.copyWindow.rect,width,height)}}><PairedTextPlane field={field('paired-complete-copy')} measured={measured['paired-complete-copy']} elapsed={elapsed} window={config.copyWindow}/></div>}
  {state.graphicVisible&&<>
   <svg data-paired-relation={config.relation.type} data-paired-phase={state.phaseId??'overview'} width={width} height={height} style={{position:'absolute',inset:0}}><defs><marker id={marker} markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#93d0ed" strokeWidth="1.5"/></marker></defs><line x1={line.from.x*width} y1={line.from.y*height} x2={line.to.x*width} y2={line.to.y*height} stroke="#93d0ed" strokeWidth={Math.min(width,height)*.002} strokeDasharray={config.relation.type==='contrast'?'7 7':undefined} markerStart={line.bidirectional?'url(#'+marker+')':undefined} markerEnd={line.bidirectional?'url(#'+marker+')':undefined}/>{state.pulses.map(p=><circle key={p.id} data-paired-direction={p.direction} cx={p.x*width} cy={p.y*height} r={Math.min(width,height)*.005} fill="#c7edff"/>)}</svg>
   {scene.title&&<div data-paired-title="true" style={{position:'absolute',...px(config.titleRect,width,height)}}><PairedTextPlane field={field('paired-title')} measured={measured['paired-title']} elapsed={elapsed} window={config.graphicWindow}/></div>}
   {state.objects.map(object=><div key={object.side} data-paired-side={object.side} data-original-node={object.nodeId} data-paired-active={object.active} data-paired-motion={state.phase} style={{position:'absolute',...px(object.rect,width,height),border:`${object.active?2:1}px solid ${object.active?'#b1e5ff':'#6d8aa8'}`,borderRadius:height*.014,background:object.active?'#203a54ed':'#13273ded',boxSizing:'border-box'}}><div style={{position:'absolute',left:'4%',top:'7%',width:'92%',height:'86%'}}><PairedTextPlane field={field('paired-side-'+object.side)} measured={measured['paired-side-'+object.side]} elapsed={state.phase==='moving'?object.window.endMs-.001:elapsed} window={object.window}/></div></div>)}
   {config.relation.label&&<div data-paired-relation-label="true" style={{position:'absolute',...px(config.relation.label.rect,width,height),background:'#13273d',borderRadius:height*.008}}><PairedTextPlane field={field('paired-relation')} measured={measured['paired-relation']} elapsed={elapsed} window={config.graphicWindow}/></div>}
  </>}
 </>;
}
function PreparedPaired({scene,config,elapsed,speakerContent,projectionProof,onReadiness}:{scene:StoryScene;config:PairedRelationsConfig;elapsed:number;speakerContent:React.ReactNode;projectionProof?:PairedProjectionProof;onReadiness?:((value:PairedNativeReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'none',key=pairedRelationsMeasurementKey(scene,config,{width,height},fontKey),plan=pairedRelationsFieldPlan(scene,config),[reports,setReports]=useState<{key:string;fields:Record<string,PairedMeasuredField>}>({key:'',fields:{}});
 const report=useCallback((value:PairedMeasuredField)=>setReports(previous=>{const current=previous.key===key?previous.fields:{};if(previous.key===key&&JSON.stringify(current[value.id])===JSON.stringify(value))return previous;return {key,fields:{...current,[value.id]:value}};}),[key]);
 const current=reports.key===key?reports.fields:{},measurement:PairedMeasurement={key,fontKey,fields:Object.values(current)},readiness=pairedRelationsReadiness(scene,config,measurement,{width,height},projectionProof),issuesKey=JSON.stringify(readiness.issues);
 useLayoutEffect(()=>onReadiness?.({...readiness,issues:JSON.parse(issuesKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[readiness.status,issuesKey,onReadiness]);
 return <AbsoluteFill data-experimental-mechanism="paired-relations" data-paired-variant={config.variant} data-layout-status={readiness.status} data-needs-face-review="true" data-mechanism-unavailable={readiness.status==='blocked'?readiness.issues.join('；'):undefined} style={{pointerEvents:'none'}}>{plan.map(f=><MeasureField key={f.id} field={f} onReport={report}/>)}{readiness.status==='ready'&&<PairedRelationsGraphics scene={scene} config={config} elapsed={elapsed} measured={current}/>}<div data-paired-real-speaker="true" style={{position:'absolute',...px(config.speakerRect,width,height),overflow:'hidden',borderRadius:height*.014}}>{speakerContent}</div></AbsoluteFill>;
}
function hasContent(value:React.ReactNode):boolean{if(Array.isArray(value))return value.some(hasContent);if(!React.isValidElement<{children?:React.ReactNode}>(value))return false;if(value.type===React.Fragment)return hasContent(value.props.children);return typeof value.type==='string'?['video','canvas','img'].includes(value.type)||hasContent(value.props.children):true;}
/** Independent native renderer: no registry, store writes, invented relation,
 * audio, or implicit per-item values. The parent supplies the real source slot. */
export function PairedRelationsScene({scene,config,elapsed,speakerProof,renderSpeaker,projectionProof,onReadiness}:{scene:StoryScene;config:PairedRelationsConfig;elapsed:number;speakerProof?:PairedSpeakerProof;renderSpeaker?:PairedSpeakerRenderer;projectionProof?:PairedProjectionProof;onReadiness?:((value:PairedNativeReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=pairedRelationsIssues(scene,config,{width,height},projectionProof),binding=config?.binding;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=dynamicSceneDuration(scene))issues.push('paired-source-elapsed-outside-scene');
 if(!renderSpeaker||!speakerProof||speakerProof.kind!=='same-source-video'||speakerProof.src!==binding?.src||speakerProof.sha256!==binding?.sha256||speakerProof.startMs!==binding?.startMs||speakerProof.endMs!==binding?.endMs)issues.push('paired-real-same-source-speaker-slot-required');
 let speakerContent:React.ReactNode=null;if(!issues.length&&renderSpeaker){try{speakerContent=renderSpeaker({width:config.speakerRect.width*width,height:config.speakerRect.height*height,elapsed,sourceMs:binding.startMs+elapsed,mode:'inset'});if(!hasContent(speakerContent))issues.push('paired-real-speaker-output-empty');}catch{issues.push('paired-real-speaker-render-failed');}}
 const issuesKey=JSON.stringify(issues);useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issuesKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[issuesKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-experimental-mechanism="paired-relations" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedPaired scene={scene} config={config} elapsed={elapsed} speakerContent={speakerContent} projectionProof={projectionProof} onReadiness={onReadiness}/>;
}
