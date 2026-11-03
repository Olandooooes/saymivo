import {completeSourceCopyInventory} from './complete-source-copy.mjs';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {projectStoryboard,storyboardFrameRange} from './storyboard.mjs';
import {sourceTokenAdditionalCopy,sourceTokenExposure,sourceTokenGraphemes,sourceTokenTextReadiness} from './source-token-transfer.mjs';
import {fitMeasuredText} from './text-fit.mjs';
import {persistentMotionCaptionBands} from './persistent-motion.mjs';

const finite=x=>typeof x==='number'&&Number.isFinite(x),clamp=x=>Math.max(0,Math.min(1,x));
const unique=x=>[...new Set(x)],text=x=>typeof x==='string'&&x.trim().length>0;
const serial=x=>JSON.stringify(x,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
const rect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const overlaps=(a,b)=>a.x<b.x+b.width-1e-7&&b.x<a.x+a.width-1e-7&&a.y<b.y+b.height-1e-7&&b.y<a.y+a.height-1e-7;
const contains=(a,b)=>b.x>=a.x-1e-7&&b.y>=a.y-1e-7&&b.x+b.width<=a.x+a.width+1e-7&&b.y+b.height<=a.y+a.height+1e-7;
const graphemes=s=>sourceTokenGraphemes(s).map(g=>g.text);
const fields=config=>(config.cards??[]).flatMap(card=>(card.fields??[]).map(field=>({...field,cardId:card.id,card})));
const settle=field=>field.rollAtMs+field.cellRollMs+(Math.max(graphemes(field.from).length,graphemes(field.to).length)-1)*field.staggerMs;
const ease=p=>{const t=clamp(p);return t*t*(3-2*t);};

const inventory=scene=>{const original=completeSourceCopyInventory(scene);return [...original,...sourceTokenAdditionalCopy(scene).filter(item=>!original.some(old=>old.id===item.id))];};
export const fieldRollCompleteCopy=scene=>inventory(scene).map(item=>item.text).join('\n');
export function fieldRollProtectedRects(scene,config,viewport,proof){
 const points=scene.window?[scene.window,...(scene.window.keyframes??[])]:[];
 const windows=points.map(p=>({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height}));
 if(windows.length&&windows.every(rect)){
  const x=Math.min(...windows.map(r=>r.x)),y=Math.min(...windows.map(r=>r.y));
  windows.push({x,y,width:Math.max(...windows.map(r=>r.x+r.width))-x,height:Math.max(...windows.map(r=>r.y+r.height))-y});
 }
 const projections=proof?(scene.sourceId?[scene]:projectStoryboard([scene],proof.clips,proof.fps)):[];
 return [config.speakerRect,...windows,...(config.protectedAreas??[]).map(p=>p.rect),...projections.flatMap(p=>persistentMotionCaptionBands(p,proof))];
}
export function fieldRollProjectionIssues(scene,config,proof){
 const unprojected=scene.sourceId===undefined&&scene.phaseStartMs===undefined&&scene.phaseEndMs===undefined;
 const raw=proof?.rawScene,b=config.binding,clips=proof?.clips;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||raw.id!==b.sceneId||raw.src!==b.src||raw.startMs!==b.startMs||raw.endMs!==b.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c.id)).size!==clips.length||clips.some(c=>!text(c.id)||!text(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['field-roll-current-raw-source-projection-required'];
 if(!Array.isArray(proof.captions)||proof.captions.some(c=>!c||![c.startMs,c.endMs,c.topPct].every(finite)||c.startMs<0||c.endMs<=c.startMs||c.topPct<5||c.topPct>92||c.clipId&&!clips.some(p=>p.id===c.clipId)||c.holdMs!==undefined&&(!finite(c.holdMs)||c.holdMs<0)||c.holdMaxMs!==undefined&&(!finite(c.holdMaxMs)||c.holdMaxMs<0)||c.scale!==undefined&&(!finite(c.scale)||c.scale<=0)))return ['field-roll-explicit-current-caption-inventory-required'];
 if(unprojected)return serial(raw)===serial(scene)?[]:['field-roll-current-raw-scene-proof-stale'];
 const projected=projectStoryboard([raw],clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);
 return projected&&serial(projected)===serial(scene)?[]:['field-roll-source-instance-projection-mismatch'];
}
/** Global composition frame -> original scene-relative ms. No tick counter or
 * preview playback-rate accumulator: seek and repeated clip instances agree. */
export function fieldRollElapsedAtFrame(scene,frame,fps){
 if(!Number.isInteger(frame)||!finite(fps)||fps<=0)throw Error('field-roll-valid-composition-frame-and-fps-required');
 const range=storyboardFrameRange(scene,fps),exposure=sourceTokenExposure(scene);
 if(frame<range.from||frame>=range.from+range.durationInFrames)throw Error('field-roll-frame-outside-retained-instance');
 return exposure.startMs+(frame-range.from)/fps*1000*exposure.speed;
}
export function fieldRollBoardIssues(scene,config,viewport={width:1920,height:1080},proof){
 if(!scene||config?.kind!=='field-roll-board')return ['field-roll-kind-required'];
 if(typeof scene.title!=='string'||scene.body!==undefined&&typeof scene.body!=='string'||!Array.isArray(scene.nodes)||scene.nodes.some(n=>!n||typeof n.text!=='string'||n.detail!==undefined&&typeof n.detail!=='string'||n.bullets!==undefined&&(!Array.isArray(n.bullets)||n.bullets.some(v=>typeof v!=='string')))||['tags','links'].some(k=>scene[k]!==undefined&&!Array.isArray(scene[k])))return ['field-roll-complete-source-copy-invalid'];
 const issues=[],duration=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),binding=config.binding;
 if(![duration,viewport.width,viewport.height,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||duration<=0||viewport.width<=0||viewport.height<=0||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs)issues.push('field-roll-valid-source-exposure-required');
 if(config.clock!=='scene-source-relative-ms'||!binding||binding.sceneId!==(scene.sourceId??scene.id)||binding.src!==scene.src||!text(binding.src)||!/^[a-f0-9]{64}$/i.test(binding.sha256??'')||!finite(binding.startMs)||!finite(binding.endMs)||binding.startMs<0||Math.abs(binding.endMs-binding.startMs-duration)>.01||!scene.sourceId&&(binding.startMs!==scene.startMs||binding.endMs!==scene.endMs))issues.push('field-roll-exact-raw-source-binding-required');
 if(issues.length)return issues;
 issues.push(...fieldRollProjectionIssues(scene,config,proof));
 const originals=inventory(scene),copy=config.copyWindow,cards=config.cards;
 if(!originals.length||typeof scene.title!=='string'||scene.body!==undefined&&typeof scene.body!=='string'||!Array.isArray(scene.nodes)||scene.nodes.some(n=>!n||typeof n.text!=='string'||n.detail!==undefined&&typeof n.detail!=='string'||n.bullets!==undefined&&(!Array.isArray(n.bullets)||n.bullets.some(v=>typeof v!=='string'))))issues.push('field-roll-complete-source-copy-invalid');
 if(!copy||!rect(copy.rect)||![copy.atMs,copy.endMs].every(finite)||copy.atMs<0||copy.endMs<=copy.atMs||copy.endMs>duration)issues.push('field-roll-complete-copy-window-required');
 if(!rect(config.titleRect)||!rect(config.speakerRect)||config.protectedAreas!==undefined&&(!Array.isArray(config.protectedAreas)||config.protectedAreas.some(p=>!rect(p?.rect))))issues.push('field-roll-safe-title-speaker-and-protected-rects-required');
 if(!Array.isArray(cards)||!cards.length||cards.length>8||new Set(cards.map(c=>c?.id)).size!==cards.length||cards.some(c=>!text(c?.id)||!rect(c.rect)||![c.enterAtMs,c.enterMs,c.exitAtMs,c.exitMs].every(finite)||c.enterAtMs<(copy?.endMs??Infinity)||c.enterMs<150||c.exitMs<150||c.exitAtMs<=c.enterAtMs+c.enterMs||c.exitAtMs+c.exitMs>duration||!Array.isArray(c.fields)||!c.fields.length))issues.push('field-roll-explicit-stable-cards-and-source-phases-required');
 if(issues.length)return unique(issues);
 const items=fields(config);
 if(items.length>24||new Set(items.map(f=>f.id)).size!==items.length)issues.push('field-roll-global-unique-field-ids-required');
 for(const f of items){
  const source=originals.find(s=>s.id===f.sourceRef),provenance=f.provenance;
  if(!text(f.id)||!text(f.label)||!text(f.from)||!text(f.to)||/[\r\n\t]/.test(f.from+f.to)||Math.max(graphemes(f.from).length,graphemes(f.to).length)>128||!source||source.text!==f.from)issues.push('field-roll-full-original-source-field-required:'+f.id);
  if(!provenance||!['translation','format','authored-update'].includes(provenance.kind)||!text(provenance.citation)||provenance.kind==='translation'&&(!text(provenance.fromLanguage)||!text(provenance.toLanguage)||provenance.fromLanguage===provenance.toLanguage))issues.push('field-roll-explicit-mapping-provenance-required:'+f.id);
  if(!rect(f.rect)||!rect(f.labelRect)||!contains(f.card.rect,f.rect)||!contains(f.card.rect,f.labelRect)||overlaps(f.rect,f.labelRect))issues.push('field-roll-field-label-must-fit-own-stable-card:'+f.id);
  if(![f.rollAtMs,f.cellRollMs,f.staggerMs].every(finite)||f.cellRollMs<150||f.staggerMs<0||f.rollAtMs<f.card.enterAtMs+f.card.enterMs||settle(f)>=f.card.exitAtMs||!['up','down'].includes(f.direction))issues.push('field-roll-explicit-old-roll-new-holds-required:'+f.id);
  // Transient values are supplied old/new glyph fragments, never fake language
  // codes, intermediate metrics, random decoded text or an inferred counter.
  if(f.intermediateValues!==undefined||f.counter!==undefined||f.autoTranslate!==undefined)issues.push('field-roll-unsupported-generated-facts:'+f.id);
 }
 if(scene.media?.src||(scene.nodes??[]).some(n=>n.assetSrc)||config.assets!==undefined)issues.push('field-roll-first-text-only-build-cannot-discard-existing-media');
 const protection=fieldRollProtectedRects(scene,config,viewport,proof);
 // Caption bands deliberately extend to the stage bottom; other reservations
 // remain above the lower14% safety strip.
 const personProtection=fieldRollProtectedRects(scene,config,viewport);
 if(personProtection.some(p=>!rect(p))||(scene.window?.keyframes??[]).some(p=>!finite(p.atMs)||p.atMs<0||p.atMs>duration))issues.push('field-roll-complete-person-envelope-invalid');
 const graphics=[config.titleRect,...cards.map(c=>c.rect)];
 if([copy.rect,...graphics].some(r=>protection.some(p=>overlaps(p,r))))issues.push('field-roll-text-crosses-person-or-subtitle-envelope');
 for(let i=0;i<graphics.length;i++)for(let j=i+1;j<graphics.length;j++)if(overlaps(graphics[i],graphics[j]))issues.push('field-roll-title-or-cards-overlap');
 for(const card of cards){const areas=card.fields.flatMap(f=>[f.rect,f.labelRect]);for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++)if(overlaps(areas[i],areas[j]))issues.push('field-roll-field-regions-overlap');}
 return unique(issues);
}
export function fieldRollTextPlan(scene,config){
 const start=Math.min(...config.cards.map(c=>c.enterAtMs)),end=Math.max(...config.cards.map(c=>c.exitAtMs+c.exitMs));
 return [{id:'field-roll-complete-copy',text:fieldRollCompleteCopy(scene),rect:config.copyWindow.rect,role:'copy',window:config.copyWindow},...(scene.title?[{id:'field-roll-title',text:scene.title,rect:config.titleRect,role:'title',window:{atMs:start,endMs:end}}]:[]),...fields(config).map(f=>({id:'field-roll-label:'+f.id,text:f.label,rect:f.labelRect,role:'label',window:{atMs:f.card.enterAtMs+f.card.enterMs,endMs:f.card.exitAtMs}}))];
}
export function fieldRollMeasurementKey(scene,config,viewport,fontKey){return serial([scene.sourceId??scene.id,scene.src,dynamicSceneDuration(scene),inventory(scene),scene.window,config,viewport,fontKey]);}
/** The production caller supplies Canvas measurements AFTER the current font
 * loads. Tests inject synthetic metrics; that never constitutes pixel proof. */
