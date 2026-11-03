import {dynamicMechanismControls} from './dynamic-mechanism-adapter.mjs';
import {flipBoardPages} from './dynamic-mechanisms.mjs';
import {completeSourceCopyText} from './complete-source-copy.mjs';
import {phraseChoreographyControls,phraseAdditionalCopy,phraseKinds} from './phrase-choreography.mjs';
import {sourceTokenTransferControls} from './source-token-transfer.mjs';
import {pairedRelationsControls} from './paired-relations.mjs';
import {veilStateControls,veilStateCopy} from './veil-state.mjs';
import {fullFrameHandoffControls,fullFrameHandoffCopy} from './full-frame-handoff.mjs';
import {audioClockControls} from './audio-clock.mjs';
import {pathRunnerControls} from './path-runner.mjs';
import {quantitativeChartControls} from './quantitative-chart.mjs';
import {persistentMotionControls} from './persistent-motion.mjs';
import {typedClockMotionControls} from './typed-clock-motion.mjs';
import {conditionalSetViewControls,createConditionalSetViewDraft} from '../editor/conditional-set-fields.mjs';
import {sceneSpeakerLayout} from './storyboard.mjs';
import {speakerBox} from './presentation.mjs';

const finite=Number.isFinite,clone=v=>structuredClone(v),unique=v=>[...new Set(v)];
const fullNode=n=>[n.text,n.detail,...(n.bullets??[])].filter(t=>typeof t==='string'&&t.length).join('\n');
const local=src=>typeof src==='string'&&src.length&&!/^[a-z][a-z\d+.-]*:/i.test(src)&&!src.startsWith('/')&&!/[\\\u0000-\u001f]/.test(src)&&src.split('/').every(p=>p&&p!=='.'&&p!=='..');
const segmenter=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
const chars=t=>[...segmenter.segment(t??'')].length;
const readingMs=t=>t?Math.max(1200,chars(t)*95):0;
const validRect=r=>r&&['x','y','width','height'].every(k=>finite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=.86;
const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
const shrink=(r,x,y)=>r?{x:r.x+x,y:r.y+y,width:r.width-2*x,height:r.height-2*y}:undefined;
const field=(key,label,type,extra={})=>({key,label,type,...extra});
const time=(key,label)=>field(key,label,'source-ms');
const rect=(key,label)=>field(key,label,'stage-rect');
const list=(key,label,itemFields)=>field(key,label,'list',{itemFields});
const node=()=>field('nodeId','完整原对象','node-ref',{preserveId:true});
const provenance=[field('dataKind','数据或示意类别','select',{options:['explicit','illustration']}),field('provenance','明确来源','text')];
const nativeCopyField=field('sourceCopyWindow','完整原文先行窗口','record',{fields:[time('atMs','开始'),time('endMs','结束'),rect('rect','全文区域'),rect('speakerRect','真实人物位置')]});

/** Draft geometry only. The actual renderer still waits for loaded fonts and a decoded person frame. */
function context(scene,env={}){
 const issues=[],requiredData=[],width=env.width,height=env.height,duration=scene?.endMs-scene?.startMs;
 if(!scene||typeof scene.id!=='string'||!scene.id||!local(scene.src)||!finite(scene.startMs)||scene.startMs<0||!finite(duration)||duration<=0||scene.sourceId||scene.phaseStartMs!==undefined||scene.phaseEndMs!==undefined)throw Error('请从具有绝对原片时钟的本地原始场景生成草稿，不能使用投影片段。');
 if(!finite(width)||!finite(height)||width<=0||height<=0)throw Error('需要明确输出宽高。');
 const nodes=scene.nodes??[];
 if(!Array.isArray(nodes)||nodes.some(n=>typeof n?.id!=='string'||!n.id)||new Set(nodes.map(n=>n.id)).size!==nodes.length)throw Error('原节点需要唯一稳定ID。');
 const proof=env.sourceIdentity;
 const verified=proof?.src===scene.src&&/^[a-f0-9]{64}$/i.test(proof?.sha256??'')&&[proof.width,proof.height].every(n=>Number.isSafeInteger(n)&&n>0)&&proof.kind==='video'&&finite(proof.durationSec)&&proof.durationSec*1000>=scene.endMs-.01;
 if(!verified){requiredData.push('sourceIdentity');issues.push('需要当前原片的同源SHA、实际尺寸与覆盖场景的时长；旧文件证明不能代替。');}
 const windowPoints=scene.window?[scene.window,...(scene.window.keyframes??[])]:[];
 const windowTimes=(scene.window?.keyframes??[]).map(w=>w.atMs);
 const people=windowPoints.map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*width/height}));
 // Match DynamicMotionRenderer's actual fallback. A known default inset is
 // useful geometry even when no manual window was authored. Full-frame and
 // off-canvas editorial shots still do not reveal where the face is.
 if(!scene.window){
  const layout=sceneSpeakerLayout({...scene,visualPreset:undefined}),actual=speakerBox(layout,width,height),r={x:actual.left/width,y:actual.top/height,width:actual.width/width,height:actual.height/height};
  if(layout!=='editorial'&&validRect(r)&&(r.width<.999||r.height<.999))people.push(r);
 }
 let speakerRect;
 if(!people.length){requiredData.push('scene.window');issues.push('尚无已知人物位置，不能自动声称文字避开脸部。');}
 else if(people.some(r=>!validRect(r))||windowTimes.some(t=>!finite(t)||t<0||t>duration)||new Set(windowTimes).size!==windowTimes.length){requiredData.push('scene.window');issues.push('人物窗或关键帧超出有效源时段/字幕安全区，请先校正。');}
 else if(people.length===1)speakerRect=clone(people[0]);
 else{const x=Math.min(...people.map(r=>r.x)),y=Math.min(...people.map(r=>r.y));speakerRect={x,y,width:Math.max(...people.map(r=>r.x+r.width))-x,height:Math.max(...people.map(r=>r.y+r.height))-y};}
 const safe={x:.04,y:.05,width:.92,height:.76},p=speakerRect,gap=.035;
 const candidates=p?[
  {x:safe.x,y:safe.y,width:Math.min(safe.width,p.x-gap-safe.x),height:safe.height},
  {x:Math.max(safe.x,p.x+p.width+gap),y:safe.y,width:safe.x+safe.width-Math.max(safe.x,p.x+p.width+gap),height:safe.height},
  {x:safe.x,y:safe.y,width:safe.width,height:Math.min(safe.height,p.y-gap-safe.y)},
  {x:safe.x,y:Math.max(safe.y,p.y+p.height+gap),width:safe.width,height:safe.y+safe.height-Math.max(safe.y,p.y+p.height+gap)}
 ]:[safe];
 const box=candidates.filter(r=>validRect(r)&&r.width>=.2&&r.height>=.12&&!people.some(p=>overlap(r,p))).sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 if(!box){requiredData.push('safeTextRect');issues.push('当前人物路径没有足够的完整文字区域，请调整构图或保留原编排。');}
 const copyMs=readingMs(completeSourceCopyText(scene)),copy=box?{atMs:0,endMs:copyMs,rect:clone(box),...(speakerRect?{speakerRect:clone(speakerRect)}:{})}:undefined;
 const binding={sceneId:scene.id,src:scene.src,sha256:verified?proof.sha256:undefined,startMs:scene.startMs,endMs:scene.endMs};
 return {scene,env,width,height,duration,nodes,people,speakerRect,box,copyMs,copy,binding,issues,requiredData};
}
function need(ctx,key,message){ctx.requiredData.push(key);if(message)ctx.issues.push(message);}
function timeBudget(ctx,end){if(end>ctx.duration)need(ctx,'scene.durationMs','完整原文和动作需要更长的实际保留时段；草稿不会截字或压缩阅读时间。');}
function nativeBase(ctx,kind){timeBudget(ctx,ctx.copyMs+1200);return {kind,sourceCopyWindow:clone(ctx.copy)};}
function phraseDraft(ctx,kind){
 const config={kind,items:[]},extra=phraseAdditionalCopy(ctx.scene,{items:ctx.nodes.map(n=>({nodeId:n.id}))}).map(i=>i.text).join('\n'),copyMs=readingMs(extra),entryMs=280,exitMs=180;
 if(!ctx.nodes.length)need(ctx,'scene.nodes','短语机制需要真实原节点ID，不会从标题虚构新节点。');
 if(ctx.scene.media?.src||ctx.nodes.some(n=>n.assetSrc))need(ctx,'evidenceComposition','本场有真实资料；请确认预览保留证据层，不用纯文字替代资料。');
 if(extra&&ctx.box)config.copyWindow={atMs:0,endMs:copyMs,rect:clone(ctx.box)};
 const budgets=ctx.nodes.map(n=>readingMs(fullNode(n))+(kind==='caret-phrase'?Math.max(300,chars(fullNode(n))*48):0)+entryMs+exitMs),minimum=copyMs+budgets.reduce((a,b)=>a+b,0);
 timeBudget(ctx,minimum);let at=copyMs;
 const sequential=kind!=='cumulative-phrases',spare=Math.max(0,ctx.duration-minimum)/Math.max(1,ctx.nodes.length),gap=.026;
 const base=shrink(ctx.box,ctx.box?ctx.box.width*.055:0,ctx.box?ctx.box.height*.055:0);
 config.items=ctx.nodes.map((n,i)=>{
  let r=base;
  if(!sequential&&base){const h=(base.height-gap*(ctx.nodes.length-1))/ctx.nodes.length;r={x:base.x,y:base.y+i*(h+gap),width:base.width,height:h};if(h<.07)need(ctx,'safeTextRect','累积短语逐项保留的字框太小，请拆场或减少同场对象。');}
  const endMs=at+budgets[i]+spare,item={nodeId:n.id,rect:r,atMs:at,endMs:sequential?endMs:Math.max(ctx.duration,minimum),entryMs,exitMs,fromScale:kind==='emphasis-phrase'?1.08:1,fromTrackingEm:kind==='emphasis-phrase'?.04:0,extrusion:kind==='emphasis-phrase'};
  at=endMs;return item;
 });
 return config;
}
function nativeDraft(ctx,kind){
 const config=nativeBase(ctx,kind),at=ctx.copyMs;
 if(kind==='flip-board'){
  const columns=Math.max(4,Math.min(24,Math.floor(ctx.width*.69/(ctx.height*.045)))),rows=6,board=flipBoardPages(ctx.scene,{columns,rows});
  const holdMs=Math.max(1200,...board.pages.map(p=>readingMs(p.lines.map(l=>l.glyphs.join('')).join('\n'))));
  Object.assign(config,{columns,rows,atMs:at,fillMs:500,flipMs:300,staggerMs:12,holdMs});timeBudget(ctx,at+board.pages.length*(holdMs+740));
  // This renderer has a fixed geometry; adding a fake config.rect would not move it.
  const nativeEnvelope={x:.045,y:.045,width:.69,height:.765};
  if(ctx.people.some(p=>overlap(nativeEnvelope,p)))need(ctx,'scene.window','翻字板的现有固定字板/标题/页码范围与人物路径重叠；请先调整构图。');
 }else if(kind==='glass-capsules'){
  const r=ctx.box?shrink(ctx.box,.06,.02):undefined,hold=ctx.nodes.length?ctx.nodes.map(n=>readingMs(fullNode(n))):[readingMs([ctx.scene.title,ctx.scene.body].filter(Boolean).join('\n'))];
  let cursor=at;const atMs=hold.map(ms=>{const value=cursor;cursor+=420+ms;return value;});
  Object.assign(config,{side:r&&r.x>.5?'right':'left',rect:r,atMs,endMs:ctx.duration,inMs:420,outMs:400,gap:.014});timeBudget(ctx,cursor+400);
  if(ctx.nodes.length>6)need(ctx,'scene.nodes','玻璃胶囊最多同时保留六个完整对象，请拆场。');
  if(r&&r.height/Math.max(1,ctx.nodes.length)<.08)need(ctx,'safeTextRect','逐项完整文案的胶囊高度不足，请拆场或扩大区域。');
 }else if(kind==='number-counter'){
  Object.assign(config,{from:undefined,to:undefined,unit:undefined,decimals:undefined,direction:undefined,atMs:at,countMs:undefined,rect:clone(ctx.box)});
  ['from','to','unit','decimals','direction','countMs'].forEach(k=>need(ctx,k));
 }else if(kind==='bar-group-variant'){
  Object.assign(config,{scale:undefined,unit:undefined,items:ctx.nodes.map(n=>({nodeId:n.id,from:undefined,to:undefined,atMs:at,countMs:undefined}))});['scale','unit','items[].from','items[].to','items[].countMs'].forEach(k=>need(ctx,k));
 }else if(kind==='evidence-handoff'){
  const assets=ctx.nodes.filter(n=>n.assetSrc),single=assets.length===1?assets[0].id:ctx.scene.media&&ctx.nodes.length===1?ctx.nodes[0].id:undefined;
  const declared=[...new Set([ctx.scene.media?.src,...assets.map(n=>n.assetSrc)].filter(Boolean))],proof=ctx.env.assetIdentity;
  // This is the identity hint, not the node/asset association or cue schedule.
  // A valid proof for one picture cannot stand in for a different source or
  // all pictures in a multi-asset scene. The renderer's own receipt remains required.
  const expectedKind=ctx.scene.media?.src&&ctx.scene.media.src===declared[0]?ctx.scene.media.kind:'image';
  const verified=declared.length===1&&proof?.src===declared[0]&&/^[a-f0-9]{64}$/i.test(proof?.sha256??'')&&[proof.width,proof.height].every(n=>Number.isSafeInteger(n)&&n>0)&&proof.kind===expectedKind&&(proof.kind!=='video'||finite(proof.durationSec)&&proof.durationSec>0);
  Object.assign(config,{mediaNodeId:single,boardRect:clone(ctx.box),speakerRect:clone(ctx.speakerRect),cues:undefined});need(ctx,'cues');if(!single)need(ctx,'mediaNodeId');if(!verified)need(ctx,'assetIdentity');
 }else if(kind==='orbit-flow-variant'){
  Object.assign(config,{gatherAtMs:undefined,openAtMs:undefined,flowAtMs:undefined,count:undefined,mediaRect:clone(ctx.box)});['gatherAtMs','openAtMs','flowAtMs','count','assetIdentity'].forEach(k=>need(ctx,k));if(!ctx.scene.media?.src)need(ctx,'scene.media');
 }else if(kind==='hub-branch-flow'){
  Object.assign(config,{hubNodeId:undefined,inputNodeIds:undefined,outputNodeIds:undefined,edges:undefined,nodeStates:undefined,rearrangements:undefined,branchesAtMs:undefined,flowAtMs:undefined});['hubNodeId','inputNodeIds','outputNodeIds','edges','branchesAtMs','flowAtMs'].forEach(k=>need(ctx,k));
 }else if(kind==='screenshot-region-focus'){
  const assets=ctx.nodes.filter(n=>n.assetSrc),src=assets.length===1?assets[0].assetSrc:assets.length===0?ctx.scene.media?.src:undefined,proof=ctx.env.assetIdentity;
  const verified=src&&proof?.src===src&&/^[a-f0-9]{64}$/i.test(proof?.sha256??'')&&[proof.width,proof.height].every(n=>Number.isSafeInteger(n)&&n>0)&&['image','video'].includes(proof.kind);
  Object.assign(config,{mediaNodeId:assets.length===1?assets[0].id:undefined,sourceKind:undefined,provenance:undefined,sourceWidth:verified?proof.width:undefined,sourceHeight:verified?proof.height:undefined,focusRegion:undefined,regionUnits:'source-pixels',maskScope:'asset-only',atMs:at+1000,focusRect:clone(ctx.box),explanationCues:undefined});
  ['sourceKind','provenance','focusRegion','explanationCues','expandMs','holdMs','returnMs'].forEach(k=>need(ctx,k));if(!verified)need(ctx,'assetIdentity');if(!src)need(ctx,'mediaNodeId');
 }else if(kind==='bilingual-board-transition'){
  Object.assign(config,{pairs:ctx.nodes.map(n=>({nodeId:n.id,fromText:n.text,toText:undefined,fromLanguage:undefined,toLanguage:undefined,atMs:undefined,rollMs:undefined})),provenance:undefined});['pairs[].toText','pairs[].fromLanguage','pairs[].toLanguage','pairs[].atMs','pairs[].rollMs','provenance'].forEach(k=>need(ctx,k));
 }
 return config;
}
function newPrimitiveDraft(ctx,id){
 const binding=clone(ctx.binding),box=clone(ctx.box),speaker=clone(ctx.speakerRect),kind=id.split(':')[0];
 if(ctx.scene.media?.src||ctx.nodes.some(n=>n.assetSrc))if(kind!=='full-frame-blur-zoom')need(ctx,'evidenceComposition','当前机制不绘制本场已有媒体；请选择证据类或保留原编排。');
 if(kind==='paired-relations'){
  const variant=id.split(':')[1],row=box?{...box,y:box.y+box.height*.25,height:box.height*.55}:undefined,gap=.07,a=row?{...row,width:(row.width-gap)/2}:undefined,b=row?{...a,x:row.x+(row.width+gap)/2}:undefined;
  ['sides.a.nodeId','sides.b.nodeId','relation.type','relation.provenance','phases'].forEach(k=>need(ctx,k));timeBudget(ctx,ctx.copyMs+5000);
  return {kind,variant,clock:'scene-source-relative-ms',binding,sides:{a:{nodeId:undefined,rect:a},b:{nodeId:undefined,rect:b}},relation:{type:undefined,provenance:undefined},copyWindow:clone(ctx.copy),graphicWindow:{atMs:ctx.copyMs,endMs:ctx.duration},titleRect:box?{...box,height:box.height*.15}:undefined,speakerRect:speaker,phases:[]};
 }
 if(kind==='veil-state'){
  const config={kind,clock:'scene-source-relative-ms',binding,sourceKind:'illustration',provenance:undefined,copyWindow:clone(ctx.copy),objects:ctx.nodes.map(n=>({id:'veil:'+n.id,nodeId:n.id,expectedText:fullNode(n),rect:undefined,atMs:undefined,freezeAtMs:undefined,freezeMs:undefined,releaseAtMs:undefined,releaseMs:undefined,endMs:undefined,appearance:{dimOpacity:undefined,veilOpacity:undefined,blurPxAt1080:undefined}}))};
  if(config.copyWindow)config.copyWindow.endMs=readingMs(veilStateCopy(ctx.scene,config));
  ['provenance','objects[].rect','objects[].atMs','objects[].freezeAtMs','objects[].freezeMs','objects[].releaseAtMs','objects[].releaseMs','objects[].endMs','objects[].appearance'].forEach(k=>need(ctx,k));if(!ctx.nodes.length)need(ctx,'scene.nodes');timeBudget(ctx,(config.copyWindow?.endMs??ctx.copyMs)+5000);return config;
 }
 const source=ctx.env.sourceIdentity,declared=unique([ctx.scene.media?.src,...ctx.nodes.map(n=>n.assetSrc)].filter(Boolean)),proof=ctx.env.assetIdentity,assetNodes=ctx.nodes.filter(n=>n.assetSrc),nodeId=assetNodes.length===1&&!ctx.scene.media?.src?assetNodes[0].id:undefined;
 const image=declared.length===1&&proof?.src===declared[0]&&proof.kind==='image'&&/^[a-f0-9]{64}$/i.test(proof.sha256??'')&&[proof.width,proof.height].every(n=>Number.isSafeInteger(n)&&n>0)?{src:proof.src,sha256:proof.sha256,width:proof.width,height:proof.height,kind:'image'}:undefined;
 const target=declared.length?{kind:'scene-image',...(nodeId?{nodeId}:{}),identity:image}:{kind:'source-video'};
 if(declared.length&&!ctx.scene.media?.src&&assetNodes.length!==1)need(ctx,'target.nodeId');
 if(declared.length&&!image)need(ctx,'target.identity','整幅资料只支持本场已绑定的一张实际图片，需要它自己的SHA与尺寸。');
 if(declared.length>1)need(ctx,'singleAuthoredImage','本场含多份媒体，整幅机制不能省略其他证据。');
 const config={kind,clock:'scene-source-relative-ms',binding:{...binding,width:source?.width,height:source?.height,durationSec:source?.durationSec},target,transition:{atMs:undefined,peakMs:undefined,endMs:undefined,clearHoldMs:undefined,peakScale:undefined,maxBlurPx:undefined,origin:{x:.5,y:.5}},copyWindow:clone(ctx.copy),speakerRect:speaker};
 if(config.copyWindow)config.copyWindow.endMs=readingMs(fullFrameHandoffCopy(ctx.scene,config));
 ['transition.atMs','transition.peakMs','transition.endMs','transition.clearHoldMs','transition.peakScale','transition.maxBlurPx'].forEach(k=>need(ctx,k));timeBudget(ctx,(config.copyWindow?.endMs??ctx.copyMs)+2500);return config;
}
function persistentDraft(ctx){
 const b=ctx.box,prefix='persistent:'+ctx.scene.id,config={kind:'persistent-entities',clock:'scene-source-relative-ms',binding:clone(ctx.binding),provenance:{kind:'illustration',note:''},copyWindow:clone(ctx.copy)};
 need(ctx,'provenance.note','请明确填写作者示意含义；动画不代表软件实际执行。');
 if(!b)return config;
 const images=ctx.nodes.filter(n=>n.assetSrc),labelNode=ctx.nodes.find(n=>!n.assetSrc)??ctx.nodes[0];
 if(images.length>=2){
  let cursor=ctx.copyMs+500;config.mediaStack={id:prefix+':media',stackRect:{x:b.x,y:b.y+.05,width:b.width*.65,height:b.height*.62},anchorRect:{x:b.x+b.width*.70,y:b.y+.025,width:b.width*.28,height:b.height*.32},anchorNodeId:labelNode?.id,anchorExpectedText:labelNode?fullNode(labelNode):undefined,items:images.slice(0,3).map(n=>{const at=cursor,read=Math.max(2400,readingMs(fullNode(n)));cursor+=read+850;return{id:prefix+':image:'+n.id,nodeId:n.id,expectedText:fullNode(n),assetIdentity:undefined,entryRect:{x:b.x,y:b.y+.02,width:b.width*.65,height:b.height*.65},appearAtMs:at,readUntilMs:at+read,pushEndMs:at+read+600};}),attachAtMs:cursor,attachEndMs:cursor+700};
  need(ctx,'mediaStack.items[].assetIdentity','每张图片须由当前原节点与实际素材身份绑定；不会用一个图的SHA代替另一张图。');
  if(images.length>3)need(ctx,'mediaStack.items','该原创入栈示例最多3张；本场更多资料不能静默省略，请拆场或保留原编排。');
  timeBudget(ctx,cursor+700+readingMs(labelNode?fullNode(labelNode):''));
 }else{
  const ns=ctx.nodes.filter(n=>!n.assetSrc).slice(0,5),at=ctx.copyMs+500,summary=Math.max(at+4200,at+Math.max(0,...ns.map(n=>readingMs(fullNode(n))))+1000);
  config.checklist={id:prefix+':checklist',rect:{x:b.x,y:b.y+.02,width:b.width,height:b.height*.70},atMs:at,items:ns.map((n,i)=>({id:prefix+':task:'+n.id,nodeId:n.id,expectedText:fullNode(n),doneAtMs:at+1000+i*450})),summaryText:'',summaryRect:{x:b.x,y:b.y+.08,width:b.width*.6,height:b.height*.30},summaryAtMs:summary,archiveRect:{x:b.x+b.width*.68,y:b.y+.02,width:b.width*.30,height:b.height*.30},archiveNodeId:labelNode?.id,archiveExpectedText:labelNode?fullNode(labelNode):undefined,archiveAtMs:summary+2500,archiveEndMs:summary+3200};
  if(ns.length!==5)need(ctx,'checklist.items','原创任务示例需要5个现有原节点，不能自动编造缺少的任务。');
  need(ctx,'checklist.summaryText','摘要必须由作者明确提供；完整任务及条件仍保留。');timeBudget(ctx,summary+3200+Math.max(2500,readingMs(labelNode?fullNode(labelNode):'')));
 }
 return config;
}
function advancedDraft(ctx,id){
 if(id==='conditional-set'){
  const config=createConditionalSetViewDraft(ctx.scene,ctx.env.sourceIdentity);
  ['provenance.note','outcomeLabels','copyWindow','graphicWindow','sets','gates','actors','events','gateViews'].forEach(k=>need(ctx,k,'请明确填写集合、每道门的独立条件、对象和源时点；不自动编造通过或拒绝。'));
  return config;
 }
 if(id==='field-roll-board'){
  const zero={x:0,y:0,width:0,height:0},box=ctx.box??zero;
  ['cards','cards[].fields[].sourceRef','cards[].fields[].to','cards[].fields[].provenance','cards[].fields[].timing'].forEach(k=>need(ctx,k,'逐格滚动需要当前完整来源、明确目标和映射依据；不会自动翻译或生成数值。'));
  return{kind:id,clock:'scene-source-relative-ms',binding:clone(ctx.binding),copyWindow:ctx.copy?{atMs:ctx.copy.atMs,endMs:ctx.copy.endMs,rect:clone(ctx.copy.rect)}:{atMs:0,endMs:ctx.copyMs,rect:clone(zero)},titleRect:{x:box.x,y:box.y,width:box.width,height:box.height*.12},speakerRect:clone(ctx.speakerRect??zero),cards:[]};
 }
 if(id==='typed-data-clock'){
  const n=ctx.nodes[0],box=ctx.box,begin=ctx.copyMs;
  if(!n)need(ctx,'scene.nodes','数据轨道须选择已有原节点，不会编造来源');
  ['tracks[].label','tracks[].definition','tracks[].provenance','tracks[].value','tracks[].format'].forEach(k=>need(ctx,k));
  timeBudget(ctx,begin+Math.max(4000,readingMs(n?fullNode(n):'')));
  return {kind:id,clock:'scene-source-relative-ms',binding:clone(ctx.binding),copyWindow:clone(ctx.copy),durationTracks:n?[{id:'clock:'+n.id,nodeId:n.id,expectedText:fullNode(n),unit:'ms',label:'',definition:'',provenance:undefined,value:undefined,format:undefined,window:{startMs:begin,endMs:ctx.duration},textRect:box?{x:box.x,y:box.y,width:box.width,height:box.height*.55}:undefined,numberRect:box?{x:box.x,y:box.y+box.height*.60,width:box.width,height:box.height*.20}:undefined,geometry:{kind:'bar',rect:box?{x:box.x,y:box.y+box.height*.86,width:box.width,height:box.height*.10}:undefined}}]:[],eventTracks:[],receiptTracks:[]};
 }
 if(id==='persistent-entities')return persistentDraft(ctx);
 if(id==='audio-clock-ab'){
  const box=clone(ctx.box),row=box?(box.height-.035)/2:undefined;
  for(const key of ['provenance','order','takes[].source','takes[].startMs','takes[].endMs','comparisonWindow'])need(ctx,key);
  if(ctx.nodes.length<2)need(ctx,'scene.nodes','需要明确的A、B原论点标签；不会替你编造实验结论。');
  return {kind:id,clock:'scene-source-relative-ms',binding:clone(ctx.binding),dataKind:'explicit-audio',provenance:undefined,audioOwner:{kind:'external-single-track',id:'audio-owner:'+ctx.scene.id},order:undefined,timeScaleMs:undefined,copyWindow:clone(ctx.copy),comparisonWindow:{atMs:ctx.copyMs,endMs:undefined},takes:['A','B'].map((take,i)=>{const n=ctx.nodes[i],y=box?box.y+i*(row+.035):undefined;return {id:take,nodeId:n?.id,expectedText:n?fullNode(n):undefined,source:undefined,startMs:undefined,endMs:undefined,playAtMs:undefined,labelRect:box?{x:box.x,y,width:box.width,height:row*.36}:undefined,waveRect:box?{x:box.x,y:y+row*.41,width:box.width,height:row*.22}:undefined,wordRect:box?{x:box.x,y:y+row*.69,width:box.width,height:row*.27}:undefined};})};
 }
 if(id.startsWith('paired-relations:')||['veil-state','full-frame-blur-zoom'].includes(id))return newPrimitiveDraft(ctx,id);
 const at=ctx.copyMs,end=ctx.duration,seconds=id==='closed-loop-runner'||id==='bounded-agent-runner';
 if(id.startsWith('quantitative-chart:')){
  const variant=id.split(':')[1],config={kind:'quantitative-chart',variant,clock:'scene-source-relative-ms',binding:clone(ctx.binding),copyWindow:clone(ctx.copy),chartWindow:{atMs:at,endMs:end},plotRect:clone(ctx.box),speakerRect:clone(ctx.speakerRect),dataKind:undefined,provenance:undefined};
  if(variant==='annotated-line'){Object.assign(config,{xAxis:undefined,yAxis:undefined,series:undefined,code:undefined,conditions:undefined});['xAxis','yAxis','series','code','conditions','xAxisLayout','yAxisLayout'].forEach(k=>need(ctx,k));}
  else{Object.assign(config,{axis:undefined,axisLayout:undefined,items:ctx.nodes.map(n=>({id:n.id,nodeId:n.id,from:undefined,to:undefined,decimals:undefined,atMs:undefined,durationMs:undefined,labelRect:undefined,valueRect:undefined}))});['axis','axisLayout','items[].from','items[].to','items[].decimals','items[].atMs','items[].durationMs','items[].labelRect','items[].valueRect'].forEach(k=>need(ctx,k));}
  ['dataKind','provenance'].forEach(k=>need(ctx,k));timeBudget(ctx,at+1200);return config;
 }
 if(seconds){
  const config={kind:id,clock:'scene-source-relative-seconds',binding:clone(ctx.binding),copyWindow:ctx.copy?{startSec:0,endSec:at/1000,rect:clone(ctx.box)}:undefined,graphicWindow:{startSec:at/1000,endSec:end/1000},speakerRect:clone(ctx.speakerRect),runStartSec:undefined,runner:undefined,path:undefined};
  if(id==='closed-loop-runner'){config.stages=undefined;need(ctx,'stages');}else{config.boundary=undefined;config.rules=undefined;need(ctx,'boundary');need(ctx,'rules');}
  ['runStartSec','runner','path'].forEach(k=>need(ctx,k));timeBudget(ctx,at+1200);return config;
 }
 if(id==='source-token-transfer'){
  const config={kind:id,clock:'scene-source-relative-ms',binding:{sceneId:ctx.scene.id,src:ctx.scene.src,durationMs:ctx.duration},sources:ctx.nodes.map(n=>({id:n.id,nodeId:n.id,expectedText:fullNode(n),rect:undefined,atMs:undefined})),tokens:undefined,copyWindow:clone(ctx.copy)};
  ['sources[].rect','sources[].atMs','tokens'].forEach(k=>need(ctx,k));return config;
 }
 if(id==='quantified-funnel-flow'){
  const config={kind:id,dataKind:undefined,provenance:undefined,totalCount:undefined,passedCount:undefined,unitPerDot:undefined,unit:undefined,atMs:at,emitMs:undefined,inletMs:undefined,passMs:undefined,settleMs:undefined,panelRect:clone(ctx.box),copyWindow:{atMs:0,durationMs:at}};
  ['dataKind','provenance','totalCount','passedCount','unitPerDot','unit','emitMs','inletMs','passMs','settleMs'].forEach(k=>need(ctx,k));return config;
 }
 if(id==='progressive-ui'){
  const panel=ctx.box?{...ctx.box,y:Math.max(.16,ctx.box.y),height:ctx.box.y+ctx.box.height-Math.max(.16,ctx.box.y)}:undefined;
  const config={kind:id,sourceKind:'illustration',provenance:undefined,copyWindow:clone(ctx.copy),panelRect:panel,elements:ctx.nodes.map(n=>({id:n.id,nodeId:n.id,role:undefined,atMs:undefined,fillMs:undefined,rect:undefined}))};
  ['provenance','elements[].role','elements[].atMs','elements[].fillMs','elements[].rect'].forEach(k=>need(ctx,k));timeBudget(ctx,at+2400);return config;
 }
 const panel=ctx.box?{...ctx.box,y:Math.max(.17,ctx.box.y),height:Math.min(.76,ctx.box.y+ctx.box.height)-Math.max(.17,ctx.box.y)}:undefined;
 const config={kind:'task-tracks',dataKind:undefined,provenance:undefined,domain:undefined,copyWindow:clone(ctx.copy),panelRect:panel,rows:ctx.nodes.map(n=>({id:n.id,nodeId:n.id,segments:undefined})),cursor:undefined,calendar:undefined};
 ['dataKind','provenance','domain','rows[].segments'].forEach(k=>need(ctx,k));timeBudget(ctx,at+3400);return config;
}

