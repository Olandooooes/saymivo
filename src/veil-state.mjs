import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';
import {projectStoryboard,sceneSpeakerLayout} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';
import {sourceTokenExposure,sourceTokenTextReadiness,sourceTokenPageState} from './source-token-transfer.mjs';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const unique=items=>[...new Set(items)];
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{const p=clamp(n);return p*p*(3-2*p);};
const local=src=>typeof src==='string'&&src.length>0&&!/^(?:[a-z]+:|\/|.*\.\.)/i.test(src)&&!src.includes('\\');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const rect=(r,bottom=.86)=>!!r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=bottom+.000001;
const overlaps=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const union=rs=>{const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return {x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const text=value=>typeof value==='string'&&value.length>0;
const fullNode=node=>[node?.text,node?.detail,...(Array.isArray(node?.bullets)?node.bullets:[])].filter(text).join('\n');
const windowValid=(w,duration)=>w&&[w.atMs,w.endMs].every(finite)&&w.atMs>=0&&w.endMs>w.atMs&&w.endMs<=duration;

/** Source prose is rendered, including unselected nodes and their conditions. */
export function veilStateCopy(scene,config){
 return [scene?.title,scene?.body,scene?.label,scene?.sourceNote,...(Array.isArray(scene?.tags)?scene.tags:[]).map(t=>t?.text),...(Array.isArray(scene?.links)?scene.links:[]).map(l=>l?.label),...(Array.isArray(scene?.nodes)?scene.nodes:[]).map(fullNode),config?.annotation].filter(text).join('\n');
}
export function veilStateMeasurementKey(scene,config,viewport,fontKey){
 return JSON.stringify([scene.sourceId??scene.id,scene.src,dynamicSceneDuration(scene),scene.nodes,veilStateCopy(scene,config),scene.window,scene.layout,scene.speaker,config,viewport,fontKey]);
}
/** Default central inset geometry and the conservative union of every authored pose. */
export function veilStateProtectedRects(scene,config,viewport){
 const points=scene.window?[scene.window,...(Array.isArray(scene.window.keyframes)?scene.window.keyframes:[])]:[],rs=points.map(p=>({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height}));
 if(!points.length){const r=speakerBox(sceneSpeakerLayout({...scene,visualPreset:undefined}),viewport.width,viewport.height);rs.push({x:r.left/viewport.width,y:r.top/viewport.height,width:r.width/viewport.width,height:r.height/viewport.height});}
 return [...rs,...(rs.length&&rs.every(r=>rect(r,1))?[union(rs)]:[]),...(config.protectedAreas??[]).map(p=>p.rect)];
}
/** Recompute the exact retained instance; same src/duration is not source identity. */
export function veilStateProjectionIssues(scene,config,proof){
 if(scene.phaseStartMs===undefined&&scene.phaseEndMs===undefined)return [];
 const raw=proof?.rawScene,clips=proof?.clips,b=config?.binding;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||raw.id!==b?.sceneId||raw.src!==b?.src||raw.startMs!==b?.startMs||raw.endMs!==b?.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c?.id)).size!==clips.length||clips.some(c=>!c?.id||!local(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['verified-raw-scene-and-timeline-projection-required'];
 const expected=projectStoryboard([raw],clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);
 return expected&&JSON.stringify(stable(expected))===JSON.stringify(stable(scene))?[]:['projection-no-longer-matches-bound-absolute-source-scene'];
}
export function veilStateFieldPlan(scene,config){
 const nodes=new Map((scene.nodes??[]).map(n=>[n.id,n]));
 return [
  {id:'complete-copy',role:'copy',text:veilStateCopy(scene,config),rect:config.copyWindow?.rect,windows:[{atMs:config.copyWindow?.atMs,endMs:config.copyWindow?.endMs}]},
  ...(config.objects??[]).map(o=>({id:o.id,nodeId:o.nodeId,role:'object',text:fullNode(nodes.get(o.nodeId)),rect:o.rect,windows:[{atMs:o.atMs,endMs:o.freezeAtMs},{atMs:o.releaseAtMs+o.releaseMs,endMs:o.endMs}]}))
 ];
}
export function veilStateIssues(scene,config,viewport={width:1920,height:1080},projectionProof){
 if(!scene||!config||config.kind!=='veil-state')return ['veil-state-config-required'];
 const issues=[],duration=dynamicSceneDuration(scene),exposure=sourceTokenExposure(scene),b=config.binding,projected=scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined;
 if(![duration,scene.startMs,scene.endMs,exposure.startMs,exposure.endMs,exposure.speed,viewport.width,viewport.height].every(finite)||duration<=0||scene.endMs<=scene.startMs||exposure.speed<=0||exposure.startMs<-.01||exposure.endMs>duration+.01||exposure.endMs<=exposure.startMs||viewport.width<=0||viewport.height<=0||projected&&(!finite(scene.phaseStartMs)||!finite(scene.phaseEndMs)))issues.push('source-clock-or-viewport-invalid');
 if(config.clock!=='scene-source-relative-ms'||!b||b.sceneId!==(scene.sourceId??scene.id)||b.src!==scene.src||!local(b.src)||!sha(b.sha256)||![b.startMs,b.endMs].every(finite)||b.startMs<0||b.endMs<=b.startMs||Math.abs(b.endMs-b.startMs-duration)>.01||!projected&&(b.startMs!==scene.startMs||b.endMs!==scene.endMs))issues.push('raw-source-identity-or-clock-mismatch');
 if(projected&&(!finite(scene.sourceOffsetMs)||Math.abs(scene.sourceOffsetMs-exposure.startMs)>.02))issues.push('retained-source-offset-mismatch');
 issues.push(...veilStateProjectionIssues(scene,config,projectionProof));
 if(config.sourceKind!=='illustration'||typeof config.provenance!=='string'||!config.provenance.trim())issues.push('explicit-original-illustration-provenance-required');
 if(config.annotation!==undefined&&!text(config.annotation))issues.push('annotation-must-be-complete-authored-text');
 const nodes=Array.isArray(scene.nodes)?scene.nodes:[],objects=Array.isArray(config.objects)?config.objects:[];
 if(!nodes.length||nodes.some(n=>!n||!text(n.id)||!text(n.text)||n.detail!==undefined&&typeof n.detail!=='string'||n.bullets!==undefined&&(!Array.isArray(n.bullets)||n.bullets.some(t=>typeof t!=='string')))||new Set(nodes.map(n=>n?.id)).size!==nodes.length)issues.push('source-node-ids-and-complete-text-required');
 if(!objects.length||objects.length>8||new Set(objects.map(o=>o?.id)).size!==objects.length||new Set(objects.map(o=>o?.nodeId)).size!==objects.length)issues.push('one-to-eight-distinct-source-bound-objects-required');
 if(scene.media?.src||nodes.some(n=>n?.assetSrc))issues.push('existing-media-requires-a-supported-media-renderer');
 const copy=config.copyWindow;
 if(!windowValid(copy,duration)||!rect(copy?.rect)||copy.endMs-copy.atMs<1000)issues.push('complete-source-copy-window-required');
 for(const o of objects){
  const node=nodes.find(n=>n?.id===o?.nodeId);
  if(!o||!text(o.id)||o.id==='complete-copy'||!node||o.expectedText!==fullNode(node)||!rect(o.rect)){issues.push('object-must-bind-stable-id-and-exact-complete-source-node');continue;}
  if(![o.atMs,o.endMs,o.freezeAtMs,o.freezeMs,o.releaseAtMs,o.releaseMs].every(finite)||o.atMs<0||o.endMs>duration||o.freezeAtMs<=o.atMs||o.freezeMs<80||o.releaseMs<80||o.freezeAtMs+o.freezeMs>=o.releaseAtMs||o.releaseAtMs+o.releaseMs>=o.endMs)issues.push('explicit-ordered-freeze-and-release-with-clear-reading-windows-required');
  if(copy&&o.atMs<copy.endMs)issues.push('complete-source-copy-must-finish-before-object-actions');
  const a=o.appearance;
  if(!a||![a.dimOpacity,a.veilOpacity,a.blurPxAt1080].every(finite)||a.dimOpacity<.15||a.dimOpacity>1||a.veilOpacity<0||a.veilOpacity>.9||a.blurPxAt1080<0||a.blurPxAt1080>24||a.dimOpacity===1&&a.veilOpacity===0&&a.blurPxAt1080===0)issues.push('explicit-bounded-opacity-and-blur-change-required');
 }
 if(!Array.isArray(config.protectedAreas??[])||(config.protectedAreas??[]).some(p=>!rect(p?.rect,1)))issues.push('protected-area-invalid');
 const keyframes=Array.isArray(scene.window?.keyframes)?scene.window.keyframes:[],points=scene.window?[scene.window,...keyframes]:[];
 if(scene.window?.keyframes!==undefined&&!Array.isArray(scene.window.keyframes))issues.push('speaker-keyframe-list-invalid');
 if(points.some(p=>!p||![p.x,p.y,p.size].every(finite)||p.size<=0||!rect({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height},1)))issues.push('speaker-window-invalid');
 const times=keyframes.map(p=>p?.atMs);if(times.some(t=>!finite(t)||t<0||t>duration)||new Set(times).size!==times.length)issues.push('speaker-keyframe-clock-invalid');
 if(issues.length)return unique(issues);
 const protectedRects=veilStateProtectedRects(scene,config,viewport),fields=veilStateFieldPlan(scene,config);
 if(protectedRects.some(p=>!rect(p,1)))issues.push('full-frame-or-unknown-person-geometry-needs-supported-inset');
 if(fields.some(f=>protectedRects.some(p=>overlaps(p,f.rect))))issues.push('complete-copy-or-whole-object-envelope-overlaps-person-path-or-protection');
 for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++)if(objects[i].atMs<objects[j].endMs&&objects[j].atMs<objects[i].endMs&&overlaps(objects[i].rect,objects[j].rect))issues.push('simultaneous-object-envelopes-must-not-overlap');
 return unique(issues);
}
/** The clear windows restart pagination; the frozen page is held deterministically. */
export function veilStateObjectPhase(object,elapsed){
 const freezeEnd=object.freezeAtMs+object.freezeMs,releaseEnd=object.releaseAtMs+object.releaseMs;
 const phase=elapsed<object.atMs?'pending':elapsed>=object.endMs?'finished':elapsed<object.freezeAtMs?'clear':elapsed<freezeEnd?'veiling':elapsed<object.releaseAtMs?'frozen':elapsed<releaseEnd?'releasing':'restored';
 const amount=phase==='veiling'?ease((elapsed-object.freezeAtMs)/object.freezeMs):phase==='frozen'?1:phase==='releasing'?1-ease((elapsed-object.releaseAtMs)/object.releaseMs):0,a=object.appearance;
 return {phase,visible:elapsed>=object.atMs&&elapsed<object.endMs,frozen:phase==='frozen',amount,opacity:1-(1-a.dimOpacity)*amount,blurPxAt1080:a.blurPxAt1080*amount,veilOpacity:a.veilOpacity*amount};
}
export function veilStateReadiness(scene,config,measurement,viewport={width:1920,height:1080},projectionProof){
 const issues=veilStateIssues(scene,config,viewport,projectionProof);if(issues.length)return {status:'blocked',issues};
 if(!measurement)return {status:'waiting',issues:['loaded-font-complete-copy-and-object-measurements-required']};
 if(!measurement.fontKey||measurement.key!==veilStateMeasurementKey(scene,config,viewport,measurement.fontKey))return {status:'blocked',issues:['stale-font-source-content-or-layout-measurement']};
 const waiting=[],exposure=sourceTokenExposure(scene);
 for(const field of veilStateFieldPlan(scene,config)){
  const m=measurement.fields?.find(m=>m.id===field.id);
  if(!m||m.text!==field.text){waiting.push('all-complete-source-fields-must-be-measured');continue;}
  if(m.fit&&(![m.fit.fontSize,m.fit.rowHeight,m.fit.width].every(finite)||m.fit.fontSize<viewport.height*.026||m.fit.rowHeight<=0||m.fit.width>field.rect.width*viewport.width*.94+.01||(m.fit.pages??[]).some(p=>p.length*m.fit.rowHeight>field.rect.height*viewport.height*.88+.01)))issues.push('complete-text-font-or-page-geometry-invalid');
  for(const w of field.windows){const check=sourceTokenTextReadiness(field.text,m.fit,w,exposure);(check.status==='waiting'?waiting:issues).push(...check.issues.map(i=>`${field.id}: ${i}`));}
 }
 for(const o of config.objects){
  // No motion or frozen hold can be silently discarded by a cut or compressed to a flash.
  if(o.atMs<exposure.startMs-.01||o.endMs>exposure.endMs+.01||o.freezeMs/exposure.speed<120||o.releaseMs/exposure.speed<120||(o.releaseAtMs-o.freezeAtMs-o.freezeMs)/exposure.speed<600)issues.push('whole-freeze-release-and-hold-must-be-retained-at-readable-speed');
 }
 return {status:issues.length?'blocked':waiting.length?'waiting':'ready',issues:unique([...issues,...waiting])};
}
export function veilStateState(scene,config,elapsed,measurement,viewport={width:1920,height:1080},projectionProof){
 const readiness=veilStateReadiness(scene,config,measurement,viewport,projectionProof),valid=finite(elapsed)&&elapsed>=0&&elapsed<dynamicSceneDuration(scene),ready=valid&&readiness.status==='ready';
 const base={readiness:valid?readiness.status:'blocked',issues:unique([...readiness.issues,...(!valid?['source-elapsed-outside-original-scene']:[])]),automaticAllowed:false,canApply:false,uiAccepted:false,needsFaceReview:true,sourceClock:'scene-source-relative-ms',copy:null,objects:[]};
 if(!ready)return base;
 const fields=veilStateFieldPlan(scene,config),copy=fields[0],copyFit=measurement.fields.find(m=>m.id===copy.id).fit;
 return {...base,copy:{...copy,page:sourceTokenPageState(copyFit.pages,elapsed,copy.windows[0])},objects:config.objects.map(o=>{
  const field=fields.find(f=>f.id===o.id),fit=measurement.fields.find(m=>m.id===o.id).fit,state=veilStateObjectPhase(o,elapsed),w=state.phase==='restored'||state.phase==='finished'?field.windows[1]:field.windows[0],page=sourceTokenPageState(fit.pages,state.phase==='veiling'||state.phase==='frozen'||state.phase==='releasing'?o.freezeAtMs-.001:elapsed,w);
  return {...o,...state,text:field.text,page:{...page,visible:state.visible}};
 })};
}

const ms=(key,label)=>({key,label,type:'source-ms',min:0});
const box=(key,label)=>({key,label,type:'stage-rect',coordinates:'normalized-output',subtitleBottom:.86});
export const veilStateControls={kind:'veil-state',label:'对象遮蔽、冻结与解除',stage:'experimental-independent',automaticAllowed:false,canApply:false,uiAccepted:false,fields:[
 {key:'clock',label:'原场相对毫秒',type:'text',readonly:true,fixed:'scene-source-relative-ms'},
 {key:'binding',label:'原片绝对身份与SHA256',type:'record',readonly:true,fields:[{key:'sceneId',label:'原场ID',type:'text'},{key:'src',label:'本地原片',type:'text'},{key:'sha256',label:'原片SHA256',type:'text'},ms('startMs','原场绝对开始'),ms('endMs','原场绝对结束')]},
 {key:'sourceKind',label:'中性原创示意',type:'text',readonly:true,fixed:'illustration'},
 {key:'provenance',label:'作者对示意含义的明确说明',type:'text'},
 {key:'copyWindow',label:'完整原文独立阅读窗',type:'record',fields:[ms('atMs','开始'),ms('endMs','结束'),box('rect','完整原文区')]},
 {key:'objects',label:'持久原对象与显式时点',type:'list',preserveId:true,itemFields:[
  {key:'id',label:'持久对象ID',type:'stable-id',readonly:true},{key:'nodeId',label:'原节点ID',type:'node-ref'},
  {key:'expectedText',label:'完整原节点原文',type:'text',readonly:true,source:'scene-node-complete-text'},box('rect','对象完整包络'),
  ms('atMs','对象清晰出现'),ms('freezeAtMs','遮蔽开始'),ms('freezeMs','遮蔽过渡用时'),ms('releaseAtMs','解除开始'),ms('releaseMs','解除过渡用时'),ms('endMs','清晰对象结束'),
  {key:'appearance',label:'冻结视觉状态（不代表真实运行）',type:'record',fields:[{key:'dimOpacity',label:'冻结正文透明度',type:'number',min:.15,max:1},{key:'veilOpacity',label:'中性遮层透明度',type:'number',min:0,max:.9},{key:'blurPxAt1080',label:'1080高时正文模糊px',type:'number',min:0,max:24}]}
 ]},
 {key:'annotation',label:'作者明确补充文字（可省略）',type:'text'},
 {key:'protectedAreas',label:'额外人物/重要对象保护',type:'list',itemFields:[{key:'label',label:'保护说明',type:'text'},box('rect','保护范围')]}
]};
