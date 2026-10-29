import React,{useContext,useLayoutEffect,useState} from 'react';
import {AbsoluteFill,cancelRender,continueRender,delayRender,useVideoConfig} from 'remotion';
import {DisplayFontContext,loadDisplayFont} from './DisplayFont';
import {displayFontFamily} from './display-fonts.mjs';
import {sourceTokenPageState} from './source-token-transfer.mjs';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import type {StoryScene} from './storyboard.mjs';
import type {StageRect} from './dynamic-mechanisms.mjs';
import {fieldRollBoardIssues,fieldRollBoardReadiness,fieldRollBoardState,fieldRollMeasurementKey,measureFieldRollBoard,type FieldRollBoardConfig,type FieldRollMeasurement,type FieldRollProjectionProof,type FieldRollSpeakerProof,type FieldRollReadiness,type FieldRollTextPlan} from './field-roll-board.mjs';

export type FieldRollNativeReadiness=FieldRollReadiness&{canApply:false;uiAccepted:false;needsFaceReview:true;nativeMeasuredFields:number};
export type FieldRollSpeakerRenderer=(props:{width:number;height:number;elapsed:number;sourceMs:number;mode:'inset'})=>React.ReactNode;
const px=(r:StageRect,width:number,height:number)=>({left:r.x*width,top:r.y*height,width:r.width*width,height:r.height*height});

function TextPlane({item,elapsed,family}:{item:FieldRollTextPlan&{fit:FieldRollMeasurement['texts'][number]['fit']};elapsed:number;family:string}){
 const {fit}=item,page=sourceTokenPageState(fit.pages,elapsed,item.window);
 return <div data-measured-text="true" data-field-roll-text={item.id} data-text-pages={fit.pages.length} data-layout-error={fit.unplaceable?'field-roll-copy-overflow':undefined} style={{position:'relative',width:'100%',height:'100%',fontFamily:family,fontWeight:600,fontSize:fit.fontSize,lineHeight:`${fit.rowHeight}px`,whiteSpace:'pre',color:'#edf6ff'}}>{fit.pages.map((lines,index)=><div key={index} aria-hidden={index!==page.index} style={{position:'absolute',inset:0,opacity:index===page.index?1:0}}>{lines.map((line,row)=><div key={row}>{line||'\u00a0'}</div>)}</div>)}</div>;
}

/** Drawing only. It does not issue readiness, apply a scene, load media or play
 * sound. Stable card rectangles never rotate; each glyph slides inside its own
 * measured mask. Callers must use the gated Scene for production mounting. */
export function FieldRollBoardGraphics({scene,config,elapsed,measurement,family}:{scene:StoryScene;config:FieldRollBoardConfig;elapsed:number;measurement:FieldRollMeasurement;family:string}){
 const {width,height}=useVideoConfig(),state=fieldRollBoardState(scene,config,elapsed),copy=measurement.texts.find(t=>t.id==='field-roll-complete-copy')!,title=measurement.texts.find(t=>t.id==='field-roll-title');
 return <>
  {state.copyVisible&&<div data-source-copy-window="true" data-field-roll-complete-source-copy="true" style={{position:'absolute',...px(config.copyWindow.rect,width,height)}}><TextPlane item={copy} elapsed={elapsed} family={family}/></div>}
  {title&&state.cards.some(c=>c.visible)&&<div style={{position:'absolute',...px(config.titleRect,width,height)}}><TextPlane item={title} elapsed={elapsed} family={family}/></div>}
  {state.cards.filter(c=>c.visible).map(card=><React.Fragment key={card.id}>
   <div data-field-roll-card={card.id} data-field-roll-card-phase={card.phase} style={{position:'absolute',...px(card.rect,width,height),opacity:card.opacity,border:'1px solid #b3d9ef70',background:'#162c46ed',borderRadius:height*.012}}/>
   {card.fields.map(field=>{
    const m=measurement.fields.find(m=>m.id===field.id)!,label=measurement.texts.find(t=>t.id==='field-roll-label:'+field.id)!,baseline=(m.rowHeight-m.ascent-m.descent)/2+m.ascent;
    const glyph=(value:string,y:number,hidden:boolean,role:string)=>{const metric=m.metrics.find(g=>g.glyph===value),x=metric?(m.advance-metric.left-metric.right)/2+metric.left:0;return <svg aria-hidden={hidden} data-field-roll-glyph-role={role} width={m.advance} height={m.rowHeight} style={{position:'absolute',overflow:'visible',transform:`translateY(${y*m.rowHeight}px)`}}><text x={x} y={baseline} fill="#edf6ff" fontFamily={family} fontSize={m.fontSize} fontWeight={600} xmlSpace="preserve">{value}</text></svg>;};
    return <React.Fragment key={field.id}>
     <div style={{position:'absolute',...px(field.labelRect,width,height),opacity:card.opacity}}><TextPlane item={label} elapsed={elapsed} family={family}/></div>
     <div data-field-roll-id={field.id} data-field-roll-source-ref={field.sourceRef} data-field-roll-phase={field.phase} data-field-roll-complete-readable={field.completeReadable} data-field-roll-readable-value={field.completeReadable?field.readableValue??undefined:undefined} style={{position:'absolute',...px(field.rect,width,height),opacity:card.opacity,fontFamily:family,fontWeight:600,fontSize:m.fontSize,lineHeight:`${m.rowHeight}px`,color:'#edf6ff',whiteSpace:'pre'}}>
      {field.cells.map(cell=><div key={cell.index} data-field-roll-cell={cell.index} data-field-roll-progress={cell.progress} style={{position:'absolute',left:cell.index*m.advance,top:(field.rect.height*height-m.rowHeight)/2,width:m.advance,height:m.rowHeight,overflow:'hidden'}}>
       {cell.unchanged?glyph(cell.from,0,false,'unchanged'):<>{glyph(cell.from,cell.fromY,cell.progress===1,'old')}{glyph(cell.to,cell.toY,cell.progress===0,'new')}</>}
      </div>)}
     </div>
    </React.Fragment>;
   })}
  </React.Fragment>)}
 </>;
}

