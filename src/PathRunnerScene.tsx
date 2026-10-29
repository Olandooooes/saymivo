import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import type {StoryScene} from './storyboard.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import type {TextFit} from './text-fit.mjs';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {pathRunnerFieldPlan,pathRunnerIssues,pathRunnerMeasurementKey,pathRunnerPathD,pathRunnerState,type PathRunnerConfig,type PathRunnerField,type PathRunnerMeasurement,type PathRunnerSpeakerProof,type PathRunnerProjectionProof} from './path-runner.mjs';

export type PathRunnerPreviewReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true};
export type PathRunnerSpeakerRenderer=(props:{width:number;height:number;elapsed:number;sourceMs:number;mode:'inset'})=>React.ReactNode;
type MeasuredField={id:string;text:string;fit:TextFit|null;family:string};
const px=(rect:StageRect,width:number,height:number)=>({left:rect.x*width,top:rect.y*height,width:rect.width*width,height:rect.height*height});
export function pathRunnerSpeakerHasContent(value:React.ReactNode):boolean{
 if(Array.isArray(value))return value.some(pathRunnerSpeakerHasContent);
 if(!React.isValidElement<{children?:React.ReactNode}>(value))return false;
 if(value.type===React.Fragment)return pathRunnerSpeakerHasContent(value.props.children);
 return typeof value.type==='string'?['video','canvas','img'].includes(value.type)||pathRunnerSpeakerHasContent(value.props.children):true;
}

