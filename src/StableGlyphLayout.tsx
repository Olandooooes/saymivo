import {useContext,useId,useLayoutEffect,useState} from 'react';
import {cancelRender,continueRender,delayRender} from 'remotion';
import {DisplayFontContext,loadDisplayFont} from './DisplayFont';
import {displayFontFamily} from './display-fonts.mjs';
import {TextLayoutReportContext} from './MeasuredText';

export type StableGlyphLayout={fontSize:number;family:string;advance:number;unitWidth:number;rowHeight:number;unplaceable:boolean};
// Inputs describe the FINAL glyph set and maximum capacity. Elapsed/value are
// deliberately absent, so counting and split-flap frames never invalidate fit.
export function useStableGlyphLayout({glyphs,slots=1,unit='',samples=[],width,height,weight=600,minFont=20,maxFont=180}:{glyphs:string;slots?:number;unit?:string;samples?:string[];width:number;height:number;weight?:number;minFont?:number;maxFont?:number}){
 const id=useContext(DisplayFontContext),instanceId=useId(),report=useContext(TextLayoutReportContext),family=displayFontFamily(id),samplesKey=JSON.stringify(samples),key=JSON.stringify([glyphs,slots,unit,samplesKey,width,height,weight,minFont,maxFont,id]),[state,setState]=useState<{key:string;layout:StableGlyphLayout}|null>(null);
 useLayoutEffect(()=>{
  let active=true,finished=false;const handle=delayRender('Measure final glyph atlas once');const finish=()=>{if(!finished){finished=true;continueRender(handle);}};
  loadDisplayFont(id).then(()=>{
   const context=document.createElement('canvas').getContext('2d');if(!context)throw Error('无法测量最终字符');
   const glyphSet=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(glyphs)].map(part=>part.segment);
   const at=(size:number)=>{context.font=`${weight} ${size}px ${family}`;const metrics=glyphSet.map(glyph=>context.measureText(glyph)),unitMetric=context.measureText(unit),advance=Math.max(1,...metrics.map(metric=>metric.width)),unitWidth=unit?unitMetric.width+size*.22:0,rowHeight=Math.max(size*1.12,...[...metrics,unitMetric].map(metric=>metric.actualBoundingBoxAscent+metric.actualBoundingBoxDescent));return {advance,unitWidth,rowHeight,total:Math.max(advance*slots+unitWidth,...JSON.parse(samplesKey).map((sample:string)=>context.measureText(sample+unit).width))};};
   let low=minFont,high=maxFont,best=at(low);for(let i=0;i<14;i++){const size=(low+high)/2,result=at(size);if(result.total<=width&&result.rowHeight<=height){low=size;best=result;}else high=size;}
   const layout={fontSize:low,family,advance:best.advance,unitWidth:best.unitWidth,rowHeight:best.rowHeight,unplaceable:best.total>width||best.rowHeight>height};if(active){setState({key,layout});report?.({key,instanceId,active:true,pages:1,fontSize:low,unplaceable:layout.unplaceable});}finish();
  }).catch(error=>{if(active)cancelRender(error);else finish();});
  return()=>{active=false;report?.({key,instanceId,active:false,pages:0,fontSize:0,unplaceable:false});finish();};
 },[key,id,family,glyphs,slots,unit,samplesKey,width,height,weight,minFont,maxFont,report,instanceId]);
 return state?.key===key?state.layout:null;
}
