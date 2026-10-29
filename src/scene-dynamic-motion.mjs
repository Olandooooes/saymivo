import {requiresDynamicMatte,dynamicMatteEvidenceIssues,dynamicMatteElementIssues,dynamicMatteFrameAt,dynamicMatteVisibleBounds} from './dynamic-matte.mjs';
import {matchingSource,projectStoryboard} from './storyboard.mjs';
import {presentationSize} from './presentation.mjs';
import {completeSourceCopyInventory} from './complete-source-copy.mjs';
import {dynamicMechanismIssues,evidenceHandoffItems} from './dynamic-mechanisms.mjs';
import {phraseChoreographyIssues,phraseKinds} from './phrase-choreography.mjs';
import {sourceTokenTransferIssues} from './source-token-transfer.mjs';
import {persistentMotionIssues} from './persistent-motion.mjs';
import {typedClockMotionIssues} from './typed-clock-motion.mjs';
import {conditionalSetViewIssues} from './conditional-set-view.mjs';
import {conditionalSetCurrentContext} from './conditional-set-integration.mjs';
import {fieldRollBoardIssues} from './field-roll-board.mjs';
import {pathRunnerIssues} from './path-runner.mjs';
import {funnelFlowIssues} from './funnel-flow.mjs';
import {quantitativeIssues} from './quantitative-chart.mjs';
import {progressiveUiIssues,taskTracksIssues} from './progressive-scenes.mjs';
import {regionFocusMedia} from './region-focus.mjs';
import {pairedRelationsIssues} from './paired-relations.mjs';
import {veilStateIssues} from './veil-state.mjs';
import {fullFrameHandoffIssues} from './full-frame-handoff.mjs';
import {audioClockEvidenceIssues,audioClockSceneSegments,audioClockDomPlaybackIssues} from './audio-clock-integration.mjs';
import {displayFontConfig} from './display-fonts.mjs';

