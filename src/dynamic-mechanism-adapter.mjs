import {dynamicMechanismIssues,dynamicSceneDuration,evidenceHandoffItems} from './dynamic-mechanisms.mjs';
import {matchingSource,projectStoryboard} from './storyboard.mjs';
import {personMatteFrame} from './person-matte.mjs';
import {regionFocusMedia} from './region-focus.mjs';

const field=(key,label,type,options={})=>({key,label,type,...options});
const time=(key,label,options={})=>field(key,label,'source-ms',{min:0,...options});
const number=(key,label,min,max)=>field(key,label,'number',{min,max});
const rect=(key,label)=>field(key,label,'stage-rect',{coordinates:'normalized-output',subtitleBottom:.86});
const list=(key,label,itemFields)=>field(key,label,'list',{itemFields});
const node=(key,label)=>field(key,label,'node-ref',{source:'scene.nodes',preserveId:true});
const valueFields=[number('from','明确起值',-1e15,1e15),number('to','明确终值',-1e15,1e15),field('unit','单位','text'),number('decimals','小数位',0,4)];
const quotedLines=[node('nodeId','来源对象'),field('provenance','引用来源','text'),list('lines','完整引用行',[field('text','完整原句','text'),time('atMs','出现时点'),field('highlightText','原文内高亮','text'),time('highlightAtMs','高亮时点')])];
const edgeFields=[field('id','稳定连线ID','text'),node('from','起点'),node('to','终点'),field('route','路径','select',{options:['orthogonal','bezier']}),field('points','显式控制点','stage-points')];
const matchFields=[time('atMs','交接起点'),time('durationMs','人物匹配时长'),rect('from','起始人物框'),rect('to','目标人物框'),time('backgroundDelayMs','背景叠化延迟'),time('backgroundFadeMs','背景叠化时长'),time('graphicsDelayMs','旧图残留时长'),time('graphicsFadeMs','旧图退场时长')];

