import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {visibleTextClock} from './dynamic-text-clock.mjs';
import {projectStoryboard} from './storyboard.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=value=>Math.max(0,Math.min(1,value));
const unique=values=>[...new Set(values)];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const local=value=>typeof value==='string'&&value.length>0&&!/^(?:https?:|file:|\/|.*\.\.)/.test(value);
const rectValid=rect=>rect&&['x','y','width','height'].every(key=>finite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=.86;
const pointValid=point=>point&&finite(point.x)&&finite(point.y)&&point.x>=0&&point.x<=1&&point.y>=0&&point.y<=.86;
const samePoint=(a,b)=>!!a&&!!b&&Math.abs(a.x-b.x)<1e-7&&Math.abs(a.y-b.y)<1e-7;
const overlaps=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const contains=(a,b)=>b.x>=a.x-1e-7&&b.y>=a.y-1e-7&&b.x+b.width<=a.x+a.width+1e-7&&b.y+b.height<=a.y+a.height+1e-7;
const expand=(r,x,y)=>({x:r.x-x,y:r.y-y,width:r.width+2*x,height:r.height+2*y});
const union=rects=>{const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};};
const nodeCopy=node=>[node.text,node.detail,...(node.bullets??[])].filter(value=>typeof value==='string'&&value.length).join('\n');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;