function PreparedFieldRoll({scene,config,elapsed,projectionProof,speakerContent,onReadiness}:{scene:StoryScene;config:FieldRollBoardConfig;elapsed:number;projectionProof?:FieldRollProjectionProof;speakerContent:React.ReactNode;onReadiness?:((readiness:FieldRollNativeReadiness)=>void)}){
 const {width,height}=useVideoConfig(),font=useContext(DisplayFontContext),fontKey=font??'none',family=displayFontFamily(font),key=fieldRollMeasurementKey(scene,config,{width,height},fontKey),[measured,setMeasured]=useState<FieldRollMeasurement|null>(null);
 useLayoutEffect(()=>{
  let active=true,finished=false;const handle=delayRender('Measure every original/target field-roll grapheme');
  const finish=()=>{if(!finished){finished=true;continueRender(handle);}};
  loadDisplayFont(font).then(()=>{
   const context=document.createElement('canvas').getContext('2d');if(!context)throw Error('field-roll-canvas-font-measurement-unavailable');
   const next=measureFieldRollBoard(scene,config,{width,height},fontKey,(value,size)=>{context.font=`600 ${size}px ${family}`;const m=context.measureText(value);return {width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent,left:m.actualBoundingBoxLeft,right:m.actualBoundingBoxRight};});
   if(active)setMeasured(next);finish();
  }).catch(error=>{if(active)cancelRender(error);else finish();});
  return()=>{active=false;finish();};
 },[key,font,fontKey,family,width,height]);
 const current=measured?.key===key?measured:null,readiness=fieldRollBoardReadiness(scene,config,current,{width,height},projectionProof),issuesKey=JSON.stringify(readiness.issues);
 useLayoutEffect(()=>onReadiness?.({...readiness,issues:JSON.parse(issuesKey),canApply:false,uiAccepted:false,needsFaceReview:true,nativeMeasuredFields:current?.fields.length??0}),[readiness.status,issuesKey,current?.fields.length,onReadiness]);
 return <AbsoluteFill data-experimental-mechanism="field-roll-board" data-field-roll-status={readiness.status} data-mechanism-unavailable={readiness.status==='blocked'?readiness.issues.join('；'):undefined} style={{pointerEvents:'none'}}>{readiness.status==='ready'&&current&&<FieldRollBoardGraphics scene={scene} config={config} elapsed={elapsed} measurement={current} family={family}/>}<div data-field-roll-real-speaker="true" style={{position:'absolute',...px(config.speakerRect,width,height),overflow:'hidden',borderRadius:height*.014}}>{speakerContent}</div></AbsoluteFill>;
}

function hasSourceSlot(value:React.ReactNode):boolean{if(Array.isArray(value))return value.some(hasSourceSlot);if(!React.isValidElement<{children?:React.ReactNode}>(value))return false;if(value.type===React.Fragment)return hasSourceSlot(value.props.children);return typeof value.type==='string'?['video','img','canvas'].includes(value.type)||hasSourceSlot(value.props.children):true;}
/** Independent/unregistered. Parent integration must still provide current
 * decoded source readiness, actual DOM/font/full-cycle receipt, one audio owner
 * and apply/undo/export validation. This native component never writes a scene. */
export function FieldRollBoardScene({scene,config,elapsed,projectionProof,speakerProof,renderSpeaker,onReadiness}:{scene:StoryScene;config:FieldRollBoardConfig;elapsed:number;projectionProof?:FieldRollProjectionProof;speakerProof?:FieldRollSpeakerProof;renderSpeaker?:FieldRollSpeakerRenderer;onReadiness?:((readiness:FieldRollNativeReadiness)=>void)}){
 const {width,height}=useVideoConfig(),issues=fieldRollBoardIssues(scene,config,{width,height},projectionProof),b=config?.binding;
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=dynamicSceneDuration(scene))issues.push('field-roll-original-source-elapsed-outside-scene');
 if(!speakerProof||speakerProof.kind!=='same-source-video'||speakerProof.src!==b?.src||speakerProof.sha256!==b?.sha256||speakerProof.startMs!==b?.startMs||speakerProof.endMs!==b?.endMs||!renderSpeaker)issues.push('field-roll-real-same-source-speaker-required');
 let speakerContent:React.ReactNode=null;
 if(!issues.length&&renderSpeaker){try{speakerContent=renderSpeaker({width:config.speakerRect.width*width,height:config.speakerRect.height*height,elapsed,sourceMs:b.startMs+elapsed,mode:'inset'});if(!hasSourceSlot(speakerContent))issues.push('field-roll-real-source-slot-empty');}catch{issues.push('field-roll-real-source-slot-failed');}}
 const issuesKey=JSON.stringify(issues);useLayoutEffect(()=>{if(issues.length)onReadiness?.({status:'blocked',issues:JSON.parse(issuesKey),canApply:false,uiAccepted:false,needsFaceReview:true,nativeMeasuredFields:0});},[issuesKey,onReadiness]);
 if(issues.length)return <AbsoluteFill data-experimental-mechanism="field-roll-board" data-field-roll-status="blocked" data-mechanism-unavailable={issues.join('；')}/>;
 return <PreparedFieldRoll scene={scene} config={config} elapsed={elapsed} projectionProof={projectionProof} speakerContent={speakerContent} onReadiness={onReadiness}/>;
}