// This is an editing contract, not a registration or an automatic recommendation.
// Source copy stays on StoryScene; this form edits explicit motion parameters only.
export const dynamicMechanismControls=[
 {kind:'flip-board',label:'翻字总览',fields:[number('columns','每行格数',4,32),number('rows','每页行数',1,12),time('atMs','开始时点'),field('nodeAtMs','逐对象口述时点','node-time-map'),time('fillMs','填入时长'),time('holdMs','完整终态停留',{min:600}),time('flipMs','单格翻动时长'),time('staggerMs','格间错峰')]},
 {kind:'number-counter',label:'显式数值计增',fields:[...valueFields,field('direction','方向','select',{options:['up','down']}),field('grouping','数字分组','boolean'),field('locale','数字语言','text'),time('atMs','计数起点'),time('countMs','计数时长'),rect('rect','数字框')]},
 {kind:'evidence-handoff',label:'来源证据焦点交接',fields:[node('mediaNodeId','本场媒体对应对象'),number('columns','总览列数',1,4),list('cues','逐次焦点',[node('nodeId','真实素材来源对象'),time('atMs','焦点起点'),time('travelMs','移动时长'),time('holdMs','焦点停留'),time('returnMs','回到总览'),rect('origin','来源小框'),rect('target','放大目标框')]),...['boardRect','focusBoardRect','speakerRect','focusSpeakerRect','focusRect'].map(key=>rect(key,key)),field('speakerMode','人物形态','select',{options:['inset','cutout']}),field('matchToLive','人物/实拍交接','record',{fields:matchFields})]},
 {kind:'glass-capsules',label:'错峰玻璃胶囊',fields:[field('side','侧区','select',{options:['left','right']}),rect('rect','标签组'),field('atMs','逐项口述时点','source-ms-list'),time('endMs','整组结束'),time('inMs','入场时长'),time('outMs','组退时长'),number('gap','行间距',0,.1)]},
 {kind:'orbit-flow-variant',label:'圆群聚集/开口/点流',fields:[time('gatherAtMs','开始聚集'),time('gatherMs','聚集时长'),time('openAtMs','开始开口'),time('openMs','开口时长'),time('flowAtMs','开始转移'),time('flowMs','转移时长'),number('gapDegrees','开口角度',1,299),number('count','装饰点数',4,96),field('center','圆心','stage-point'),number('radius','相对短边半径',.01,.5),field('target','转移目标','stage-point'),rect('mediaRect','真实资料框')]},
 {kind:'bar-group-variant',label:'共同尺度条形比较',fields:[field('scale','显式共同尺度','record',{fields:[field('min','共同零基线','number',{fixed:0}),number('max','共同上限',.001,1e15)]}),field('unit','共同单位','text'),number('decimals','小数位',0,4),field('grouping','数字分组','boolean'),list('items','比较数据',[node('nodeId','原对象'),...valueFields.slice(0,2),time('atMs','增长起点'),time('countMs','增长时长')])]},
 {kind:'hub-branch-flow',label:'分支流与状态重排',fields:[node('hubNodeId','中心对象'),field('inputNodeIds','输入对象','node-ref-list'),field('outputNodeIds','输出对象','node-ref-list'),list('positions','显式节点中心',[node('nodeId','原对象'),number('x','横坐标',0,1),number('y','纵坐标',0,.86),number('width','宽度',.01,1),number('height','高度',.01,.86)]),time('branchesAtMs','开始画线'),time('branchDrawMs','画线时长'),time('nodeStaggerMs','对象错峰'),time('flowAtMs','开始点流'),time('flowMs','单程时长'),number('particleCount','同时粒子上限',1,32),list('edges','稳定连线',edgeFields),list('edgeGates','支路门控',[field('edgeId','连线ID','edge-ref'),time('atMs','开关时点'),field('enabled','允许新粒子','boolean'),time('drainMs','旧点排空时长')]),list('nodeStates','对象状态',[node('nodeId','原对象'),time('atMs','状态起点'),time('durationMs','过渡时长'),field('state','状态','select',{options:['active','dim','hidden']}),field('trend','显式趋势','select',{options:['up','down','flat']}),field('explicitValue','明确数据','record',{fields:[...valueFields.slice(0,3),field('scale','尺度','record',{fields:[number('min','下限',-1e15,1e15),number('max','上限',-1e15,1e15)]})]})]),list('rearrangements','网络重排',[time('atMs','重排起点'),time('durationMs','重排时长'),list('nodes','保留ID的对象位置',[node('nodeId','原对象'),rect('rect','终框'),rect('fromRect','新对象入场框'),node('assetNodeId','真实图片来源对象')]),list('edges','新拓扑',edgeFields)]),list('quotedLineCues','逐行引用',quotedLines),field('matchToDiagram','实拍/人物转图解','record',{fields:matchFields})]},
 {kind:'screenshot-region-focus',label:'原图精确区域聚焦',fields:[node('mediaNodeId','原图来源对象'),field('sourceKind','素材类别','select',{options:['screenshot','illustration']}),field('provenance','原图来源','text'),field('sourceWidth','实际解码宽度','decoded-dimension',{readonly:true}),field('sourceHeight','实际解码高度','decoded-dimension',{readonly:true}),field('focusRegion','在实际原图圈选ROI','source-pixel-rect',{source:'decoded-image'}),field('regionUnits','ROI单位','text',{fixed:'source-pixels'}),field('maskScope','遮罩范围','text',{fixed:'asset-only'}),time('atMs','开始放大'),time('expandMs','放大时长'),time('holdMs','区域停留',{min:600}),time('returnMs','归位时长'),rect('assetRect','原图框'),rect('focusRect','独立ROI框'),number('dimOpacity','仅原图内暗化',0,.85),rect('explanationRect','完整说明框'),list('explanationCues','逐行说明',quotedLines)]},
 {kind:'bilingual-board-transition',label:'完整双语换面',fields:[number('columns','列数',1,4),field('provenance','翻译来源','text'),list('pairs','显式翻译对',[node('nodeId','原对象'),field('fromText','完整原文','text',{readonly:true,source:'scene-node-text'}),field('toText','完整译文','text'),field('fromLanguage','原语言','text'),field('toLanguage','目标语言','text'),time('atMs','换面起点'),time('rollMs','滚转时长')])]},
].map(item=>({...item,stage:'experimental-independent',automaticAllowed:false,uiAccepted:false}));

