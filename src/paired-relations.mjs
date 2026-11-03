import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {projectStoryboard} from './storyboard.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness} from './source-token-transfer.mjs';
import {completeSourceCopyInventory} from './complete-source-copy.mjs';
const finite=value=>typeof value==='number'&&Number.isFinite(value),unique=values=>[...new Set(values)],sides=['a','b'];
const local=value=>typeof value==='string'&&value.length>0&&!/^[a-z][a-z\d+.-]*:/i.test(value)&&!value.startsWith('/')&&!/[\\\u0000-\u001f]/.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');
const safe=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const intersects=(a,b)=>a.x<b.x+b.width-1e-7&&b.x<a.x+a.width-1e-7&&a.y<b.y+b.height-1e-7&&b.y<a.y+a.height-1e-7;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,canonical(v[k])])):v;
const serial=v=>JSON.stringify(canonical(v)),node=(scene,id)=>(Array.isArray(scene.nodes)?scene.nodes:[]).find(n=>n.id===id),copy=n=>[n?.text,n?.detail,...(n?.bullets??[])].filter(t=>typeof t==='string'&&t.length).join('\n');
const ease=t=>{const p=Math.max(0,Math.min(1,t));return p*p*(3-2*p);},mix=(a,b,p)=>Object.fromEntries(['x','y','width','height'].map(k=>[k,a[k]+(b[k]-a[k])*p]));
export const pairedCompleteCopy=scene=>completeSourceCopyInventory(scene).map(item=>item.text).join('\n');
function envelope(rects){const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};}
export function pairedProtectedRects(scene,config,viewport){
 const windows=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],rects=windows.map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*viewport.width/viewport.height}));
 return [config.speakerRect,...rects,...(rects.length?[envelope(rects)]:[]),...(config.protectedAreas??[]).map(p=>p.rect)];
}
export function pairedProjectionIssues(scene,config,proof){
 if(scene.phaseStartMs===undefined&&scene.phaseEndMs===undefined&&!scene.sourceId)return [];
 const raw=proof?.rawScene,b=config?.binding,clips=proof?.clips;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||raw.id!==b?.sceneId||raw.src!==b?.src||raw.startMs!==b?.startMs||raw.endMs!==b?.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c?.id)).size!==clips.length||clips.some(c=>!c?.id||!local(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['paired-verified-raw-source-projection-required'];
 const expected=projectStoryboard([raw],clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);
 return expected&&serial(expected)===serial(scene)?[]:['paired-source-projection-mismatch'];
}
/** Both rectangles share one easing progress. Solve all four linear separation
 * inequalities over p∈[0,1], rather than sampling and missing a fast collision. */
export function pairedSweptOverlap(a0,a1,b0,b1){
 let lo=0,hi=1;const inequalities=[
  [a0.x-b0.x-b0.width,(a1.x-a0.x)-(b1.x-b0.x)-(b1.width-b0.width)],
  [b0.x-a0.x-a0.width,(b1.x-b0.x)-(a1.x-a0.x)-(a1.width-a0.width)],
  [a0.y-b0.y-b0.height,(a1.y-a0.y)-(b1.y-b0.y)-(b1.height-b0.height)],
  [b0.y-a0.y-a0.height,(b1.y-b0.y)-(a1.y-a0.y)-(a1.height-a0.height)],
 ];
 for(const [c,d] of inequalities){if(Math.abs(d)<1e-12){if(c>=-1e-7)return false;}else if(d>0)hi=Math.min(hi,(-1e-7-c)/d);else lo=Math.max(lo,(-1e-7-c)/d);if(hi-lo<=1e-10)return false;}
 return hi>0&&lo<1&&hi-lo>1e-10;
}
function link(a,b){const ac={x:a.x+a.width/2,y:a.y+a.height/2},bc={x:b.x+b.width/2,y:b.y+b.height/2},dx=bc.x-ac.x,dy=bc.y-ac.y,edge=(r,c,v)=>{const t=Math.min(Math.abs(v.x)>1e-12?r.width/2/Math.abs(v.x):Infinity,Math.abs(v.y)>1e-12?r.height/2/Math.abs(v.y):Infinity);return {x:c.x+v.x*t,y:c.y+v.y*t};};return {from:edge(a,ac,{x:dx,y:dy}),to:edge(b,bc,{x:-dx,y:-dy})};}
function stableWindows(config){const initial={atMs:config.graphicWindow.atMs,endMs:config.phases[0].atMs};return [initial,...config.phases.map(p=>({atMs:p.atMs+p.moveMs,endMs:p.atMs+p.moveMs+p.holdMs}))];}
function positions(config){return [{a:config.sides.a.rect,b:config.sides.b.rect},...config.phases.map(p=>p.positions)];}
export function pairedRelationsFieldPlan(scene,config){
 const windows=stableWindows(config),all=positions(config),fields=[{id:'paired-complete-copy',text:pairedCompleteCopy(scene),rect:config.copyWindow.rect,windows:[config.copyWindow],role:'copy'},{id:'paired-title',text:scene.title??'',rect:config.titleRect,windows:[config.graphicWindow],role:'title'}];
 for(const side of sides){const rects=all.map(p=>p[side]);fields.push({id:'paired-side-'+side,text:copy(node(scene,config.sides[side].nodeId)),rect:{...config.sides[side].rect,width:Math.min(...rects.map(r=>r.width))*.92,height:Math.min(...rects.map(r=>r.height))*.86},windows,role:'side'});}
 if(config.relation.label)fields.push({id:'paired-relation',text:copy(node(scene,config.relation.label.nodeId)),rect:config.relation.label.rect,windows:[config.graphicWindow],role:'relation'});
 return fields.filter(f=>f.text);
}
export function pairedRelationsMeasurementKey(scene,config,viewport,fontKey){return serial([scene.sourceId??scene.id,scene.src,pairedCompleteCopy(scene),scene.nodes,scene.window,config,viewport,fontKey]);}
export function pairedRelationsIssues(scene,config,viewport={width:1920,height:1080},proof){
 if(!scene||!config||config.kind!=='paired-relations')return ['paired-kind-required'];
 const issues=[],duration=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),binding=config.binding,originals=Array.isArray(scene.nodes)?scene.nodes:[],ids=originals.map(n=>n?.id);
 if(typeof scene.title!=='string'||scene.body!==undefined&&typeof scene.body!=='string'||!Array.isArray(scene.nodes)||originals.some(n=>!n||typeof n.text!=='string'||!n.text.trim()||n.detail!==undefined&&typeof n.detail!=='string'||n.bullets!==undefined&&(!Array.isArray(n.bullets)||n.bullets.some(t=>typeof t!=='string'))))issues.push('paired-original-node-and-copy-text-invalid');
 if(!['correspondence','horizontal-alternate','bidirectional'].includes(config.variant)||config.clock!=='scene-source-relative-ms')issues.push('paired-explicit-variant-and-source-clock-required');
 if(!binding||binding.sceneId!==(scene.sourceId??scene.id)||!local(binding.src)||binding.src!==scene.src||!/^[a-f0-9]{64}$/i.test(binding.sha256??'')||!finite(binding.startMs)||!finite(binding.endMs)||binding.startMs<0||binding.endMs<=binding.startMs||Math.abs(binding.endMs-binding.startMs-duration)>.01||!scene.sourceId&&(binding.startMs!==scene.startMs||binding.endMs!==scene.endMs))issues.push('paired-current-source-identity-binding-required');
 if(![duration,viewport.width,viewport.height,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||duration<=0||viewport.width<=0||viewport.height<=0||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs)issues.push('paired-source-exposure-invalid');
 issues.push(...pairedProjectionIssues(scene,config,proof));
 if(new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id)||!sides.every(s=>config.sides?.[s]&&ids.includes(config.sides[s].nodeId)&&safe(config.sides[s].rect))||config.sides?.a?.nodeId===config.sides?.b?.nodeId)issues.push('paired-two-distinct-original-node-ids-and-rectangles-required');
 const relation=config.relation;
 if(!relation||!['correspondence','contrast','bidirectional'].includes(relation.type)||typeof relation.provenance!=='string'||!relation.provenance.trim()||config.variant==='bidirectional'&&relation.type!=='bidirectional'||config.variant!=='bidirectional'&&relation.type==='bidirectional')issues.push('paired-explicit-relation-and-provenance-required');
 if(relation?.label&&(!ids.includes(relation.label.nodeId)||!safe(relation.label.rect)))issues.push('paired-relation-label-must-reference-original-node');
 for(const window of [config.copyWindow,config.graphicWindow])if(!window||![window.atMs,window.endMs].every(finite)||window.atMs<0||window.endMs>duration||window.endMs<=window.atMs)issues.push('paired-copy-and-graphic-source-windows-required');
 if(!safe(config.copyWindow?.rect)||!safe(config.titleRect)||!safe(config.speakerRect)||config.copyWindow?.endMs>config.graphicWindow?.atMs+.01)issues.push('paired-full-copy-before-graphics-in-safe-rect-required');
 if(!Array.isArray(config.phases)||!config.phases.length||config.phases.length>8||new Set(config.phases.map(p=>p?.id)).size!==config.phases.length)issues.push('paired-unique-explicit-phases-required');
 const times=(scene.window?.keyframes??[]).map(p=>p.atMs);if(times.some(t=>!finite(t)||t<0||t>duration)||new Set(times).size!==times.length)issues.push('paired-person-source-keyframes-invalid');
 if(config.protectedAreas!==undefined&&(!Array.isArray(config.protectedAreas)||config.protectedAreas.some(p=>!safe(p?.rect))))issues.push('paired-protected-areas-invalid');
 if(scene.media?.src||originals.some(n=>n?.assetSrc))issues.push('paired-text-composition-does-not-display-existing-media');
 if(issues.length)return unique(issues);
 let previous={a:config.sides.a.rect,b:config.sides.b.rect},previousEnd=config.graphicWindow.atMs,previousActive;
 for(const [index,p] of config.phases.entries()){
  if(!p?.id||![p.atMs,p.moveMs,p.holdMs].every(finite)||p.atMs<previousEnd||p.moveMs<200||p.holdMs<900||p.atMs+p.moveMs+p.holdMs>config.graphicWindow.endMs||!['a','b','both'].includes(p.active)||!sides.every(s=>safe(p.positions?.[s])))return unique([...issues,'paired-phases-require-ordered-move-hold-and-both-rectangles']);
  if(index===0&&p.atMs-config.graphicWindow.atMs<900)issues.push('paired-initial-pair-overview-required');
  if(config.variant==='horizontal-alternate'){
   if(p.active==='both'||previousActive===p.active||sides.some(s=>['y','width','height'].some(k=>Math.abs(p.positions[s][k]-previous[s][k])>1e-7)))issues.push('paired-horizontal-alternate-keeps-identity-size-lane-and-alternates-focus');
   if(!sides.some(s=>Math.abs(p.positions[s].x-previous[s].x)>1e-7))issues.push('paired-horizontal-alternate-needs-visible-horizontal-change');
  }
  if(p.flow!==undefined&&(config.variant!=='bidirectional'||!['a-to-b','b-to-a','both'].includes(p.flow)))issues.push('paired-flow-only-for-explicit-bidirectional-relation');
  if(config.variant==='bidirectional'&&!p.flow)issues.push('paired-bidirectional-phase-direction-required');
  if(pairedSweptOverlap(previous.a,p.positions.a,previous.b,p.positions.b))issues.push('paired-objects-overlap-during-motion');
  previous=p.positions;previousEnd=p.atMs+p.moveMs+p.holdMs;previousActive=p.active;
 }
 const protectedRects=pairedProtectedRects(scene,config,viewport),all=positions(config),fields=pairedRelationsFieldPlan(scene,config),label=relation.label?.rect;
 if(protectedRects.some(r=>!safe(r)))issues.push('paired-person-path-outside-safe-stage');
 const sideEnvelopes=sides.map(s=>envelope(all.map(p=>p[s]))),bridgeEnvelope=envelope(sideEnvelopes);
 if(protectedRects.some(p=>intersects(bridgeEnvelope,p))||intersects(bridgeEnvelope,config.titleRect))issues.push('paired-moving-connector-envelope-crosses-protected-region');
 if([config.copyWindow.rect,config.titleRect,...sideEnvelopes,...(label?[label]:[])].some(r=>!safe(r)||protectedRects.some(p=>intersects(r,p))))issues.push('paired-copy-graphics-cross-person-envelope-or-subtitles');
 if(sideEnvelopes.some(r=>intersects(r,config.titleRect))||label&&[config.titleRect,...sideEnvelopes].some(r=>intersects(r,label)))issues.push('paired-native-text-regions-overlap');
 for(const group of all){
  if(intersects(group.a,group.b))issues.push('paired-static-objects-overlap');
  const l=link(group.a,group.b),pad=Math.max(4/viewport.width,4/viewport.height),corridor={x:Math.min(l.from.x,l.to.x)-pad,y:Math.min(l.from.y,l.to.y)-pad,width:Math.abs(l.to.x-l.from.x)+pad*2,height:Math.abs(l.to.y-l.from.y)+pad*2};
  if(!safe(corridor)||protectedRects.some(p=>intersects(corridor,p))||intersects(corridor,config.titleRect))issues.push('paired-relation-line-crosses-protected-region');
 }
 if(!pairedCompleteCopy(scene)||!fields.some(f=>f.id==='paired-complete-copy'))issues.push('paired-complete-source-copy-required');
 return unique(issues);
}
export function pairedRelationsReadiness(scene,config,measurement,viewport={width:1920,height:1080},proof){
 const issues=pairedRelationsIssues(scene,config,viewport,proof);if(issues.length)return {status:'blocked',issues};
 if(!measurement)return {status:'waiting',issues:['paired-waiting-for-loaded-font-measurements']};
 if(!measurement.fontKey||measurement.key!==pairedRelationsMeasurementKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['paired-text-font-or-layout-measurement-stale']};
 const waiting=[],exposure=sourceTokenExposure(scene),fields=pairedRelationsFieldPlan(scene,config);
 for(const field of fields){
  const m=measurement.fields.find(m=>m.id===field.id);
  if(!m||m.text!==field.text||!m.fit){waiting.push('paired-missing-current-native-text:'+field.id);continue;}
  if(!m.fit.pages?.length||m.fit.pages.flat().join('')!==field.text.replace(/[\r\n]/g,'')){issues.push('paired-measured-text-loss:'+field.id);continue;}
  for(const window of field.windows){const readiness=sourceTokenTextReadiness(field.text,m.fit,window,exposure);(readiness.status==='waiting'?waiting:issues).push(...readiness.issues.map(issue=>field.id+':'+issue));}
 }
 if(config.phases.some(p=>p.atMs<exposure.startMs-.01||p.atMs+p.moveMs+p.holdMs>exposure.endMs+.01))issues.push('paired-whole-move-and-hold-must-be-retained-in-this-instance');
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
export function pairedRelationsPage(fit,elapsed,window){const index=Math.min(fit.pages.length-1,Math.max(0,Math.floor((elapsed-window.atMs)/Math.max(1,window.endMs-window.atMs)*fit.pages.length)));return {index,lines:fit.pages[index]??[]};}
export function pairedRelationsState(scene,config,elapsed){
 const cw=config.copyWindow,gw=config.graphicWindow,initial={a:config.sides.a.rect,b:config.sides.b.rect},windows=stableWindows(config);let current=initial,phase='overview',phaseId=null,progress=0,active='both',flow,clock=windows[0];
 for(const [index,p] of config.phases.entries()){
  if(elapsed<p.atMs)break;phaseId=p.id;active=p.active;progress=ease((elapsed-p.atMs)/p.moveMs);
  if(elapsed<p.atMs+p.moveMs){current={a:mix(current.a,p.positions.a,progress),b:mix(current.b,p.positions.b,progress)};phase='moving';flow=p.flow;break;}
  current=p.positions;phase='holding';clock=windows[index+1];flow=p.flow;
 }
 const graphicVisible=elapsed>=gw.atMs&&elapsed<gw.endMs,copyVisible=elapsed>=cw.atMs&&elapsed<cw.endMs,connector={...link(current.a,current.b),bidirectional:config.relation.type==='bidirectional'},pulses=[];
 if(graphicVisible&&phase==='moving'&&flow){const point=(p)=>({x:connector.from.x+(connector.to.x-connector.from.x)*p,y:connector.from.y+(connector.to.y-connector.from.y)*p});if(flow==='a-to-b'||flow==='both')pulses.push({id:'a',...point(progress),direction:'a-to-b'});if(flow==='b-to-a'||flow==='both')pulses.push({id:'b',...point(1-progress),direction:'b-to-a'});}
 return {phase:elapsed<cw.atMs?'before':copyVisible?'copy':elapsed>=gw.endMs?'after':elapsed<gw.atMs?'before':phase,phaseId,progress,copyVisible,graphicVisible,objects:sides.map(side=>({side,nodeId:config.sides[side].nodeId,text:copy(node(scene,config.sides[side].nodeId)),rect:current[side],active:active==='both'||active===side,window:clock})),connector,pulses,automaticAllowed:false,needsFaceReview:true};
}
const f=(key,label,type,extra={})=>({key,label,type,...extra}),rectField=(key,label)=>f(key,label,'stage-rect'),windowFields=[f('atMs','起点','source-ms'),f('endMs','终点','source-ms')];
export const pairedRelationsControls=['correspondence','horizontal-alternate','bidirectional'].map(variant=>({kind:'paired-relations',variant,label:({correspondence:'成对对象对应', 'horizontal-alternate':'成对横移与焦点交替',bidirectional:'明确双向关系'})[variant],stage:'experimental-independent',automaticAllowed:false,uiAccepted:false,fields:[f('binding','当前原场身份','source-binding',{readonly:true}),f('sides','稳定双方','record',{fields:sides.map(side=>f(side,'对象'+side,'record',{fields:[f('nodeId','完整原节点','node-ref'),rectField('rect','起始框')]}))}),f('relation','明确关系','record',{fields:[f('type','关系','select',{options:variant==='bidirectional'?['bidirectional']:['correspondence','contrast']}),f('provenance','关系来源','text'),f('label','原节点关系文字','record',{fields:[f('nodeId','原文节点','node-ref'),rectField('rect','完整关系字框')]})]}),f('copyWindow','完整源正文先行','record',{fields:[...windowFields,rectField('rect','完整正文框')]}),f('graphicWindow','配对图解窗口','record',{fields:windowFields}),rectField('titleRect','完整标题'),rectField('speakerRect','真实人物框'),f('protectedAreas','附加人物/字幕保护','list',{itemFields:[f('label','保护区说明','text'),rectField('rect','完整保护框')]}),f('phases','显式阶段','list',{itemFields:[f('id','稳定阶段ID','text'),f('atMs','开始','source-ms'),f('moveMs','移动时长','source-ms'),f('holdMs','完整停留','source-ms'),f('positions','双方终框','record',{fields:sides.map(side=>rectField(side,'对象'+side))}),f('active','当前焦点','select',{options:['a','b','both']}),...(variant==='bidirectional'?[f('flow','明确方向','select',{options:['a-to-b','b-to-a','both']})]:[])]})]}));
