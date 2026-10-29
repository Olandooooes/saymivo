import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {TextFit} from './text-fit.mjs';
import {sourceTokenLineRanges} from './source-token-transfer.mjs';
import {audioClockFieldPlan,audioClockIssues,audioClockMeasurementKey,audioClockState,type AudioClockConfig,type AudioClockField,type AudioClockMeasurement,type AudioClockProjectionProof,type AudioClockReadiness,type AudioClockRuntime,type AudioClockWord} from './audio-clock.mjs';

type Measured={id:string;text:string;fit:TextFit|null;family:string};
export type AudioClockPreviewReadiness=AudioClockReadiness&{canApply:false;uiAccepted:false;automaticAllowed:false;needsFaceReview:true};
function MeasureField({field,config,onReport}:{field:AudioClockField;config:AudioClockConfig;onReport:(m:Measured)=>void}){
 const {width,height}=useVideoConfig(),words=config.takes.find(t=>t.id===field.takeId)?.wordTrack?.words??[],{fit,family}=useMeasuredText(field.text,field.rect.width*width*.94,field.rect.height*height*.88,{minFont:height*.027,maxFont:height*(field.role==='copy'?.065:.043),weight:600,protectedPhrases:[...(field.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]),...(field.role==='words'?words.map(w=>w.text):[])]});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function TextPlane({measured,page,activeWord}:{measured:Measured;page:number;activeWord?:AudioClockWord}){
 const fit=measured.fit;if(!fit)return null;const ranges=sourceTokenLineRanges(measured.text,fit.lines)??[];
 return <div data-audio-full-text={measured.id} data-audio-text-page={page} style={{position:'absolute',left:'3%',top:'6%',width:'94%',height:'88%',fontFamily:measured.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#eaf2ff'}}>{fit.pages.map((lines,index)=><div key={index} data-audio-page={index} aria-hidden={index!==page} style={{position:'absolute',inset:0,opacity:index===page?1:0}}>{lines.map((line,row)=>{
  const lineIndex=fit.pages.slice(0,index).reduce((n,p)=>n+p.length,0)+row,start=ranges[lineIndex]?.startUtf16??0;
  return <div key={row}>{activeWord?[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(line)].map(({segment,index:offset})=>{const active=start+offset>=activeWord.startUtf16&&start+offset<activeWord.endUtf16;return <span key={offset} data-audio-word-cursor={active?activeWord.id:undefined} style={{color:active?'#78dcff':'inherit',textDecoration:active?'underline':'none',textUnderlineOffset:'.18em'}}>{segment}</span>;}):line||'\u00a0'}</div>;
 })}</div>)}</div>;
}
function PreparedAudioClock({scene,config,elapsed,runtime,projectionProof,onReadiness}:{scene:StoryScene;config:AudioClockConfig;elapsed:number;runtime?:AudioClockRuntime;projectionProof?:AudioClockProjectionProof;onReadiness?:((r:AudioClockPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',key=audioClockMeasurementKey(scene,config,{width,height},fontKey),plan=audioClockFieldPlan(scene,config);
 const [reports,setReports]=useState<{key:string;fields:Record<string,Measured>}>({key:'',fields:{}}),report=useCallback((m:Measured)=>setReports(prior=>{const state=prior.key===key?prior:{key,fields:{}};return JSON.stringify(state.fields[m.id])===JSON.stringify(m)?prior:{key,fields:{...state.fields,[m.id]:m}};}),[key]);
 const current=reports.key===key?reports.fields:{},measurement:AudioClockMeasurement={key,fontKey,fields:Object.values(current)},state=audioClockState(scene,config,elapsed,measurement,runtime,{width,height},projectionProof),issueKey=JSON.stringify(state.issues),px=(r:{x:number;y:number;width:number;height:number})=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});
 useLayoutEffect(()=>onReadiness?.({status:state.status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true}),[state.status,issueKey,onReadiness]);
 return <AbsoluteFill data-experimental-mechanism="audio-clock-ab" data-layout-status={state.status} data-audio-clock-mode={state.clockMode} data-audio-owner={config.audioOwner.id} data-audio-original-muted={runtime?.mixerPolicy?.forceMuteOriginal} data-audio-music-muted={runtime?.mixerPolicy?.forceMuteMusic} data-needs-face-review="true" data-mechanism-unavailable={state.status==='blocked'?state.issues.join('；'):undefined} style={{pointerEvents:'none'}}>
  {plan.map(field=><MeasureField key={field.id} field={field} config={config} onReport={report}/>)}
  {state.status==='ready'&&<>
   {state.copy?.page.visible&&<div data-audio-source-copy="true" style={{position:'absolute',...px(state.copy.rect)}}><TextPlane measured={current['complete-copy']} page={state.copy.page.index}/></div>}
   {state.rows.filter(row=>row.visible).map(row=>{const take=config.takes.find(t=>t.id===row.id)!,activeWord=take.wordTrack?.words.find(w=>w.id===row.activeWordId),r=row.waveRect;
    return <React.Fragment key={row.id}>
     <svg data-audio-pcm-waveform={row.id} data-audio-pcm-sha={runtime?.analyses.find(a=>a.analysisSha256===take.source.analysisSha256)?.pcmSha256} data-audio-analysis-sha={take.source.analysisSha256} data-audio-common-time-scale={config.timeScaleMs} width={r.width*width} height={r.height*height} style={{position:'absolute',left:r.x*width,top:r.y*height,overflow:'hidden',background:'#10283ad9',borderRadius:height*.008}}>
      <line x1={0} x2={row.durationFraction*r.width*width} y1={r.height*height/2} y2={r.height*height/2} stroke="#7192ac88" strokeWidth={1}/>
      {row.waveform.map((bin,i)=><line key={i} data-pcm-bin={i} x1={bin.x*r.width*width} x2={bin.x*r.width*width} y1={(.5-bin.max*.47)*r.height*height} y2={(.5-bin.min*.47)*r.height*height} stroke={row.playing?'#7ddcff':'#8faec9'} strokeWidth={Math.max(.75,r.width*width/row.waveform.length*.65)}/>)}
      {row.cursor!==null&&<line data-audio-decoded-cursor={state.clockMode==='preview-decoded'?row.id:undefined} data-audio-render-sample-cursor={state.clockMode==='render-pcm'?row.id:undefined} x1={row.cursor*r.width*width} x2={row.cursor*r.width*width} y1={0} y2={r.height*height} stroke="#e7f6ff" strokeWidth={Math.max(1.5,height*.002)}/>}
     </svg>
     {row.fields.filter(f=>f.page.visible).map(f=><div key={f.id} data-audio-field={f.id} style={{position:'absolute',...px(f.rect)}}><TextPlane measured={current[f.id]} page={f.page.index} activeWord={f.role==='words'?activeWord:undefined}/></div>)}
    </React.Fragment>;
   })}
  </>}
 </AbsoluteFill>;
}

/** Native visual layer. It NEVER creates Audio/video or a second audio owner. */
export function AudioClockScene({scene,config,elapsed,runtime,projectionProof,onReadiness}:{scene:StoryScene;config:AudioClockConfig;elapsed:number;runtime?:AudioClockRuntime;projectionProof?:AudioClockProjectionProof;onReadiness?:((r:AudioClockPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=audioClockIssues(scene,config,{width,height},projectionProof),key=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(key),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true});},[key,onReadiness]);
 if(issues.length)return <AbsoluteFill data-experimental-mechanism="audio-clock-ab" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')} style={{pointerEvents:'none'}}/>;
 return <PreparedAudioClock scene={scene} config={config} elapsed={elapsed} runtime={runtime} projectionProof={projectionProof} onReadiness={onReadiness}/>;
}