const clone=value=>structuredClone(value);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const serial=value=>JSON.stringify(stable(value));
const validSource=source=>typeof source==='string'&&source.length&&!/^(?:https?:|file:|\/|.*\.\.)/.test(source);
const validSha=sha=>/^[a-f0-9]{64}$/i.test(sha??'');
const dependencySnapshot=environment=>({clips:environment.clips??[],viewport:environment.viewport,fps:environment.fps,fontKey:environment.font?.key,sourceIdentity:environment.sourceIdentity,assets:(environment.assets??[]).map(asset=>({src:asset.src,sha256:asset.sha256,width:asset.width,height:asset.height})),appearance:environment.appearance});
export function dynamicDraftSignature(scene,environment){return serial({scene,dependencies:dependencySnapshot(environment)});}
export function dynamicDraftKey(draft){return serial({baseSignature:draft.baseSignature,config:draft.config});}
export function dynamicContentInventory(scene){return [{id:'title',text:scene.title},{id:'body',text:scene.body},...(scene.nodes??[]).flatMap(node=>[{id:`node:${node.id}:text`,text:node.text},{id:`node:${node.id}:detail`,text:node.detail},...(node.bullets??[]).map((text,index)=>({id:`node:${node.id}:bullet:${index}`,text}))])].filter(item=>typeof item.text==='string'&&item.text.length>0);}
export function createDynamicMechanismDraft(scene,config,environment){
 if(!dynamicMechanismControls.some(control=>control.kind===config?.kind))throw Error('未知独立机制');
 if(scene.sourceId||scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined)throw Error('请从原始源时间场景创建配置，不从投影片段保存');
 if(!validSource(scene.src)||!Number.isFinite(scene.startMs)||!Number.isFinite(scene.endMs)||scene.endMs<=scene.startMs)throw Error('需要完整源路径与有效源时间');
 const clips=(environment.clips??[]).filter(clip=>matchingSource(scene,clip)&&clip.outSec*1000>scene.startMs&&clip.inSec*1000<scene.endMs);
 if(!clips.length)throw Error('场景没有当前保留实例');
 if(new Set(clips.map(clip=>clip.id)).size!==clips.length||clips.some(clip=>!clip.id||![clip.inSec,clip.outSec,clip.speed??1].every(Number.isFinite)||clip.inSec<0||clip.outSec<=clip.inSec||(clip.speed??1)<=0))throw Error('源片段实例或速度无效');
 return {version:1,sceneId:scene.id,binding:{src:scene.src,clipId:scene.clipId,startMs:scene.startMs,endMs:scene.endMs,instances:clips.map(clip=>({id:clip.id,src:clip.src,inSec:clip.inSec,outSec:clip.outSec,speed:clip.speed??1}))},clock:'scene-source-relative-ms',baseSignature:dynamicDraftSignature(scene,environment),config:clone(config)};
}
export function bindDynamicScreenshotRegion(draft,scene,asset,focusRegion,environment){
 if(draft.config.kind!=='screenshot-region-focus')throw Error('只有原图区域配置可以绑定实际解码尺寸');
 const old=JSON.parse(draft.baseSignature),current={scene,dependencies:dependencySnapshot(environment)};
 const withoutAssets=value=>({...value,dependencies:{...value.dependencies,assets:[]}});
 if(serial(withoutAssets(old))!==serial(withoutAssets(current)))throw Error('原场、剪口、字体或输出已变化，请重新建立配置');
 const media=regionFocusMedia(scene,draft.config),proof=environment.assets?.find(item=>item.src===asset.src);
 if(asset.src!==media?.src||asset.status!=='ready'||!validSha(asset.sha256)||!(asset.width>0)||!(asset.height>0)||serial(asset)!==serial(proof))throw Error('请在当前已加载且身份一致的实际原图上圈选');
 const next=clone(draft);next.config={...next.config,sourceWidth:asset.width,sourceHeight:asset.height,focusRegion:clone(focusRegion)};next.baseSignature=dynamicDraftSignature(scene,environment);return next;
}
const forbidden=new Set(['__proto__','prototype','constructor']);
export function editDynamicMechanismDraft(draft,path,value){
 if(!Array.isArray(path)||!path.length||path.some(key=>forbidden.has(String(key))))throw Error('配置路径无效');
 const control=dynamicMechanismControls.find(control=>control.kind===draft.config.kind);let fields=control.fields,currentField;
 for(let index=0;index<path.length;index++){
  const key=path[index];if(typeof key==='number'){if(currentField?.type!=='list'||!Number.isInteger(key)||key<0)throw Error('列表路径无效');fields=currentField.itemFields;continue;}
  currentField=fields?.find(item=>item.key===key);if(!currentField||currentField.readonly||currentField.fixed!==undefined)throw Error('该字段须通过来源绑定/实际素材解码更新');
  fields=currentField.fields;
  if(currentField.type==='node-time-map'&&index===path.length-2){if(forbidden.has(String(path[index+1])))throw Error('对象ID无效');break;}
 }
 const next=clone(draft);let target=next.config;for(const key of path.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')throw Error('请先创建完整记录或列表');target=target[key];}const last=path.at(-1);if(value===undefined)delete target[last];else target[last]=clone(value);return next;
}

function usedAssets(scene,config){
 if(config.kind==='evidence-handoff')return evidenceHandoffItems(scene,config).map(item=>({src:item.media.src,nodeId:item.node.id,kind:item.media.kind}));
 if(config.kind==='screenshot-region-focus'){const media=regionFocusMedia(scene,config);return media?[{src:media.src,nodeId:config.mediaNodeId??null,kind:media.kind}]:[];}
 if(config.kind==='orbit-flow-variant')return scene.media?[{src:scene.media.src,nodeId:null,kind:scene.media.kind}]:[];
 if(config.kind==='hub-branch-flow')return (scene.nodes??[]).filter(node=>node.assetSrc).map(node=>({src:node.assetSrc,nodeId:node.id,kind:'image'}));
 return [];
}
function matteIssues(scene,environment){
 const issues=[],matte=scene.personMatte,identity=environment.sourceIdentity,ready=environment.matte;
 if(!matte||matte.src!==scene.src||!validSha(matte.sourceSha256)||!identity||identity.src!==scene.src||!validSha(identity.sha256)||identity.sha256!==matte.sourceSha256)issues.push('真实人物层必须与当前源文件的可核验身份一致');
 if(!(matte?.width>0)||!(matte?.height>0)||matte.width!==identity?.width||matte.height!==identity?.height)issues.push('人物RGBA源画布须与原片尺寸一致');
 if(matte){const period=1000/matte.fps,times=matte.timesMs;if(!validSource(matte.prefix)||!personMatteFrame(matte,scene.startMs)||!personMatteFrame(matte,scene.endMs-.001)||!Number.isFinite(matte.endMs)||matte.endMs<scene.endMs-.001||!times||times.length!==matte.count||times.some((time,index)=>!Number.isFinite(time)||index>0&&(time<=times[index-1]||time-times[index-1]>period*1.5+.001)))issues.push('人物RGBA须连续覆盖完整原场源时间，不能只有首尾帧');}
 if(!ready||ready.status!=='ready'||ready.prefix!==matte?.prefix||ready.sourceSha256!==matte?.sourceSha256||ready.rgbaVerified!==true)issues.push('实际RGBA帧尚未加载并确认，普通视频或透明叠字不能代替');
 return issues;
}

export function prepareDynamicMechanismPreview(draft,scene,environment){
 const issues=[],add=(code,severity,message)=>issues.push({code,severity,message});
 if(draft.version!==1||draft.clock!=='scene-source-relative-ms'||draft.sceneId!==scene.id||draft.binding.src!==scene.src||draft.binding.startMs!==scene.startMs||draft.binding.endMs!==scene.endMs||draft.baseSignature!==dynamicDraftSignature(scene,environment))add('stale','blocked','源内容、剪口、字体、素材身份或输出规格已变更，请重新生成配置');
 const viewport=environment.viewport;if(!(viewport?.width>0)||!(viewport?.height>0)||!(environment.fps>0))add('output','blocked','需要明确输出尺寸与帧率');
 try{for(const message of dynamicMechanismIssues(scene,draft.config,viewport))add('configuration','blocked',message);}catch{add('configuration','blocked','配置尚未完整，请通过表单补齐必要字段');}
 const requirements=usedAssets(scene,draft.config);
 for(const requirement of requirements){
  const asset=environment.assets?.find(asset=>asset.src===requirement.src);
  if(!asset||asset.status==='loading'||asset.status==='unloaded'){add('asset-loading','waiting',`等待实际素材解码：${requirement.src}`);continue;}
  if(asset.status!=='ready'||!validSha(asset.sha256)||!(asset.width>0)||!(asset.height>0)){add('asset-invalid','blocked',`素材缺少真实尺寸或内容身份：${requirement.src}`);continue;}
  if(draft.config.kind==='screenshot-region-focus'&&(asset.width!==draft.config.sourceWidth||asset.height!==draft.config.sourceHeight))add('roi-dimensions','blocked','实际解码原图尺寸已变化，请在新原图重新圈选ROI');
 }
 if(environment.font?.status!=='ready'||!environment.font.key)add('font-loading',environment.font?.status==='error'?'blocked':'waiting','等待实际展示字体加载；不能用估计字数代替像素测量');
 const requiresMatte=draft.config.kind==='evidence-handoff'&&(draft.config.speakerMode==='cutout'||!!draft.config.matchToLive)||draft.config.kind==='hub-branch-flow'&&!!draft.config.matchToDiagram;
 if(requiresMatte)for(const message of matteIssues(scene,environment))add('matte','blocked',message);
 const projections=projectStoryboard([scene],environment.clips??[],environment.fps??30),key=dynamicDraftKey(draft),inventory=dynamicContentInventory(scene),layout=environment.layoutReview,safety=environment.safetyReview;
 if(layout?.draftKey!==key||layout.status!=='reviewed')add('layout-review','review','需整段预览实际字体、全部分页与最短保留段阅读时间');
 else if(layout.unplaceable||layout.missingText?.length||inventory.some(item=>!layout.displayedFields?.includes(item.id))||projections.some(projection=>!layout.projectionIds?.includes(projection.id)))add('layout-invalid','blocked','真实文字布局或保留实例仍有溢出/未展示的完整内容，不能只确认字符串仍在工程中');
 if(safety?.draftKey!==key||safety.status!=='reviewed')add('person-safety','review','需检查真人全路径、素材与字幕安全区；未知脸位置不能自动通过');
 else if(safety.overlaps?.length||projections.some(projection=>!safety.projectionIds?.includes(projection.id)))add('person-overlap','blocked','仍有真人/字幕遮挡或未核对的保留实例，请调整配置并逐段预览');
 if(!projections.length)add('retained-range','blocked','当前时间轴没有保留本场');
 if(projections.length>1)add('multiple-instances','review','本场按源路径投影到多个保留实例；逐个核对上下文与曝光，不合并阅读时长');
 return {stage:'experimental-independent',uiAccepted:false,automaticAllowed:false,canApply:false,draftKey:key,previewReadiness:issues.some(issue=>issue.severity==='blocked')?'blocked':issues.some(issue=>issue.severity==='waiting')?'waiting':'ready',reviewRequired:issues.some(issue=>issue.severity==='review'),issues,requirements,contentInventory:inventory,projections,renderProps:{scene:clone(scene),config:clone(draft.config)}};
}

export function dynamicPreviewClock(draft,projection,timelineMs){
 const speed=projection.speed??1,instance=draft.binding.instances.find(instance=>instance.id===projection.clipId),duration=(projection.phaseEndMs-projection.phaseStartMs)*speed;
 if(!instance||instance.src!==draft.binding.src||projection.src!==draft.binding.src||projection.sourceId!==draft.sceneId||!Number.isFinite(timelineMs)||timelineMs<projection.startMs||timelineMs>=projection.endMs||!(speed>0)||speed!==instance.speed||Math.abs(duration-(draft.binding.endMs-draft.binding.startMs))>.01)throw Error('预览片段/时钟与当前源场景不一致');
 const elapsed=(timelineMs-projection.phaseStartMs)*speed,sourceMs=draft.binding.startMs+elapsed;
 if(sourceMs<Math.max(draft.binding.startMs,instance.inSec*1000)-.01||sourceMs>=Math.min(draft.binding.endMs,instance.outSec*1000)+.01)throw Error('预览时点已超出当前保留源区间');
 return {elapsed,sourceMs,sourceDurationMs:dynamicSceneDuration(projection),visibleDurationMs:projection.endMs-projection.startMs};
}
