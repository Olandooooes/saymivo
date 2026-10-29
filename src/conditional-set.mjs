// Independent authored set / gate timeline. Not imported by the workbench yet.
// Curves are supplied choreography, never inferred physics or service results.
import {projectStoryboard} from './storyboard.mjs';
import {persistentMotionCaptionBands} from './persistent-motion.mjs';

const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = s => typeof s === 'string' && s.trim().length > 0;
const unique = xs => new Set(xs).size === xs.length;
const sha = s => typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
const local = s => text(s) && !/^(?:https?:|file:|\/)|(?:^|\/)\.\.(?:\/|$)/.test(s);
const full = n => [n?.text, n?.detail, ...(n?.bullets ?? [])].filter(s => typeof s === 'string' && s.length).join('\n');
const copy = x => structuredClone(x);
const stable = x => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
const same = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const clamp = p => Math.max(0, Math.min(1,p));
const must = (ok, issue) => {if (!ok) throw Error(issue);};
const rect = r => r && ['x','y','width','height'].every(k => finite(r[k])) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x+r.width <= 1.000001 && r.y+r.height <= .86;
const point = p => p && finite(p.x) && finite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= .86;
const overlap = (a,b) => a.x < b.x+b.width-1e-8 && a.x+a.width > b.x+1e-8 && a.y < b.y+b.height-1e-8 && a.y+a.height > b.y+1e-8;
const samePoint = (a,b) => a && b && Math.abs(a.x-b.x) < 1e-7 && Math.abs(a.y-b.y) < 1e-7;
const atPoint = (p,size) => ({x:p.x-size.width/2,y:p.y-size.height/2,...size});
const hull = rs => {const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return{x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};};
const containsPoint = (shape,p) => {
 const r=shape.rect;
 return shape.kind==='rect' ? p.x>=r.x-1e-7 && p.x<=r.x+r.width+1e-7 && p.y>=r.y-1e-7 && p.y<=r.y+r.height+1e-7
 : ((p.x-r.x-r.width/2)/(r.width/2))**2+((p.y-r.y-r.height/2)/(r.height/2))**2 <= 1+1e-7;
};
const corners = r => [{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}];
const containsRect = (shape,r) => corners(r).every(p=>containsPoint(shape,p));
const provenance = p => p?.kind==='illustration' && text(p.note);
const setAncestors = (sets,id) => {const out=[];while(id){must(!out.includes(id),'set-parent-cycle');const s=sets.get(id);must(s,'unknown-set-membership');out.push(id);id=s.parentId;}return out;};
const visibleOverlap = (a,b) => a.atMs < b.endMs && b.atMs < a.endMs;

export function conditionalSetSourceCopy(context,config) {
 const s=context?.rawScene;
 return [s?.title,s?.body,s?.label,s?.sourceNote,...(s?.tags??[]).map(t=>t.text),...(s?.links??[]).map(l=>l.label),...(s?.nodes??[]).map(full),config?.annotation].filter(s=>typeof s==='string'&&s.length).join('\n');
}
/** Stale-input identity only: not a font, decoder, DOM or UI receipt. */
export function conditionalSetKey(config,context,fontKey='') {return JSON.stringify(stable([config,context,fontKey]));}
export function conditionalSetBezier(path,p) {
 const t=clamp(p),q=1-t;
 return {x:q**3*path.from.x+3*q*q*t*path.control1.x+3*q*t*t*path.control2.x+t**3*path.to.x,y:q**3*path.from.y+3*q*q*t*path.control1.y+3*q*t*t*path.control2.y+t**3*path.to.y};
}
export function conditionalSetPathEnvelope(path,size) {return hull([path.from,path.control1,path.control2,path.to].map(p=>atPoint(p,size)));}
/** Full boundary stroke is reserved; its interior is available for labels. */
export function conditionalSetBoundaryBands(shape,stroke=.003) {
 const r=shape.rect,ps=shape.kind==='rect'?[...corners(r),corners(r)[0]]:Array.from({length:65},(_,i)=>({x:r.x+r.width/2+Math.cos(i/64*Math.PI*2)*r.width/2,y:r.y+r.height/2+Math.sin(i/64*Math.PI*2)*r.height/2}));
 return ps.slice(1).map((p,i)=>({x:Math.min(p.x,ps[i].x)-stroke,y:Math.min(p.y,ps[i].y)-stroke,width:Math.abs(p.x-ps[i].x)+stroke*2,height:Math.abs(p.y-ps[i].y)+stroke*2}));
}

