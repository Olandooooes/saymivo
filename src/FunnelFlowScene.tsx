import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import type {StoryScene} from './storyboard.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import {counterMeasurementSpec,formatCounterValue} from './dynamic-mechanisms.mjs';
import {useMeasuredText} from './MeasuredText';
import {useStableGlyphLayout} from './StableGlyphLayout';
import {StableNumberText} from './StableNumberText';
import type {TextFit} from './text-fit.mjs';
import type {VisibleTextClock} from './dynamic-text-clock.mjs';
import {funnelFlowState,funnelTextPage,funnelTextReadiness,type FunnelFlowConfig,type FunnelFlowState} from './funnel-flow.mjs';

export type FunnelReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;uiAccepted:false;needsFaceReview:true};
export type FunnelSpeakerRenderer=(props:{width:number;height:number;elapsed:number;mode:'inset'})=>React.ReactNode;
const px=(rect:StageRect,width:number,height:number)=>({left:rect.x*width,top:rect.y*height,width:rect.width*width,height:rect.height*height});
type FitResult={fit:TextFit|null;family:string};
function TextPlane({result,clock,width,height,color='#e6f2ff',role}:{result:FitResult;clock:VisibleTextClock;width:number;height:number;color?:string;role:string}){
 const {fit,family}=result;if(!fit)return null;const page=funnelTextPage(fit.pages,clock);
 return <div data-funnel-text={role} data-text-pages={fit.pages.length} data-text-start-ms={clock.startMs} style={{position:'relative',width,height,fontFamily:family,fontSize:fit.fontSize,lineHeight:`${fit.rowHeight}px`,color,whiteSpace:'pre'}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={page!==index} style={{position:'absolute',inset:0,opacity:page===index?1:0}}>{lines.map((line,i)=><div key={i}>{line||'\u00a0'}</div>)}</div>)}</div>;
}
function useNumberLayout(max:number,width:number,height:number,minFont:number,maxFont:number,unit='',decimals=0){const spec=counterMeasurementSpec({kind:'number-counter',from:0,to:max,grouping:true,unit,decimals});return useStableGlyphLayout({glyphs:spec.glyphs,slots:spec.numericSlots,unit:spec.unit,samples:spec.samples,width,height,minFont,maxFont,weight:700});}

