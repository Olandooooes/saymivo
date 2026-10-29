import React,{createContext,useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText,TextLayoutReportContext,type TextLayoutReport} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {DynamicMechanismConfig} from './dynamic-mechanisms.mjs';
import {completeSourceCopyText,completeSourceCopySpeaker,completeSourceCopyIssues,completeSourceCopyReadiness,nativeLayoutPlan,updateNativeLayoutReports} from './complete-source-copy.mjs';
import {sourceTokenPageState} from './source-token-transfer.mjs';
import type {SpeakerRenderer} from './DynamicMechanismScene';

const GraphicsVisibleContext=createContext(true);
export const useDynamicGraphicsVisibility=()=>useContext(GraphicsVisibleContext);
export type CompleteSourceReadiness={status:'blocked'|'waiting'|'ready';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true;nativeReports:number;expectedNativeReports:number};

function SourceCopyPrepared({scene,config,elapsed,children,renderSpeaker,speakerRenderedExternally=false,onReadiness}:{scene:StoryScene;config:DynamicMechanismConfig;elapsed:number;children:React.ReactNode;renderSpeaker:SpeakerRenderer;speakerRenderedExternally?:boolean;onReadiness?:((readiness:CompleteSourceReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),window=config.sourceCopyWindow!,text=completeSourceCopyText(scene),{fit,family}=useMeasuredText(text,window.rect.width*width,window.rect.height*height,{minFont:height*.032,maxFont:height*.067,weight:600,protectedPhrases:text.match(/[A-Za-z][A-Za-z0-9'-]*/g)??[]}),copyReady=completeSourceCopyReadiness(scene,config,fit,{width,height}),plan=nativeLayoutPlan(scene,config,elapsed,{width,height});
 const signature=JSON.stringify([scene,config,width,height,font]),[native,setNative]=useState<{signature:string;reports:TextLayoutReport[]}>({signature:'',reports:[]});
 const report=useCallback((value:TextLayoutReport)=>setNative(previous=>updateNativeLayoutReports(previous,signature,value)),[signature]);
 const reports=native.signature===signature?native.reports:[],nativeBad=reports.some(value=>value.unplaceable),nativeWaiting=reports.length!==plan.count;
 const issues=[...copyReady.issues,...(nativeBad?['native-full-font-layout-unplaceable']:[]),...(nativeWaiting?['waiting-for-all-actual-native-font-layouts']:[])],status=copyReady.status==='blocked'||nativeBad?'blocked':copyReady.status==='waiting'||nativeWaiting?'waiting':'ready',enabled=status==='ready',page=sourceTokenPageState(fit?.pages??[],elapsed,window),copyActive=page.visible,issueKey=JSON.stringify(issues),nativeOwnsSpeaker=config.kind==='evidence-handoff'||config.kind==='hub-branch-flow'&&!!config.matchToDiagram,speaker=completeSourceCopySpeaker(scene,config,elapsed,{width,height});
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true,nativeReports:reports.length,expectedNativeReports:plan.count}),[status,issueKey,reports.length,plan.count,onReadiness]);
 return <AbsoluteFill data-complete-source-status={status} data-complete-source-copy="renderer-owned" data-mechanism-unavailable={status==='blocked'?issues.join('；'):undefined}>
  <TextLayoutReportContext.Provider value={report}><GraphicsVisibleContext.Provider value={enabled&&elapsed>=window.endMs}>{children}</GraphicsVisibleContext.Provider></TextLayoutReportContext.Provider>
  {enabled&&copyActive&&fit&&<div data-source-copy-page={page.index} data-source-copy-window="true" style={{position:'absolute',left:window.rect.x*width,top:window.rect.y*height,width:window.rect.width*width,height:window.rect.height*height,fontFamily:family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,color:'#edf6ff',whiteSpace:'pre',pointerEvents:'none'}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={page.index!==index} style={{position:'absolute',inset:0,opacity:page.index===index?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div>}
  {!speakerRenderedExternally&&speaker&&(elapsed<window.endMs||!enabled)&&<div data-source-copy-real-speaker="true" style={{position:'absolute',left:speaker.x*width,top:speaker.y*height,width:speaker.width*width,height:speaker.height*height,overflow:'hidden',borderRadius:'50%'}}>{renderSpeaker({width:speaker.width*width,height:speaker.height*height,elapsed,mode:'inset'})}</div>}
 </AbsoluteFill>;
}

/** Sole complete-content entry for the nine native mechanism renderers. */
export function SourceCopyWindow({scene,config,elapsed,children,renderSpeaker,speakerRenderedExternally=false,onReadiness}:{scene:StoryScene;config:DynamicMechanismConfig;elapsed:number;children:React.ReactNode;renderSpeaker?:SpeakerRenderer;speakerRenderedExternally?:boolean;onReadiness?:((readiness:CompleteSourceReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=[...completeSourceCopyIssues(scene,config,{width,height}),...(!renderSpeaker?['actual-source-speaker-callback-required']:[])],issueKey=JSON.stringify(issues),speaker=completeSourceCopySpeaker(scene,config,elapsed,{width,height});
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true,nativeReports:0,expectedNativeReports:0});},[issueKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-complete-source-status="blocked" data-mechanism-unavailable={issues.join('；')}>{!speakerRenderedExternally&&renderSpeaker&&speaker&&<div data-source-copy-real-speaker="true" style={{position:'absolute',left:speaker.x*width,top:speaker.y*height,width:speaker.width*width,height:speaker.height*height}}>{renderSpeaker({width:speaker.width*width,height:speaker.height*height,elapsed,mode:'inset'})}</div>}</AbsoluteFill>;
 return <SourceCopyPrepared scene={scene} config={config} elapsed={elapsed} renderSpeaker={renderSpeaker!} speakerRenderedExternally={speakerRenderedExternally} onReadiness={onReadiness}>{children}</SourceCopyPrepared>;
}