function MeasureField({field,onReport}:{field:PathRunnerField;onReport:(field:MeasuredField)=>void}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width*.94,field.rect.height*height*.88,{minFont:height*.027,maxFont:height*(field.role==='copy'?.067:.046),weight:600,protectedPhrases:field.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function TextPlane({measured,field,elapsed}:{measured:MeasuredField;field:PathRunnerField;elapsed:number}){
 const fit=measured.fit;if(!fit)return null;const duration=(field.endSec-field.startSec)*1000,page=Math.min(fit.pages.length-1,Math.max(0,Math.floor((elapsed-field.startSec*1000)/duration*fit.pages.length)));
 return <div data-path-copy-field={field.id} data-path-copy-page={page} style={{width:'100%',height:'100%',fontFamily:measured.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#e9f4ff'}}>{fit.pages.map((lines,index)=><div key={index} data-path-text-page={index} aria-hidden={index!==page} style={{position:'absolute',inset:0,opacity:index===page?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div>;
}

function PreparedPathRunner({scene,config,elapsed,speakerProof,speakerContent,projectionProof,onReadiness}:{scene:StoryScene;config:PathRunnerConfig;elapsed:number;speakerProof:PathRunnerSpeakerProof;speakerContent:React.ReactNode;projectionProof?:PathRunnerProjectionProof;onReadiness?:((readiness:PathRunnerPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',key=pathRunnerMeasurementKey(scene,config,{width,height},fontKey),plan=pathRunnerFieldPlan(scene,config);
 const [reports,setReports]=useState<{key:string;fields:Record<string,MeasuredField>}>({key:'',fields:{}});
 const report=useCallback((value:MeasuredField)=>setReports(previous=>{const current=previous.key===key?previous:{key,fields:{}};if(JSON.stringify(current.fields[value.id])===JSON.stringify(value))return previous;return {key,fields:{...current.fields,[value.id]:value}};}),[key]);
 const current=reports.key===key?reports.fields:{},measurement:PathRunnerMeasurement={key,fontKey,fields:Object.values(current)},state=pathRunnerState(scene,config,elapsed,measurement,speakerProof,{width,height},projectionProof),issueKey=JSON.stringify(state.issues);
 useLayoutEffect(()=>onReadiness?.({status:state.readiness,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[state.readiness,issueKey,onReadiness]);
 const speaker=<div data-path-real-speaker="true" style={{position:'absolute',...px(config.speakerRect,width,height),borderRadius:height*.018,overflow:'hidden'}}>{speakerContent}</div>;
 return <AbsoluteFill data-experimental-mechanism={config.kind} data-layout-status={state.readiness} data-needs-face-review="true" data-mechanism-unavailable={state.readiness==='blocked'?state.issues.join('；'):undefined} style={{pointerEvents:'none'}}>
  {plan.map(field=><MeasureField key={field.id} field={field} onReport={report}/>)}
  {state.readiness==='ready'&&<>
   {state.graphicVisible&&<svg data-path-diagram="true" width={width} height={height} style={{position:'absolute',inset:0}}>
    {config.kind==='closed-loop-runner'?<path data-explicit-closed-path="true" d={pathRunnerPathD(config.path.segments,width,height)} fill="none" stroke="#75b2d477" strokeWidth={Math.min(width,height)*.002}/>:<polyline data-clockwise-yellow-boundary="true" points={state.trace.points.map(p=>`${p.x*width},${p.y*height}`).join(' ')} fill="none" stroke="#f4cf52" strokeWidth={Math.min(width,height)*.002} strokeLinejoin="round"/>}
    {state.trail.map(point=><circle key={point.id} data-path-trail={point.id} cx={point.x*width} cy={point.y*height} r={Math.min(config.runner.width*width,config.runner.height*height)*.10} fill="#78d8ff" opacity={point.opacity*.75}/>)}
   </svg>}
   {state.fields.filter(field=>field.role!=='runner'&&field.clock.visible).map(field=>{const active=field.id===state.activeStageId,isCopy=field.role==='copy';return <div key={field.id} data-path-persistent-object={field.id} data-stage-active={active} style={{position:'absolute',...px(field.rect,width,height),boxSizing:'border-box',borderRadius:isCopy?0:height*.012,border:isCopy?'none':`1px solid ${active?'#b3ecff':'#80a3c366'}`,background:isCopy?'transparent':active?'#245478ed':'#142b43ed'}}><div style={{position:'absolute',left:'3%',top:'6%',width:'94%',height:'88%'}}><TextPlane measured={current[field.id]} field={field} elapsed={elapsed}/></div></div>;})}
   {state.runner&&<div data-path-runner="true" data-runner-phase={state.runner.phase} style={{position:'absolute',left:(state.runner.x-state.runner.width/2)*width,top:(state.runner.y-state.runner.height/2)*height,width:state.runner.width*width,height:state.runner.height*height,borderRadius:height*.012,background:'#234d6e',boxShadow:'inset 0 0 0 1px #a8e7ff'}}><div style={{position:'absolute',left:'3%',top:'6%',width:'94%',height:'88%'}}><TextPlane measured={current['runner-label']} field={plan.find(f=>f.id==='runner-label')!} elapsed={elapsed}/></div></div>}
  </>}
  {speaker}
 </AbsoluteFill>;
}

/** Standalone only. The caller supplies the actual same-source talking head. */
export function PathRunnerScene({scene,config,elapsed,speakerProof,renderSpeaker,projectionProof,onReadiness}:{scene:StoryScene;config:PathRunnerConfig;elapsed:number;speakerProof?:PathRunnerSpeakerProof;renderSpeaker?:PathRunnerSpeakerRenderer;projectionProof?:PathRunnerProjectionProof;onReadiness?:((readiness:PathRunnerPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=pathRunnerIssues(scene,config,{width,height},projectionProof),binding=config.binding;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=dynamicSceneDuration(scene))issues.push('source-elapsed-outside-original-scene');
 if(!renderSpeaker||!speakerProof||speakerProof.kind!=='same-source-video'||speakerProof.src!==binding?.src||speakerProof.sha256!==binding?.sha256||speakerProof.startMs!==binding?.startMs||speakerProof.endMs!==binding?.endMs)issues.push('same-source-real-speaker-renderer-required');
 let speakerContent:React.ReactNode=null;
 if(!issues.length&&renderSpeaker){try{speakerContent=renderSpeaker({width:config.speakerRect.width*width,height:config.speakerRect.height*height,elapsed,sourceMs:binding.startMs+elapsed,mode:'inset'});if(!pathRunnerSpeakerHasContent(speakerContent))issues.push('actual-source-speaker-output-empty');}catch{issues.push('actual-source-speaker-render-failed');}}
 const issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[issueKey,onReadiness]);
 if(issues.length||!renderSpeaker||!speakerProof)return <AbsoluteFill data-experimental-mechanism={config.kind} data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedPathRunner scene={scene} config={config} elapsed={elapsed} speakerProof={speakerProof} speakerContent={speakerContent} projectionProof={projectionProof} onReadiness={onReadiness}/>;
}
