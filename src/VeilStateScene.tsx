import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {TextFit} from './text-fit.mjs';
import {veilStateFieldPlan,veilStateIssues,veilStateMeasurementKey,veilStateState,type VeilStateConfig,type VeilStateField,type VeilStateMeasurement,type VeilStateProjectionProof,type VeilStateReadiness} from './veil-state.mjs';

type Measured={id:string;text:string;fit:TextFit|null;family:string};
export type VeilStatePreviewReadiness=VeilStateReadiness&{canApply:false;uiAccepted:false;needsFaceReview:true};
function MeasureField({field,onReport}:{field:VeilStateField;onReport:(m:Measured)=>void}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width*.94,field.rect.height*height*.88,{minFont:height*.027,maxFont:height*(field.role==='copy'?.067:.046),weight:600,protectedPhrases:field.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function TextPlane({measured,page}:{measured:Measured;page:number}){
 const fit=measured.fit;if(!fit)return null;
 return <div data-veil-complete-text={measured.id} data-veil-page={page} style={{position:'absolute',left:'3%',top:'6%',width:'94%',height:'88%',fontFamily:measured.family,fontWeight:600,fontSize:fit.fontSize,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#ecf3ff'}}>{fit.pages.map((lines,index)=><div key={index} data-veil-text-page={index} aria-hidden={index!==page} style={{position:'absolute',inset:0,opacity:index===page?1:0}}>{lines.map((line,i)=><div key={i}>{line||'\u00a0'}</div>)}</div>)}</div>;
}
function PreparedVeilState({scene,config,elapsed,projectionProof,onReadiness}:{scene:StoryScene;config:VeilStateConfig;elapsed:number;projectionProof?:VeilStateProjectionProof;onReadiness?:((r:VeilStatePreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',key=veilStateMeasurementKey(scene,config,{width,height},fontKey),fields=veilStateFieldPlan(scene,config);
 const [reports,setReports]=useState<{key:string;fields:Record<string,Measured>}>({key:'',fields:{}});
 const report=useCallback((m:Measured)=>setReports(previous=>{const state=previous.key===key?previous:{key,fields:{}};return JSON.stringify(state.fields[m.id])===JSON.stringify(m)?previous:{key,fields:{...state.fields,[m.id]:m}};}),[key]);
 const current=reports.key===key?reports.fields:{},measurement:VeilStateMeasurement={key,fontKey,fields:Object.values(current)},state=veilStateState(scene,config,elapsed,measurement,{width,height},projectionProof),issueKey=JSON.stringify(state.issues);
 useLayoutEffect(()=>onReadiness?.({status:state.readiness,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[state.readiness,issueKey,onReadiness]);
 const px=(r:{x:number;y:number;width:number;height:number})=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});
 return <AbsoluteFill data-experimental-mechanism="veil-state" data-layout-status={state.readiness} data-needs-face-review="true" data-mechanism-unavailable={state.readiness==='blocked'?state.issues.join('；'):undefined} style={{pointerEvents:'none'}}>
  {fields.map(f=><MeasureField key={f.id} field={f} onReport={report}/>)}
  {state.readiness==='ready'&&<>
   {state.copy?.page.visible&&<div data-veil-source-copy="true" style={{position:'absolute',...px(state.copy.rect)}}><TextPlane measured={current['complete-copy']} page={state.copy.page.index}/></div>}
   {state.objects.filter(o=>o.visible).map(o=><div key={o.id} data-veil-object={o.id} data-source-node={o.nodeId} data-veil-phase={o.phase} data-veil-frozen={o.frozen} style={{position:'absolute',...px(o.rect),boxSizing:'border-box',overflow:'hidden',borderRadius:height*.012,border:`1px solid rgba(149,191,225,${.55+.35*o.amount})`,background:'#14283bee'}}>
    <div data-veil-object-content={o.id} style={{position:'absolute',inset:0,opacity:o.opacity,filter:`blur(${o.blurPxAt1080*height/1080}px)`}}><TextPlane measured={current[o.id]} page={o.page.index}/></div>
    <div data-veil-neutral-overlay={o.id} aria-hidden="true" style={{position:'absolute',inset:0,opacity:o.veilOpacity,background:'repeating-linear-gradient(135deg,#c8dcf0 0px,#c8dcf0 1px,#9caec6 1px,#9caec6 17px)',boxShadow:'inset 0 0 0 1px #dbedff'}}/>
   </div>)}
  </>}
 </AbsoluteFill>;
}

/** Native overlay: the caller retains its actual source video and captions. */
export function VeilStateScene({scene,config,elapsed,projectionProof,onReadiness}:{scene:StoryScene;config:VeilStateConfig;elapsed:number;projectionProof?:VeilStateProjectionProof;onReadiness?:((r:VeilStatePreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=veilStateIssues(scene,config,{width,height},projectionProof),issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[issueKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-experimental-mechanism="veil-state" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')} style={{pointerEvents:'none'}}/>;
 return <PreparedVeilState scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} onReadiness={onReadiness}/>;
}