function prepare(config,context) {
 const raw=context?.rawScene,source=context?.sourceIdentity,b=config?.binding;
 must(config?.version===1 && config.kind==='conditional-set' && config.clock==='scene-source-relative-ms','explicit-conditional-set-source-clock-required');
 must(raw && !raw.sourceId && raw.phaseStartMs===undefined && raw.phaseEndMs===undefined && text(raw.id) && local(raw.src) && [raw.startMs,raw.endMs].every(finite) && raw.startMs>=0 && raw.endMs>raw.startMs,'raw-absolute-scene-required');
 must(b?.sceneId===raw.id && b.src===raw.src && b.startMs===raw.startMs && b.endMs===raw.endMs && sha(b.sha256),'absolute-source-binding-stale');
 must(source?.kind==='video' && source.src===b.src && source.sha256===b.sha256 && [source.width,source.height,source.durationSec].every(n=>finite(n)&&n>0) && source.durationSec*1000>=b.endMs,'verified-current-source-identity-required');
 must(provenance(config.provenance),'explicit-authored-illustration-required-no-runtime-claim');
 must(Array.isArray(raw.nodes) && unique(raw.nodes.map(n=>n?.id)) && raw.nodes.every(n=>text(n?.id)&&text(n.text)&&(n.detail===undefined||typeof n.detail==='string')&&(n.bullets===undefined||Array.isArray(n.bullets)&&n.bullets.every(x=>typeof x==='string'))),'unique-complete-source-nodes-required');
 const nodes=new Map(raw.nodes.map(n=>[n.id,n])),duration=b.endMs-b.startMs;
 const ref=r=>{const n=nodes.get(r?.nodeId);must(n&&r.expectedText===full(n),'complete-source-node-or-condition-mismatch');return full(n);};
 must(Array.isArray(config.sets) && config.sets.length>0 && config.sets.length<=12 && Array.isArray(config.gates) && config.gates.length>0 && config.gates.length<=12 && Array.isArray(config.actors) && config.actors.length>0 && config.actors.length<=12 && Array.isArray(config.events) && config.events.length>0 && config.events.length<=100,'bounded-explicit-sets-gates-actors-events-required');
 const objects=[...config.sets,...config.gates,...config.actors];
 must(objects.every(o=>text(o?.id)) && unique(objects.map(o=>o.id)),'stable-unique-object-identities-required');
 const sets=new Map(config.sets.map(s=>[s.id,s])),gates=new Map(config.gates.map(g=>[g.id,g])),actors=new Map(config.actors.map(a=>[a.id,a]));
 const graph=config.graphicWindow,cw=config.copyWindow;
 const window=w=>w && [w.atMs,w.endMs].every(finite) && w.atMs>=0 && w.endMs>w.atMs && w.endMs<=duration;
 must(window(graph)&&window(cw)&&rect(cw.rect)&&cw.endMs<=graph.atMs,'complete-copy-before-explicit-graphic-window-required');
 for(const s of sets.values()) {
  ref(s.sourceRef);must(['ellipse','rect'].includes(s.boundary?.kind)&&rect(s.boundary.rect)&&rect(s.labelRect),'explicit-set-boundary-and-complete-label-rect-required');
  must(finite(s.atMs)&&finite(s.drawMs)&&s.atMs>=graph.atMs&&s.drawMs>=0&&s.atMs+s.drawMs<graph.endMs,'set-formation-clock-invalid');
  const chain=setAncestors(sets,s.id);
  if(s.parentId){const p=sets.get(s.parentId);must(s.atMs>=p.atMs+p.drawMs&&containsRect(p.boundary,s.boundary.rect),'nested-set-must-fit-and-follow-parent');}
  must(chain.length<=12,'set-parent-cycle');
 }
 const setList=[...sets.values()];
 for(let i=0;i<setList.length;i++)for(let j=i+1;j<setList.length;j++){
  const a=setList[i],b=setList[j],related=setAncestors(sets,a.id).includes(b.id)||setAncestors(sets,b.id).includes(a.id);
  must(related||!overlap(a.boundary.rect,b.boundary.rect),'parallel-sets-must-be-explicitly-separate');
 }
 for(const g of gates.values()) {
  ref(g.sourceRef);must(sets.has(g.fromSetId)&&sets.has(g.toSetId)&&g.fromSetId!==g.toSetId,'gate-needs-distinct-explicit-source-and-target-sets');
  must(['x','y'].includes(g.boundary?.axis)&&[g.boundary.position,g.boundary.min,g.boundary.max].every(finite)&&g.boundary.position>0&&g.boundary.position<(g.boundary.axis==='x'?1:.86)&&g.boundary.min>=0&&g.boundary.max<=(g.boundary.axis==='x'?.86:1)&&g.boundary.max>g.boundary.min&&rect(g.labelRect),'gate-boundary-span-and-label-required');
  must(finite(g.atMs)&&g.atMs>=Math.max(graph.atMs,sets.get(g.fromSetId).atMs+sets.get(g.fromSetId).drawMs,sets.get(g.toSetId).atMs+sets.get(g.toSetId).drawMs)&&g.atMs<graph.endMs,'gate-must-follow-set-formation');
  const c=g.condition;must(c&&['authored','membership','capacity'].includes(c.kind),'explicit-gate-condition-required');
  if(c.kind==='authored')must(['blocked','allowed'].includes(c.result),'explicit-authored-outcome-required');
  if(c.kind==='membership')must(sets.has(c.setId)&&['inside','outside'].includes(c.mode),'explicit-membership-condition-required');
  if(c.kind==='capacity')must(text(c.factKey)&&['lt','lte'].includes(c.operator)&&finite(c.limit)&&c.limit>=0&&text(c.unit),'explicit-capacity-value-unit-and-operator-required');
 }
 for(const a of actors.values()) {
  ref(a.sourceRef);must(sets.has(a.initialSetId)&&point(a.initialPoint)&&a.size&&[a.size.width,a.size.height].every(n=>finite(n)&&n>0)&&rect(atPoint(a.initialPoint,a.size))&&containsRect(sets.get(a.initialSetId).boundary,atPoint(a.initialPoint,a.size)),'actor-needs-explicit-contained-membership-pose-and-size');
  must(finite(a.atMs)&&a.atMs>=Math.max(graph.atMs,sets.get(a.initialSetId).atMs+sets.get(a.initialSetId).drawMs)&&a.atMs<graph.endMs&&rect(a.labelRect),'actor-entry-and-complete-label-required');
  must(Array.isArray(a.facts??[])&&unique((a.facts??[]).map(f=>f?.key)),'unique-explicit-actor-facts-required');
  for(const f of a.facts??[]){ref(f.sourceRef);must(text(f.key)&&finite(f.value)&&f.value>=0&&text(f.unit),'capacity-fact-needs-supplied-value-unit-source');}
  if(a.assetIdentity){const asset=a.assetIdentity,n=nodes.get(a.sourceRef.nodeId),actual=(context.assets??[]).find(x=>x.src===asset.src);must(asset.kind==='image'&&local(asset.src)&&sha(asset.sha256)&&[asset.width,asset.height].every(n=>finite(n)&&n>0)&&n.assetSrc===asset.src&&same(asset,actual),'current-source-image-identity-required');}
 }
 must(unique(config.events.map(e=>e?.id))&&config.events.every(e=>text(e?.id)),'stable-unique-event-identities-required');
 let previous=-1;
 for(const e of config.events){must(finite(e.atMs)&&e.atMs>=previous&&e.atMs>=graph.atMs&&e.atMs<graph.endMs,'events-must-be-source-ordered');previous=e.atMs;must(actors.has(e.actorId)&&gates.has(e.gateId)&&['travel','evaluate'].includes(e.type),'event-needs-known-actor-gate-and-type');}
 const clips=context.clips;
 must(Array.isArray(clips)&&clips.length>0&&unique(clips.map(c=>c?.id))&&clips.every(c=>text(c?.id)&&local(c.src)&&[c.inSec,c.outSec,c.speed??1].every(finite)&&c.inSec>=0&&c.outSec>c.inSec&&(c.speed??1)>0)&&finite(context.fps)&&context.fps>0&&Array.isArray(context.captions),'current-clips-fps-and-explicit-caption-inventory-required');
 must(context.captions.every(c=>c&&[c.startMs,c.endMs,c.topPct].every(finite)&&c.startMs>=0&&c.endMs>c.startMs&&c.topPct>=5&&c.topPct<=92&&(c.holdMs===undefined||finite(c.holdMs)&&c.holdMs>=0)&&(c.holdMaxMs===undefined||finite(c.holdMaxMs)&&c.holdMaxMs>=0)&&(c.scale===undefined||finite(c.scale)&&c.scale>0)&&(!c.clipId||clips.some(p=>p.id===c.clipId))),'caption-clock-position-or-owner-invalid');
 const projections=projectStoryboard([raw],clips,context.fps);
 must(projections.length>0,'no-retained-scene-projection');
 if(context.projection){const actual=projections.find(p=>p.id===context.projection.id&&p.clipId===context.projection.clipId);must(actual&&same(actual,context.projection),'projected-clock-content-or-instance-mismatch');}
 const viewport=context.viewport;
 must(viewport&&[viewport.width,viewport.height].every(n=>finite(n)&&n>0),'actual-output-viewport-required');
 must(context.speaker?.known===true&&rect(context.speaker.rect),'known-person-reservation-required');
 const keys=raw.window?.keyframes??[],windows=raw.window?[raw.window,...keys]:[];
 must(unique(keys.map(k=>k.atMs))&&keys.every(k=>finite(k.atMs)&&k.atMs>=0&&k.atMs<=duration),'speaker-keyframe-clock-invalid');
 const rs=windows.map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*viewport.width/viewport.height}));
 must(rs.every(rect),'complete-known-person-path-required');
 const protectedRects=[context.speaker.rect,...rs,...(rs.length?[hull(rs)]:[]),...(config.protectedAreas??[]).map(a=>a.rect)];
 must(protectedRects.every(rect),'person-or-extra-protected-area-invalid');
 protectedRects.push(...projections.flatMap(p=>persistentMotionCaptionBands(p,{clips,fps:context.fps,captions:context.captions})));
 return {raw,duration,sets,gates,actors,ref,projections,protectedRects};
}