export function measureFieldRollBoard(scene,config,viewport,fontKey,measure){
 if(typeof measure!=='function'||!text(fontKey))throw Error('field-roll-loaded-font-and-measure-function-required');
 const checked=(s,size)=>{const m=measure(s,size);if(!m||!['width','ascent','descent'].every(k=>finite(m[k])&&m[k]>=0)||!['left','right'].every(k=>finite(m[k]))||m.left+m.right<0)throw Error('field-roll-complete-glyph-metrics-required');return m;};
 const min=viewport.height*.024,max=viewport.height*.058;
 const texts=fieldRollTextPlan(scene,config).map(f=>({...f,fit:fitMeasuredText(f.text,{width:f.rect.width*viewport.width,height:f.rect.height*viewport.height,minFont:viewport.height*(f.role==='copy'?.025:.020),maxFont:viewport.height*(f.role==='copy'?.048:f.role==='title'?.045:.028),lineHeight:1.2,measure:checked})}));
 const values=fields(config).map(f=>{
  const glyphs=unique([...graphemes(f.from),...graphemes(f.to)]),slots=Math.max(graphemes(f.from).length,graphemes(f.to).length),width=f.rect.width*viewport.width,height=f.rect.height*viewport.height;
  const at=size=>{const metrics=glyphs.map(glyph=>({glyph,...checked(glyph,size)})),advance=Math.max(1,...metrics.map(m=>Math.max(m.width,m.left+m.right)))+2,ascent=Math.max(...metrics.map(m=>m.ascent)),descent=Math.max(...metrics.map(m=>m.descent)),rowHeight=Math.max(size*1.2,ascent+descent+2);return {fontSize:size,advance,rowHeight,ascent,descent,metrics,slots,unplaceable:advance*slots>width+1e-5||rowHeight>height+1e-5};};
  let low=min,high=max,best=at(min);for(let i=0;i<16;i++){const mid=(low+high)/2,m=at(mid);if(m.unplaceable)high=mid;else{low=mid;best=m;}}
  return {id:f.id,from:f.from,to:f.to,...best};
 });
 return {key:fieldRollMeasurementKey(scene,config,viewport,fontKey),fontKey,fields:values,texts};
}
export function fieldRollBoardReadiness(scene,config,measurement,viewport={width:1920,height:1080},proof){
 const issues=fieldRollBoardIssues(scene,config,viewport,proof);if(issues.length)return {status:'blocked',issues};
 if(!measurement)return {status:'waiting',issues:['field-roll-waiting-for-current-loaded-font-and-all-glyphs']};
 if(!text(measurement.fontKey)||measurement.key!==fieldRollMeasurementKey(scene,config,viewport,measurement.fontKey)||!Array.isArray(measurement.texts)||!Array.isArray(measurement.fields))return {status:'blocked',issues:['field-roll-current-font-or-full-content-measurement-stale']};
 const exposure=sourceTokenExposure(scene),waiting=[];
 for(const p of fieldRollTextPlan(scene,config)){
  const m=measurement.texts.find(t=>t.id===p.id);
  if(!m||m.text!==p.text||!m.fit){waiting.push('field-roll-native-text-not-measured:'+p.id);continue;}
  const r=sourceTokenTextReadiness(p.text,m.fit,p.window,exposure);issues.push(...r.issues.map(i=>p.id+':'+i));
 }
 for(const f of fields(config)){
  const m=measurement.fields.find(m=>m.id===f.id),glyphs=unique([...graphemes(f.from),...graphemes(f.to)]);
  if(!m||m.from!==f.from||m.to!==f.to){waiting.push('field-roll-all-old-new-glyphs-required:'+f.id);continue;}
  if(![m.fontSize,m.advance,m.rowHeight].every(v=>finite(v)&&v>0)||![m.ascent,m.descent].every(v=>finite(v)&&v>=0)||m.unplaceable||!Array.isArray(m.metrics)||m.metrics.length!==glyphs.length||glyphs.some(g=>!m.metrics.some(v=>v.glyph===g&&['width','ascent','descent'].every(k=>finite(v[k])&&v[k]>=0)&&['left','right'].every(k=>finite(v[k]))&&v.left+v.right>=0&&Math.max(v.width,v.left+v.right)+2<=m.advance+.01&&v.ascent<=m.ascent+.01&&v.descent<=m.descent+.01))||m.slots!==Math.max(graphemes(f.from).length,graphemes(f.to).length)||m.slots*m.advance>f.rect.width*viewport.width+.01||m.rowHeight>f.rect.height*viewport.height+.01||m.ascent+m.descent+2>m.rowHeight+.01)issues.push('field-roll-full-glyph-mask-does-not-fit:'+f.id);
  for(const [value,window] of [[f.from,{atMs:f.card.enterAtMs+f.card.enterMs,endMs:f.rollAtMs}],[f.to,{atMs:settle(f),endMs:f.card.exitAtMs}]]){
   const fit={pages:[[value]],unplaceable:false};issues.push(...sourceTokenTextReadiness(value,fit,window,exposure,{singlePage:true}).issues.map(i=>f.id+':'+i));
  }
  if(f.rollAtMs<exposure.startMs-.01||settle(f)>exposure.endMs+.01)issues.push('field-roll-complete-roll-must-be-retained:'+f.id);
 }
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
export function fieldRollBoardState(scene,config,elapsed){
 if(!finite(elapsed))throw Error('field-roll-finite-original-source-clock-required');
 return {elapsed,copyVisible:elapsed>=config.copyWindow.atMs&&elapsed<config.copyWindow.endMs,cards:config.cards.map(card=>{
  const visible=elapsed>=card.enterAtMs&&elapsed<card.exitAtMs+card.exitMs,opacity=clamp((elapsed-card.enterAtMs)/card.enterMs)*(1-clamp((elapsed-card.exitAtMs)/card.exitMs));
  return {id:card.id,rect:card.rect,visible,opacity,phase:!visible?'outside':elapsed<card.enterAtMs+card.enterMs?'entering':elapsed>=card.exitAtMs?'exiting':'holding',fields:card.fields.map(f=>{
   const from=graphemes(f.from),to=graphemes(f.to),settledAtMs=settle(f),phase=elapsed<f.rollAtMs?'original':elapsed<settledAtMs?'rolling':'resolved';
   return {id:f.id,label:f.label,sourceRef:f.sourceRef,rect:f.rect,labelRect:f.labelRect,from:f.from,to:f.to,phase,settledAtMs,completeReadable:visible&&opacity===1&&phase!=='rolling',readableValue:phase==='original'?f.from:phase==='resolved'?f.to:null,cells:Array.from({length:Math.max(from.length,to.length)},(_,i)=>{
    const old=from[i]??'',next=to[i]??'',p=old===next?0:ease((elapsed-f.rollAtMs-i*f.staggerMs)/f.cellRollMs),sign=f.direction==='up'?-1:1;
    return {index:i,from:old,to:next,progress:p,fromY:sign*p,toY:sign*(p-1),unchanged:old===next};
   })};
  })};
 }),automaticAllowed:false,needsFaceReview:true};
}