const clone=value=>structuredClone(value);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
const serial=value=>JSON.stringify(stable(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validSrc=value=>typeof value==='string'&&value.length>0&&!/^(?:https?:|file:|\/)|(?:^|\/)\.\.(?:\/|$)/.test(value);
const validSha=value=>/^[a-f0-9]{64}$/i.test(value??'');
const identity=value=>value?{src:value.src,sha256:value.sha256,width:value.width,height:value.height,kind:value.kind,...(value.durationSec===undefined?{}:{durationSec:value.durationSec})}:null;
const validIdentity=value=>value&&validSrc(value.src)&&validSha(value.sha256)&&Number.isInteger(value.width)&&value.width>0&&Number.isInteger(value.height)&&value.height>0&&['video','image'].includes(value.kind)&&(value.durationSec===undefined||finite(value.durationSec)&&value.durationSec>0);
const authored=scene=>{const {dynamicMotion,visualPreset,...rest}=scene;return rest;};
// A current selection must bind all of its current saved fields, without
// recursively embedding the history of the selection it replaced. Keep the
// current key's nonce/base/config and every other field; only its historical
// selectionSignature is inert. Malformed/non-object keys remain exact strings
// so changing an invalid current selection still invalidates an old receipt.
function currentSelectionMotion(motion){
 if(!motion||typeof motion!=='object'||Array.isArray(motion))return motion??null;
 if(typeof motion.draftKey!=='string')return motion;
 try{
  const parsed=JSON.parse(motion.draftKey);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return motion;
  const {selectionSignature,...currentKey}=parsed;
  return {...motion,draftKey:serial(currentKey)};
 }catch{return motion;}
}
const selection=scene=>serial({dynamicMotion:currentSelectionMotion(scene.dynamicMotion),visualPreset:scene.visualPreset??null});
const oldKinds=new Set(['flip-board','number-counter','evidence-handoff','glass-capsules','orbit-flow-variant','bar-group-variant','hub-branch-flow','screenshot-region-focus','bilingual-board-transition']);
const receipts=new WeakMap();
let sequence=0;

/** One builder is shared by the live editor and offline export. Loading status is
 * intentionally excluded from signatures; actual readiness is measured below. */
export function dynamicMotionEnvironmentFromState(state,evidence={}){
 const {scenes,...presentationWithoutScenes}=state.presentation??{};
 return {clips:state.clips??[],viewport:presentationSize(state.presentation),fps:state.meta?.fps,appearance:{presentationWithoutScenes,accentColor:state.accentColor,meta:state.meta},font:{key:state.presentation?.displayFont??'none',status:evidence.font?.status??'loading'},sourceIdentity:evidence.sourceIdentity,assets:evidence.assets??[],...(evidence.audioEvidence?{audioEvidence:evidence.audioEvidence}:{}),contextSnapshot:liveContext(state,evidence.contextSnapshot,!!evidence.audioEvidence),...(evidence.matte?{matte:evidence.matte}:{}),...(evidence.matteEvidence?{matteEvidence:evidence.matteEvidence}:{})};
}
function liveContext(state,snapshot,withAudio=false){
 const keys=['captions','brolls','music',...(withAudio?['brollAssets']:[])];
 if(!keys.some(key=>Object.hasOwn(state,key)))return snapshot??null;
 return {...(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)?snapshot:{}),...Object.fromEntries(keys.filter(key=>Object.hasOwn(state,key)).map(key=>[key,state[key]]))};
}
function dependencies(environment){return {clips:environment.clips??[],viewport:environment.viewport,fps:environment.fps,fontKey:environment.font?.key??'none',appearance:environment.appearance??null,sourceIdentity:identity(environment.sourceIdentity),assets:(environment.assets??[]).map(identity).sort((a,b)=>String(a?.src).localeCompare(String(b?.src))),...(environment.audioEvidence?{audioEvidence:environment.audioEvidence}:{}),contextSnapshot:environment.contextSnapshot??null,matte:environment.matte??null,...(environment.matteEvidence?{matteEvidence:environment.matteEvidence}:{})};}
export function sceneDynamicMotionSignature(scene,environment){return serial({scene:authored(scene),dependencies:dependencies(environment)});}
export function sceneDynamicMotionDraftKey(draft){return serial({nonce:draft.nonce,baseSignature:draft.baseSignature,selectionSignature:draft.selectionSignature,config:draft.config});}
function instances(scene,environment){return (environment.clips??[]).filter(clip=>matchingSource(scene,clip)&&clip.outSec*1000>scene.startMs&&clip.inSec*1000<scene.endMs).map(clip=>({id:clip.id,src:clip.src,inSec:clip.inSec,outSec:clip.outSec,speed:clip.speed??1}));}
function baseIssues(scene,environment){
 const issues=[],clips=environment.clips??[],source=environment.sourceIdentity;
 if(scene.sourceId||scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined||scene.sourceOffsetMs!==undefined)issues.push('请使用原始源时间场景，不能保存投影片段');
 if(!scene.id||!validSrc(scene.src)||!finite(scene.startMs)||!finite(scene.endMs)||scene.startMs<0||scene.endMs<=scene.startMs)issues.push('原场身份或源时间无效');
 if(!validIdentity(source)||source.kind!=='video'||source.src!==scene.src)issues.push('需要当前真实原视频的SHA与解码尺寸');
 if(source?.durationSec!==undefined&&scene.endMs>source.durationSec*1000+.01)issues.push('原场超过实际原视频时长');
 if(!(environment.viewport?.width>0)||!(environment.viewport?.height>0)||!finite(environment.fps)||environment.fps<=0)issues.push('输出尺寸或帧率无效');
 if(!environment.font?.key)issues.push('缺少展示字体身份');
 if(!clips.length||new Set(clips.map(clip=>clip.id)).size!==clips.length||clips.some(clip=>!clip.id||!validSrc(clip.src)||![clip.inSec,clip.outSec,clip.speed??1].every(finite)||clip.inSec<0||clip.outSec<=clip.inSec||(clip.speed??1)<=0))issues.push('剪辑实例身份、边界或速度无效');
 if(!instances(scene,environment).length)issues.push('本场没有当前保留实例');
 const required=[scene.media?.src,...(scene.nodes??[]).map(node=>node.assetSrc)].filter(Boolean),assets=environment.assets??[];
 if(new Set(assets.map(asset=>asset.src)).size!==assets.length)issues.push('素材身份重复');
 for(const src of required)if(!assets.some(asset=>asset.src===src&&validIdentity(asset)))issues.push('需要实际资料素材身份：'+src);
 return [...new Set(issues)];
}
function mediaRetentionIssues(scene,config){
 const declared=[...new Set([scene.media?.src,...(scene.nodes??[]).map(node=>node.assetSrc)].filter(Boolean))];
 if(!declared.length)return [];
 let used=[];
 if(config?.kind==='evidence-handoff')used=evidenceHandoffItems(scene,config).map(item=>item.media.src);
 else if(config?.kind==='screenshot-region-focus')used=[regionFocusMedia(scene,config)?.src];
 else if(config?.kind==='orbit-flow-variant')used=[scene.media?.src];
 else if(config?.kind==='hub-branch-flow')used=(scene.nodes??[]).map(node=>node.assetSrc);
 else if(config?.kind==='persistent-entities')used=(config.mediaStack?.items??[]).map(item=>item.assetIdentity?.src);
 else if(config?.kind==='conditional-set')used=(config.actors??[]).map(actor=>actor.assetIdentity?.src);
 else if(config?.kind==='full-frame-blur-zoom'&&config.target?.kind==='scene-image')used=[config.target.identity?.src];
 const missing=declared.filter(src=>!used.includes(src));
 return missing.length?['当前机制不显示本场已有资料，请选择证据类或保留原编排：'+missing.join('、')]:[];
}
function configurationIssues(scene,config,environment){
 const proof={rawScene:scene,clips:environment.clips,fps:environment.fps},viewport=environment.viewport,mediaIssues=mediaRetentionIssues(scene,config);
 if(mediaIssues.length)return mediaIssues;
 try{
  if(config?.kind==='conditional-set'){
   const projections=projectStoryboard([scene],environment.clips,environment.fps);
   if(!projections.length)return ['没有可验证的保留实例'];
   return [...new Set(projections.flatMap(projected=>conditionalSetViewIssues(config,conditionalSetCurrentContext(scene,projected,environment.sourceIdentity,environment.assets,environment.clips,environment.fps,environment.contextSnapshot?.captions??[],viewport))))];
  }
  if(config?.kind==='field-roll-board'){
   if(config.binding?.sha256!==environment.sourceIdentity?.sha256)return ['字段滚动绑定的原片SHA已变化'];
   const projections=projectStoryboard([scene],environment.clips,environment.fps);
   if(!projections.length)return ['没有可验证的保留实例'];
   return [...new Set(projections.flatMap(projected=>fieldRollBoardIssues(projected,config,viewport,{...proof,captions:environment.contextSnapshot?.captions??[]})))];
  }
  if(config?.kind==='typed-data-clock'){
   const projections=projectStoryboard([scene],environment.clips,environment.fps);
   if(!projections.length)return ['没有可验证的保留实例'];
   return [...new Set(projections.flatMap(projected=>typedClockMotionIssues(projected,scene,config,environment.sourceIdentity,viewport,{...proof,captions:environment.contextSnapshot?.captions??[]})))];
  }
  if(config?.kind==='persistent-entities'){
   const projections=projectStoryboard([scene],environment.clips,environment.fps);
   if(!projections.length)return ['没有可验证的保留实例'];
   return [...new Set(projections.flatMap(projected=>persistentMotionIssues(projected,scene,config,environment.sourceIdentity,environment.assets,viewport,{...proof,captions:environment.contextSnapshot?.captions??[]})))];
  }
  if(config?.kind==='audio-clock-ab')return [...(config.binding?.sha256!==environment.sourceIdentity?.sha256?['A/B场景的原片SHA已变化']:[]),...audioClockEvidenceIssues(environment,config,environment.audioEvidence),...audioClockSceneSegments(scene,config,environment.clips,environment.fps,viewport).issues];
  if(['paired-relations','veil-state','full-frame-blur-zoom'].includes(config?.kind)){
   const binding=config.binding,source=environment.sourceIdentity;
   if(binding?.src!==source?.src||binding?.sha256!==source?.sha256)return ['机制绑定的原片SHA与当前真实素材身份不一致'];
   if(config.kind==='full-frame-blur-zoom'){
    if(binding.width!==source.width||binding.height!==source.height||binding.durationSec!==source.durationSec)return ['整幅媒体绑定的真实尺寸或时长已变化'];
    if(config.target?.kind==='scene-image'){
     const image=config.target.identity,current=(environment.assets??[]).find(a=>a.src===image?.src);
     if(!current||serial(identity(current))!==serial(identity(image)))return ['整幅图片必须绑定当前真实原图的SHA与尺寸'];
    }
   }
   const projections=projectStoryboard([scene],environment.clips,environment.fps);
   if(!projections.length)return ['没有可验证的实际保留实例'];
   return [...new Set(projections.flatMap(projected=>{
    const issues=(config.kind==='paired-relations'?pairedRelationsIssues:config.kind==='veil-state'?veilStateIssues:fullFrameHandoffIssues)(projected,config,viewport,proof),speed=projected.speed??1,start=projected.sourceOffsetMs??0,end=start+(projected.endMs-projected.startMs)*speed,c=config.copyWindow;
    // Native font measurement decides per-page reading. These structural gates
    // already reject a cut discarding the independent copy/action windows.
    if(!c||c.atMs<start-.02||c.endMs>end+.02)issues.push('完整原文窗口必须全部保留在本实例中');
    if(config.kind==='paired-relations'&&(config.phases??[]).some(q=>q.atMs<start-.02||q.atMs+q.moveMs+q.holdMs>end+.02||q.holdMs/speed<1200))issues.push('配对移动和完整停留必须保留且不能因变速成为闪现');
    if(config.kind==='veil-state'&&(config.objects??[]).some(o=>o.atMs<start-.02||o.endMs>end+.02||o.freezeMs/speed<120||o.releaseMs/speed<120||(o.releaseAtMs-o.freezeAtMs-o.freezeMs)/speed<600))issues.push('遮蔽、冻结和恢复必须全部保留且具有可见时长');
    return issues.map(issue=>'保留实例 '+projected.id+'：'+issue);
   }))];
  }
  if(oldKinds.has(config?.kind))return [...dynamicMechanismIssues(scene,config,viewport),...dynamicMatteEvidenceIssues(scene,config,environment)];
  if(phraseKinds.includes(config?.kind))return phraseChoreographyIssues(scene,config,viewport);
  if(config?.kind==='source-token-transfer')return sourceTokenTransferIssues(scene,config,viewport);
  if(['closed-loop-runner','bounded-agent-runner'].includes(config?.kind))return pathRunnerIssues(scene,config,viewport,proof);
  if(config?.kind==='quantified-funnel-flow')return funnelFlowIssues(scene,config,viewport);
  if(config?.kind==='quantitative-chart')return quantitativeIssues(scene,config,viewport,proof);
  if(config?.kind==='progressive-ui')return progressiveUiIssues(scene,config,viewport);
  if(config?.kind==='task-tracks')return taskTracksIssues(scene,config);
  return ['未知独立动态机制'];
 }catch{return ['动态参数尚未完整或格式无效'];}
}
export function createSceneDynamicMotionDraft(scene,config,environment){
 const issues=baseIssues(scene,environment);if(issues.length)throw Error(issues.join('；'));
 return {version:1,nonce:globalThis.crypto?.randomUUID?.()??`local-${Date.now()}-${++sequence}`,sceneId:scene.id,clock:'scene-source-relative-ms',binding:{src:scene.src,sha256:environment.sourceIdentity.sha256,sceneId:scene.id,clipId:scene.clipId,startMs:scene.startMs,endMs:scene.endMs,instances:instances(scene,environment)},baseSignature:sceneDynamicMotionSignature(scene,environment),selectionSignature:selection(scene),config:clone(config),sourceIdentity:clone(identity(environment.sourceIdentity)),assetIdentities:(environment.assets??[]).map(asset=>clone(identity(asset))),...(environment.audioEvidence?{audioEvidence:clone(environment.audioEvidence)}:{}),...(requiresDynamicMatte(config)&&environment.matteEvidence?{matteEvidence:clone(environment.matteEvidence)}:{}),contextSnapshot:clone(environment.contextSnapshot??null)};
}
/** Preview carries the same binding as saved output, but conveys no apply proof. */
export function previewSceneDynamicMotion(draft){return {version:1,clock:draft.clock,binding:clone(draft.binding),baseSignature:draft.baseSignature,draftKey:sceneDynamicMotionDraftKey(draft),configSignature:serial(draft.config),config:clone(draft.config),sourceIdentity:clone(draft.sourceIdentity),assetIdentities:clone(draft.assetIdentities),...(draft.audioEvidence?{audioEvidence:clone(draft.audioEvidence)}:{}),...(draft.matteEvidence?{matteEvidence:clone(draft.matteEvidence)}:{}),contextSnapshot:clone(draft.contextSnapshot??null)};}
function bindingIssues(saved,scene,environment){
 const issues=baseIssues(scene,environment),binding=saved?.binding;
 if(requiresDynamicMatte(saved?.config)&&serial(saved?.matteEvidence)!==serial(environment.matteEvidence))issues.push('人物序列当前身份已变化，请重新完整预览');
 if(saved?.version!==1||saved?.clock!=='scene-source-relative-ms'||binding?.sceneId!==scene.id||binding?.src!==scene.src||binding?.clipId!==scene.clipId||binding?.sha256!==environment.sourceIdentity?.sha256||binding?.startMs!==scene.startMs||binding?.endMs!==scene.endMs||serial(binding?.instances)!==serial(instances(scene,environment))||saved?.baseSignature!==sceneDynamicMotionSignature(scene,environment)||serial(saved?.sourceIdentity)!==serial(identity(environment.sourceIdentity))||serial(saved?.assetIdentities?.map(identity).sort((a,b)=>String(a?.src).localeCompare(String(b?.src))))!==serial((environment.assets??[]).map(identity).sort((a,b)=>String(a?.src).localeCompare(String(b?.src)))))issues.push('原场、原文、剪口、实例、素材、字体或输出已变化，请重新预览');
 let keyBinding;try{keyBinding=JSON.parse(saved?.draftKey);}catch{}
 if(saved?.config?.kind==='audio-clock-ab'&&serial(saved.audioEvidence)!==serial(environment.audioEvidence))issues.push('A/B音源、PCM分析或播放资产已变化，请重新预览');
 if(!keyBinding?.nonce||keyBinding.baseSignature!==saved?.baseSignature||serial(keyBinding.config)!==serial(saved?.config)||saved?.configSignature!==serial(saved?.config))issues.push('动态参数与已预览版本身份不一致，请重新建立草稿');
 return [...new Set([...issues,...configurationIssues(scene,saved?.config,environment)])];
}
export function validateSavedSceneDynamicMotion(scene,environment){
 if(!scene.dynamicMotion)return {ok:true,issues:[]};
 const issues=bindingIssues(scene.dynamicMotion,scene,environment);
 if(scene.visualPreset)issues.push('独立动态机制与视觉预设不能同时启用');
 return {ok:issues.length===0,issues};
}
export function assessSceneDynamicMotion(draft,scene,environment,receipt){
 const issues=bindingIssues(previewSceneDynamicMotion(draft),scene,environment);
 if(draft.sceneId!==scene.id||draft.selectionSignature!==selection(scene))issues.push('当前场景的动效选择已变化，请重新建立草稿');
 const proof=receipt&&receipts.get(receipt),key=sceneDynamicMotionDraftKey(draft);
 if(!proof||proof.draftKey!==key||proof.signature!==sceneDynamicMotionSignature(scene,environment)||proof.selectionSignature!==selection(scene))issues.push('需要当前草稿实际完整预览、字体/全文/真人安全测量与人工复核');
 return {ok:issues.length===0,canApply:issues.length===0,issues:[...new Set(issues)]};
}

// Receipts never accept displayedFields or serialized flags supplied by a caller
// as a substitute for actual rendered text.
const canonical=text=>String(text??'').replace(/[\r\n]/g,'');
const rectValid=r=>r&&[r.left,r.top,r.right,r.bottom,r.width,r.height].every(finite)&&r.width>0&&r.height>0;
const inside=(r,box,tolerance=1)=>r.left>=box.left-tolerance&&r.top>=box.top-tolerance&&r.right<=box.right+tolerance&&r.bottom<=box.bottom+tolerance;
const intersection=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
function colorAlpha(value){
 const color=String(value??'').trim().toLowerCase();
 if(color==='transparent')return 0;
 if(/^#[a-f\d]{8}$/i.test(color))return parseInt(color.slice(-2),16)/255;
 if(/^#[a-f\d]{4}$/i.test(color))return parseInt(color.slice(-1),16)/15;
 const match=color.match(/^[a-z][a-z0-9-]*\((.*)\)$/);
 if(match){const parts=match[1].split(/\s*[,/]\s*|\s+/).filter(Boolean),hasAlpha=match[1].includes('/')||/^(?:rgba?|hsla?)\(/.test(color)&&parts.length===4;if(hasAlpha){const alpha=parts.at(-1),number=Number.parseFloat(alpha);return Number.isFinite(number)?number/(alpha.endsWith('%')?100:1):0;}}
 return 1;
}
function drawnGlyph(style){
 const fill=style.webkitTextFillColor||style.getPropertyValue?.('-webkit-text-fill-color')||style.color,stroke=style.webkitTextStrokeColor||style.getPropertyValue?.('-webkit-text-stroke-color'),width=Number.parseFloat(style.webkitTextStrokeWidth||style.getPropertyValue?.('-webkit-text-stroke-width')||'0');
 return colorAlpha(fill)>=.5||width>=.75&&colorAlpha(stroke)>=.5;
}
function styleVisible(element,root,view){
 let opacity=1;
 for(let item=element;item;item=item.parentElement){
  const style=view.getComputedStyle(item);opacity*=Number(style.opacity||1);
  if(/opacity\(\s*(?:0(?:\.0*)?|0%)\s*\)/.test(style.filter??''))return false;
  if(item.hidden||item.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||opacity<.98)return false;
  if(item===root)return true;
 }
 return false;
}
function visibleRect(rect,element,root,view,stage){
 if(!rectValid(rect)||!inside(rect,stage))return false;
 for(let item=element;item;item=item.parentElement){
  const style=view.getComputedStyle(item),box=item.getBoundingClientRect();
  if((/(hidden|clip|scroll|auto)/.test(style.overflow+' '+style.overflowX+' '+style.overflowY))&&!inside(rect,box))return false;
  const clip=style.clipPath;
  // An arbitrary mask cannot prove that the full glyph was drawn. A completed
  // inset reveal is measurable; intermediate masks simply do not count as copy.
  if(clip&&clip!=='none'){
   const match=clip.match(/^inset\(([^)]*)\)$/);if(!match)return false;
   const values=match[1].split(/\s+/).filter(Boolean);if(!values.length||values.length>4||values.some(value=>!/^[-.\d]+(?:px|%)?$/.test(value)))return false;
   const a=values[0],b=values[1]??a,c=values[2]??a,d=values[3]??b,unit=(value,dimension)=>parseFloat(value)*(value.endsWith('%')?dimension/100:1),mask={left:box.left+unit(d,box.width),right:box.right-unit(b,box.width),top:box.top+unit(a,box.height),bottom:box.bottom-unit(c,box.height)};
   if(!inside(rect,mask))return false;
  }
  if(item===root)break;
 }
 return true;
}
const mediaSourceMatches=(media,src)=>{try{return decodeURIComponent(new URL(media.currentSrc||media.src,media.ownerDocument?.baseURI??'http://localhost/').pathname).endsWith('/'+src);}catch{return false;}};
const textPlanes='[data-measured-text],[data-full-phrase],[data-complete-scene-copy],[data-persistent-source],[data-chart-field],[data-path-copy-field],[data-funnel-text],[data-source-copy-window],[data-progressive-complete-text],[data-veil-complete-text],[data-full-frame-copy],[data-audio-full-text]';
function observeDom(root,draft,projection,sourceMs,readiness,environment){
 const issues=[],doc=root?.ownerDocument,view=doc?.defaultView,key=sceneDynamicMotionDraftKey(draft),stage=root?.getBoundingClientRect?.();
 if(!root?.isConnected||!doc?.createTreeWalker||!doc?.createRange||!view?.getComputedStyle||!rectValid(stage))return {issues:['需要已挂载且具有真实布局的浏览器预览DOM'],texts:[],assets:[]};
 if(root.getAttribute('data-dynamic-draft-key')!==key||root.getAttribute('data-dynamic-projection-id')!==projection.id||root.getAttribute('data-dynamic-preview-kind')!==draft.config.kind||root.getAttribute('data-dynamic-source-ms')===null||!finite(Number(root.getAttribute('data-dynamic-source-ms')))||Math.abs(Number(root.getAttribute('data-dynamic-source-ms'))-sourceMs)>.1)return {issues:['预览DOM不是当前草稿、当前实例或当前源时钟'],texts:[],assets:[]};
 if(root.getAttribute('data-dynamic-preview-status')!=='ready'||readiness?.projectionId!==projection.id||['status','nativeStatus','sourceStatus','assetStatus'].some(name=>readiness?.[name]!=='ready')||readiness?.issues?.length)return {issues:['等待当前实例原生renderer、原声人物源和资料素材就绪'],texts:[],assets:[]};
 if(draft.config.kind==='audio-clock-ab')issues.push(...audioClockDomPlaybackIssues(root,draft,projection,sourceMs,environment.fps));
 const selectedFont=displayFontConfig(environment.font?.key);
 if(!doc.fonts||doc.fonts.status!=='loaded')issues.push('展示字体仍未实际加载');
 if(selectedFont){const faces=[];doc.fonts?.forEach?.(face=>faces.push(face));if(!faces.some(face=>face.family.replace(/[\"']/g,'')===selectedFont.family&&face.status==='loaded'))issues.push('所选展示字体的实际FontFace尚未加载');}
 if(root.querySelector('[data-layout-error],[data-mechanism-unavailable],[data-layout-status="blocked"]'))issues.push('实际renderer报告文字溢出或机制不可用');
 const person=[...root.querySelectorAll('[data-dynamic-real-source]')].filter(element=>element.getAttribute('data-dynamic-real-source')===draft.binding.src&&styleVisible(element,root,view)&&rectValid(element.getBoundingClientRect()));
 let actualPerson=false;
 for(const element of person){
  for(const video of element.querySelectorAll('video')){
   const box=video.getBoundingClientRect(),visible=intersection(box,element.getBoundingClientRect());
   if(styleVisible(video,root,view)&&mediaSourceMatches(video,draft.binding.src)&&video.readyState>=2&&!video.error&&video.videoWidth===draft.sourceIdentity.width&&video.videoHeight===draft.sourceIdentity.height&&Math.abs(video.currentTime-sourceMs/1000)<.6&&visible.right>visible.left&&visible.bottom>visible.top&&inside(element.getBoundingClientRect(),stage))actualPerson=true;
  }
 }
 if(requiresDynamicMatte(draft.config)&&draft.matteEvidence){for(const image of [...root.querySelectorAll('img')].filter(image=>image.closest('[data-dynamic-real-matte]'))){const f=dynamicMatteFrameAt(draft.matteEvidence,sourceMs),bounds=f&&dynamicMatteVisibleBounds(image,f,view);if(bounds&&bounds.width>0&&bounds.height>0&&styleVisible(image,root,view)&&visibleRect(bounds,image,root,view,stage)&&!dynamicMatteElementIssues(image,draft.matteEvidence,sourceMs,key).length)actualPerson=true;}}
 if(!actualPerson)issues.push('当前帧未测得同一原片、同一源时钟的已解码可见真人视频或核验RGBA人物帧');
 for(const image of root.querySelectorAll('img'))if(styleVisible(image,root,view)&&(!image.complete||!(image.naturalWidth>0)||!(image.naturalHeight>0)))issues.push('可见资料图片尚未成功解码');
 const observedAssets=[];
 for(const asset of draft.assetIdentities){
  const media=[...root.querySelectorAll(asset.kind==='video'?'video':'img')].find(element=>mediaSourceMatches(element,asset.src)&&styleVisible(element,root,view)&&rectValid(element.getBoundingClientRect())&&visibleRect(element.getBoundingClientRect(),element,root,view,stage)&&(asset.kind==='video'?element.readyState>=2&&element.videoWidth===asset.width&&element.videoHeight===asset.height:element.complete&&element.naturalWidth===asset.width&&element.naturalHeight===asset.height));
  if(media)observedAssets.push(asset.src);
 }
 const groups=new Map(),all=[],walker=doc.createTreeWalker(root,4),safeStage={left:stage.left,top:stage.top,right:stage.right,bottom:stage.top+stage.height*.86,width:stage.width,height:stage.height*.86};
 let textNode;
 while((textNode=walker.nextNode())){
  const text=textNode.nodeValue,element=textNode.parentElement;
  if(!text||text==='\u00a0'||!element||!styleVisible(element,root,view)||element.closest('script,style,[data-dynamic-proof-ignore]'))continue;
  const style=view.getComputedStyle(element),size=Number.parseFloat(style.fontSize);
  if(!drawnGlyph(style))continue;
  if(!(size>0)||!doc.fonts?.check(`${style.fontWeight||400} ${style.fontSize} ${style.fontFamily}`)){issues.push('可见文字尚未使用已加载的实际字体');continue;}
  const range=doc.createRange();range.selectNodeContents(textNode);const boxes=[...range.getClientRects()];range.detach?.();
  if(!boxes.length||boxes.some(box=>!visibleRect(box,element,root,view,safeStage)))continue;
  const plane=element.closest(textPlanes)??root;
  if(selectedFont&&plane!==root&&style.fontFamily.split(',')[0].trim().replace(/[\"']/g,'')!==selectedFont.family){issues.push('正文实际字体与当前所选字体不一致');continue;}
  if(plane!==root&&!root.contains(plane))continue;
  groups.set(plane,(groups.get(plane)??'')+text);all.push(text);
 }
 // Only drawn text nodes enter coverage. Hidden pages, aria labels, data-text
 // attributes, off-canvas glyphs, masks and caller supplied inventories do not.
 return {issues:[...new Set(issues)],texts:[...new Set([all.join(''),...groups.values()].map(canonical).filter(Boolean))],assets:observedAssets};
}
function markText(coverage,expected,observed){
 if(!observed)return;
 if(observed.includes(expected)){coverage.fill(true);return;}
 let at=expected.indexOf(observed);
 while(at>=0){for(let i=at;i<at+observed.length;i++)coverage[i]=true;at=expected.indexOf(observed,at+1);}
 // A paginated plane can straddle the boundary between two authored fields.
 // Match exact boundary substrings without deleting spaces or short words.
 for(let size=1;size<=Math.min(expected.length,observed.length);size++){
  if(expected.startsWith(observed.slice(-size)))for(let i=0;i<size;i++)coverage[i]=true;
  if(expected.endsWith(observed.slice(0,size)))for(let i=expected.length-size;i<expected.length;i++)coverage[i]=true;
 }
}

/** A receipt is local authority derived from real DOM samples, not a durable
 * claim about every source frame or an external JSON approval. */
export function createDynamicMotionRenderSession(draft,scene,environment){
 const captured=clone(draft),key=sceneDynamicMotionDraftKey(captured),signature=sceneDynamicMotionSignature(scene,environment),initialIssues=bindingIssues(previewSceneDynamicMotion(captured),scene,environment),inventory=completeSourceCopyInventory(scene).map(item=>({...item,text:canonical(item.text)}));
 if(captured.selectionSignature!==selection(scene))initialIssues.push('动效选择已变化');
 const projections=projectStoryboard([scene],environment.clips,environment.fps),states=new Map(projections.map(projection=>[projection.id,{projection,times:[],coverage:inventory.map(item=>Array(item.text.length).fill(false)),assets:new Set(),issues:[],rejections:{native:0,dom:0,groups:[]}} ]));
 const bounds=projection=>({start:scene.startMs+(projection.sourceOffsetMs??0),end:scene.startMs+(projection.sourceOffsetMs??0)+(projection.endMs-projection.startMs)*(projection.speed??1)});
 const timing=state=>{
  const points=[...new Set(state.times)].sort((a,b)=>a-b),{start,end}=bounds(state.projection),speed=state.projection.speed??1,tolerance=1000/environment.fps*speed*1.6+2,maxGap=Math.max(250,1000/environment.fps*speed*2.1);
  return !!points.length&&points[0]<=start+tolerance&&points.at(-1)>=end-tolerance&&points.every((time,index)=>index===0||time-points[index-1]<=maxGap);
 };
 // Observability only. The predicate, accepted samples and receipt are above/
 // below unchanged; sparse external screenshots cannot substitute these times.
 const timingDiagnostics=state=>{
  const points=[...new Set(state.times)].sort((a,b)=>a-b),{start,end}=bounds(state.projection),speed=state.projection.speed??1,tolerance=1000/environment.fps*speed*1.6+2,maxGap=Math.max(250,1000/environment.fps*speed*2.1),gaps=points.slice(1).map((toMs,i)=>({fromMs:points[i],toMs,gapMs:toMs-points[i]}));
  return {sourceStartMs:start,sourceEndMs:end,uniqueSamples:points.length,firstSourceMs:points[0]??null,lastSourceMs:points.at(-1)??null,requiredFirstAtOrBeforeMs:start+tolerance,requiredLastAtOrAfterMs:end-tolerance,gapLimitMs:maxGap,largestGapMs:gaps.length?gaps.reduce((max,g)=>Math.max(max,g.gapMs),0):null,missingStart:!points.length||points[0]>start+tolerance,missingEnd:!points.length||points.at(-1)<end-tolerance,gaps:gaps.filter(g=>g.gapMs>maxGap)};
 };
 const requiredAssets=[...new Set([scene.media?.src,...(scene.nodes??[]).map(node=>node.assetSrc)].filter(Boolean))];
 // Diagnostic history cannot add accepted times/text/assets or grant a receipt.
 const reject=(state,kind,sourceMs,issues)=>{
  state.rejections[kind]++;const groups=state.rejections.groups,last=groups.at(-1),reasons=[...new Set(issues)];
  if(last&&last.kind===kind&&JSON.stringify(last.issues)===JSON.stringify(reasons)&&sourceMs>=last.toMs&&sourceMs-last.toMs<=150){last.toMs=sourceMs;last.samples++;}
  else{groups.push({kind,fromMs:sourceMs,toMs:sourceMs,samples:1,issues:reasons});if(groups.length>256)groups.shift();}
 };
 const getProgress=()=>({draftKey:key,projections:[...states.values()].map(state=>({id:state.projection.id,samples:state.times.length,covered:timing(state),timing:timingDiagnostics(state),rejections:clone(state.rejections),missingAssets:requiredAssets.filter(src=>!state.assets.has(src)),missingText:inventory.filter((_,index)=>state.coverage[index].some(value=>!value)).map(item=>item.id),issues:[...state.issues]}))});
 return {
  recordUnavailable(projectionId,sourceMs,readiness){
   const state=states.get(projectionId);if(!state||!finite(sourceMs))return;
   const {start,end}=bounds(state.projection);if(sourceMs<start-.1||sourceMs>end+.1)return;
   const statuses=readiness?['status','nativeStatus','sourceStatus','assetStatus'].filter(k=>readiness[k]!=='ready').map(k=>k+':'+readiness[k]):['native-report-not-yet-available'];
   reject(state,'native',sourceMs,[...statuses,...(readiness?.issues??[])]);
  },
  recordFrame(root,projectionId,sourceMs,readiness){
   const state=states.get(projectionId);
   if(sceneDynamicMotionDraftKey(draft)!==key)return {ok:false,issues:['参数已变化，请新建预览会话']};
   if(!state||!finite(sourceMs))return {ok:false,issues:['未知保留实例或源时钟']};
   const {start,end}=bounds(state.projection);if(sourceMs<start-.1||sourceMs>end+.1)return {ok:false,issues:['当前帧不在该保留实例的源时间内']};
   const observed=observeDom(root,captured,state.projection,sourceMs,readiness,environment);
   if(observed.issues.length){reject(state,'dom',sourceMs,observed.issues);state.issues=observed.issues;return {ok:false,issues:observed.issues};}
   state.issues=[];state.times.push(sourceMs);for(const src of observed.assets)state.assets.add(src);
   for(let index=0;index<inventory.length;index++)for(const text of observed.texts)markText(state.coverage[index],inventory[index].text,text);
   return {ok:true,issues:[]};
  },
  getProgress,
  finish(review){
   const issues=[...initialIssues],progress=getProgress();
   if(sceneDynamicMotionDraftKey(draft)!==key)issues.push('参数已变化，请新建预览会话');
   if(!review?.reviewed||!review?.personSafe||review.reviewedDraftKey!==key)issues.push('请实际复看完整动态及真人避让，并确认当前草稿');
   for(const state of progress.projections){if(!state.covered)issues.push('尚未完整连续预览保留实例：'+state.id);if(state.missingText.length)issues.push('尚未在实际画面显示完整原文：'+state.id+' / '+state.missingText.join('、'));if(state.missingAssets.length)issues.push('实际画面尚未展示原有资料：'+state.id+' / '+state.missingAssets.join('、'));issues.push(...state.issues);}
   if(!progress.projections.length)issues.push('没有可验证的保留实例');
   if(issues.length)return {ok:false,issues:[...new Set(issues)]};
   const receipt=Object.freeze({draftKey:key});receipts.set(receipt,{draftKey:key,signature,selectionSignature:captured.selectionSignature});
   return {ok:true,issues:[],receipt};
  },
 };
}

/** Owner uses the same current context as the art layer. Saved source identity
 * here is only for static staleness; playback separately re-hashes real files. */
export function audioClockLiveSelectionIssues(state,scene){
 const saved=scene?.dynamicMotion;if(saved?.config?.kind!=='audio-clock-ab')return [];
 const environment=dynamicMotionEnvironmentFromState(state,{sourceIdentity:saved.sourceIdentity,assets:saved.assetIdentities,audioEvidence:saved.audioEvidence,contextSnapshot:saved.contextSnapshot,font:{status:'ready'}});
 return validateSavedSceneDynamicMotion(scene,environment).issues;
}