function conditionResult(gate,actor,memberSetId,sets) {
 const c=gate.condition;
 if(c.kind==='authored')return c.result;
 if(c.kind==='membership'){const inside=setAncestors(sets,memberSetId).includes(c.setId);return (c.mode==='inside'?inside:!inside)?'allowed':'blocked';}
 const f=(actor.facts??[]).find(f=>f.key===c.factKey);
 must(f&&f.unit===c.unit,'same-explicit-capacity-unit-required-no-invented-conversion');
 return (c.operator==='lt'?f.value<c.limit:f.value<=c.limit)?'allowed':'blocked';
}
const gateAxisValue = (g,p) => p[g.boundary.axis]-g.boundary.position;
function travelCheck(e,a,g,state,prepared) {
 const p=e.path,size=a.size;
 must(['approach','retreat','pass','reroute'].includes(e.phase)&&[e.endMs].every(finite)&&e.endMs>e.atMs&&e.endMs<=prepared.raw.endMs-prepared.raw.startMs,'explicit-authored-travel-phase-and-end-required');
 must(p&&[p.from,p.control1,p.control2,p.to].every(point)&&samePoint(state.point,p.from),'continuous-authored-cubic-path-required');
 const envelope=conditionalSetPathEnvelope(p,size);must(rect(envelope),'whole-motion-envelope-outside-safe-area');
 const start=gateAxisValue(g,p.from),end=gateAxisValue(g,p.to),half=g.boundary.axis==='x'?size.width/2:size.height/2;
 const crossAxis=g.boundary.axis==='x'?'y':'x',crossHalf=g.boundary.axis==='x'?size.height/2:size.width/2;
 const onSpan=p=>p[crossAxis]-crossHalf>=g.boundary.min-1e-7&&p[crossAxis]+crossHalf<=g.boundary.max+1e-7;
 if(e.phase==='pass') {
  must(state.outcomes[g.id]?.result==='allowed'&&state.outcomes[g.id].atMs<=e.atMs&&state.outcomes[g.id].approachEventId===state.lastApproachId&&conditionResult(g,a,state.memberSetId,prepared.sets)==='allowed','pass-needs-prior-current-gate-approval');
  must(setAncestors(prepared.sets,state.memberSetId).includes(g.fromSetId)&&start*end<0,'pass-must-cross-its-own-gate-from-current-membership');
  // Monotone across the gate axis gives exactly one crossing, not a hidden loop.
  const coords=[p.from,p.control1,p.control2,p.to].map(q=>q[g.boundary.axis]);
  const direction=Math.sign(end-start);
  must(coords.slice(1).every((v,i)=>(v-coords[i])*direction>=-1e-8),'pass-axis-must-be-monotone');
  let lo=0,hi=1;for(let i=0;i<52;i++){const mid=(lo+hi)/2;if(gateAxisValue(g,conditionalSetBezier(p,mid))*Math.sign(start)>0)lo=mid;else hi=mid;}
  must([p.from,p.control1,p.control2,p.to].every(onSpan)&&onSpan(conditionalSetBezier(p,(lo+hi)/2)),'complete-actor-must-fit-gate-opening');
  must(containsRect(prepared.sets.get(g.toSetId).boundary,atPoint(p.to,size)),'pass-end-must-fit-target-set');
 } else {
  if(e.phase==='retreat')must(state.outcomes[g.id]?.result==='blocked'&&state.outcomes[g.id].approachEventId===state.lastApproachId,'retreat-needs-this-gates-explicit-blocked-event');
  if(e.phase==='reroute')must(text(e.blockedGateId)&&e.blockedGateId!==g.id&&state.outcomes[e.blockedGateId]?.result==='blocked','reroute-needs-distinct-persistent-blocked-gate');
  // All cubic controls stay on the same side, including actor half-width.
  const direction=Math.sign(Math.abs(start)>1e-7?start:end);
  must(direction!==0&&[p.from,p.control1,p.control2,p.to].every(q=>gateAxisValue(g,q)*direction>=half-1e-7),'blocked-or-approaching-actor-cannot-cross-boundary');
  if(e.phase==='approach'||e.phase==='reroute')must(setAncestors(prepared.sets,state.memberSetId).includes(g.fromSetId)&&Math.abs(end)>=half-1e-7&&Math.abs(end)<=half+.04&&onSpan(p.to),'approach-must-stop-before-the-declared-gate');
  if(e.phase==='retreat')must(containsRect(prepared.sets.get(state.memberSetId).boundary,atPoint(p.to,size)),'retreat-must-return-to-current-set');
 }
 return envelope;
}