function ReadyFunnel({scene,config,elapsed,state,width,height,renderSpeaker,onReadiness}:{scene:StoryScene;config:FunnelFlowConfig;elapsed:number;state:FunnelFlowState;width:number;height:number;renderSpeaker:FunnelSpeakerRenderer;onReadiness?:((readiness:FunnelReadiness)=>void)}){
 const g=state.geometry,countWidth=g.counts.width*width/3,gap=width*.009,labelHeight=g.counts.height*height*.43,numberHeight=g.counts.height*height*.55,numberWidth=countWidth-gap;
 const labels=[`${config.inputLabel??'已进入'} · ${config.unit}`,`${config.rejectedLabel??'已沉积'} · ${config.unit}`,`${config.passedLabel??'已通过'} · ${config.unit}`],scaleText=`1 点 ≈ ${config.unitPerDot} ${config.unit}`;
 const title=useMeasuredText(scene.title,g.title.width*width,g.title.height*height,{minFont:height*.024,maxFont:height*.044,weight:600});
 const copy=useMeasuredText(g.copyText,g.copy.width*width,g.copy.height*height,{minFont:height*.032,maxFont:height*.067,weight:500});
 const input=useMeasuredText(labels[0],numberWidth,labelHeight,{minFont:height*.018,maxFont:height*.028});
 const rejected=useMeasuredText(labels[1],numberWidth,labelHeight,{minFont:height*.018,maxFont:height*.028});
 const passed=useMeasuredText(labels[2],numberWidth,labelHeight,{minFont:height*.018,maxFont:height*.028});
 const scale=useMeasuredText(scaleText,g.body.width*width*.94,g.body.height*height*.075,{minFont:height*.017,maxFont:height*.025});
 const numberMin=height*.016,numberMax=height*.052,inputNumber=useNumberLayout(config.totalCount,numberWidth,numberHeight,numberMin,numberMax),rejectedNumber=useNumberLayout(config.totalCount-config.passedCount,numberWidth,numberHeight,numberMin,numberMax),passedNumber=useNumberLayout(config.passedCount,numberWidth,numberHeight,numberMin,numberMax),rateNumber=useNumberLayout(100,g.body.width*width*.30,g.body.height*height*.13,numberMin,height*.055,'%',1);
 const numberLayouts=[inputNumber,rejectedNumber,passedNumber,...(config.totalCount?[rateNumber]:[])],waiting=[title,input,rejected,passed,scale,...(config.copyWindow?[copy]:[])].some(result=>!result.fit)||!numberLayouts.every(Boolean);
 const speed=scene.speed??1,projected=Number.isFinite(scene.phaseStartMs),exposure={speed,startMs:projected?(scene.startMs-scene.phaseStartMs!)*speed:0,endMs:projected?(scene.endMs-scene.phaseStartMs!)*speed:state.duration};
 const checks=[funnelTextReadiness(scene.title,title.fit,state.flowClock,exposure),...labels.map((label,index)=>funnelTextReadiness(label,[input,rejected,passed][index].fit,state.flowClock,exposure)),funnelTextReadiness(scaleText,scale.fit,state.flowClock,exposure),...(config.copyWindow?[funnelTextReadiness(g.copyText,copy.fit,state.copyClock,exposure)]:[])];
 const issues=[...new Set(checks.flatMap(check=>check.issues).filter(issue=>issue!=='等待实际字体测量'))];if(numberLayouts.some(layout=>layout?.unplaceable))issues.push('明确数值的最大字串在当前区域放不进，请调整布局');
 const status=waiting?'waiting':issues.length?'blocked':'ready',issueKey=JSON.stringify(issues);
 useLayoutEffect(()=>{onReadiness?.({status,issues:JSON.parse(issueKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[status,issueKey,onReadiness]);
 const speaker=<div data-funnel-speaker="true" style={{position:'absolute',...px(g.speaker,width,height),borderRadius:'50%',overflow:'hidden'}}>{renderSpeaker({width:g.speaker.width*width,height:g.speaker.height*height,elapsed,mode:'inset'})}</div>;
 if(status!=='ready')return <AbsoluteFill data-dynamic-mechanism="funnel-flow" data-layout-status={status} data-mechanism-unavailable={status==='blocked'?issues.join('；'):undefined}>{speaker}</AbsoluteFill>;
 const fits=[input,rejected,passed],values=[state.counts.emitted,state.counts.rejected,state.counts.passed],maxima=[config.totalCount,config.totalCount-config.passedCount,config.passedCount],bodyWidth=g.body.width*width,bodyHeight=g.body.height*height;
 return <AbsoluteFill data-dynamic-mechanism="funnel-flow" data-phase={state.phase} data-layout-status="ready" data-automatic-allowed="false" style={{pointerEvents:'none'}}>
  {state.copyClock.visible?<div data-funnel-complete-copy="true" style={{position:'absolute',...px(g.copy,width,height)}}><TextPlane result={copy} clock={state.copyClock} width={g.copy.width*width} height={g.copy.height*height} role="complete-copy"/></div>:state.flowClock.visible&&<>
   <div style={{position:'absolute',...px(g.title,width,height)}}><TextPlane result={title} clock={state.flowClock} width={g.title.width*width} height={g.title.height*height} role="title"/></div>
   <div style={{position:'absolute',...px(g.counts,width,height)}}>{values.map((value,index)=><div key={index} data-funnel-count={['emitted','rejected','passed'][index]} data-value={value} style={{position:'absolute',left:index*countWidth,top:0,width:numberWidth,height:g.counts.height*height}}><TextPlane result={fits[index]} clock={state.flowClock} width={numberWidth} height={labelHeight} role={['input-label','rejected-label','passed-label'][index]}/><div style={{position:'absolute',left:0,top:labelHeight}}><StableNumberText text={formatCounterValue(value,{kind:'number-counter',from:0,to:maxima[index],grouping:true})} config={{kind:'number-counter',from:0,to:maxima[index],grouping:true}} width={numberWidth} height={numberHeight} minFont={numberMin} maxFont={numberMax} color={index===2?'#81dfff':index===1?'#aebed0':'#e7f4ff'}/></div></div>)}</div>
   <div data-funnel-plot="true" style={{position:'absolute',...px(g.body,width,height)}}>
    <TextPlane result={scale} clock={state.flowClock} width={bodyWidth*.94} height={bodyHeight*.075} role="point-unit"/>
    <svg width={bodyWidth} height={bodyHeight} style={{position:'absolute',inset:0}}>
     <path d={`M${bodyWidth*.12} ${bodyHeight*.10} L${bodyWidth*.47} ${bodyHeight*.69} L${bodyWidth*.47} ${bodyHeight*.79} M${bodyWidth*.88} ${bodyHeight*.10} L${bodyWidth*.53} ${bodyHeight*.69} L${bodyWidth*.53} ${bodyHeight*.79}`} fill="none" stroke="#aacce0a0" strokeWidth={2.5}/>
     {state.particles.map(particle=><circle key={particle.id} data-funnel-particle={particle.id} data-particle-phase={particle.phase} data-particle-weight={particle.weight} cx={particle.x*bodyWidth} cy={particle.y*bodyHeight} r={Math.max(.65,state.dotRadiusPx*Math.sqrt(particle.weight/config.unitPerDot))} fill={['passing','passed'].includes(particle.phase)?'#77dbff':'#9ba9ba'} opacity={particle.phase==='settled'?.57:.94}/>)}
    </svg>
    {state.rate!==null&&<div data-funnel-final-rate="true" aria-hidden={!state.rateVisible} style={{position:'absolute',left:bodyWidth*.69,top:bodyHeight*.61,opacity:state.rateVisible?1:0}}><StableNumberText text={(state.rate*100).toFixed(1)} config={{kind:'number-counter',from:0,to:100,decimals:1,unit:'%'}} width={bodyWidth*.30} height={bodyHeight*.13} minFont={height*.016} maxFont={height*.055}/></div>}
   </div>
  </>}
  {speaker}
 </AbsoluteFill>;
}

// Independent, unregistered renderer. A caller must supply the actual talking
// head at the same source elapsed time; a static avatar cannot stand in for it.
export function FunnelFlowScene({scene,config,elapsed,renderSpeaker,onReadiness}:{scene:StoryScene;config:FunnelFlowConfig;elapsed:number;renderSpeaker?:FunnelSpeakerRenderer;onReadiness?:((readiness:FunnelReadiness)=>void)}){
 const {width,height}=useVideoConfig(),state=funnelFlowState(scene,config,elapsed,{width,height});
 const outerIssues=[...state.issues,...(!renderSpeaker?['real-source-speaker-renderer-required']:[])],outerKey=JSON.stringify(outerIssues);
 useLayoutEffect(()=>{if(outerIssues.length)onReadiness?.({status:'blocked',issues:JSON.parse(outerKey),canApply:false,uiAccepted:false,needsFaceReview:true});},[outerKey,onReadiness]);
 if(!state.available||!renderSpeaker)return <AbsoluteFill data-dynamic-mechanism="funnel-flow" data-mechanism-unavailable={outerIssues.join('；')}/>;
 return <ReadyFunnel scene={scene} config={config} elapsed={elapsed} state={state} width={width} height={height} renderSpeaker={renderSpeaker} onReadiness={onReadiness}/>;
}
