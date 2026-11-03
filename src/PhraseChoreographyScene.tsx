import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {TextFit} from './text-fit.mjs';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {phraseChoreographyIssues,phraseChoreographyState,phrasePageState,phraseTextReadiness,type PhraseChoreographyConfig} from './phrase-choreography.mjs';

const glyphs=(text:string)=>[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].map(piece=>piece.segment);
type Readiness={status:'waiting'|'blocked'|'ready';issues:string[]};
export type PhraseReadiness=Readiness&{canApply:false;uiAccepted:false;needsFaceReview:true};

function PhraseText({text,width,height,elapsed,readMs,fit,family,caret=false,trackingEm=0,color,extrusion=false}:{text:string;width:number;height:number;elapsed:number;readMs:number;fit:TextFit;family:string;caret?:boolean;trackingEm?:number;color:string;extrusion?:boolean}){
 const state=phrasePageState(fit.pages,elapsed,readMs,{caret});
 const shadow=extrusion?Array.from({length:6},(_,i)=>`${(i+1)*.7}px ${(i+1)*1.1}px 0 #071326`).join(','):'0 4px 14px #06132638';
 return <div data-full-phrase={text} data-phrase-page={state.pageIndex} style={{width,height,position:'relative',fontFamily:family,fontSize:fit.fontSize,lineHeight:`${fit.rowHeight}px`,fontWeight:800,letterSpacing:`${trackingEm}em`,color,textShadow:shadow}}>{fit.pages.map((lines,page)=>{let count=0;return <div key={page} aria-hidden={page!==state.pageIndex} style={{position:'absolute',inset:0,opacity:page===state.pageIndex?1:0,whiteSpace:'pre'}}>{lines.map((line,row)=><div key={row}>{glyphs(line).map((glyph,column)=>{const ordinal=count++,cursor=caret&&ordinal===state.revealedGlyphs&&state.caretVisible;return <span key={column} style={{position:'relative',opacity:!caret||ordinal<state.revealedGlyphs?1:cursor?1:0}}>{cursor&&<span aria-hidden="true" style={{position:'absolute',left:0,top:0,height:'1em',borderLeft:'2px solid currentColor'}}/>}<span data-phrase-glyph={glyph} style={{opacity:!caret||ordinal<state.revealedGlyphs?1:0}}>{glyph}</span></span>;})}</div>)}</div>;})}</div>;
}