function compile(config,context) {
 const p=prepare(config,context),states=new Map(),trips=[],evaluations=[];
 for(const a of p.actors.values())states.set(a.id,{point:a.initialPoint,memberSetId:a.initialSetId,busyUntil:a.atMs,outcomes:{},lastGateId:null,lastApproachId:null});
 const finish=s=>{if(s.pending){s.point=s.pending.path.to;if(s.pending.phase==='pass')s.memberSetId=p.gates.get(s.pending.gateId).toSetId;s.pending=null;}};
 for(const e of config.events) {
  const a=p.actors.get(e.actorId),g=p.gates.get(e.gateId),s=states.get(a.id);
  must(e.atMs>=Math.max(a.atMs,g.atMs,s.busyUntil),'actor-event-before-entry-or-during-travel');finish(s);
  if(e.type==='travel') {
   const envelope=travelCheck(e,a,g,s,p);must(e.endMs<=config.graphicWindow.endMs,'travel-outside-graphic-window');
   trips.push({...e,envelope,memberSetId:s.memberSetId});s.busyUntil=e.endMs;s.pending=e;
   if(e.phase==='approach'||e.phase==='reroute'){s.lastGateId=e.gateId;s.lastApproachId=e.id;}
  } else {
   must(s.lastGateId===g.id,'evaluate-needs-completed-approach-to-same-gate');
   const half=g.boundary.axis==='x'?a.size.width/2:a.size.height/2;
   must(Math.abs(gateAxisValue(g,s.point))>=half-1e-7&&Math.abs(gateAxisValue(g,s.point))<=half+.04,'evaluation-must-happen-at-held-boundary');
   const result=conditionResult(g,a,s.memberSetId,p.sets);
   must(e.expectedResult===result,'explicit-outcome-conflicts-with-current-condition');
   const evaluated={...e,result,approachEventId:s.lastApproachId,condition:copy(g.condition),sourceRef:copy(g.sourceRef),provenance:copy(config.provenance)};
   s.outcomes[g.id]=evaluated;evaluations.push(evaluated);
  }
 }
 for(const s of states.values())finish(s);
 const fields=conditionalSetFieldPlan(config,context);
 for(const f of fields)must(rect(f.rect)&&f.atMs>=0&&f.endMs>f.atMs&&f.endMs<=p.duration,'complete-field-window-and-rect-required');
 for(const f of fields)must(!p.protectedRects.some(r=>overlap(f.rect,r)),'complete-text-overlaps-person-or-caption:'+f.id);
 for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++)if(visibleOverlap(fields[i],fields[j]))must(!overlap(fields[i].rect,fields[j].rect),'simultaneous-complete-text-overlap');
 const nativeFields=fields.filter(f=>f.role!=='copy');
 for(const trip of trips){
  must(!p.protectedRects.some(r=>overlap(trip.envelope,r)),'motion-crosses-person-or-caption');
  must(!nativeFields.some(f=>visibleOverlap(f,trip)&&overlap(f.rect,trip.envelope)),'motion-covers-complete-label');
 }
 // Conservative cross-actor reservation: no temporal space reuse in this slice.
 const actorHulls=[...p.actors.values()].map(a=>({id:a.id,rect:hull([atPoint(a.initialPoint,a.size),...trips.filter(t=>t.actorId===a.id).map(t=>t.envelope)])}));
 for(const a of actorHulls){must(!p.protectedRects.some(r=>overlap(a.rect,r)),'actor-reservation-crosses-person-or-caption');must(!nativeFields.some(f=>overlap(f.rect,a.rect)),'actor-reservation-covers-complete-label');}
 for(let i=0;i<actorHulls.length;i++)for(let j=i+1;j<actorHulls.length;j++)must(!overlap(actorHulls[i].rect,actorHulls[j].rect),'actors-require-disjoint-full-history-envelopes');
 for(const s of p.sets.values())for(const band of conditionalSetBoundaryBands(s.boundary)){
  must(rect(band)&&!p.protectedRects.some(r=>overlap(band,r)),'boundary-stroke-crosses-person-or-caption');
  must(!nativeFields.some(f=>overlap(band,f.rect)),'boundary-stroke-crosses-complete-label');
 }
 for(const g of p.gates.values()){
  const r=g.boundary.axis==='x'?{x:g.boundary.position-.003,y:g.boundary.min,width:.006,height:g.boundary.max-g.boundary.min}:{x:g.boundary.min,y:g.boundary.position-.003,width:g.boundary.max-g.boundary.min,height:.006};
  must(!p.protectedRects.some(x=>overlap(r,x))&&!nativeFields.some(f=>overlap(r,f.rect)),'gate-stroke-crosses-person-caption-or-label');
 }
 // Unused real media cannot silently disappear under this mechanism.
 const used=[...p.actors.values()].map(a=>a.assetIdentity?.src).filter(Boolean),declared=[p.raw.media?.src,...p.raw.nodes.map(n=>n.assetSrc)].filter(Boolean);
 must(declared.every(src=>used.includes(src)),'all-real-source-media-must-remain-bound');
 return {...p,trips,evaluations,fields,actorHulls};
}