/** All source copy is actually rendered in a separate readable plane. */
export function pathRunnerCopy(scene,config){
 return [scene.title,scene.body,scene.label,scene.sourceNote,...(scene.tags??[]).map(tag=>tag.text),...(scene.links??[]).map(link=>link.label),...(scene.nodes??[]).map(nodeCopy),config?.annotation].filter(value=>typeof value==='string'&&value.length).join('\n');
}
export function pathRunnerExposure(scene){
 const speed=scene.speed??1,projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined;
 return {speed,startMs:projected?(scene.startMs-scene.phaseStartMs)*speed:0,endMs:projected?(scene.endMs-scene.phaseStartMs)*speed:dynamicSceneDuration(scene)};
}
export function pathRunnerMeasurementKey(scene,config,viewport,fontKey){
 return JSON.stringify([scene.sourceId??scene.id,scene.src,scene.nodes,pathRunnerCopy(scene,config),scene.window,config,viewport,fontKey]);
}
export function pathRunnerProtectedRects(scene,config,viewport){
 const points=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],windows=points.map(point=>({x:point.x,y:point.y,width:point.size,height:point.size*viewport.width/viewport.height}));
 return [config.speakerRect,...windows,...(windows.length&&windows.every(r=>['x','y','width','height'].every(k=>finite(r[k])))?[union(windows)]:[]),...(config.protectedAreas??[]).map(area=>area.rect)];
}
export function pathRunnerSegmentEnvelope(segment,runner){
 const points=[segment.from,segment.control1,segment.control2,segment.to],x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
 return expand({x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y},runner.width/2,runner.height/2);
}
export function pathRunnerBezier(segment,p){
 const t=clamp(p),q=1-t;return {x:q*q*q*segment.from.x+3*q*q*t*segment.control1.x+3*q*t*t*segment.control2.x+t*t*t*segment.to.x,y:q*q*q*segment.from.y+3*q*q*t*segment.control1.y+3*q*t*t*segment.control2.y+t*t*t*segment.to.y};
}
export function pathRunnerPathD(segments,width,height){
 if(!segments?.length)return '';return `M${segments[0].from.x*width} ${segments[0].from.y*height} `+segments.map(s=>`C${s.control1.x*width} ${s.control1.y*height} ${s.control2.x*width} ${s.control2.y*height} ${s.to.x*width} ${s.to.y*height}`).join(' ');
}
/** Rectangle begins at top right, then down, left, up, right. No bounce model. */
export function pathRunnerBoundaryPoints(rect){return [{x:rect.x+rect.width,y:rect.y},{x:rect.x+rect.width,y:rect.y+rect.height},{x:rect.x,y:rect.y+rect.height},{x:rect.x,y:rect.y},{x:rect.x+rect.width,y:rect.y}];}
export function pathRunnerTraceState(config,elapsedSec){
 if(config.kind!=='bounded-agent-runner')return {progress:1,points:[]};
 const progress=clamp((elapsedSec-config.boundary.startSec)/config.boundary.drawSec),corners=pathRunnerBoundaryPoints(config.boundary.rect),lengths=corners.slice(1).map((p,i)=>Math.hypot(p.x-corners[i].x,p.y-corners[i].y)),total=lengths.reduce((a,b)=>a+b,0),points=[corners[0]];let left=progress*total;
 for(let i=0;i<lengths.length;i++){const p=clamp(left/lengths[i]);points.push({x:corners[i].x+(corners[i+1].x-corners[i].x)*p,y:corners[i].y+(corners[i+1].y-corners[i].y)*p});left-=lengths[i];if(p<1)break;}
 return {progress,points};
}
export function pathRunnerSample(config,elapsedSec){
 const segments=config.path.segments,lapSec=segments.reduce((sum,s)=>sum+s.durationSec,0),age=elapsedSec-config.runStartSec,totalSec=lapSec*config.path.laps,finished=age>=totalSec,lap=finished?config.path.laps-1:Math.max(0,Math.floor(Math.max(0,age)/lapSec));
 let local=finished?lapSec:Math.max(0,age)-lap*lapSec,index=0;
 for(;index<segments.length-1&&local>=segments[index].durationSec;index++)local-=segments[index].durationSec;
 const segment=segments[index],progress=finished?1:clamp(local/segment.durationSec);
 return {point:pathRunnerBezier(segment,progress),segmentId:segment.id,segmentIndex:index,progress,lap,finished,started:age>=0,completedAtSec:config.runStartSec+totalSec};
}
export function pathRunnerFieldPlan(scene,config){
 const end=config.graphicWindow.endSec,byId=new Map((scene.nodes??[]).map(n=>[n.id,n]));
 const cards=config.kind==='closed-loop-runner'?(config.stages??[]).map(stage=>({...stage,startSec:config.graphicWindow.startSec,role:'stage'})):(config.rules??[]).map(rule=>({...rule,startSec:rule.atSec,role:'rule'}));
 return [
  ...(pathRunnerCopy(scene,config)?[{id:'source-copy',text:pathRunnerCopy(scene,config),rect:config.copyWindow?.rect,startSec:config.copyWindow?.startSec,endSec:config.copyWindow?.endSec,role:'copy'}]:[]),
  ...cards.map(card=>({id:card.id,text:byId.get(card.nodeId)?.text??'',rect:card.rect,startSec:card.startSec,endSec:end,role:card.role,nodeId:card.nodeId})),
  ...(config.feedback??[]).map(event=>({id:event.id,text:byId.get(event.nodeId)?.text??'',rect:event.rect,startSec:event.atSec,endSec:end,role:'feedback',nodeId:event.nodeId})),
  {id:'runner-label',text:config.runner.label,rect:{x:0,y:0,width:config.runner.width,height:config.runner.height},startSec:config.runStartSec,endSec:end,role:'runner'}
 ];
}
export function pathRunnerProjectionIssues(scene,config,proof){
 if(scene.phaseStartMs===undefined&&scene.phaseEndMs===undefined)return [];
 const raw=proof?.rawScene,clips=proof?.clips,binding=config?.binding;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||raw.id!==binding?.sceneId||raw.src!==binding?.src||raw.startMs!==binding?.startMs||raw.endMs!==binding?.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c?.id)).size!==clips.length||clips.some(c=>!c?.id||!local(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['verified-raw-scene-and-timeline-projection-required'];
 const expected=projectStoryboard([raw],clips,proof.fps).find(projected=>projected.id===scene.id&&projected.clipId===scene.clipId);
 return expected&&JSON.stringify(stable(expected))===JSON.stringify(stable(scene))?[]:['projection-no-longer-matches-bound-absolute-source-scene'];
}
export function pathRunnerIssues(scene,config,viewport={width:1920,height:1080},projectionProof){
 if(!config||!['closed-loop-runner','bounded-agent-runner'].includes(config.kind))return ['path-runner-kind-invalid'];
 const issues=[],duration=dynamicSceneDuration(scene),binding=config.binding,exposure=pathRunnerExposure(scene),projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined;
 if(![duration,scene.startMs,scene.endMs,exposure.startMs,exposure.endMs,exposure.speed,viewport.width,viewport.height].every(finite)||duration<=0||scene.endMs<=scene.startMs||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs||viewport.width<=0||viewport.height<=0||projected&&(!finite(scene.phaseStartMs)||!finite(scene.phaseEndMs)))issues.push('source-clock-invalid');
 if(config.clock!=='scene-source-relative-seconds'||!binding||binding.sceneId!==(scene.sourceId??scene.id)||binding.src!==scene.src||!local(binding.src)||!sha(binding.sha256)||![binding.startMs,binding.endMs].every(finite)||binding.startMs<0||binding.endMs<=binding.startMs||Math.abs(binding.endMs-binding.startMs-duration)>.01||!projected&&(Math.abs(binding.startMs-scene.startMs)>.01||Math.abs(binding.endMs-scene.endMs)>.01))issues.push('raw-source-identity-or-clock-mismatch');
 if(projected&&(!finite(scene.sourceOffsetMs)||Math.abs(scene.sourceOffsetMs-exposure.startMs)>.02))issues.push('retained-source-offset-mismatch');
 issues.push(...pathRunnerProjectionIssues(scene,config,projectionProof));
 const graph=config.graphicWindow,copy=config.copyWindow;
 if(!graph||![graph.startSec,graph.endSec].every(finite)||graph.startSec<0||graph.endSec>duration/1000||graph.endSec-graph.startSec<2)issues.push('graphic-window-invalid');
 if(pathRunnerCopy(scene,config)&&(!copy||!rectValid(copy.rect)||![copy.startSec,copy.endSec].every(finite)||copy.startSec<0||copy.endSec>duration/1000||copy.endSec-copy.startSec<1.2))issues.push('complete-source-copy-window-required');
 if(copy&&graph&&copy.startSec<graph.endSec&&graph.startSec<copy.endSec)issues.push('copy-and-motion-must-use-separate-windows');
 if(!rectValid(config.speakerRect))issues.push('explicit-real-speaker-slot-required');
 if(!Array.isArray(config.protectedAreas??[])||(config.protectedAreas??[]).some(area=>!rectValid(area?.rect)))issues.push('protected-area-invalid');
 const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[];
 if(windows.some(w=>![w.x,w.y,w.size].every(finite)||w.size<=0||w.x<0||w.y<0||w.x+w.size>1||w.y+w.size*viewport.width/viewport.height>1))issues.push('speaker-window-invalid');
 const times=(scene.window?.keyframes??[]).map(w=>w.atMs);if(times.some(t=>!finite(t)||t<0||t>duration)||new Set(times).size!==times.length)issues.push('speaker-keyframe-clock-invalid');
 const runner=config.runner,trail=runner?.trail;
 if(!runner||typeof runner.label!=='string'||!runner.label.trim()||![runner.width,runner.height].every(finite)||runner.width<.02||runner.height<.02||runner.width>.2||runner.height>.15)issues.push('explicit-runner-label-and-size-required');
 if(!trail||![trail.sampleSec,trail.lifetimeSec].every(finite)||trail.sampleSec<.025||trail.lifetimeSec<trail.sampleSec||trail.lifetimeSec>10||!Number.isInteger(trail.maxPoints)||trail.maxPoints<1||trail.maxPoints>240||Math.ceil(trail.lifetimeSec/trail.sampleSec)>trail.maxPoints)issues.push('explicit-bounded-trail-budget-required');
 const path=config.path,segments=Array.isArray(path?.segments)?path.segments:[];
 if(!segments.length||segments.length>16||new Set(segments.map(s=>s?.id)).size!==segments.length||!Number.isInteger(path?.laps)||path.laps<1||path.laps>12)issues.push('explicit-path-segments-and-laps-required');
 for(let i=0;i<segments.length;i++){
  const s=segments[i];if(!s?.id||![s.from,s.control1,s.control2,s.to].every(pointValid)||!finite(s.durationSec)||s.durationSec<.2||samePoint(s.from,s.to)&&samePoint(s.from,s.control1)&&samePoint(s.from,s.control2))issues.push('bezier-segment-invalid');
  if(i&& !samePoint(segments[i-1]?.to,s?.from))issues.push('path-must-be-continuous');
 }
 const closed=segments.length&&samePoint(segments.at(-1)?.to,segments[0]?.from);
 if((config.kind==='closed-loop-runner'||path?.laps>1)&&!closed)issues.push('closed-path-required-no-invented-return-or-bounce');
 if(config.kind==='closed-loop-runner'&&segments.length<2)issues.push('closed-loop-needs-multiple-explicit-segments');
 const nodes=scene.nodes??[],cards=config.kind==='closed-loop-runner'?config.stages:config.rules;
 if(new Set(nodes.map(node=>node.id)).size!==nodes.length||nodes.some(node=>!node.id))issues.push('source-node-ids-must-be-stable-and-unique');
 if(!Array.isArray(cards)||!cards.length||cards.length>12||new Set(cards.map(c=>c?.id)).size!==cards.length||new Set(cards.map(c=>c?.nodeId)).size!==cards.length)issues.push('stable-explicit-stage-or-rule-ids-required');
 for(const card of Array.isArray(cards)?cards:[]){
  if(!card?.id||!nodes.some(n=>n.id===card.nodeId&&typeof n.text==='string'&&n.text.trim())||!rectValid(card.rect))issues.push('stage-or-rule-must-bind-complete-source-node');
  if(config.kind==='closed-loop-runner'&&!segments.some(s=>s?.id===card?.segmentId))issues.push('stage-must-bind-explicit-path-segment');
 }
 if(config.kind==='closed-loop-runner'&&Array.isArray(cards)&&(cards.length<2||new Set(cards.map(c=>c.segmentId)).size!==cards.length))issues.push('loop-stages-must-have-distinct-segment-entries');
 const feedback=config.feedback??[];
 if(!Array.isArray(feedback)||feedback.length>12)issues.push('feedback-list-invalid');
 for(const event of Array.isArray(feedback)?feedback:[])if(!event?.id||!nodes.some(n=>n.id===event.nodeId&&typeof n.text==='string'&&n.text.trim())||!rectValid(event.rect)||!finite(event.atSec)||event.atSec<config.runStartSec||event.atSec+1.2>graph?.endSec)issues.push('feedback-requires-explicit-original-node-and-time');
 const fieldIds=[...(Array.isArray(cards)?cards:[]),...(Array.isArray(feedback)?feedback:[])].map(card=>card?.id);
 if(new Set(fieldIds).size!==fieldIds.length||fieldIds.some(id=>['source-copy','runner-label'].includes(id)))issues.push('all-field-ids-must-be-stable-unique-and-nonreserved');
 if(!finite(config.runStartSec)||config.runStartSec<graph?.startSec)issues.push('run-start-invalid');
 const completed=config.runStartSec+segments.reduce((sum,s)=>sum+(s?.durationSec??NaN),0)*(path?.laps??NaN);
 if(!finite(completed)||completed+1.2>graph?.endSec)issues.push('path-needs-complete-motion-and-final-hold');
 if(config.kind==='bounded-agent-runner'){
  const b=config.boundary;if(!b||!rectValid(b.rect)||![b.startSec,b.drawSec].every(finite)||b.startSec<graph?.startSec||b.drawSec<.8||b.startSec+b.drawSec>graph?.endSec)issues.push('explicit-clockwise-boundary-required');
  for(const card of Array.isArray(cards)?cards:[])if(!finite(card.atSec)||card.atSec<(b?.startSec??Infinity)+(b?.drawSec??Infinity)||card.atSec+.3>config.runStartSec)issues.push('rules-must-follow-closed-boundary-before-agent');
 }
 if(scene.media?.src||nodes.some(n=>n.assetSrc))issues.push('existing-media-requires-a-separate-supported-renderer');
 if(issues.length)return unique(issues);
 const protections=pathRunnerProtectedRects(scene,config,viewport),fields=pathRunnerFieldPlan(scene,config),staticFields=fields.filter(f=>f.role!=='runner'),envelopes=segments.map(s=>pathRunnerSegmentEnvelope(s,runner));
 for(const field of staticFields){
  if(!rectValid(field.rect)||protections.some(r=>overlaps(r,field.rect)))issues.push('complete-text-overlaps-speaker-or-protected-area');
 }
 for(let i=0;i<staticFields.length;i++)for(let j=i+1;j<staticFields.length;j++){const a=staticFields[i],b=staticFields[j];if(a.startSec<b.endSec&&b.startSec<a.endSec&&overlaps(a.rect,b.rect))issues.push('persistent-labels-overlap');}
 for(const envelope of envelopes){
  if(!rectValid(envelope))issues.push('whole-runner-motion-envelope-outside-safe-area');
  if(protections.some(r=>overlaps(r,envelope)))issues.push('runner-or-trail-crosses-speaker-path');
  if(staticFields.some(f=>f.role!=='copy'&&overlaps(f.rect,envelope)))issues.push('runner-or-trail-covers-persistent-label');
  if(config.kind==='bounded-agent-runner'&&!contains(config.boundary.rect,envelope))issues.push('agent-and-blue-trail-must-remain-inside-explicit-boundary');
 }
 if(config.kind==='bounded-agent-runner'){
  // Reserve the full yellow stroke, rather than merely its unexpanded corners.
  const b=config.boundary.rect,bands=[{x:b.x-.002,y:b.y-.002,width:b.width+.004,height:.004},{x:b.x-.002,y:b.y+b.height-.002,width:b.width+.004,height:.004},{x:b.x-.002,y:b.y-.002,width:.004,height:b.height+.004},{x:b.x+b.width-.002,y:b.y-.002,width:.004,height:b.height+.004}];
  if(!rectValid(expand(b,.002,.002)))issues.push('whole-boundary-stroke-outside-safe-area');
  if(bands.some(band=>protections.some(r=>overlaps(r,band))||staticFields.some(f=>f.role!=='copy'&&overlaps(f.rect,band))))issues.push('boundary-stroke-overlaps-speaker-or-rule-text');
 }
 return unique(issues);
}

export function pathRunnerTextReadiness(text,fit,field,exposure){
 if(!fit)return {status:'waiting',issues:['loaded-real-font-required']};
 const issues=[],pages=fit.pages??[],duration=(field.endSec-field.startSec)*1000;
 if(fit.unplaceable||!pages.length||pages.flat().join('')!==String(text).replaceAll('\n',''))issues.push('complete-text-does-not-fit-or-match');
 if(![duration,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||duration<=0||exposure.speed<=0)issues.push('reading-clock-invalid');
 else for(let page=0;page<pages.length;page++){
  const start=field.startSec*1000+page*duration/pages.length,end=start+duration/pages.length,shown=Math.max(0,Math.min(end,exposure.endMs)-Math.max(start,exposure.startMs))/exposure.speed,count=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(pages[page].join(''))].length;
  if(shown<Math.max(1200,count/14*1000))issues.push('every-page-needs-real-retained-speed-adjusted-reading-time');
 }
 return {status:issues.length?'blocked':'ready',issues:unique(issues)};
}
export function pathRunnerReadiness(scene,config,measurement,speakerProof,viewport={width:1920,height:1080},projectionProof){
 const issues=pathRunnerIssues(scene,config,viewport,projectionProof),binding=config?.binding;
 if(!speakerProof||speakerProof.src!==binding?.src||speakerProof.sha256!==binding?.sha256||speakerProof.startMs!==binding?.startMs||speakerProof.endMs!==binding?.endMs||speakerProof.kind!=='same-source-video')issues.push('same-source-real-speaker-proof-required');
 if(issues.length)return {status:'blocked',issues:unique(issues)};
 if(!measurement)return {status:'waiting',issues:['complete-loaded-font-measurements-required']};
 if(!measurement.fontKey||measurement.key!==pathRunnerMeasurementKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['stale-font-content-geometry-or-source-measurement']};
 const checks=pathRunnerFieldPlan(scene,config).map(field=>{const m=measurement.fields?.find(m=>m.id===field.id);return m&&m.text===field.text?pathRunnerTextReadiness(field.text,m.fit,field,pathRunnerExposure(scene)):{status:'waiting',issues:['complete-field-font-measurement-required']};});
 return {status:checks.some(c=>c.status==='blocked')?'blocked':checks.some(c=>c.status==='waiting')?'waiting':'ready',issues:unique(checks.flatMap(c=>c.issues))};
}
export function pathRunnerState(scene,config,elapsed,measurement,speakerProof,viewport={width:1920,height:1080},projectionProof){
 const readiness=pathRunnerReadiness(scene,config,measurement,speakerProof,viewport,projectionProof),timeValid=finite(elapsed)&&elapsed>=0&&elapsed<dynamicSceneDuration(scene),issues=[...readiness.issues,...(!timeValid?['source-elapsed-outside-original-scene']:[])],ready=readiness.status==='ready'&&timeValid,seconds=elapsed/1000,base={readiness:ready?'ready':!timeValid?'blocked':readiness.status,issues:unique(issues),canApply:false,uiAccepted:false,needsFaceReview:true,fields:[],runner:null,trail:[],trace:{progress:0,points:[]},graphicVisible:false,copyVisible:false,activeStageId:null,lap:null};
 if(!ready)return base;
 const sample=pathRunnerSample(config,seconds),graphicVisible=seconds>=config.graphicWindow.startSec&&seconds<config.graphicWindow.endSec,fields=pathRunnerFieldPlan(scene,config).map(field=>({...field,clock:visibleTextClock(elapsed,[{startMs:field.startSec*1000,endMs:field.endSec*1000}])})),trail=[],t=config.runner.trail;
 if(graphicVisible&&sample.started){const last=Math.min(seconds,sample.completedAtSec),first=Math.max(config.runStartSec,seconds-t.lifetimeSec),end=Math.floor((last-config.runStartSec)/t.sampleSec+1e-9),begin=Math.max(Math.ceil((first-config.runStartSec)/t.sampleSec-1e-9),end-t.maxPoints+1);for(let i=begin;i<=end;i++){const atSec=config.runStartSec+i*t.sampleSec,p=pathRunnerSample(config,atSec).point;trail.push({id:'trail-'+i,...p,opacity:Math.max(0,1-(seconds-atSec)/t.lifetimeSec)});}}
 const active=config.kind==='closed-loop-runner'?(config.stages??[]).find(stage=>stage.segmentId===sample.segmentId):null;
 return {...base,fields,runner:graphicVisible&&sample.started?{...sample.point,width:config.runner.width,height:config.runner.height,phase:sample.finished?'hold':'moving'}:null,trail,trace:pathRunnerTraceState(config,seconds),graphicVisible,copyVisible:fields.some(f=>f.role==='copy'&&f.clock.visible),activeStageId:graphicVisible&&sample.started?active?.id??null:null,lap:sample.lap};
}

const seconds=(key,label)=>({key,label,type:'source-seconds',min:0});
const rect=(key,label)=>({key,label,type:'stage-rect',coordinates:'normalized-output',subtitleBottom:.86});
const point=key=>({key,label:key,type:'stage-point'});
const nodeCard=[{key:'id',label:'持久对象ID',type:'stable-id',readonly:true},{key:'nodeId',label:'原节点',type:'node-ref'},rect('rect','完整文字框')];
export const pathRunnerControls=['closed-loop-runner','bounded-agent-runner'].map(kind=>({kind,label:kind==='closed-loop-runner'?'显式闭环角色接力':'围栏内Agent路径',stage:'experimental-independent',canApply:false,uiAccepted:false,automaticAllowed:false,fields:[
 {key:'clock',label:'原场相对秒钟',type:'text',readonly:true,fixed:'scene-source-relative-seconds'},
 {key:'binding',label:'原片完整身份',type:'record',readonly:true,fields:[{key:'sceneId',label:'原场ID',type:'text'},{key:'src',label:'本地原片',type:'text'},{key:'sha256',label:'原片SHA256',type:'text'},{key:'startMs',label:'原场绝对起点ms',type:'number'},{key:'endMs',label:'原场绝对终点ms',type:'number'}]},
 {key:'graphicWindow',label:'图解时窗（秒）',type:'record',fields:[seconds('startSec','开始秒'),seconds('endSec','结束秒')]},
 {key:'copyWindow',label:'完整原文阅读（秒）',type:'record',fields:[seconds('startSec','开始秒'),seconds('endSec','结束秒'),rect('rect','大字说明区')]},
 rect('speakerRect','真实说话人插槽'),seconds('runStartSec','角色出发秒'),
 {key:'runner',label:'显式角色与尾迹',type:'record',fields:[{key:'label',label:'角色完整名称',type:'text'},{key:'width',label:'角色宽',type:'number',min:.02,max:.2},{key:'height',label:'角色高',type:'number',min:.02,max:.15},{key:'trail',label:'蓝点采样预算',type:'record',fields:[seconds('sampleSec','采样间隔秒'),seconds('lifetimeSec','每点保留秒'),{key:'maxPoints',label:'点数上限',type:'number',min:1,max:240}]}]},
 {key:'path',label:'原创显式Bezier路径',type:'record',fields:[{key:'laps',label:'明确圈数',type:'number',min:1,max:12},{key:'segments',label:'相接路径段',type:'list',preserveId:true,itemFields:[{key:'id',label:'路径段ID',type:'stable-id',readonly:true},point('from'),point('control1'),point('control2'),point('to'),seconds('durationSec','本段秒数')]}]},
 ...(kind==='closed-loop-runner'?[{key:'stages',label:'持久阶段对象',type:'list',preserveId:true,itemFields:[...nodeCard,{key:'segmentId',label:'激活路径段ID',type:'path-segment-ref'}]}]:[{key:'boundary',label:'右上起顺时针黄围栏',type:'record',fields:[rect('rect','围栏范围'),seconds('startSec','描边开始秒'),seconds('drawSec','描闭用时秒')]},{key:'rules',label:'描闭后依次出现规则',type:'list',preserveId:true,itemFields:[...nodeCard,seconds('atSec','规则出现秒')]}]),
 {key:'feedback',label:'可选明确版本反馈',type:'list',preserveId:true,itemFields:[...nodeCard,seconds('atSec','反馈出现秒')]},
 {key:'annotation',label:'作者明确说明（默认空）',type:'text'},
 {key:'protectedAreas',label:'手动保护区域',type:'list',itemFields:[{key:'label',label:'保护对象',type:'text'},rect('rect','保护框')]}
 ]}));
