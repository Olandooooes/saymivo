import React,{useCallback,useContext,useLayoutEffect,useRef,useState}from'react';
import{AbsoluteFill,Img,staticFile,useVideoConfig}from'remotion';
import{DisplayFontContext}from'./DisplayFont';
import{useMeasuredText}from'./MeasuredText';
import{sourceTokenPageState}from'./source-token-transfer.mjs';
import type{StoryScene}from'./storyboard.mjs';
import type{TextFit}from'./text-fit.mjs';
import{compilePersistentMotion,persistentMotionIssues,persistentMotionKey,persistentMotionReadiness,persistentMotionSample,persistentMotionImageRect,type PersistentMotionConfig,type PersistentIdentity,type PersistentField,type PersistentMedia,type PersistentProjectionProof}from'./persistent-motion.mjs';
type Report={id:string;text:string;fit:TextFit|null;family:string};
type MediaReport={id:string;asset:PersistentMedia['asset'];status:'waiting'|'ready'|'error'};
type Readiness={status:'ready'|'waiting'|'blocked';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true};
type Props={scene:StoryScene;rawScene:StoryScene;config:PersistentMotionConfig;elapsed:number;identity:PersistentIdentity;assets:PersistentIdentity[];projectionProof:PersistentProjectionProof;onReadiness?:(r:Readiness)=>void};
function Measure({field,onReport}:{field:PersistentField;onReport:(r:Report)=>void}){
 const{width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width,field.rect.height*height,{minFont:height*.026,maxFont:height*(field.role==='copy'?.06:.04),weight:600,preferredPhrases:field.text.split('\n')});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function TextPlane({field,report,elapsed}:{field:PersistentField;report:Report;elapsed:number}){
 const{width,height}=useVideoConfig(),fit=report?.fit;if(!fit)return null;const page=sourceTokenPageState(fit.pages,elapsed,field);if(!page.visible)return null;
 return<div data-measured-text="true" data-persistent-field={field.id} data-persistent-page={page.index} style={{position:'absolute',left:field.rect.x*width,top:field.rect.y*height,width:field.rect.width*width,height:field.rect.height*height,fontFamily:report.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#ecf5ff',zIndex:20}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={index!==page.index} style={{position:'absolute',inset:0,opacity:index===page.index?1:0}}>{lines.map((line,i)=><div key={i}>{line||'\u00a0'}</div>)}</div>)}</div>;
}
function ImageEntity({media,rect,visible,onReport}:{media:PersistentMedia;rect:{x:number;y:number;width:number;height:number};visible:boolean;onReport:(r:MediaReport)=>void}){
 const{width,height}=useVideoConfig(),ref=useRef<HTMLImageElement>(null),check=useCallback(()=>{const image=ref.current;if(image?.complete)onReport({id:media.id,asset:media.asset,status:image.naturalWidth===media.asset.width&&image.naturalHeight===media.asset.height?'ready':'error'});},[media.id,JSON.stringify(media.asset),onReport]);
 useLayoutEffect(check,[check]);
 return<Img ref={ref} data-persistent-image={media.id} src={staticFile(media.asset.src)} onLoad={check} onError={()=>onReport({id:media.id,asset:media.asset,status:'error'})} style={{position:'absolute',left:rect.x*width,top:rect.y*height,width:rect.width*width,height:rect.height*height,objectFit:'contain',opacity:visible?1:0,background:'#14243ce8',border:'1px solid #99bce960',borderRadius:height*.009,boxSizing:'border-box'}}/>;
}
function Prepared(props:Props){
 const{scene,rawScene,config,identity,assets,elapsed,projectionProof,onReadiness}=props,{width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'none',viewport={width,height},key=persistentMotionKey(rawScene,config,identity,assets,viewport,fontKey,scene),compiled=compilePersistentMotion(rawScene,config,identity,assets);
 const[reports,setReports]=useState<{key:string;fields:Record<string,Report>;media:Record<string,MediaReport>}>({key:'',fields:{},media:{}});
 const report=useCallback((r:Report)=>setReports(p=>{const current=p.key===key?p:{key,fields:{},media:{}};return JSON.stringify(current.fields[r.id])===JSON.stringify(r)?p:{...current,fields:{...current.fields,[r.id]:r}};}),[key]);
 const reportMedia=useCallback((r:MediaReport)=>setReports(p=>{const current=p.key===key?p:{key,fields:{},media:{}};return JSON.stringify(current.media[r.id])===JSON.stringify(r)?p:{...current,media:{...current.media,[r.id]:r}};}),[key]);
 const current=reports.key===key?reports:{key,fields:{},media:{}},m={key,fontKey,fields:Object.values(current.fields),media:Object.values(current.media)},readiness=persistentMotionReadiness(scene,rawScene,config,identity,assets,viewport,projectionProof,m),state=persistentMotionSample(scene,rawScene,config,identity,assets,elapsed),valid=state.status==='valid',status=valid?readiness.status:'blocked',issues=valid?readiness.issues:state.issues,issueKey=JSON.stringify(issues),ready=status==='ready';
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[status,issueKey,onReadiness]);
 const px=(r:{x:number;y:number;width:number;height:number})=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});
 const checklist=config.checklist,showTasks=!!checklist&&elapsed>=checklist.atMs&&elapsed<checklist.summaryAtMs;
 return<AbsoluteFill data-experimental-mechanism="persistent-entities" data-layout-status={status} data-mechanism-unavailable={status==='blocked'?issues.join('；'):undefined} style={{pointerEvents:'none'}}>
  {compiled.fields.map(f=><Measure key={f.id} field={f} onReport={report}/>)}
  {compiled.media.map(media=>{const e=state.entities[media.id],r=persistentMotionImageRect(e?.worldPose??media.entryRect);return<ImageEntity key={media.id+':'+media.asset.sha256} media={media} rect={r} visible={ready&&!!e?.active} onReport={reportMedia}/>;})}
  {ready&&<>
   {showTasks&&checklist!.items.map(i=>{const e=state.entities[i.id],r=e.worldPose!;return<div key={i.id} data-persistent-entity={i.id} data-persistent-task-status={e.status} style={{position:'absolute',...px(r),border:'1px solid #91b7e866',borderRadius:10,background:e.status==='done'?'#17485ce8':'#18283de8'}}><svg aria-hidden="true" width={r.width*width*.055} height={r.height*height*.6} viewBox="0 0 24 24" style={{position:'absolute',left:'1%',top:'20%'}}>{e.status==='done'?<path d="M4 12l5 5L20 5" fill="none" stroke="#9be6d8" strokeWidth="3"/>:<circle cx="12" cy="12" r="8" fill="none" stroke="#a3b6d6" strokeWidth="2"/>}</svg></div>;})}
   {checklist&&elapsed>=checklist.summaryAtMs&&(()=>{const e=state.entities[checklist.id+':summary'],r=e?.worldPose;return r?<div data-persistent-summary={e.id} data-member-count={e.summary?.members.length} data-summary-snapshot-at={e.summary?.atMs} style={{position:'absolute',...px(r),background:'#16415ce8',border:'2px solid #8edcca',borderRadius:height*.012}}/>:null;})()}
   {checklist&&elapsed>=checklist.archiveAtMs&&elapsed<checklist.archiveEndMs&&(()=>{const e=state.entities[checklist.id+':summary'],r=e?.worldPose,f=compiled.fields.find(f=>f.id==='summary:'+checklist.id);if(!r||!f)return null;return<TextPlane field={{...f,rect:{...f.rect,x:r.x+(r.width-f.rect.width)/2,y:r.y+(r.height-f.rect.height)/2}}} report={current.fields[f.id]} elapsed={checklist.archiveAtMs-.001}/>;})()}
   {compiled.fields.map(f=><TextPlane key={f.id} field={f} report={current.fields[f.id]} elapsed={elapsed}/>)}
  </>}
 </AbsoluteFill>;
}
/** Overlay only; the central renderer keeps the actual source person/audio. */
export function PersistentEntitiesScene(props:Props){
 const viewport=useVideoConfig(),issues=persistentMotionIssues(props.scene,props.rawScene,props.config,props.identity,props.assets,viewport,props.projectionProof),key=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)props.onReadiness?.({status:'blocked',issues:JSON.parse(key),canApply:false,uiAccepted:false,needsFaceReview:true});},[key,props.onReadiness]);
 return issues.length?<AbsoluteFill data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>:<Prepared {...props}/>;
}