export function conditionalSetFieldPlan(config,context) {
 const end=config?.graphicWindow?.endMs,fields=[{id:'source-copy',role:'copy',text:conditionalSetSourceCopy(context,config),rect:config?.copyWindow?.rect,atMs:config?.copyWindow?.atMs,endMs:config?.copyWindow?.endMs}];
 for(const [kind,list] of [['set',config?.sets??[]],['gate',config?.gates??[]],['actor',config?.actors??[]]])for(const o of list)fields.push({id:kind+':'+o.id,role:kind,text:o.sourceRef?.expectedText??'',rect:o.labelRect,atMs:o.atMs,endMs:end});
 return fields;
}
export function conditionalSetIssues(config,context) {try{compile(config,context);return [];}catch(error){return [error instanceof Error?error.message:'conditional-set-configuration-invalid'];}}
export function conditionalSetExposure(context) {
 return projectStoryboard([context.rawScene],context.clips,context.fps).map(s=>({projectionId:s.id,clipId:s.clipId,startMs:(s.startMs-s.phaseStartMs)*(s.speed??1),endMs:(s.endMs-s.phaseStartMs)*(s.speed??1),speed:s.speed??1}));
}
/** Supplied real-font pages must all have sufficient actual retained exposure.
 * Repeated same-source clips never add together to fake more reading time. */