const supplementControls=[
 {kind:'field-roll-board',label:'稳定卡片逐格字段滚动',fields:[field('binding','当前原片身份','source-binding',{readonly:true}),field('clock','原场源时钟','text',{readonly:true,fixed:'scene-source-relative-ms'}),field('copyWindow','完整原文窗口','record',{fields:[time('atMs','开始'),time('endMs','结束'),rect('rect','完整正文区域')]}),rect('titleRect','完整标题区域'),rect('speakerRect','同源真实人物槽'),list('cards','稳定卡片与完整字段',[field('id','稳定卡片ID','stable-id',{readonly:true}),rect('rect','卡片位置'),...['enterAtMs','enterMs','exitAtMs','exitMs'].map(k=>time(k,k)),list('fields','完整来源到目标',[field('id','稳定字段ID','stable-id',{readonly:true}),field('sourceRef','来源完整字段','text',{readonly:true}),field('from','完整原值','text',{readonly:true}),field('to','明确完整目标值','text'),field('label','完整标签','text'),field('provenance','明确映射依据','record',{fields:[field('kind','映射类型','select',{source:'explicit-choice',options:['translation','format','authored-update']}),field('citation','完整来源说明','text'),field('fromLanguage','原语言','text'),field('toLanguage','目标语言','text')]}),rect('rect','完整字形区域'),rect('labelRect','完整标签区域'),...['rollAtMs','cellRollMs','staggerMs'].map(k=>time(k,k)),field('direction','滚动方向','select',{source:'explicit-choice',options:['up','down']})])])]},
 {kind:'quantified-funnel-flow',label:'显式数量分流与沉积',fields:[...provenance,...['totalCount','passedCount','unitPerDot'].map(k=>field(k,k,'number')),field('unit','数量单位','text'),...['atMs','emitMs','inletMs','passMs','settleMs','collectMs'].map(k=>time(k,k)),rect('panelRect','图解面板'),field('copyWindow','全文窗口','record',{fields:[time('atMs','开始'),time('durationMs','全文时长')]})]},
 {kind:'progressive-ui',label:'逐项界面说明板',fields:[field('sourceKind','明确原创示意','text',{fixed:'illustration'}),field('provenance','示意来源','text'),field('copyWindow','完整原文阅读窗口','record',{fields:[time('atMs','开始'),time('endMs','结束'),rect('rect','完整大字区域')]}),rect('panelRect','面板'),list('elements','原节点界面元素',[field('id','稳定ID','text',{readonly:true}),node(),field('role','元素角色','select',{options:['field','text','progress','image']}),...['atMs','fillAtMs','fillMs','focusAtMs','focusMs','questionAtMs'].map(k=>time(k,k)),field('from','明确起始进度','number'),field('to','明确结束进度','number'),rect('rect','元素框')]),field('annotation','作者可编辑说明（默认空）','text')]},
 {kind:'task-tracks',label:'显式任务时间轨道',fields:[...provenance,field('copyWindow','完整原文阅读窗口','record',{fields:[time('atMs','开始'),time('endMs','结束'),rect('rect','完整大字区域')]}),field('domain','明确共同时间域','record',{fields:[field('start','开始','number'),field('end','结束','number'),field('unit','单位','text')]}),rect('panelRect','轨道区域'),list('rows','完整原节点轨道',[field('id','稳定ID','text',{readonly:true}),node(),list('segments','明确时段',[field('id','稳定ID','text',{readonly:true}),field('label','完整时段标签','text'),field('from','起点','number'),field('to','终点','number'),...['atMs','drawMs','fillAtMs','fillMs','questionAtMs'].map(k=>time(k,k))])]),field('cursor','明确时间游标','record',{fields:[field('from','起值','number'),field('to','终值','number'),time('atMs','开始'),time('durationMs','时长')]}),field('calendar','明确日历标签','record',{fields:[rect('rect','日历真实区域'),time('flipMs','翻页时长'),list('values','真实日历数据',[field('value','数值','number'),field('label','完整标签','text'),time('atMs','出现')])]}),field('annotation','作者可编辑说明（默认空）','text')]}
];
const purpose={
 'conditional-set':'稳定对象在明确嵌套或并列集合间按独立门条件停回或通过，保留全部拒绝与许可历史；仅作者说明，不冒充软件执行。',
 'field-roll-board':'同一稳定卡片中按实际完整原值与明确目标逐格滚动；保留旧值/新值阅读时段和映射依据，不自动翻译或造统计。',
 'typed-data-clock':'一个源时钟驱动明确时长、原创范围或明示事件计数与图形；静态回执只显示同一时基差值，不假装跑表或软件执行。',
 'persistent-entities':'真实图片以稳定实例入栈后整组附着；或明确示意的五任务保留完成状态、全部成员摘要及归档。两组可组合，不冒充真实执行。',
 'audio-clock-ab':'使用本项目实际视频音轨与PCM波形比较A/B；比较窗唯一音轨，窗外恢复原声。没有素材或明确词时间不生成示例。',
 'paired-relations:correspondence':'按真实原节点和明确关系展示双方对应，不推断关系。','paired-relations:horizontal-alternate':'保留双方身份，沿同一横向通道移动并交替聚焦。','paired-relations:bidirectional':'按作者明确的关系与方向绘制双向对应，不冒充运行数据。','veil-state':'同一原对象遮蔽、冻结和恢复，明确是原创示意。','full-frame-blur-zoom':'同一原片或一张真实图片清晰→模糊缩放→清晰；真人持续清晰、原声只一轨。',
 'flip-board':'用原文完整分页翻字形成总览；当前固定板式须避开人物。','number-counter':'展示明确起止值的连续变化，缺数据时留空。','evidence-handoff':'保持对象身份，将已绑定的真实资料移入焦点。','glass-capsules':'在人物安全侧错峰显示并保留完整原文标签。','orbit-flow-variant':'用明确装饰点群、开口与目标资料表达关系。','bar-group-variant':'依据显式同尺度数据比较，禁止从文字猜统计值。','hub-branch-flow':'依据明确的对象角色、连接与状态时点展示分支协作。','screenshot-region-focus':'只放大实际原图中由用户圈选的像素ROI。','bilingual-board-transition':'保留完整原文与明确来源译文后换面。','emphasis-phrase':'完整原节点厚影重点字，收束字距和初始尺度。','caret-phrase':'完整原节点逐字写入，每页保留阅读时间。','cumulative-phrases':'逐项加入短语，已有项持续保留。','identity-sweep':'完整原节点身份条亮扫，不猜人物姓名或头衔。','source-token-transfer':'从明确字素范围复制同文词语，原句与限定条件留存。','closed-loop-runner':'沿明确闭合曲线逐阶段激活，保留稳定对象身份。','bounded-agent-runner':'描闭规则边界后沿明确曲线运动，不虚构反弹。','quantified-funnel-flow':'按明确整数数量分流，出口/沉积累计保持守恒。','quantitative-chart:horizontal-bars':'按明确线性或对数轴绘制数值横条。','quantitative-chart:signed-columns':'按明确共同零线绘制正负值及厚侧面。','quantitative-chart:annotated-line':'按明确点值、条件区域与代码对应解释折线。','progressive-ui':'逐项说明界面字段；不冒充真实工具执行。','task-tracks':'按明确时间域与任务时段绘制轨道，不杜撰工时。'
};
const required={
 'conditional-set':['provenance.note','outcomeLabels','copyWindow','graphicWindow','sets','gates','actors','events','gateViews'],
 'field-roll-board':['cards','cards[].fields[].sourceRef','cards[].fields[].to','cards[].fields[].provenance','cards[].fields[].timing'],
 'typed-data-clock':['copyWindow','当前原节点','轨道label/definition/provenance','明确时间依据/事件列表/静态端点','完整格式位数与显示区域'],
 'persistent-entities':['provenance.note','copyWindow','mediaStack 或 checklist','当前原节点与实际图片身份','明确原场动作与阅读时点'],
 'audio-clock-ab':['provenance','order','takes[].source','takes[].startMs','takes[].endMs','comparisonWindow'],
 'paired-relations:correspondence':['sides.a.nodeId','sides.b.nodeId','relation.type','relation.provenance','phases'],'paired-relations:horizontal-alternate':['sides.a.nodeId','sides.b.nodeId','relation.type','relation.provenance','phases'],'paired-relations:bidirectional':['sides.a.nodeId','sides.b.nodeId','relation.type','relation.provenance','phases[].flow'],'veil-state':['provenance','objects[].rect','objects[].freezeAtMs','objects[].releaseAtMs','objects[].appearance'],'full-frame-blur-zoom':['transition.atMs','transition.peakMs','transition.endMs','transition.clearHoldMs','transition.peakScale','transition.maxBlurPx'],
 'number-counter':['from','to','unit','decimals','direction','countMs'],'evidence-handoff':['cues','assetIdentity'],'orbit-flow-variant':['scene.media','count','gatherAtMs','openAtMs','flowAtMs'],'bar-group-variant':['scale','unit','items[].from','items[].to'],'hub-branch-flow':['hubNodeId','inputNodeIds','outputNodeIds','edges'],'screenshot-region-focus':['assetIdentity','sourceKind','provenance','focusRegion','explanationCues'],'bilingual-board-transition':['pairs[].toText','pairs[].fromLanguage','pairs[].toLanguage','provenance'],'source-token-transfer':['tokens','sources[].rect'],'closed-loop-runner':['path','runner','stages'],'bounded-agent-runner':['path','runner','boundary','rules'],'quantified-funnel-flow':['totalCount','passedCount','unitPerDot','unit','dataKind','provenance'],'quantitative-chart:horizontal-bars':['axis','items','dataKind','provenance'],'quantitative-chart:signed-columns':['axis','items','dataKind','provenance'],'quantitative-chart:annotated-line':['xAxis','yAxis','series','code','conditions','dataKind','provenance'],'progressive-ui':['provenance','elements[].role','elements[].atMs'],'task-tracks':['domain','rows[].segments','dataKind','provenance']
};
function integratedFields(fields,kind){return fields.map(f=>({...f,
 ...(f.key==='id'&&['paired-relations','veil-state'].includes(kind)?{readonly:true}:{}),
 ...(f.type==='select'&&['paired-relations','full-frame-blur-zoom','audio-clock-ab'].includes(kind)?{source:'explicit-choice'}:{}),
 ...(f.fields?{fields:integratedFields(f.fields,kind)}:{}),...(f.itemFields?{itemFields:integratedFields(f.itemFields,kind)}:{})}));}
