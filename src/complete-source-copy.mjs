import {dynamicSceneDuration,evidenceHandoffState,glassCapsuleState} from './dynamic-mechanisms.mjs';
import {hubFlowState} from './hub-flow.mjs';
import {visualSequence} from './visual-presets.mjs';
import {sampleSceneWindow} from './storyboard.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness} from './source-token-transfer.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const rectValid=rect=>rect&&['x','y','width','height'].every(key=>finite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=.86;
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function completeSourceCopyInventory(scene){
 return [{id:'title',text:scene.title},{id:'body',text:scene.body},...(scene.nodes??[]).flatMap(node=>[{id:`node:${node.id}:text`,text:node.text},{id:`node:${node.id}:detail`,text:node.detail},...(node.bullets??[]).map((text,index)=>({id:`node:${node.id}:bullet:${index}`,text}))])].filter(item=>typeof item.text==='string'&&item.text.length);
}
export const completeSourceCopyText=scene=>completeSourceCopyInventory(scene).map(item=>item.text).join('\n');

/** One current layout per mounted hook, not a count of historical effect calls. */
export function updateNativeLayoutReports(previous,signature,value){
 const id=value.instanceId??value.key,current=previous.signature===signature?previous.reports:[];
 if(value.active===false&&previous.signature!==signature)return previous;
 const old=current.find(r=>(r.instanceId??r.key)===id);
 if(value.active===false){if(!old)return previous;return {signature,reports:current.filter(r=>(r.instanceId??r.key)!==id)};}
 if(old&&JSON.stringify(old)===JSON.stringify(value))return previous;
 return {signature,reports:[...current.filter(r=>(r.instanceId??r.key)!==id),value]};
}

// These are actual entry paths in the nine native renderers, not preset-name
// guesses. First source visual motion is never shifted to fit the copy.
export function nativeCriticalEntry(scene,config){
 let events=[],overviewMs=0;
 const event=(atMs,reason)=>{if(finite(atMs))events.push({atMs,reason});};
 if(config.kind==='flip-board')event(config.atMs??0,'split-flap first fill');
 else if(config.kind==='number-counter')event(config.atMs??0,'first numeric change');
 else if(config.kind==='evidence-handoff'){
  overviewMs=1000;for(const cue of evidenceHandoffState(scene,config,0).cues)event(cue.atMs,'evidence cue travel');if(config.matchToLive)event(config.matchToLive.atMs,'person/background match');
 }else if(config.kind==='glass-capsules'){
  for(const item of glassCapsuleState(scene,config,0).items)event(item.atMs,'capsule node entry');event((config.endMs??dynamicSceneDuration(scene))-(config.outMs??400),'capsule group exit');
 }else if(config.kind==='orbit-flow-variant'){
  overviewMs=1000;if(config.gatherAtMs!==undefined)event(config.gatherAtMs,'outside-point gathering');event(config.openAtMs,'ring opening');event(config.flowAtMs,'directed point flow');
 }else if(config.kind==='bar-group-variant')for(const item of config.items??[])event(item.atMs,'bar row and value entry');
 else if(config.kind==='hub-branch-flow'){
  const diagramAt=config.matchToDiagram?.atMs??0;event(diagramAt,config.matchToDiagram?'room-to-diagram match':'hub/input birth at source zero');
  event(Math.max(diagramAt,config.branchesAtMs),'branch draw');event(Math.max(diagramAt,config.flowAtMs),'particle input');
  for(const node of scene.nodes??[]){const index=config.outputNodeIds.indexOf(node.id),birth=index<0?0:config.branchesAtMs+config.branchDrawMs+index*config.nodeStaggerMs;event(Math.max(diagramAt,birth),'actual node birth');}
  for(const phase of config.rearrangements??[])event(Math.max(diagramAt,phase.atMs),'node/edge rearrangement');for(const state of config.nodeStates??[])event(Math.max(diagramAt,state.atMs),'node state gate');for(const gate of config.edgeGates??[])event(Math.max(diagramAt,gate.atMs),'branch gate');
  for(const cue of config.quotedLineCues??[])for(const line of cue.lines??[]){event(Math.max(diagramAt,line.atMs),'quote line entry');if(line.highlightAtMs!==undefined)event(Math.max(diagramAt,line.highlightAtMs),'quote highlight');}
 }else if(config.kind==='screenshot-region-focus'){
  overviewMs=1000;event(config.atMs,'ROI independent expansion');for(const cue of config.explanationCues??[])for(const line of cue.lines??[]){event(line.atMs,'ROI explanation entry');if(line.highlightAtMs!==undefined)event(line.highlightAtMs,'ROI explanation highlight');}
 }else if(config.kind==='bilingual-board-transition'){
  overviewMs=1000;for(const pair of config.pairs??[])event(pair.atMs,'bilingual front-to-back roll');
 }
 // Existing evidence media has its own source-relative camera/cursor/highlight
 // clocks. An early asset move cannot be hidden by a supposedly quiet intro.
 if(['evidence-handoff','orbit-flow-variant'].includes(config.kind)){
  const media=scene.media;
  if(media?.kind==='video'&&media.freezeAtSec===undefined)event(0,'moving source media starts at source zero');
  if((media?.camera?.length??0)>1)event(Math.min(...media.camera.map(point=>point.atMs)),'media camera begins');
  if((media?.cursor?.length??0)>1)event(Math.min(...media.cursor.map(point=>point.atMs)),'media cursor begins');
  for(const mark of scene.highlights??[])event(mark.atMs,'asset annotation draw');
 }
 events.sort((a,b)=>a.atMs-b.atMs);return {atMs:events[0]?.atMs??0,overviewMs,events};
}

// Count real useMeasuredText/useStableGlyphLayout paths. Each must actually
// report its loaded-font result before graphics are released. This is not a
// claim that native text fields were readable: full copy is separately drawn.
export function nativeLayoutPlan(scene,config,elapsed,viewport={width:1920,height:1080}){
 const nodes=scene.nodes?.length?scene.nodes:[{id:scene.id,text:scene.title,detail:scene.body}],detail=node=>!!(node.detail||node.bullets?.length);let count=0,phase=null;
 if(config.kind==='flip-board'||config.kind==='number-counter')count=2;
 else if(config.kind==='evidence-handoff')count=1+nodes.length+evidenceHandoffState(scene,config,elapsed).items.length;
 else if(config.kind==='glass-capsules')count=nodes.length;
 else if(config.kind==='orbit-flow-variant'){const sequence=visualSequence(scene,elapsed);count=2+(detail(sequence.current)?1:0);phase={nodeId:sequence.current.id};}
 else if(config.kind==='bar-group-variant')count=1+2*(config.items??[]).length;
 else if(config.kind==='screenshot-region-focus')count=1+(config.explanationCues??[]).reduce((sum,cue)=>sum+cue.lines.length,0);
 else if(config.kind==='bilingual-board-transition')count=1+nodes.reduce((sum,node)=>sum+2+(detail(node)?2:0),0);
 else if(config.kind==='hub-branch-flow'){
  const state=hubFlowState(scene,config,elapsed,viewport);count=1;phase=state.nodes.map(item=>({id:item.node.id,rect:item.measurementRect,asset:item.assetSrc,metric:item.metric?{from:item.metric.from,to:item.metric.to,unit:item.metric.unit}:null}));
  for(const item of state.nodes){const separateDetail=detail(item.node)&&(item.assetSrc||item.quoteLines.length);count+=1+(separateDetail?1:0)+item.quoteLines.length+(item.metric?1:0);}
 }
 return {count,phase};
}

export function completeSourceCopySpeaker(scene,config,elapsed,viewport={width:1920,height:1080}){
 if(config.sourceCopyWindow?.speakerRect&&elapsed<=config.sourceCopyWindow.endMs)return config.sourceCopyWindow.speakerRect;
 if(config.kind==='evidence-handoff')return evidenceHandoffState(scene,config,elapsed).speakerRect;
 if(config.kind==='hub-branch-flow'&&config.matchToDiagram){const state=hubFlowState(scene,config,elapsed,viewport);if(state.speakerRect)return state.speakerRect;}
 const point=sampleSceneWindow(scene,elapsed);return config.sourceCopyWindow?.speakerRect??(point?{x:point.x,y:point.y,width:point.size,height:point.size*viewport.width/viewport.height}:null);
}
export function completeSourceCopyIssues(scene,config,viewport={width:1920,height:1080}){
 const inventory=completeSourceCopyInventory(scene);if(!inventory.length)return ['complete-source-copy-has-no-authored-content'];
 const issues=[],window=config.sourceCopyWindow,duration=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),entry=nativeCriticalEntry(scene,config);
 if(!window||!rectValid(window.rect)||!finite(window.atMs)||!finite(window.endMs)||window.atMs<0||window.endMs>duration||window.endMs-window.atMs<1000)issues.push('explicit-complete-source-copy-window-required');
 if(![viewport.width,viewport.height,duration,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||viewport.width<=0||viewport.height<=0||duration<=0||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs)issues.push('complete-copy-source-clock-invalid');
 if(window&&finite(window.endMs)&&window.endMs+entry.overviewMs>entry.atMs+.001)issues.push('copy-window-hides-native-motion-or-needed-overview');
 const times=window&&finite(window.atMs)&&finite(window.endMs)?[window.atMs,window.endMs]:[0],speakerRects=times.map(time=>completeSourceCopySpeaker(scene,config,time,viewport));
 if(speakerRects.some(rect=>!rectValid(rect)))issues.push('explicit-safe-real-speaker-rectangle-required');
 if(scene.window){
  const points=scene.window.keyframes??[],keyTimes=points.map(point=>point.atMs);
  if(keyTimes.some(time=>!finite(time)||time<0||time>duration)||new Set(keyTimes).size!==keyTimes.length)issues.push('speaker-keyframe-clock-invalid');
  const checkTimes=[...times,...keyTimes.filter(time=>window&&time>window.atMs&&time<window.endMs)];
  speakerRects.push(...checkTimes.map(time=>sampleSceneWindow(scene,time)).filter(Boolean).map(point=>({x:point.x,y:point.y,width:point.size,height:point.size*viewport.width/viewport.height})));
 }
 if(speakerRects.some(rect=>!rect||!['x','y','width','height'].every(key=>finite(rect[key]))))issues.push('real-person-path-invalid');
 else if(speakerRects.length&&window&&rectValid(window.rect)){
  const x=Math.min(...speakerRects.map(rect=>rect.x)),y=Math.min(...speakerRects.map(rect=>rect.y)),right=Math.max(...speakerRects.map(rect=>rect.x+rect.width)),bottom=Math.max(...speakerRects.map(rect=>rect.y+rect.height));
  if(overlaps(window.rect,{x,y,width:right-x,height:bottom-y}))issues.push('complete-copy-crosses-real-person-path');
 }
 return [...new Set(issues)];
}
export function completeSourceCopyReadiness(scene,config,fit,viewport={width:1920,height:1080}){
 const issues=completeSourceCopyIssues(scene,config,viewport);if(issues.length)return {status:'blocked',issues};
 const text=completeSourceCopyText(scene);if(!text)return {status:'ready',issues:[]};
 return sourceTokenTextReadiness(text,fit,config.sourceCopyWindow,sourceTokenExposure(scene));
}