export function conditionalSetTextReadiness(field,fit,exposures) {
 if(!fit)return {status:'waiting',issues:['current-loaded-font-measurement-required']};
 const pages=fit.pages,issues=[];
 if(!field||typeof field.text!=='string'||![field.atMs,field.endMs].every(finite)||field.endMs<=field.atMs||!Array.isArray(exposures)||!exposures.length||exposures.some(e=>![e.startMs,e.endMs,e.speed].every(finite)||e.endMs<=e.startMs||e.speed<=0))return {status:'blocked',issues:['explicit-valid-retained-reading-clock-required']};
 if(fit.unplaceable||![fit.fontSize,fit.rowHeight].every(n=>finite(n)&&n>0)||!Array.isArray(pages)||!pages.length||pages.some(p=>!Array.isArray(p)||!p.length||p.some(s=>typeof s!=='string'))||pages.flat().join('')!==field.text.replaceAll('\n',''))return {status:'blocked',issues:['complete-field-does-not-fit-or-match']};
 for(let i=0;i<pages.length;i++){
  const at=field.atMs+i*(field.endMs-field.atMs)/pages.length,end=field.atMs+(i+1)*(field.endMs-field.atMs)/pages.length;
  const points=[at,end,...exposures.flatMap(e=>[e.startMs,e.endMs]).filter(t=>t>at&&t<end)].sort((a,b)=>a-b);let shown=0,covered=0;
  for(let j=0;j<points.length-1;j++){const a=points[j],b=points[j+1],mid=(a+b)/2,speeds=exposures.filter(e=>mid>=e.startMs&&mid<e.endMs).map(e=>e.speed);if(speeds.length){covered+=b-a;shown+=(b-a)/Math.max(...speeds);}}
  const count=[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(pages[i].join(''))].length;
  if(covered<end-at-.02||shown<Math.max(1200,count/14*1000))issues.push('every-complete-page-needs-retained-speed-adjusted-exposure');
 }
 return {status:issues.length?'blocked':'ready',issues:[...new Set(issues)]};
}
export function conditionalSetReadiness(config,context,measurement) {
 const issues=conditionalSetIssues(config,context);if(issues.length)return {status:'blocked',issues,canApply:false,nativeReadiness:'unverified'};
 if(!measurement?.fontKey||!Array.isArray(measurement.fields)||measurement.key!==conditionalSetKey(config,context,measurement.fontKey))return {status:'waiting',issues:['current-font-source-and-geometry-measurements-required'],canApply:false,nativeReadiness:'unverified'};
 const checks=conditionalSetFieldPlan(config,context).map(f=>{const m=measurement.fields?.find(m=>m.id===f.id);return m?.text===f.text?conditionalSetTextReadiness(f,m.fit,conditionalSetExposure(context)):{status:'waiting',issues:['complete-field-measurement-required:'+f.id]};});
 const exposures=conditionalSetExposure(context);
 for(const event of config.events){
  const end=event.endMs??event.atMs;
  if(!exposures.some(x=>event.atMs>=x.startMs-.02&&end<=x.endMs+.02&&(event.type!=='evaluate'||(Math.min(config.graphicWindow.endMs,x.endMs)-end)/x.speed>=600)))checks.push({status:'blocked',issues:['complete-event-and-readable-result-must-be-retained']});
 }
 return {status:checks.some(c=>c.status==='blocked')?'blocked':checks.some(c=>c.status==='waiting')?'waiting':'ready',issues:[...new Set(checks.flatMap(c=>c.issues))],canApply:false,nativeReadiness:'unverified'};
}
/** Absolute source-file milliseconds, recomputed on each call. No mutable cache,
 * loop accumulator, random bounce, media playback, project write or receipt. */
