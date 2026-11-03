import React,{useCallback,useContext,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import type {StoryScene} from './storyboard.mjs';
import type {TextFit} from './text-fit.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import {sourceTokenSources,sourceTokenAdditionalCopy,sourceTokenTransferKey,sourceTokenTransferIssues,sourceTokenRangeLocation,sourceTokenTransferState,sourceTokenPageState,type SourceTokenTransferConfig,type SourceTokenSource,type SourceTokenItem,type SourceTokenAnchor,type SourceTokenMeasuredText,type SourceTokenMeasurement} from './source-token-transfer.mjs';

export type SourceTokenPreviewReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true;facePositionKnown:boolean};
type TextReport=SourceTokenMeasuredText&{family:string;anchors?:SourceTokenAnchor[];issues?:string[]};
type Report=(kind:'source'|'target'|'copy',value:TextReport)=>void;
const px=(rect:StageRect,width:number,height:number)=>({left:rect.x*width,top:rect.y*height,width:rect.width*width,height:rect.height*height});

export function measureSourceTokenDomAnchors(source:SourceTokenSource,tokens:SourceTokenItem[],fit:TextFit,lineElements:(HTMLSpanElement|null)[],bounds:Pick<DOMRect,'left'|'top'|'width'|'height'>,createRange:()=>Range):SourceTokenAnchor[]{
 if(!bounds||![bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw Error('actual-stage-bounds-unavailable');
 for(let index=0;index<fit.lines.length;index++){
  const element=lineElements[index],node=element?.firstChild,line=fit.lines[index];
  if(!element||!node||node.nodeType!==3||node.textContent!==(line||'\u00a0'))throw Error('actual-complete-source-text-mismatch');
  const rect=element.getBoundingClientRect(),x=(rect.left-bounds.left)/bounds.width,y=(rect.top-bounds.top)/bounds.height,right=(rect.right-bounds.left)/bounds.width,bottom=(rect.bottom-bounds.top)/bounds.height;
  if(![x,y,right,bottom].every(Number.isFinite)||x<source.rect.x-.002||y<source.rect.y-.002||right>source.rect.x+source.rect.width+.002||bottom>source.rect.y+source.rect.height+.002)throw Error('actual-complete-source-text-exceeds-rectangle');
 }
 return tokens.map(token=>{
  const location=sourceTokenRangeLocation(source.expectedText,fit.lines,token.range);if(!location)throw Error('token-range-crosses-source-line-or-layout-is-incomplete');
  const textNode=lineElements[location.lineIndex]?.firstChild;if(!textNode||textNode.nodeType!==3)throw Error('actual-source-text-node-unavailable');
  const range=createRange();range.setStart(textNode,location.startUtf16);range.setEnd(textNode,location.endUtf16);
  const boxes=Array.from(range.getClientRects()).filter(rect=>rect.width>0&&rect.height>0),box=range.getBoundingClientRect();range.detach();
  if(boxes.length!==1||box.width<=0||box.height<=0)throw Error('source-token-must-have-one-real-glyph-range');
  return {id:token.id,sourceId:source.id,nodeId:source.nodeId,range:token.range,text:location.text,fontSize:fit.fontSize,rect:{x:(box.left-bounds.left)/bounds.width,y:(box.top-bounds.top)/bounds.height,width:box.width/bounds.width,height:box.height/bounds.height}};
 });
}

function MeasuredSource({source,tokens,stage,visible,onReport}:{source:SourceTokenSource;tokens:SourceTokenItem[];stage:React.RefObject<HTMLDivElement|null>;visible:boolean;onReport:Report}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(source.expectedText,source.rect.width*width,source.rect.height*height,{minFont:height*.028,maxFont:height*.052,weight:600,protectedPhrases:tokens.map(token=>token.text)}),lineRefs=useRef<(HTMLSpanElement|null)[]>([]),tokenKey=JSON.stringify(tokens),sourceKey=JSON.stringify(source);
 useLayoutEffect(()=>{
  if(!fit){onReport('source',{id:source.id,text:source.expectedText,fit:null,family});return;}
  const anchors:SourceTokenAnchor[]=[],issues:string[]=[];
  // This uses actual loaded-font DOM glyph positions. Canvas only chooses a
  // complete layout; it does not guess the word's original-screen location.
  try{
   const bounds=stage.current?.getBoundingClientRect();if(!bounds||bounds.width<=0||bounds.height<=0)throw Error('actual-stage-bounds-unavailable');
   anchors.push(...measureSourceTokenDomAnchors(source,tokens,fit,lineRefs.current,bounds,()=>document.createRange()));
  }catch(error){issues.push(error instanceof Error?error.message:'actual-source-anchor-measurement-failed');}
  onReport('source',{id:source.id,text:source.expectedText,fit,family,anchors,issues});
 },[fit,family,sourceKey,tokenKey,stage,onReport]);
 return <div data-persistent-source={source.id} data-source-node={source.nodeId} data-original-text={source.expectedText} style={{position:'absolute',...px(source.rect,width,height),display:'flex',flexDirection:'column',justifyContent:'center',opacity:visible?1:0,fontFamily:family,fontSize:fit?.fontSize,fontWeight:600,lineHeight:fit?`${fit.rowHeight}px`:undefined,color:'#f0f6ff',whiteSpace:'pre'}}>{fit?.lines.map((line,index)=><div key={index} style={{height:fit.rowHeight,flexShrink:0}}><span ref={element=>{lineRefs.current[index]=element;}}>{line||'\u00a0'}</span></div>)}</div>;
}

function MeasureTarget({token,onReport}:{token:SourceTokenItem;onReport:Report}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(token.text,token.targetRect.width*width*.92,token.targetRect.height*height*.84,{minFont:height*.028,maxFont:height*.058,weight:600,protectedPhrases:[token.text]});
 useLayoutEffect(()=>onReport('target',{id:token.id,text:token.text,fit,family}),[token.id,token.text,fit,family,onReport]);return null;
}
function MeasuredCopy({text,config,elapsed,enabled,onReport}:{text:string;config:NonNullable<SourceTokenTransferConfig['copyWindow']>;elapsed:number;enabled:boolean;onReport:Report}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(text,config.rect.width*width,config.rect.height*height,{minFont:height*.028,maxFont:height*.060,weight:600}),page=sourceTokenPageState(fit?.pages??[],elapsed,config);
 useLayoutEffect(()=>onReport('copy',{id:'scene-copy',text,fit,family}),[text,fit,family,onReport]);
 return <div data-complete-scene-copy="true" data-current-copy-page={page.index} style={{position:'absolute',...px(config.rect,width,height),opacity:enabled&&page.visible?1:0,fontFamily:family,fontSize:fit?.fontSize,fontWeight:600,lineHeight:fit?`${fit.rowHeight}px`:undefined,color:'#edf5ff',whiteSpace:'pre'}}>{fit?.pages.map((lines,index)=><div key={index} aria-hidden={page.index!==index} data-copy-page={index} style={{position:'absolute',inset:0,opacity:page.index===index?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div>;
}

function PreparedTransfer({scene,config,elapsed,onReadiness}:{scene:StoryScene;config:SourceTokenTransferConfig;elapsed:number;onReadiness?:((readiness:SourceTokenPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',viewport={width,height},key=sourceTokenTransferKey(scene,config,viewport,fontKey),stage=useRef<HTMLDivElement>(null);
 const [reports,setReports]=useState<{key:string;source:Record<string,TextReport>;target:Record<string,TextReport>;copy:Record<string,TextReport>}>({key:'',source:{},target:{},copy:{}});
 const report=useCallback<Report>((kind,value)=>setReports(previous=>{
  const current=previous.key===key?previous:{key,source:{},target:{},copy:{}};if(JSON.stringify(current[kind][value.id])===JSON.stringify(value))return previous;
  return {...current,[kind]:{...current[kind],[value.id]:value}};
 }),[key]);
 const current=reports.key===key?reports:null,sourceReports=Object.values(current?.source??{}),measurement:SourceTokenMeasurement={key,fontKey,sources:sourceReports,targets:Object.values(current?.target??{}),anchors:sourceReports.flatMap(source=>source.anchors??[]),copy:current?.copy['scene-copy'],issues:sourceReports.flatMap(source=>source.issues??[])},state=sourceTokenTransferState(scene,config,elapsed,measurement,viewport),enabled=state.readiness==='ready',issueKey=JSON.stringify(state.issues);
 useLayoutEffect(()=>onReadiness?.({status:state.readiness,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true,facePositionKnown:state.facePositionKnown}),[state.readiness,issueKey,state.facePositionKnown,onReadiness]);
 const sources=sourceTokenSources(scene,config),copy=sourceTokenAdditionalCopy(scene).map(item=>item.text).join('\n');
 return <AbsoluteFill data-experimental-mechanism="source-token-transfer" data-layout-status={state.readiness} data-automatic-allowed="false" data-needs-face-review="true" data-mechanism-unavailable={state.readiness==='blocked'?state.issues.join('；'):undefined} style={{pointerEvents:'none'}}><div ref={stage} style={{position:'absolute',inset:0}}>
  {sources.map(source=><MeasuredSource key={source.id} source={source} tokens={config.tokens.filter(token=>token.sourceId===source.id)} stage={stage} visible={enabled&&elapsed>=source.atMs&&elapsed<state.duration} onReport={report}/>)}
  {config.tokens.map(token=><MeasureTarget key={token.id} token={token} onReport={report}/>)}
  {copy&&config.copyWindow&&<MeasuredCopy text={copy} config={config.copyWindow} elapsed={elapsed} enabled={enabled} onReport={report}/>}
  {enabled&&state.tokens.map(token=>{
   const measured=current!.target[token.id],sourceFit=current!.source[token.sourceId].fit!,targetFit=measured.fit!,fontSize=sourceFit.fontSize+(targetFit.fontSize-sourceFit.fontSize)*token.progress;
   return <div key={token.id} data-source-token={token.id} data-token-phase={token.phase} data-token-text={token.text} data-source-id={token.sourceId} data-source-node={token.nodeId} style={{position:'absolute',...px(token.rect,width,height),opacity:token.visible?1:0,fontFamily:measured.family,fontSize,fontWeight:600,lineHeight:`${token.rect.height*height}px`,whiteSpace:'pre',textAlign:'center',color:'#e1f6ff',borderRadius:height*.009,background:`rgba(41,80,107,${token.progress*.84})`,boxShadow:token.progress>0?`0 0 0 1px rgba(130,220,255,${token.progress*.65})`:undefined}}>{token.text}</div>;
  })}
 </div></AbsoluteFill>;
}

/** Overlay only. The parent retains real-source video/audio. No source text is removed. */
export function SourceTokenTransferScene({scene,config,elapsed,onReadiness}:{scene:StoryScene;config:SourceTokenTransferConfig;elapsed:number;onReadiness?:((readiness:SourceTokenPreviewReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=sourceTokenTransferIssues(scene,config,{width,height}),issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true,facePositionKnown:!!scene.window||!!config?.protectedAreas?.length});},[issueKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-experimental-mechanism="source-token-transfer" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedTransfer scene={scene} config={config} elapsed={elapsed} onReadiness={onReadiness}/>;
}
