import React,{useCallback,useContext,useLayoutEffect,useState}from'react';
import{AbsoluteFill,useVideoConfig}from'remotion';
import{DisplayFontContext}from'./DisplayFont';
import{useMeasuredText}from'./MeasuredText';
import{useTypedClockGlyphLayout,TypedClockDigits}from'./TypedClockDigits';
import{sourceTokenPageState}from'./source-token-transfer.mjs';
import type{StoryScene}from'./storyboard.mjs';import type{TextFit}from'./text-fit.mjs';
import{compileTypedClockMotion,typedClockMotionIssues,typedClockMotionKey,typedClockMotionReadiness,typedClockMotionSample,type TypedClockMotionConfig,type TypedClockIdentity,type TypedClockProof,type TypedClockField,type TypedClockNumberPlan,type TypedClockGlyphLayout}from'./typed-clock-motion.mjs';
type Report={id:string;text:string;fit:TextFit|null;family:string};type NumberReport={id:string;specKey:string;fit:TypedClockGlyphLayout|null};
type Readiness={status:'ready'|'waiting'|'blocked';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true};
type Props={scene:StoryScene;rawScene:StoryScene;config:TypedClockMotionConfig;elapsed:number;identity:TypedClockIdentity;proof:TypedClockProof;onReadiness?:(r:Readiness)=>void};
function Measure({field,onReport}:{field:TypedClockField;onReport:(r:Report)=>void}){const{width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width,field.rect.height*height,{minFont:height*.025,maxFont:height*(field.role==='copy'?.055:.04),weight:600,preferredPhrases:field.text.split('\n')});useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;}
function MeasureDigits({plan,onReport}:{plan:TypedClockNumberPlan;onReport:(r:NumberReport)=>void}){const{width,height}=useVideoConfig(),specKey=JSON.stringify(plan),fit=useTypedClockGlyphLayout(plan,plan.rect.width*width,plan.rect.height*height);useLayoutEffect(()=>onReport({id:plan.id,specKey,fit}),[plan.id,specKey,fit,onReport]);return null;}
function Prepared(props:Props){
 const{scene,rawScene,config,identity,elapsed,proof,onReadiness}=props,{width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'none',viewport={width,height},key=typedClockMotionKey(scene,rawScene,config,identity,viewport,proof,fontKey),compiled=compileTypedClockMotion(rawScene,config);
 const[reports,setReports]=useState<{key:string;fields:Record<string,Report>;numbers:Record<string,NumberReport>}>({key:'',fields:{},numbers:{}});
 const fieldReport=useCallback((r:Report)=>setReports(p=>{const current=p.key===key?p:{key,fields:{},numbers:{}};return JSON.stringify(current.fields[r.id])===JSON.stringify(r)?p:{...current,fields:{...current.fields,[r.id]:r}};}),[key]);
 const numberReport=useCallback((r:NumberReport)=>setReports(p=>{const current=p.key===key?p:{key,fields:{},numbers:{}};return JSON.stringify(current.numbers[r.id])===JSON.stringify(r)?p:{...current,numbers:{...current.numbers,[r.id]:r}};}),[key]);
 const current=reports.key===key?reports:{key,fields:{},numbers:{}},measurement={key,fontKey,fields:Object.values(current.fields),numbers:Object.values(current.numbers).filter(n=>n.fit).map(n=>({id:n.id,specKey:n.specKey,unplaceable:n.fit!.unplaceable}))},readyState=typedClockMotionReadiness(scene,rawScene,config,identity,viewport,proof,measurement),sample=typedClockMotionSample(scene,rawScene,config,identity,proof,elapsed),status=sample.status==='blocked'?'blocked':readyState.status,issues=sample.status==='blocked'?sample.issues:readyState.issues,issueKey=JSON.stringify(issues),ready=status==='ready';
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[status,issueKey,onReadiness]);
 const px=(r:{x:number;y:number;width:number;height:number})=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});
 return<AbsoluteFill data-experimental-mechanism="typed-data-clock" data-layout-status={status} style={{pointerEvents:'none'}}>
 {compiled.fields.map(f=><Measure key={f.id} field={f} onReport={fieldReport}/>)}{compiled.numbers.map(n=><MeasureDigits key={n.id} plan={n} onReport={numberReport}/>)}
 {ready&&<>
  {compiled.fields.map(f=>{const r=current.fields[f.id],fit=r?.fit;if(!fit)return null;const page=sourceTokenPageState(fit.pages,elapsed,{atMs:f.startMs,endMs:f.endMs});return page.visible?<div key={f.id} data-measured-text="true" data-clock-field={f.id} style={{position:'absolute',...px(f.rect),fontFamily:r.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#edf5ff'}}>{fit.pages.map((lines,i)=><div key={i} aria-hidden={i!==page.index} style={{position:'absolute',inset:0,opacity:i===page.index?1:0}}>{lines.map((line,j)=><div key={j}>{line||'\u00a0'}</div>)}</div>)}</div>:null;})}
  {sample.tracks.filter(t=>t.visible).map(t=>{const c=compiled.tracks.find(c=>c.id===t.id)!,n=compiled.numbers.find(n=>n.id===t.id)!,fit=current.numbers[t.id]?.fit;if(!fit||t.text===null)return null;const digits=[...t.text],slots=Array(Math.max(0,n.slots-digits.length)).fill(' ').concat(digits),g=c.geometry,r=g.rect,progress=t.geometryProgress??0;return<React.Fragment key={t.id}>
   <div data-clock-value={t.id} data-clock-mode={t.mode} data-clock-progress={t.progress??'static'} style={{position:'absolute',...px(n.rect)}}><TypedClockDigits text={t.text} plan={n} fit={fit}/></div>
   {g.kind!=='none'&&r&&<svg data-clock-geometry={t.id} data-source-derived-progress={progress} width={r.width*width} height={r.height*height} style={{position:'absolute',...px(r)}} viewBox="0 0 100 100" preserveAspectRatio="none">{g.kind==='bar'?<><rect width="100" height="100" rx="4" fill="#20374e"/><rect width={progress*100} height="100" rx="4" fill="#8ed9ec"/></>:<><circle cx="50" cy="50" r="44" fill="none" stroke="#29465d" strokeWidth="8"/><circle cx="50" cy="50" r="44" fill="none" stroke="#8ed9ec" strokeWidth="8" strokeDasharray={`${progress*2*Math.PI*44} ${2*Math.PI*44}`} transform="rotate(-90 50 50)"/></>}</svg>}
  </React.Fragment>;})}
 </>}
 </AbsoluteFill>;
}
/** Overlay only: central current decoded person and sole audio owner persist. */
export function TypedDataClockScene(props:Props){const viewport=useVideoConfig(),issues=typedClockMotionIssues(props.scene,props.rawScene,props.config,props.identity,viewport,props.proof),key=JSON.stringify(issues);useLayoutEffect(()=>{if(issues.length)props.onReadiness?.({status:'blocked',issues:JSON.parse(key),canApply:false,uiAccepted:false,needsFaceReview:true});},[key,props.onReadiness]);return issues.length?<AbsoluteFill data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>:<Prepared {...props}/>;}
