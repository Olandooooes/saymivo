import React,{useCallback,useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import type {StoryScene} from './storyboard.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import type {TextFit} from './text-fit.mjs';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {DisplayFontContext} from './DisplayFont';
import {useMeasuredText} from './MeasuredText';
import {useStableGlyphLayout,type StableGlyphLayout} from './StableGlyphLayout';
import {quantitativeFieldPlan,quantitativeIssues,quantitativeMeasurementKey,quantitativeNumberPlans,quantitativeState,quantitativeAxisPosition,type QuantitativeChartConfig,type QuantitativeField,type QuantitativeMeasurement,type QuantitativeNumberPlan,type QuantitativeSpeakerProof,type QuantitativeProjectionProof} from './quantitative-chart.mjs';

export type QuantitativePreviewReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;automaticAllowed:false;needsFaceReview:true};
export type QuantitativeSpeakerRenderer=(props:{width:number;height:number;elapsed:number;sourceMs:number;mode:'inset'})=>React.ReactNode;
type FieldReport={id:string;text:string;fit:TextFit|null;family:string};
type NumberReport={id:string;specKey:string;fit:StableGlyphLayout|null};
const px=(r:StageRect,w:number,h:number)=>({left:r.x*w,top:r.y*h,width:r.width*w,height:r.height*h});
export function quantitativeSpeakerHasContent(value:React.ReactNode):boolean{
 if(Array.isArray(value))return value.some(quantitativeSpeakerHasContent);
 if(!React.isValidElement<{children?:React.ReactNode}>(value))return false;
 if(value.type===React.Fragment)return quantitativeSpeakerHasContent(value.props.children);
 return typeof value.type==='string'?['video','canvas','img'].includes(value.type)||quantitativeSpeakerHasContent(value.props.children):true;
}
function MeasureField({field,onReport}:{field:QuantitativeField;onReport:(field:FieldReport)=>void}){
 const {width,height}=useVideoConfig(),{fit,family}=useMeasuredText(field.text,field.rect.width*width*.94,field.rect.height*height*.90,{minFont:height*.023,maxFont:height*(field.role==='copy'?.062:.042),weight:600,protectedPhrases:field.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[]});
 useLayoutEffect(()=>onReport({id:field.id,text:field.text,fit,family}),[field.id,field.text,fit,family,onReport]);return null;
}
function MeasureNumber({plan,onReport}:{plan:QuantitativeNumberPlan;onReport:(number:NumberReport)=>void}){
 const {width,height}=useVideoConfig(),key=JSON.stringify(plan),fit=useStableGlyphLayout({glyphs:plan.glyphs,slots:plan.slots,unit:plan.unit,samples:plan.samples,width:plan.rect.width*width*.94,height:plan.rect.height*height*.90,minFont:height*.025,maxFont:height*.065,weight:700});
 useLayoutEffect(()=>onReport({id:plan.id,specKey:key,fit}),[plan.id,key,fit,onReport]);return null;
}
function TextPlane({field,measured,page}:{field:QuantitativeField;measured:FieldReport;page:number}){
 const fit=measured.fit;if(!fit)return null;
 return <div data-chart-field={field.id} data-chart-page={page} style={{position:'absolute',inset:'5% 3%',fontFamily:measured.family,fontSize:fit.fontSize,fontWeight:600,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#edf5ff'}}>{fit.pages.map((lines,i)=><div key={i} data-chart-text-page={i} aria-hidden={i!==page} style={{position:'absolute',inset:0,opacity:i===page?1:0}}>{lines.map((line,j)=><div key={j}>{line||'\u00a0'}</div>)}</div>)}</div>;
}
function NumberPlane({text,plan,fit}:{text:string;plan:QuantitativeNumberPlan;fit:StableGlyphLayout}){
 const chars=[...text],slots=Array.from({length:Math.max(0,plan.slots-chars.length)},()=> ' ').concat(chars);
 return <div data-chart-number={text} data-number-final-atlas={JSON.stringify(plan.samples)} style={{position:'absolute',inset:'5% 3%',fontFamily:fit.family,fontSize:fit.fontSize,fontWeight:700,lineHeight:`${fit.rowHeight}px`,whiteSpace:'nowrap',color:'#edf5ff',fontKerning:'none'}}>{slots.map((c,i)=><span key={i} style={{display:'inline-block',width:fit.advance,textAlign:'center',whiteSpace:'pre'}}>{c}</span>)}{plan.unit&&<span style={{display:'inline-block',width:fit.unitWidth,paddingLeft:fit.fontSize*.22,boxSizing:'border-box'}}>{plan.unit}</span>}</div>;
}
function PreparedChart({scene,config,elapsed,speakerProof,speakerContent,projectionProof,onReadiness}:{scene:StoryScene;config:QuantitativeChartConfig;elapsed:number;speakerProof:QuantitativeSpeakerProof;speakerContent:React.ReactNode;projectionProof?:QuantitativeProjectionProof;onReadiness?:(r:QuantitativePreviewReadiness)=>void}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'system-display-font',key=quantitativeMeasurementKey(scene,config,{width,height},fontKey),fields=quantitativeFieldPlan(scene,config),numbers=quantitativeNumberPlans(config);
 const [reports,setReports]=useState<{key:string;fields:Record<string,FieldReport>;numbers:Record<string,NumberReport>}>({key:'',fields:{},numbers:{}});
 const reportField=useCallback((v:FieldReport)=>setReports(prev=>{const state=prev.key===key?prev:{key,fields:{},numbers:{}};return JSON.stringify(state.fields[v.id])===JSON.stringify(v)?prev:{...state,fields:{...state.fields,[v.id]:v}};}),[key]);
 const reportNumber=useCallback((v:NumberReport)=>setReports(prev=>{const state=prev.key===key?prev:{key,fields:{},numbers:{}};return JSON.stringify(state.numbers[v.id])===JSON.stringify(v)?prev:{...state,numbers:{...state.numbers,[v.id]:v}};}),[key]);
 const current=reports.key===key?reports:{key,fields:{},numbers:{}},measurement:QuantitativeMeasurement={key,fontKey,fields:Object.values(current.fields),numbers:Object.values(current.numbers).filter(n=>n.fit).map(n=>({id:n.id,specKey:n.specKey,unplaceable:n.fit!.unplaceable}))},state=quantitativeState(scene,config,elapsed,measurement,speakerProof,{width,height},projectionProof),issueKey=JSON.stringify(state.issues);
 useLayoutEffect(()=>onReadiness?.({status:state.readiness,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true}),[state.readiness,issueKey,onReadiness]);
 const p=config.plotRect,line=config.variant==='annotated-line',axis=line?null:config.axis,horizontal=config.variant==='horizontal-bars';
 return <AbsoluteFill data-experimental-mechanism="quantitative-chart" data-chart-variant={config.variant} data-layout-status={state.readiness} data-needs-face-review="true" style={{pointerEvents:'none'}}>
  {fields.map(f=><MeasureField key={f.id} field={f} onReport={reportField}/>)}{numbers.map(n=><MeasureNumber key={n.id} plan={n} onReport={reportNumber}/>)}
  {state.readiness==='ready'&&<>
   {state.chartVisible&&<svg data-quantitative-native-chart="true" width={width} height={height} style={{position:'absolute',inset:0}}>
    <rect x={p.x*width} y={p.y*height} width={p.width*width} height={p.height*height} fill="#17304a88"/>
    {line?<>
     {config.xAxis.ticks.map((t,i)=><line key={'x'+i} x1={(p.x+quantitativeAxisPosition(config.xAxis,t)*p.width)*width} x2={(p.x+quantitativeAxisPosition(config.xAxis,t)*p.width)*width} y1={p.y*height} y2={(p.y+p.height)*height} stroke="#c3e4ff22"/>)}
     {config.yAxis.ticks.map((t,i)=><line key={'y'+i} x1={p.x*width} x2={(p.x+p.width)*width} y1={(p.y+(1-quantitativeAxisPosition(config.yAxis,t))*p.height)*height} y2={(p.y+(1-quantitativeAxisPosition(config.yAxis,t))*p.height)*height} stroke="#c3e4ff22"/>)}
     {state.regions.map(r=><rect key={r.id} data-explicit-condition-region={r.id} x={r.rect.x*width} y={r.rect.y*height} width={r.rect.width*width} height={r.rect.height*height} fill="#f1ce5428" stroke="#ead674" strokeDasharray="8 6"/>)}
     {state.lines.map(l=><polyline key={l.id} data-explicit-polyline={l.id} points={l.points.map(p=>`${p.x*width},${p.y*height}`).join(' ')} stroke={l.color} strokeWidth={Math.min(width,height)*.003} fill="none" strokeLinejoin="round"/>)}
    </>:<>
     {axis!.ticks.map((t,i)=>{const v=quantitativeAxisPosition(axis!,t);return horizontal?<line key={i} x1={(p.x+v*p.width)*width} x2={(p.x+v*p.width)*width} y1={p.y*height} y2={(p.y+p.height)*height} stroke="#c3e4ff33"/>:<line key={i} x1={p.x*width} x2={(p.x+p.width)*width} y1={(p.y+(1-v)*p.height)*height} y2={(p.y+(1-v)*p.height)*height} stroke={t===0?'#edf5ffaa':'#c3e4ff33'} data-common-zero={t===0?true:undefined}/>;})}
     {state.bars.filter(b=>b.visible).map(b=>{const r=b.rect,d=config.variant==='signed-columns'?config.depth:undefined,x=r.x*width,y=r.y*height,w=r.width*width,h=r.height*height,dx=(d?.x??0)*width,dy=(d?.y??0)*height;return <g key={b.id} data-chart-bar={b.id} data-explicit-current-value={b.value}>
      {d&&h>0&&<><polygon data-original-depth-side="true" points={`${x+w},${y} ${x+w+dx},${y+dy} ${x+w+dx},${y+h+dy} ${x+w},${y+h}`} fill={b.color} opacity=".5"/><polygon points={`${x},${y} ${x+dx},${y+dy} ${x+w+dx},${y+dy} ${x+w},${y}`} fill={b.color} opacity=".75"/></>}
      <rect x={x} y={y} width={w} height={h} fill={b.color}/>
     </g>;})}
    </>}
   </svg>}
   {state.fields.filter(f=>f.page.visible).map(f=><div key={f.id} data-code-line-active={f.role==='code'?state.activeCodeLineIds.includes(f.id.slice(5)):undefined} style={{position:'absolute',...px(f.rect,width,height),background:f.role==='code'&&state.activeCodeLineIds.includes(f.id.slice(5))?'#d8c24944':f.role==='condition'?'#172b45ee':undefined,borderRadius:height*.008}}><TextPlane field={f} measured={current.fields[f.id]} page={f.page.index}/></div>)}
   {state.chartVisible&&state.bars.filter(b=>b.visible).map(b=>{const plan=numbers.find(n=>n.id===b.id)!,fit=current.numbers[b.id]?.fit;return fit?<div key={b.id} style={{position:'absolute',...px(plan.rect,width,height)}}><NumberPlane text={b.numericText} plan={plan} fit={fit}/></div>:null;})}
  </>}
  <div data-chart-real-speaker="true" style={{position:'absolute',...px(config.speakerRect,width,height),borderRadius:height*.015,overflow:'hidden'}}>{speakerContent}</div>
 </AbsoluteFill>;
}
/** Independent experiment. Public library/adapter integration is intentionally absent. */
export function QuantitativeChartScene({scene,config,elapsed,speakerProof,renderSpeaker,projectionProof,onReadiness}:{scene:StoryScene;config:QuantitativeChartConfig;elapsed:number;speakerProof?:QuantitativeSpeakerProof;renderSpeaker?:QuantitativeSpeakerRenderer;projectionProof?:QuantitativeProjectionProof;onReadiness?:(r:QuantitativePreviewReadiness)=>void}){
 const {width,height}=useVideoConfig(),issues=quantitativeIssues(scene,config,{width,height},projectionProof),b=config?.binding;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=dynamicSceneDuration(scene))issues.push('source-elapsed-outside-original-scene');
 if(!renderSpeaker||!speakerProof||speakerProof.kind!=='same-source-video'||speakerProof.src!==b?.src||speakerProof.sha256!==b?.sha256||speakerProof.startMs!==b?.startMs||speakerProof.endMs!==b?.endMs)issues.push('same-source-real-speaker-renderer-required');
 let speakerContent:React.ReactNode=null;
 if(!issues.length&&renderSpeaker){try{speakerContent=renderSpeaker({width:config.speakerRect.width*width,height:config.speakerRect.height*height,elapsed,sourceMs:b.startMs+elapsed,mode:'inset'});if(!quantitativeSpeakerHasContent(speakerContent))issues.push('actual-source-speaker-output-empty');}catch{issues.push('actual-source-speaker-render-failed');}}
 const issueKey=JSON.stringify(issues);useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true});},[issueKey,onReadiness]);
 if(issues.length||!speakerProof)return <AbsoluteFill data-experimental-mechanism="quantitative-chart" data-layout-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedChart scene={scene} config={config} elapsed={elapsed} speakerProof={speakerProof} speakerContent={speakerContent} projectionProof={projectionProof} onReadiness={onReadiness}/>;
}
