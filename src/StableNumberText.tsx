import React from 'react';
import {useStableGlyphLayout} from './StableGlyphLayout';
import {counterMeasurementSpec,type NumberCounterConfig} from './dynamic-mechanisms.mjs';
export function StableNumberText({text,config,width,height,minFont=24,maxFont=100,color='#eaf5ff'}:{text:string;config:NumberCounterConfig;width:number;height:number;minFont?:number;maxFont?:number;color?:string}){
 const spec=counterMeasurementSpec(config),fit=useStableGlyphLayout({glyphs:spec.glyphs,slots:spec.numericSlots,unit:spec.unit,samples:spec.samples,width,height,minFont,maxFont,weight:700});if(!fit)return null;
 const characters=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].map(piece=>piece.segment),slots=Array.from({length:Math.max(0,spec.numericSlots-characters.length)},()=> ' ').concat(characters);
 return <div data-stable-number={text} data-measure-key={spec.key} style={{width,height,fontFamily:fit.family,fontSize:fit.fontSize,fontWeight:700,lineHeight:`${fit.rowHeight}px`,color,whiteSpace:'nowrap',fontKerning:'none'}}>{slots.map((character,index)=><span key={index} style={{display:'inline-block',width:fit.advance,textAlign:'center',whiteSpace:'pre'}}>{character}</span>)}{spec.unit&&<span style={{display:'inline-block',width:fit.unitWidth,paddingLeft:fit.fontSize*.22,boxSizing:'border-box'}}>{spec.unit}</span>}</div>;
}
