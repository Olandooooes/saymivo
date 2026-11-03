import {conditionalSetIssues,conditionalSetSourceCopy,conditionalSetFieldPlan,conditionalSetState,conditionalSetKey,conditionalSetExposure,conditionalSetTextReadiness,conditionalSetPathEnvelope,conditionalSetBoundaryBands} from './conditional-set.mjs';
import {projectStoryboard,storyboardFrameRange} from './storyboard.mjs';
import {persistentMotionCaptionBands} from './persistent-motion.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n),text=s=>typeof s==='string'&&!!s.trim(),full=r=>r?.expectedText??'',overlap=(a,b)=>a.x<b.x+b.width-1e-8&&a.x+a.width>b.x+1e-8&&a.y<b.y+b.height-1e-8&&a.y+a.height>b.y+1e-8;
const rect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const active=(a,b)=>a.atMs<b.endMs&&b.atMs<a.endMs;
const hull=rs=>{const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return{x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};};
const at=(point,size)=>({x:point.x-size.width/2,y:point.y-size.height/2,...size});
const must=(ok,message)=>{if(!ok)throw Error(message);};

/** Human-authored labels are content, never a claim that a service ran. */
export function conditionalSetConditionText(gate,config){
 const c=gate.condition;
 if(c.kind==='capacity')return `${c.factKey} ${c.operator==='lt'?'<':'≤'} ${c.limit} ${c.unit}`;
 if(c.kind==='membership'){const set=config.sets.find(s=>s.id===c.setId);return `${c.mode==='inside'?'属于':'不属于'}\n${full(set?.sourceRef)}`;}
 return config.outcomeLabels?.[c.result]??'';
}
export function conditionalSetViewFields(config,context){
 const fields=conditionalSetFieldPlan(config,context),gateText=g=>[full(g.sourceRef),conditionalSetConditionText(g,config)].filter(Boolean).join('\n');
 fields[0]={...fields[0],text:[conditionalSetSourceCopy(context,config),config.provenance?.note,...config.gates.map(gateText),...config.actors.flatMap(a=>(a.facts??[]).map(f=>[full(f.sourceRef),`${f.key}: ${f.value} ${f.unit}`].join('\n'))),config.outcomeLabels?.allowed,config.outcomeLabels?.blocked].filter(Boolean).join('\n')};
 for(const f of fields){if(f.role==='gate')f.text=gateText(config.gates.find(g=>'gate:'+g.id===f.id));if(f.role==='actor'){const a=config.actors.find(a=>'actor:'+a.id===f.id);f.text=[f.text,...(a.facts??[]).map(v=>[full(v.sourceRef),`${v.key}: ${v.value} ${v.unit}`].join('\n'))].join('\n');}}
 for(const g of config.gates){const events=config.events.filter(e=>e.type==='evaluate'&&e.gateId===g.id),view=config.gateViews?.find(v=>v.gateId===g.id);if(!events.length)continue;const rows=events.length,gap=.006,r=view?.historyRect;for(let i=0;i<rows;i++){const e=events[i],a=config.actors.find(a=>a.id===e.actorId);fields.push({id:'history:'+e.id,role:'history',eventId:e.id,gateId:g.id,text:[full(a?.sourceRef),config.outcomeLabels?.[e.expectedResult],gateText(g)].filter(Boolean).join('\n'),rect:r?{x:r.x,y:r.y+i*(r.height+gap)/rows,width:r.width,height:(r.height-gap*(rows-1))/rows}:undefined,atMs:e.atMs,endMs:config.graphicWindow.endMs});}}
 return fields;
}
export function conditionalSetViewKey(config,context,fontKey=''){return conditionalSetKey(config,context,fontKey);}
export function conditionalSetViewIssues(config,context){
 const base=conditionalSetIssues(config,context);if(base.length)return base;
 try{
  must(text(config.outcomeLabels?.allowed)&&text(config.outcomeLabels?.blocked),'author-complete-allowed-and-blocked-labels-required');
  must(Array.isArray(config.gateViews)&&new Set(config.gateViews.map(v=>v.gateId)).size===config.gateViews.length&&config.gateViews.every(v=>config.gates.some(g=>g.id===v.gateId)&&rect(v.historyRect)),'unique-known-gate-history-regions-required');
  for(const e of config.events.filter(e=>e.type==='evaluate'))must(config.gateViews.some(v=>v.gateId===e.gateId),'every-gate-result-needs-persistent-history-region');
  for(const a of config.actors)must(!a.useSourceImage||a.assetIdentity,'selected-source-image-not-bound');
  const fields=conditionalSetViewFields(config,context),native=fields.filter(f=>f.role!=='copy'),people=[context.speaker.rect,...(config.protectedAreas??[]).map(p=>p.rect)],windows=context.rawScene.window?[context.rawScene.window,...(context.rawScene.window.keyframes??[])]:[];
  const ps=windows.map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*context.viewport.width/context.viewport.height}));people.push(...ps,...(ps.length?[hull(ps)]:[]));
  const projected=projectStoryboard([context.rawScene],context.clips,context.fps);people.push(...projected.flatMap(p=>persistentMotionCaptionBands(p,{clips:context.clips,fps:context.fps,captions:context.captions})));
  const actorEnvelopes=config.actors.map(a=>hull([at(a.initialPoint,a.size),...config.events.filter(e=>e.type==='travel'&&e.actorId===a.id).map(e=>conditionalSetPathEnvelope(e.path,a.size))]));
  const strokes=[...config.sets.flatMap(s=>conditionalSetBoundaryBands(s.boundary)),...config.gates.map(g=>g.boundary.axis==='x'?{x:g.boundary.position-.003,y:g.boundary.min,width:.006,height:g.boundary.max-g.boundary.min}:{x:g.boundary.min,y:g.boundary.position-.003,width:g.boundary.max-g.boundary.min,height:.006})];
  for(const f of fields){must(rect(f.rect),'complete-field-or-history-region-invalid:'+f.id);must(!people.some(p=>overlap(f.rect,p)),'complete-field-or-history-crosses-person-caption:'+f.id);if(f.role==='history')must(![...actorEnvelopes,...strokes].some(r=>overlap(f.rect,r)),'persistent-gate-history-crosses-motion-or-boundary:'+f.id);}
  for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++)must(!active(fields[i],fields[j])||!overlap(fields[i].rect,fields[j].rect),'complete-fields-or-result-histories-overlap');
  // A label may not be safe merely because its parent field is no longer shown.
  for(const a of actorEnvelopes)must(!native.some(f=>f.role==='history'&&overlap(f.rect,a)),'persistent-history-crosses-actor-envelope');
  return [];
 }catch(error){return [error instanceof Error?error.message:'conditional-view-configuration-invalid'];}
}
export function conditionalSetViewReadiness(config,context,measurement,assets){
 const issues=conditionalSetViewIssues(config,context),waiting=[];
 if(issues.length)return{status:'blocked',issues,canApply:false,uiAccepted:false,needsFaceReview:true};
 if(!measurement?.fontKey||measurement.key!==conditionalSetViewKey(config,context,measurement.fontKey))waiting.push('current-font-and-complete-view-measurements-required');
 else for(const f of conditionalSetViewFields(config,context)){const m=measurement.fields?.find(m=>m.id===f.id),r=m?.text===f.text?conditionalSetTextReadiness(f,m.fit,conditionalSetExposure(context)):{status:'waiting',issues:['current-complete-field-measurement-required']};(r.status==='blocked'?issues:waiting).push(...r.issues.map(x=>f.id+':'+x));}
 // The original module additionally validates event completeness and result holds.
 const exposures=conditionalSetExposure(context);
 for(const e of config.events){const end=e.endMs??e.atMs;if(!exposures.some(p=>e.atMs>=p.startMs-.02&&end<=p.endMs+.02&&(e.type!=='evaluate'||(Math.min(config.graphicWindow.endMs,p.endMs)-end)/p.speed>=600)))issues.push('complete-event-and-result-hold-must-be-retained');}
 const expected=[...new Set(config.actors.map(a=>a.assetIdentity?.src).filter(Boolean))];
 if(!assets||assets.key!==conditionalSetViewKey(config,context))waiting.push('current-image-decode-status-required');else for(const src of expected){const a=assets.items?.find(a=>a.src===src);if(a?.status==='blocked')issues.push('current-source-image-decode-failed:'+src);else if(a?.status!=='ready')waiting.push('current-source-image-decode-required:'+src);}
 return{status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:[...new Set([...issues,...waiting])],canApply:false,uiAccepted:false,needsFaceReview:true};
}
/** Uses the exact displayed ceil frame; input source phase never restarts at cuts. */
export function conditionalSetViewSourceMs(context,localFrame){
 must(context.projection&&Number.isInteger(localFrame)&&localFrame>=0,'current-projection-and-local-display-frame-required');
 const expected=projectStoryboard([context.rawScene],context.clips,context.fps).find(p=>p.id===context.projection.id&&p.clipId===context.projection.clipId),stable=o=>Array.isArray(o)?o.map(stable):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,stable(o[k])])):o;
 must(expected&&JSON.stringify(stable(expected))===JSON.stringify(stable(context.projection)),'current-projection-clock-and-content-proof-required');
 const r=storyboardFrameRange(context.projection,context.fps);must(localFrame<r.durationInFrames,'display-frame-outside-current-projection');
 return context.rawScene.startMs+(r.from/context.fps*1000-(context.projection.phaseStartMs??context.projection.startMs)+localFrame/context.fps*1000)*(context.projection.speed??1);
}
export function conditionalSetViewSample(config,context,sourceMs){return conditionalSetState(config,context,sourceMs);}