export function conditionalSetState(config,context,absoluteSourceMs) {
 const issues=conditionalSetIssues(config,context),elapsed=absoluteSourceMs-config?.binding?.startMs;
 if(!finite(absoluteSourceMs)||!finite(elapsed)||elapsed<0||elapsed>=config?.binding?.endMs-config?.binding?.startMs)issues.push('absolute-source-time-outside-bound-scene');
 if(!issues.length){const exposures=conditionalSetExposure(context).filter(x=>!context.projection||x.projectionId===context.projection.id);if(!exposures.some(x=>elapsed>=x.startMs-.001&&elapsed<x.endMs))issues.push('source-time-outside-current-retained-instance');}
 if(issues.length)return {status:'blocked',issues,canApply:false,uiAccepted:false,nativeReadiness:'unverified',sets:[],gates:[],actors:[]};
 const p=compile(config,context),actors=[];
 for(const a of p.actors.values()){
  let pos=a.initialPoint,member=a.initialSetId,motion=null;
  for(const trip of p.trips.filter(t=>t.actorId===a.id&&t.atMs<=elapsed)){
   if(elapsed>=trip.endMs){pos=trip.path.to;if(trip.phase==='pass')member=p.gates.get(trip.gateId).toSetId;}
   else{pos=conditionalSetBezier(trip.path,(elapsed-trip.atMs)/(trip.endMs-trip.atMs));motion={eventId:trip.id,gateId:trip.gateId,phase:trip.phase,progress:(elapsed-trip.atMs)/(trip.endMs-trip.atMs)};}
  }
  actors.push({id:a.id,sourceRef:copy(a.sourceRef),assetIdentity:copy(a.assetIdentity??null),point:copy(pos),rect:atPoint(pos,a.size),memberSetId:member,effectiveSetIds:setAncestors(p.sets,member),visible:elapsed>=a.atMs&&elapsed<config.graphicWindow.endMs,motion,outcomes:p.evaluations.filter(e=>e.actorId===a.id&&e.atMs<=elapsed).map(copy)});
 }
 return {status:'valid',issues:[],canApply:false,uiAccepted:false,nativeReadiness:'unverified',sourceMs:absoluteSourceMs,elapsedMs:elapsed,sourceCopy:conditionalSetSourceCopy(context,config),
  copyVisible:elapsed>=config.copyWindow.atMs&&elapsed<config.copyWindow.endMs,
  sets:[...p.sets.values()].map(s=>({id:s.id,parentId:s.parentId??null,sourceRef:copy(s.sourceRef),boundary:copy(s.boundary),visible:elapsed>=s.atMs&&elapsed<config.graphicWindow.endMs,drawProgress:s.drawMs?clamp((elapsed-s.atMs)/s.drawMs):+(elapsed>=s.atMs),directMemberIds:actors.filter(a=>a.visible&&a.memberSetId===s.id).map(a=>a.id),effectiveMemberIds:actors.filter(a=>a.visible&&a.effectiveSetIds.includes(s.id)).map(a=>a.id)})),
  gates:[...p.gates.values()].map(g=>({id:g.id,sourceRef:copy(g.sourceRef),condition:copy(g.condition),visible:elapsed>=g.atMs&&elapsed<config.graphicWindow.endMs,outcomes:p.evaluations.filter(e=>e.gateId===g.id&&e.atMs<=elapsed).map(copy)})),actors};
}
