import React,{createContext,useContext,useId,useLayoutEffect,useState} from 'react';
import {cancelRender,continueRender,delayRender} from 'remotion';
import {DisplayFontContext,loadDisplayFont} from './DisplayFont';
import {displayFontFamily} from './display-fonts.mjs';
import {fitMeasuredText,type TextFit} from './text-fit.mjs';
export type TextLayoutReport={key:string;pages:number;fontSize:number;unplaceable:boolean;instanceId?:string;active?:boolean};
export const TextLayoutReportContext=createContext<((report:TextLayoutReport)=>void)|null>(null);

export function useMeasuredText(text:string,width:number,height:number,{minFont=34,maxFont=110,lineHeight=1.18,weight=400,protectedPhrases=[],preferredPhrases=[],maxTrackingEm=0}:{minFont?:number;maxFont?:number;lineHeight?:number;weight?:number;protectedPhrases?:string[];preferredPhrases?:string[];maxTrackingEm?:number}={}){
 const id=useContext(DisplayFontContext),instanceId=useId(),family=displayFontFamily(id),[measured,setMeasured]=useState<{key:string;fit:TextFit}|null>(null);
 const report=useContext(TextLayoutReportContext);
 const phrasesKey=JSON.stringify(protectedPhrases),preferredKey=JSON.stringify(preferredPhrases);
 const key=JSON.stringify([text,width,height,minFont,maxFont,lineHeight,weight,id,phrasesKey,preferredKey,maxTrackingEm]);
 useLayoutEffect(()=>{
  let active=true,finished=false;const handle=delayRender('Measure complete text using loaded font');
  const finish=()=>{if(!finished){finished=true;continueRender(handle);}};
  loadDisplayFont(id).then(()=>{
   const context=document.createElement('canvas').getContext('2d');if(!context)throw Error('无法测量文字，请检查浏览器Canvas支持');
   const tracking=Number.isFinite(maxTrackingEm)?Math.max(0,maxTrackingEm):0,segments=tracking?new Intl.Segmenter('zh-CN',{granularity:'grapheme'}):null;
   const measure=(value:string,size:number)=>{context.font=`${weight} ${size}px ${family}`;const m=context.measureText(value),glyphCount=segments?[...segments.segment(value)].length:0;return {width:m.width+glyphCount*size*tracking,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent};};
   // Authored lines are a preference, not an unbreakable overflow constraint.
   // Decide only after the current font loads, in this same measurement pass.
   const smallest=Math.min(minFont,maxFont),preferred=(JSON.parse(preferredKey) as string[]).filter(value=>{if(!value)return false;const m=measure(value,smallest);return m.width<=width&&Math.max(smallest*lineHeight,m.ascent+m.descent)<=height;});
   const result=fitMeasuredText(text,{width,height,minFont,maxFont,lineHeight,protectedPhrases:[...JSON.parse(phrasesKey),...preferred],measure});
   if(active){setMeasured({key,fit:result});report?.({key,instanceId,active:true,pages:result.pages.length,fontSize:result.fontSize,unplaceable:result.unplaceable});}finish();
  }).catch(error=>{if(active)cancelRender(error);else finish();});
  return()=>{active=false;report?.({key,instanceId,active:false,pages:0,fontSize:0,unplaceable:false});finish();};
 },[text,width,height,minFont,maxFont,lineHeight,weight,id,family,phrasesKey,preferredKey,maxTrackingEm,key,report,instanceId]);
 return {fit:measured?.key===key?measured.fit:null,family};
}

// Explicit paragraph protection is preferred only when the loaded minimum font
// fits. Existing cue protection remains mandatory and keeps its old behavior.
export function MeasuredText({text,width,height,elapsed=0,duration=6000,minFont=34,maxFont=110,weight=400,color='inherit',align='left',cues=[],protectedPhrases=[]}:{text:string;width:number;height:number;elapsed?:number;duration?:number;minFont?:number;maxFont?:number;weight?:number;color?:string;align?:'left'|'center'|'right';cues?:{text:string;atMs:number}[];protectedPhrases?:string[]}){
 const {fit,family}=useMeasuredText(text,width,height,{minFont,maxFont,weight,protectedPhrases:cues.map(c=>c.text),preferredPhrases:protectedPhrases});if(!fit)return null;
 const page=Math.min(fit.pages.length-1,Math.max(0,Math.floor(elapsed/Math.max(1,duration)*fit.pages.length)));
 const marked=(line:string)=>{const result:React.ReactNode[]=[];let end=0;for(const cue of cues.map(c=>({...c,index:line.indexOf(c.text)})).filter(c=>c.index>=0).sort((a,b)=>a.index-b.index)){if(cue.index<end)continue;result.push(line.slice(end,cue.index));result.push(<span key={cue.index} style={elapsed>=cue.atMs?{color:'#abc1ff',textDecoration:'underline',textDecorationThickness:3,textUnderlineOffset:7}:undefined}>{cue.text}</span>);end=cue.index+cue.text.length;}result.push(line.slice(end));return result;};
 return <div data-measured-text="true" data-text-pages={fit.pages.length} data-layout-error={fit.unplaceable?'text-box-too-small':undefined} style={{width,height,position:'relative',fontFamily:family,fontSize:fit.fontSize,fontWeight:weight,lineHeight:`${fit.rowHeight}px`,color,textAlign:align,boxSizing:'border-box'}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={index!==page} style={{position:'absolute',inset:0,opacity:index===page?1:0,whiteSpace:'pre'}}>{lines.map((line,i)=><div key={i}>{marked(line||'\u00a0')}</div>)}</div>)}</div>;
}