const controls=[...dynamicMechanismControls,...phraseChoreographyControls,sourceTokenTransferControls,...pathRunnerControls,...supplementControls.filter(c=>c.kind!=='field-roll-board'),...quantitativeChartControls,...pairedRelationsControls,veilStateControls,fullFrameHandoffControls,audioClockControls,persistentMotionControls,typedClockMotionControls,conditionalSetViewControls,...supplementControls.filter(c=>c.kind==='field-roll-board')];
export const dynamicMotionLibrary=Object.freeze(controls.map(control=>{
 const id=control.variant?control.kind+':'+control.variant:control.kind;
 return Object.freeze({id,kind:control.kind,...(control.variant?{variant:control.variant}:{}),name:control.label,purpose:purpose[id],fields:integratedFields(clone([...control.fields,...(dynamicMechanismControls.some(c=>c.kind===control.kind)?[nativeCopyField]:[])]),control.kind),requiredData:clone(required[id]??[]),stage:'experimental-independent',uiAccepted:false,automaticAllowed:false,constructor:(scene,env)=>createDynamicLibraryConfig(id,scene,env)});
}));

/** Pure source-bound draft constructor; it never changes scene, facts or the active project. */
export function createDynamicLibraryConfig(id,scene,environment){
 const entry=dynamicMotionLibrary.find(item=>item.id===id);if(!entry)throw Error('请选择明确的动效类别；数值图表还需要指定变体。');
 const ctx=context(scene,environment),config=phraseKinds.includes(id)?phraseDraft(ctx,id):dynamicMechanismControls.some(c=>c.kind===id)?nativeDraft(ctx,id):advancedDraft(ctx,id);
 return {config,requiredData:unique(ctx.requiredData),issues:unique(ctx.issues)};
}
