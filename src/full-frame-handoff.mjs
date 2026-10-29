import {projectStoryboard} from './storyboard.mjs';
import {dynamicSceneDuration} from './dynamic-mechanisms.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const unique=values=>[...new Set(values)];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const local=value=>typeof value==='string'&&value.length>0&&!/^(?:[a-z]+:|\/|.*\.\.)/i.test(value);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const rectValid=r=>!!r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const overlap=(a,b)=>a.x<b.x+b.width-1e-7&&a.x+a.width>b.x+1e-7&&a.y<b.y+b.height-1e-7&&a.y+a.height>b.y+1e-7;
const identityValid=i=>i&&local(i.src)&&sha(i.sha256)&&Number.isInteger(i.width)&&Number.isInteger(i.height)&&i.width>0&&i.height>0;
const identityEqual=(a,b)=>!!a&&!!b&&['src','sha256','width','height','kind'].every(k=>a[k]===b[k]);
const eased=p=>{const t=Math.max(0,Math.min(1,p));return t*t*(3-2*t);};
const graphemes=text=>[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].length;

/** Original source copy, never inferred labels or a truncated transition title. */
export function fullFrameHandoffCopy(scene,config){
 return [scene.title,scene.body,scene.label,scene.sourceNote,...(scene.tags??[]).map(t=>t.text),...(scene.links??[]).map(l=>l.label),...(scene.nodes??[]).flatMap(n=>[n.text,n.detail,...(n.bullets??[])]),config?.annotation].filter(t=>typeof t==='string'&&t.length).join('\n');
}
export function fullFrameHandoffExposure(scene){
 const speed=scene.speed??1;return {startMs:(scene.startMs-scene.phaseStartMs)*speed,endMs:(scene.endMs-scene.phaseStartMs)*speed,speed};
}
/** A geometry cache is deliberately independent of playhead, but not source binding. */
export function fullFrameHandoffMeasurementKey(scene,config,viewport,fontKey){
 return JSON.stringify(stable([scene.sourceId??scene.id,scene.src,config,fullFrameHandoffCopy(scene,config),scene.window,viewport,fontKey]));
}
export function fullFrameHandoffProjectionIssues(scene,config,proof){
 const raw=proof?.rawScene,clips=proof?.clips,b=config?.binding;
 if(!raw||raw.sourceId||raw.phaseStartMs!==undefined||raw.phaseEndMs!==undefined||!b||raw.id!==b.sceneId||raw.src!==b.src||raw.startMs!==b.startMs||raw.endMs!==b.endMs||!finite(proof?.fps)||proof.fps<=0||!Array.isArray(clips)||!clips.length||new Set(clips.map(c=>c?.id)).size!==clips.length||clips.some(c=>!c?.id||!local(c.src)||![c.inSec,c.outSec,c.speed??1].every(finite)||c.inSec<0||c.outSec<=c.inSec||(c.speed??1)<=0))return ['verified-raw-source-and-retained-clips-required'];
 if(!scene.sourceId||!finite(scene.phaseStartMs)||!finite(scene.phaseEndMs))return ['actual-retained-projection-required'];
 const expected=projectStoryboard([raw],clips,proof.fps).find(p=>p.id===scene.id&&p.clipId===scene.clipId);
 return expected&&equal(expected,scene)?[]:['retained-projection-or-absolute-source-binding-stale'];
}
export function fullFrameHandoffProtectedRects(scene,config,viewport){
 const points=scene.window?[scene.window,...(scene.window.keyframes??[])]:[],windows=points.map(p=>({x:p.x,y:p.y,width:p.size,height:p.size*viewport.width/viewport.height}));
 if(windows.length&&windows.every(r=>Object.values(r).every(finite))){const x=Math.min(...windows.map(r=>r.x)),y=Math.min(...windows.map(r=>r.y));windows.push({x,y,width:Math.max(...windows.map(r=>r.x+r.width))-x,height:Math.max(...windows.map(r=>r.y+r.height))-y});}
 return [config.speakerRect,...windows,...(config.protectedAreas??[]).map(p=>p.rect)];
}
export function fullFrameHandoffIssues(scene,config,viewport={width:1920,height:1080},projectionProof){
 if(!config||config.kind!=='full-frame-blur-zoom')return ['full-frame-handoff-kind-invalid'];
 const issues=[],b=config.binding,duration=dynamicSceneDuration(scene),exposure=fullFrameHandoffExposure(scene),t=config.transition,c=config.copyWindow;
 if(config.clock!=='scene-source-relative-ms'||!b||b.sceneId!==(scene.sourceId??scene.id)||b.src!==scene.src||!identityValid({...b,kind:'video'})||![b.startMs,b.endMs,b.durationSec].every(finite)||b.startMs<0||b.endMs<=b.startMs||b.endMs>b.durationSec*1000+.01||Math.abs(b.endMs-b.startMs-duration)>.01)issues.push('verified-original-video-identity-and-absolute-clock-required');
 issues.push(...fullFrameHandoffProjectionIssues(scene,config,projectionProof));
 if(![duration,viewport.width,viewport.height,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||duration<=0||viewport.width<=0||viewport.height<=0||exposure.speed<=0||exposure.startMs<-.02||exposure.endMs>duration+.02||exposure.endMs<=exposure.startMs||!finite(scene.sourceOffsetMs)||Math.abs(scene.sourceOffsetMs-exposure.startMs)>.02)issues.push('source-phase-or-retained-exposure-invalid');
 if(!t||![t.atMs,t.peakMs,t.endMs,t.peakScale,t.maxBlurPx,t.clearHoldMs,t.origin?.x,t.origin?.y].every(finite)||t.atMs<0||t.peakMs<=t.atMs||t.endMs<=t.peakMs||t.endMs>duration+.001||t.peakMs-t.atMs<100||t.endMs-t.peakMs<100||t.endMs-t.atMs>6000||t.peakScale<=1||t.peakScale>1.6||t.maxBlurPx<=0||t.maxBlurPx>60||t.clearHoldMs<600||t.origin.x<0||t.origin.x>1||t.origin.y<0||t.origin.y>1||t.atMs-t.clearHoldMs<0||t.endMs+t.clearHoldMs>duration+.001)issues.push('explicit-blur-zoom-phases-and-clear-source-holds-required');
 if(!c||!rectValid(c.rect)||![c.atMs,c.endMs].every(finite)||c.atMs<0||c.endMs>duration+.001||c.endMs-c.atMs<1200||!fullFrameHandoffCopy(scene,config))issues.push('readable-complete-source-copy-window-required');
 if(c&&t&&c.atMs<t.endMs&&t.atMs<c.endMs)issues.push('copy-window-must-not-overlap-blur-or-zoom');
 if(!rectValid(config.speakerRect))issues.push('explicit-clear-real-speaker-slot-required');
 const keys=scene.window?.keyframes??[],points=scene.window?[scene.window,...keys]:[];
 if(points.some(p=>![p.x,p.y,p.size].every(finite)||p.size<=0||p.x<0||p.y<0||p.x+p.size>1||p.y+p.size*viewport.width/viewport.height>1))issues.push('known-speaker-window-invalid');
 if(keys.some(p=>!finite(p.atMs)||p.atMs<0||p.atMs>duration)||new Set(keys.map(p=>p.atMs)).size!==keys.length)issues.push('speaker-keyframe-clock-invalid');
 if(!Array.isArray(config.protectedAreas??[])||(config.protectedAreas??[]).some(p=>!rectValid(p?.rect)))issues.push('protected-area-invalid');
 if(!Array.isArray(scene.nodes??[])||(scene.nodes??[]).some(n=>!n?.id)||new Set((scene.nodes??[]).map(n=>n.id)).size!==(scene.nodes??[]).length)issues.push('stable-source-node-ids-required');
 const assets=unique([scene.media?.src,...(scene.nodes??[]).map(n=>n.assetSrc)].filter(Boolean)),target=config.target;
 if(target?.kind==='source-video'){
  if(assets.length)issues.push('source-video-target-would-omit-existing-evidence-media');
 }else if(target?.kind==='scene-image'){
  const i=target.identity,node=target.nodeId?(scene.nodes??[]).find(n=>n.id===target.nodeId):null,src=target.nodeId?node?.assetSrc:scene.media?.src;
  if(!identityValid(i)||i.kind!=='image'||src!==i.src||!target.nodeId&&scene.media?.kind==='video'||assets.some(src=>src!==i?.src))issues.push('target-must-bind-one-actual-authored-image-with-own-identity');
 }else issues.push('explicit-same-source-video-or-authored-image-target-required');
 if(!issues.length){
  if(fullFrameHandoffProtectedRects(scene,config,viewport).some(r=>overlap(r,c.rect)))issues.push('complete-copy-overlaps-speaker-path-or-protected-area');
  // All three phases and both clear holds must survive this actual instance.
  if(exposure.startMs>t.atMs-t.clearHoldMs+.02||exposure.endMs<t.endMs+t.clearHoldMs-.02)issues.push('retained-instance-misses-transition-or-clear-source-hold');
  if(t.clearHoldMs/exposure.speed<600)issues.push('speed-adjusted-clear-source-hold-too-short');
 }
 return unique(issues);
}
export function fullFrameHandoffTextReadiness(text,fit,window,exposure){
 if(!fit)return {status:'waiting',issues:['complete-loaded-font-measurement-required']};
 const pages=fit.pages??[],issues=[];
 if(fit.unplaceable||!pages.length||pages.flat().join('')!==text.replaceAll('\n',''))issues.push('complete-copy-text-or-actual-font-capacity-invalid');
 if(![window.atMs,window.endMs,exposure.startMs,exposure.endMs,exposure.speed].every(finite)||window.endMs<=window.atMs||exposure.speed<=0)issues.push('copy-reading-clock-invalid');
 else pages.forEach((lines,index)=>{const duration=(window.endMs-window.atMs)/pages.length,start=window.atMs+index*duration,end=start+duration,shown=Math.max(0,Math.min(end,exposure.endMs)-Math.max(start,exposure.startMs))/exposure.speed;if(shown<Math.max(1200,graphemes(lines.join(''))/14*1000))issues.push('every-complete-page-needs-retained-speed-adjusted-reading-time');});
 return {status:issues.length?'blocked':'ready',issues:unique(issues)};
}
export function fullFrameHandoffReadiness(scene,config,elapsed,measurement,sourceProof,assetProof,viewport={width:1920,height:1080},projectionProof){
 const issues=fullFrameHandoffIssues(scene,config,viewport,projectionProof),b=config?.binding;
 if(!finite(elapsed)||elapsed<0||elapsed>=dynamicSceneDuration(scene))issues.push('source-elapsed-outside-original-scene');
 if(!sourceProof||sourceProof.kind!=='same-source-video'||!b||!['src','sha256','width','height','startMs','endMs'].every(k=>sourceProof[k]===b[k])||sourceProof.muted!==true||sourceProof.audioOwner!=='external-single-track'||sourceProof.preservesFraming!==true||!finite(sourceProof.fps)||sourceProof.fps<=0||!finite(sourceProof.sourceMs)||Math.abs(sourceProof.sourceMs-(b.startMs+elapsed))>1000/sourceProof.fps+.1||!['waiting','blocked','ready'].includes(sourceProof.status))issues.push('current-same-source-loaded-muted-speaker-proof-required');
 if(sourceProof?.status==='blocked')issues.push('actual-source-decode-failed');
 if(config?.target?.kind==='scene-image'&&(!assetProof||!identityEqual(assetProof,config.target.identity)||!['waiting','blocked','ready'].includes(assetProof.status)))issues.push('current-real-image-identity-and-decode-proof-required');
 if(assetProof?.status==='blocked'&&config?.target?.kind==='scene-image')issues.push('actual-target-image-decode-failed');
 if(issues.length)return {status:'blocked',issues:unique(issues)};
 if(!measurement)return {status:'waiting',issues:['complete-loaded-font-measurement-required']};
 if(!measurement.fontKey||measurement.key!==fullFrameHandoffMeasurementKey(scene,config,viewport,measurement.fontKey)||measurement.text!==fullFrameHandoffCopy(scene,config))return {status:'blocked',issues:['stale-original-source-font-content-or-layout-measurement']};
 const text=fullFrameHandoffTextReadiness(measurement.text,measurement.fit,config.copyWindow,fullFrameHandoffExposure(scene));
 if(text.status==='blocked')return text;
 return sourceProof.status!=='ready'||config.target.kind==='scene-image'&&assetProof.status!=='ready'||text.status!=='ready'?{status:'waiting',issues:unique([...text.issues,...(sourceProof.status!=='ready'?['actual-source-decode-not-ready']:[]),...(config.target.kind==='scene-image'&&assetProof.status!=='ready'?['actual-target-image-not-ready']:[])])}:{status:'ready',issues:[]};
}
/** Symmetric original curve, one continuous source clock; no offset footage. */
export function fullFrameHandoffPhase(config,elapsed){
 const t=config.transition,enter=elapsed<t.peakMs,amount=elapsed<t.atMs||elapsed>=t.endMs?0:enter?eased((elapsed-t.atMs)/(t.peakMs-t.atMs)):1-eased((elapsed-t.peakMs)/(t.endMs-t.peakMs));
 return {phase:elapsed<t.atMs?'clear-before':elapsed<t.peakMs?'blur-zoom-in':elapsed<t.endMs?'resolve':'clear-after',scale:1+(t.peakScale-1)*amount,blurPx:t.maxBlurPx*amount,origin:t.origin,amount};
}
export function fullFrameHandoffState(scene,config,elapsed,measurement,sourceProof,assetProof,viewport={width:1920,height:1080},projectionProof){
 const readiness=fullFrameHandoffReadiness(scene,config,elapsed,measurement,sourceProof,assetProof,viewport,projectionProof),ready=readiness.status==='ready',c=config?.copyWindow,pages=measurement?.fit?.pages??[],visible=ready&&elapsed>=c.atMs&&elapsed<c.endMs,index=visible?Math.min(pages.length-1,Math.floor((elapsed-c.atMs)/(c.endMs-c.atMs)*pages.length)):0;
 return {...readiness,canApply:false,uiAccepted:false,automaticAllowed:false,needsFaceReview:true,sourceMs:config?.binding?.startMs+elapsed,mediaVisible:ready,motion:ready?fullFrameHandoffPhase(config,elapsed):null,copy:{visible,index,lines:visible?pages[index]:[]}};
}

const rect=(key,label)=>({key,label,type:'stage-rect'}),ms=(key,label)=>({key,label,type:'source-ms'});
export const fullFrameHandoffControls={kind:'full-frame-blur-zoom',label:'整幅模糊缩放交接（原创过渡）',stage:'experimental-independent',canApply:false,uiAccepted:false,automaticAllowed:false,fields:[{key:'clock',label:'时钟',type:'text',fixed:'scene-source-relative-ms',readonly:true},{key:'binding',label:'已核验原片身份',type:'record',readonly:true,fields:[]},{key:'target',label:'整幅媒体',type:'record',fields:[{key:'kind',label:'原片或已绑定图片',type:'select',options:['source-video','scene-image']},{key:'nodeId',label:'图片来源对象（空为本场媒体）',type:'node-ref'},{key:'identity',label:'已核验图片身份',type:'record',readonly:true,fields:[]}]},{key:'transition',label:'模糊缩放相位',type:'record',fields:[ms('atMs','开始'),ms('peakMs','模糊缩放峰值'),ms('endMs','恢复清晰'),ms('clearHoldMs','前后各自清晰停留'),{key:'peakScale',label:'峰值尺度',type:'number',min:1.001,max:1.6},{key:'maxBlurPx',label:'峰值模糊像素',type:'number',min:.1,max:60},{key:'origin',label:'缩放中心',type:'record',fields:[{key:'x',label:'横向比例',type:'number',min:0,max:1},{key:'y',label:'纵向比例',type:'number',min:0,max:1}]}]},{key:'copyWindow',label:'完整原文阅读',type:'record',fields:[ms('atMs','开始'),ms('endMs','结束'),rect('rect','文字区域')]},rect('speakerRect','持续清晰真人窗'),{key:'protectedAreas',label:'手动保护区',type:'list',itemFields:[{key:'label',label:'说明',type:'text'},rect('rect','区域')]},{key:'annotation',label:'作者可编辑说明',type:'text'}]};