function MeasuredPhrase({id,text,width,height,elapsed,clock,exposure,caret=false,trackingEm=0,maxTrackingEm=0,color,extrusion=false,enabled,onReport}:{id:string;text:string;width:number;height:number;elapsed:number;clock:{atMs:number;endMs:number};exposure:{startMs:number;endMs:number;speed:number};caret?:boolean;trackingEm?:number;maxTrackingEm?:number;color:string;extrusion?:boolean;enabled:boolean;onReport:(id:string,report:Readiness)=>void}){
 const {height:outputHeight}=useVideoConfig(),{fit,family}=useMeasuredText(text,width,height,{minFont:outputHeight*.028,maxFont:outputHeight*.105,weight:800,maxTrackingEm,protectedPhrases:text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 const readiness=phraseTextReadiness(fit,{...clock,caret},exposure),key=JSON.stringify(readiness);
 useLayoutEffect(()=>onReport(id,JSON.parse(key)),[id,key,onReport]);
 if(!fit||!enabled||readiness.status!=='ready')return null;
 return <PhraseText text={text} width={width} height={height} elapsed={elapsed-clock.atMs} readMs={clock.endMs-clock.atMs} fit={fit} family={family} caret={caret} trackingEm={trackingEm} color={color} extrusion={extrusion}/>;
}

function PreparedPhrases({scene,config,elapsed,onReadiness}:{scene:StoryScene;config:PhraseChoreographyConfig;elapsed:number;onReadiness?:((readiness:PhraseReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),state=phraseChoreographyState(scene,config,elapsed),window=config.copyWindow;
 const speed=scene.speed??1,projected=Number.isFinite(scene.phaseStartMs),exposure={speed,startMs:projected?(scene.startMs-scene.phaseStartMs!)*speed:0,endMs:projected?(scene.endMs-scene.phaseStartMs!)*speed:dynamicSceneDuration(scene)};
 const signature=JSON.stringify([scene,config,width,height,font]),[reports,setReports]=useState<{signature:string;values:Record<string,Readiness>}>({signature:'',values:{}});
 const report=useCallback((id:string,value:Readiness)=>setReports(previous=>{
  const values=previous.signature===signature?previous.values:{};if(previous.signature===signature&&JSON.stringify(values[id])===JSON.stringify(value))return previous;
  return {signature,values:{...values,[id]:value}};
 }),[signature]);
 const expected=[...state.items.map(item=>'node:'+item.nodeId),...(window&&state.additionalCopy.length?['scene-copy']:[])],values=reports.signature===signature?reports.values:{},issues=[...new Set(expected.flatMap(id=>values[id]?.issues??[]).filter(issue=>issue!=='等待当前展示字体测量'))];
 const status=expected.some(id=>!values[id]||values[id].status==='waiting')?'waiting':expected.some(id=>values[id].status==='blocked')?'blocked':'ready',enabled=status==='ready',issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true}),[status,issueKey,onReadiness]);
 return <AbsoluteFill data-experimental-mechanism={config.kind} data-layout-status={status} data-needs-face-review="true" data-mechanism-unavailable={status==='blocked'?issues.join('；'):undefined} style={{pointerEvents:'none'}}>{state.items.map(item=>{
  const identity=config.kind==='identity-sweep',padding=identity?height*.014:0,color=item.color??'var(--koubo-emphasis-on-dark, #abc1ff)';
  return <div key={item.nodeId} data-phrase-node={item.nodeId} data-phrase-phase={item.phase} style={{position:'absolute',left:item.rect.x*width,top:item.rect.y*height,width:item.rect.width*width,height:item.rect.height*height,opacity:enabled?item.opacity:0,transform:`scale(${item.scale})`,transformOrigin:'center',padding,boxSizing:'border-box',background:identity?'linear-gradient(100deg,#3156b9ed,#6f94c1ae)':'transparent',borderRadius:identity?height*.009:0,clipPath:identity?`inset(0 ${(1-item.sweepProgress)*100}% 0 0)`:undefined}}><MeasuredPhrase id={'node:'+item.nodeId} text={item.text} width={item.rect.width*width-2*padding} height={item.rect.height*height-2*padding} elapsed={elapsed} clock={{atMs:item.readAtMs,endMs:item.endMs-(item.exitMs??180)}} exposure={exposure} caret={config.kind==='caret-phrase'} trackingEm={item.trackingEm} maxTrackingEm={item.fromTrackingEm??0} color={color} extrusion={item.extrusion} enabled={enabled} onReport={report}/>{identity&&enabled&&<div aria-hidden="true" style={{position:'absolute',inset:0,background:`linear-gradient(100deg,transparent ${Math.max(0,item.sweepProgress*100-10)}%,#f0faffdc ${item.sweepProgress*100}%,transparent ${Math.min(100,item.sweepProgress*100+10)}%)`,opacity:item.phase==='entering'?1:0}}/>}</div>;
 })}{window&&state.additionalCopy.length>0&&<div data-full-scene-copy="true" style={{position:'absolute',left:window.rect.x*width,top:window.rect.y*height,opacity:enabled&&elapsed>=window.atMs&&elapsed<window.endMs?1:0}}><MeasuredPhrase id="scene-copy" text={state.additionalCopy.map(item=>item.text).join('\n')} width={window.rect.width*width} height={window.rect.height*height} elapsed={elapsed} clock={window} exposure={exposure} color="#e5edff" enabled={enabled} onReport={report}/></div>}</AbsoluteFill>;
}

/** Independent preview; full-frame face locations still need actual review. */
export function PhraseChoreographyScene({scene,config,elapsed,onReadiness}:{scene:StoryScene;config:PhraseChoreographyConfig;elapsed:number;onReadiness?:((readiness:PhraseReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=phraseChoreographyIssues(scene,config,{width,height}),issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[issueKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedPhrases scene={scene} config={config} elapsed={elapsed} onReadiness={onReadiness}/>;
}
