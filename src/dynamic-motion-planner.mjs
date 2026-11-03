import {sceneSpeechContext,motionPlanSignature} from './motion-planner.mjs';
import {matchingSource,projectStoryboard} from './storyboard.mjs';
import {presentationSize} from './presentation.mjs';
import {visualSequence,visualPresetIssues} from './visual-presets.mjs';
import {sourceCaptionClock} from './source-review-clock.mjs';
import {createDynamicLibraryConfig,dynamicMotionLibrary} from './dynamic-motion-library.mjs';

const finite=Number.isFinite,unique=a=>[...new Set(a)],overlap=(a,b,c,d)=>Math.min(b,d)>Math.max(a,c)+.001;
const full=n=>[n.text,n.detail,...(n.bullets??[])].filter(v=>typeof v==='string'&&v.length).join('\n');
const negation=/不代表|不等于|不是|不能|并非|不一定|无法|不要|没有|不会|不保证|未完成|不认为|复制不了|做不到|未能|不了|不|没|未/;
const universal=/所有|任何|任意|随便|都能|一键|100%|百分之百/;
const explicitChange=/(?:从|由)\s*[+−-]?\d[\d.,%\s万亿千百秒分钟小时]*.{0,10}(?:增加到|减少到|增长到|下降到|升至|降至|变成|到)\s*[+−-]?\d|\d[\d.,%\s万亿千百]*\s*(?:→|增长至|下降至|增至|降至)\s*[+−-]?\d/;
const relation=/调用|依赖|连接|传递给|交给|交回|返回|导致|因此|所以|根据.{0,16}(?:分析|检查|验证)|把.{0,24}(?:交给|接到|传给)/;
const numbers=/[+−-]?\d+(?:\.\d+)?(?:%|％|万|亿|倍|秒|分钟|小时|Mbps|Kbps)?/g;
const quoted=(text,pattern)=>unique(text.match(pattern)??[]);
const optionsSnapshot=options=>({preserveExisting:options.preserveExisting!==false,sourceIdentities:options.sourceIdentities??[],assetIdentities:options.assetIdentities??[],width:options.width,height:options.height});
export function dynamicMotionPlanSignature(state,options={}){return JSON.stringify({state:motionPlanSignature(state),evidence:optionsSnapshot(options)});}

function sourceContext(state,scene,options){
 const context=sceneSpeechContext(state,scene),warnings=[...context.warnings],clips=context.clips,byId=new Map(clips.map(c=>[c.id,c])),owner=byId.get(scene.clipId),evidence=[];
 for(const cap of state.captions??[]){
  const clip=byId.get(cap.clipId);if(!clip)continue;
  const a=Math.max(scene.startMs,clip.inSec*1000,cap.startMs),b=Math.min(scene.endMs,clip.outSec*1000,cap.endMs);if(b<=a)continue;
  if(owner&&clip.id!==owner.id&&overlap(a,b,owner.inSec*1000,owner.outSec*1000))continue;
  for(const word of cap.words??[]){
   if(!overlap(word.startMs,word.endMs,a,b))continue;
   if(!finite(word.startMs)||!finite(word.endMs)||word.startMs<a-.001||word.endMs>b+.001){warnings.push('词级时间跨越本场或保留剪口，不能把被剪半词当完整依据');continue;}
   if(context.words.some(w=>w.text===word.text&&w.startMs===word.startMs&&w.endMs===word.endMs))evidence.push({source:'retained-caption',captionId:cap.id,clipId:clip.id,text:word.text,startMs:word.startMs,endMs:word.endMs});
  }
 }
 const sequence=visualSequence(scene,0),activeNodeIds=sequence.nodes.filter((node,i)=>clips.some(clip=>overlap(scene.startMs+sequence.starts[i],scene.startMs+(sequence.starts[i+1]??sequence.duration),clip.inSec*1000,clip.outSec*1000))).map(n=>n.id);
 if((scene.nodes??[]).some(n=>!activeNodeIds.includes(n.id)))warnings.push('有原节点的口述时窗未保留，不用被剪掉的节点触发推荐');
 const activeNodes=(scene.nodes??[]).filter(n=>activeNodeIds.includes(n.id));
 const written=[{source:'scene-title',text:scene.title},{source:'scene-body',text:scene.body},...activeNodes.map(n=>({source:'scene-node',nodeId:n.id,text:full(n)}))].filter(v=>typeof v.text==='string'&&v.text.length);
 evidence.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 const uniqueSpeech=new Map();for(const word of evidence)uniqueSpeech.set(JSON.stringify([word.startMs,word.endMs,word.text]),word);
 const spoken=[...uniqueSpeech.values()].map(w=>w.text).join(''),writtenText=written.map(w=>w.text).join('\n'),boundaryContext=[];
 // A negative lead-in can be its own subtitle cue in the preceding scene.
 // Preserve it as boundary evidence, never as extra words/read time here.
 if(universal.test(spoken+'\n'+(scene.title??''))){
  const boundaryClips=new Map(byId),index=(state.clips??[]).findIndex(c=>c.id===owner?.id),previous=index>0?state.clips[index-1]:null;
  if(previous&&matchingSource(scene,previous)&&previous.outSec*1000<=scene.startMs+.001)boundaryClips.set(previous.id,previous);
  for(const cap of state.captions??[]){
   const clip=boundaryClips.get(cap.clipId),onPrevious=previous?.id===clip?.id;
   if(!clip||owner&&owner.id!==clip.id&&!onPrevious||cap.endMs>scene.startMs+.001||(!onPrevious&&scene.startMs-cap.endMs>5000)||(onPrevious&&clip.outSec*1000-cap.endMs>1500)||cap.startMs<clip.inSec*1000-.001||cap.endMs>clip.outSec*1000+.001)continue;
   const text=(cap.words??[]).map(w=>w.text).join('');
   if(/(?:不代表|不意味着|不是说|不能认为|并非|不会把.{0,24}(?:理解成|当成))[，,：:\s]*$/.test(text)){warnings.push('前一条保留字幕含未完的否定引句，本场能力句必须与其连读核对');boundaryContext.push({source:'preceding-retained-caption-context',captionId:cap.id,clipId:clip.id,text,startMs:cap.startMs,endMs:cap.endMs});}
  }
 }
 if(!spoken)warnings.push('没有可确认的当前保留字幕；仅列场景原文草稿供复核');
 if(negation.test(context.text)&&!negation.test(scene.title??'')&&universal.test(scene.title??''))warnings.push('保留口述含否定，但标题像无条件能力承诺，需先核对完整语义');
 const proof=options.sourceIdentities?.find(p=>p.src===scene.src),clock=sourceCaptionClock(state,scene.src);
 if(clock&&proof&&clock.sourceSha256!==proof.sha256)warnings.push('当前保留字幕与实际原片SHA不一致，不能依据旧转写推荐');
 const projections=projectStoryboard([scene],state.clips??[],state.meta?.fps??30).map(p=>({id:p.id,clipId:p.clipId,sourceStartMs:scene.startMs+(p.sourceOffsetMs??0),sourceEndMs:scene.startMs+(p.sourceOffsetMs??0)+(p.endMs-p.startMs)*(p.speed??1),speed:p.speed??1}));
 if(projections.some(p=>p.sourceStartMs>scene.startMs+.01||p.sourceEndMs<scene.endMs-.01))warnings.push('本场跨剪口或只有部分源时段保留；逐实例全文曝光待复核');
 if(projections.some((a,i)=>projections.slice(i+1).some(b=>overlap(a.sourceStartMs,a.sourceEndMs,b.sourceStartMs,b.sourceEndMs))))warnings.push('同源重复观看实例必须各自预览，不把重复时长相加抵阅读预算');
 return {...context,text:spoken,evidence:unique(evidence.map(v=>JSON.stringify(v))).map(v=>JSON.parse(v)),boundaryContext,written,activeNodes,activeNodeIds,writtenText,warnings:unique(warnings),projections};
}

function candidateSignals(scene,context){
 const spoken=context.text,written=context.writtenText,text=spoken+'\n'+written,negative=negation.test(text),nodes=context.activeNodes;
 const links=(scene.links??[]).filter(l=>l.from!==l.to&&nodes.some(n=>n.id===l.from)&&nodes.some(n=>n.id===l.to));
 const named=nodes.filter(n=>typeof n.text==='string'&&n.text.length>=2&&spoken.includes(n.text));
 const explicitRelation=!negative&&nodes.length>=3&&(links.length>0||relation.test(spoken)&&named.length>=2);
 const media=[...new Set([scene.media?.src,...(scene.nodes??[]).map(n=>n.assetSrc)].filter(Boolean))];
 return {text,spoken,negative,nodes,links,named,media,explicitRelation,change:!negative&&explicitChange.test(spoken),numericCount:quoted(spoken,numbers).length};
}
function propose(scene,c,s){
 const choices=[],excluded=[];
 const add=(id,score,role,reasons,basis=c.evidence.length?c.evidence:c.written)=>choices.push({entryId:id,score,role,reasons,originalEvidence:basis});
 const reject=(entryId,reason)=>excluded.push({entryId,reason});
 if(s.media.length){
  add('evidence-handoff',98,'evidence',['本场已有真实资料，优先让原材料与完整说明共同可见，不以纯文字替换证据。'],[...c.evidence,...s.media.map(src=>({source:'scene-media',src}))]);
  if(/局部|这一行|这行|这个字段|这段|圈出|框选|放大|原文|细节/.test(s.text))add('screenshot-region-focus',100,'evidence',['原话明确在指认原材料的局部；ROI必须在当前真实图上圈选，候选不会猜像素。']);
  else add('screenshot-region-focus',75,'evidence',['可作为原图细字阅读的备选；须明确选择区域和来源后再预览。']);
  for(const id of ['emphasis-phrase','caret-phrase','cumulative-phrases','identity-sweep','glass-capsules','flip-board'])reject(id,'本场已绑定资料，纯文字机制会隐藏资料，优先保留证据。');
 }else if(s.nodes.length){
  const role=s.negative?'complete-limitation':'complete-point';
  add('emphasis-phrase',s.negative?95:86,role,[s.negative?'保留完整否定和限制句，用完整原节点强调，不能抽成能力承诺。':'已有完整原论点和稳定节点ID，可用整句重点字讲清。']);
  if(s.nodes.length<=6)add('glass-capsules',s.negative?92:83,role,['完整原节点可在已知人物安全侧逐项保留；不截短条件或改写结论。']);
  if(s.nodes.length>1)add('cumulative-phrases',/逐项|几个|清单|第一|第二|第三|三件|三个/.test(s.text)?91:80,role,['多个完整原节点适合累积，旧项继续保留，字量/时长不足则待复核。']);
  if(/总览|清单|列出|对象|平台|步骤/.test(s.text))add('flip-board',72,role,['完整原字段可分格总览；固定字板几何与全文分页阅读需要额外预览。']);
  if(/输入|打字|逐字|光标/.test(s.spoken))add('caret-phrase',88,role,['保留字幕明确提到输入/逐字，才将打字作为表达候选；它不是音频词游标。']);
  if(/我叫|姓名|身份|职务|担任|主讲人|作者是/.test(s.spoken))add('identity-sweep',87,role,['原话明确说明身份或角色，只使用原节点内容，不补造姓名职务。']);
 }else reject('emphasis-phrase','短语类需要真实完整节点ID；不从标题凭空新建论点。');
 if(s.explicitRelation&&!scene.media?.src)add('hub-branch-flow',92,'explicit-relation',['保留原话中有节点间明确关系，或已有显式原场连线。只提出图解方向；hub/输入输出/边结构仍需逐项确认。'],[...c.evidence,...s.links.map(l=>({source:'scene-link',linkId:l.id,from:l.from,to:l.to,text:l.label??''}))]);
 else reject('hub-branch-flow',scene.media?.src?'此图机制不显示本场已绑定的主媒体，保留真实证据优先。':s.negative?'否定/限制不转成肯定关系图。':'没有足够明确的原节点关系；同场多个词或列表顺序不等于因果/图结构。');
 if(!s.media.length&&s.nodes.length&&/原词|关键词|抽取|这几个字|条件|偏好/.test(s.spoken))add('source-token-transfer',78,'source-words',['可显式选择原词字素范围并复制到目标槽；原句与限定条件必须持续保留，候选不自动抽词改写。']);
 if(s.change)add('number-counter',89,'explicit-number-change',['保留字幕确有明确数值起止变化；数值、单位、方向和来源仍留待核对，不由关键词解析填入。']);
 else reject('number-counter','静态数字、年份、序号或泛称增长不证明明确起止计数；没有这项候选。');
 if(!s.negative&&s.numericCount>=2&&/柱状|条形图|折线|走势图|对数轴|正负柱|共同尺度|数据对比/.test(s.spoken)){
  const variant=/折线|走势图/.test(s.spoken)?'annotated-line':/正负柱/.test(s.spoken)?'signed-columns':'horizontal-bars';
  add('quantitative-chart:'+variant,90,'explicit-chart',['原话明确说明数据图种且有数值线索；完整数据、轴、单位和来源仍需显式填写，不默认0→100。']);
  if(variant==='horizontal-bars'&&/共同尺度|同尺度/.test(s.spoken))add('bar-group-variant',84,'explicit-chart',['共同尺度条形原语可作为备选；需要显式scale/单位/逐对象值，不从口述数字填统计。']);
 }else for(const id of ['quantitative-chart:horizontal-bars','quantitative-chart:signed-columns','quantitative-chart:annotated-line','bar-group-variant'])reject(id,'没有当前口述的明确可比图表数据合同，静态数字不自动变成统计图。');
 if(!s.negative&&s.numericCount>=2&&/漏斗/.test(s.spoken)&&/总量|曝光|通过量|通过率|观看/.test(s.spoken))add('quantified-funnel-flow',88,'quantified-filter',['原话明确讨论带数量的漏斗；总量/通过量/点值/单位与来源必须提供，装饰点流不能代替。']);
 else reject('quantified-funnel-flow','没有明确数量口径与漏斗语义，不把概念筛选画成统计。');
 if(!s.negative&&s.nodes.length>=2&&/闭环|循环|迭代|重试|反复验证/.test(s.spoken))add('closed-loop-runner',81,'explicit-cycle',['保留原话明确有循环关系；闭合路径/阶段/反馈必须配置，不从轮数推造版本或成功。']);
 if(!s.negative&&/边界内|围栏内|规则范围内|框内运行/.test(s.spoken))add('bounded-agent-runner',80,'explicit-boundary',['原话明确是边界内行动；必须给明确规则、轨迹和人物位置，不发明碰撞反弹。']);
 if(!s.negative&&scene.media?.src&&!s.nodes.some(n=>n.assetSrc)&&/点群|外点|概念点/.test(s.spoken)&&/聚集|开口|点流/.test(s.spoken))add('orbit-flow-variant',82,'explicit-conceptual-set',['原话明确以概念点群聚集/开口向资料转移；点只是装饰，数量与轨迹待填写，不编码统计。']);
 if(/翻译|译文|双语/.test(s.spoken))add('bilingual-board-transition',76,'explicit-bilingual',['原话明确在讲双语/译文；只保留原文，译文和来源仍待填写。']);
 else reject('bilingual-board-transition','英文项目名或中文全称不等于已有翻译对，不自动翻译。');
 if(!s.negative&&/示意界面|说明板|字段输入/.test(s.spoken))add('progressive-ui',66,'explicit-illustration',['原话明确需要说明板；元素角色和时点待补，不能冒充真实产品执行。']);
 if(!s.negative&&/任务时间轨|时间跨度|时间轴|日历/.test(s.spoken))add('task-tracks',65,'explicit-time-layout',['原话明确讨论时间布局；共同时间域/日期/任务时段仍待核实，不造工时。']);
 if(s.media.length){for(let i=choices.length-1;i>=0;i--)if(!['evidence-handoff','screenshot-region-focus','hub-branch-flow','orbit-flow-variant'].includes(choices[i].entryId)){reject(choices[i].entryId,'这项机制不会显示本场原有资料，不能为变化样式而隐藏真实证据。');choices.splice(i,1);}}
 return {choices,excluded};
}

/** Reviewable suggestions only. There is deliberately no batch apply export. */
export function generateDynamicMotionPlan(state,options={}){
 const size={...presentationSize(state.presentation),...(finite(options.width)?{width:options.width}:{}),...(finite(options.height)?{height:options.height}:{})},scenes=state.presentation?.scenes??[],projected=projectStoryboard(scenes,state.clips??[],state.meta?.fps??30),order=new Map();
 for(const p of projected)if(!order.has(p.sourceId))order.set(p.sourceId,p.startMs);
 const rows=[];let previous=null;
 for(const scene of [...scenes].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity))){
  const context=sourceContext(state,scene,options),signals=candidateSignals(scene,context),proposals=propose(scene,context,signals),assetSrc=scene.media?.src??scene.nodes?.find(n=>n.assetSrc)?.assetSrc;
  const env={...size,sourceIdentity:options.sourceIdentities?.find(p=>p.src===scene.src),assetIdentity:options.assetIdentities?.find(p=>p.src===assetSrc)};
  const candidates=proposals.choices.map(c=>{
   const entry=dynamicMotionLibrary.find(e=>e.id===c.entryId);let draft;
   try{draft=createDynamicLibraryConfig(c.entryId,scene,env);}catch(e){draft={config:undefined,requiredData:['sourceScene'],issues:[e.message]};}
   return {...c,name:entry.name,kind:entry.kind,...(entry.variant?{variant:entry.variant}:{}),requiredData:draft.requiredData,issues:draft.issues,config:draft.config,requiresRendererSession:true,canApply:false};
  }).sort((a,b)=>b.score-a.score);
  const blocked=context.warnings.length>0||!context.retainedMs;
  const matteBackdrop=!!scene.personMatte&&(scene.visualPreset?.id==='person-backdrop'||scene.titleTreatment==='embedded'&&!!scene.embeddedText?.backdrop)&&!visualPresetIssues(scene,'person-backdrop').length;
  const locked=options.preserveExisting!==false&&!!(scene.dynamicMotion||scene.visualPreset||matteBackdrop);
  const lockReason=locked?matteBackdrop?'保留已有同源人物遮挡层与后景字，不换成普通前景字。':'已有人工动态/视觉选择默认锁定；可逐场显式解锁。':null;
  let chosen=candidates[0];
  if(chosen?.entryId===previous){const alternative=candidates.find(c=>c.entryId!==previous&&c.role===chosen.role&&c.score>=chosen.score-4&&c.requiredData.length<=chosen.requiredData.length&&!c.issues.length);if(alternative&&!chosen.issues.length){chosen=alternative;chosen={...chosen,reasons:[...chosen.reasons,'仅在同一语义、同等资料与安全条件内选择近分表达，减少相邻机械重复。']};}}
  const selectedEntryId=locked||blocked?'keep':chosen?.entryId??'keep';
  const reasons=locked?[lockReason]:blocked?['当前字幕/剪口/重复实例或完整语义需复核，默认保留原编排。']:chosen?.reasons??['没有满足当前表达与事实前置的候选，保留原编排。'];
  rows.push({sceneId:scene.id,title:scene.title,src:scene.src,sourceStartMs:scene.startMs,sourceEndMs:scene.endMs,retainedMs:context.retainedMs,projections:context.projections,spokenText:context.text,matchedCaptionIds:context.matchedCaptionIds,originalEvidence:context.evidence,boundaryContext:context.boundaryContext,activeNodeIds:context.activeNodeIds,locked,lockReason,contextReviewRequired:blocked,warnings:context.warnings,candidates,excluded:proposals.excluded,recommendedEntryId:chosen?.entryId??null,selectedEntryId,reasons,canApply:false,requiresRendererSession:true});
  previous=selectedEntryId==='keep'?null:selectedEntryId;
 }
 return {version:1,method:'local-retained-source-rules',signature:dynamicMotionPlanSignature(state,options),options:optionsSnapshot(options),automaticAllowed:false,requiresPerSceneRendererSession:true,canApply:false,rows};
}
export function updateDynamicMotionPlanSelection(plan,sceneId,entryId,{unlockManual=false}={}){
 const row=plan?.rows?.find(r=>r.sceneId===sceneId);if(!row)return {ok:false,error:'方案中没有这场原场景。'};
 if(row.locked&&!unlockManual&&entryId!=='keep')return {ok:false,error:'已有人工选择已锁定，请先明确解锁本场。'};
 if(entryId!=='keep'&&!row.candidates.some(c=>c.entryId===entryId))return {ok:false,error:'本场没有这项有依据的候选；可在独立编辑器另行手动配置。'};
 return {ok:true,plan:{...plan,rows:plan.rows.map(r=>r!==row?r:{...r,locked:unlockManual?false:r.locked,selectedEntryId:entryId,reasons:[entryId==='keep'?'人工选择保留原编排。':'人工选择候选；待补事实与逐场预览门仍有效。'],canApply:false})}};
}
/** Consumer opens one editor and reconstructs against fresh source evidence; this does not carry apply authority. */
export function dynamicMotionEditorRequest(plan,sceneId,state,options={}){
 if(plan?.version!==1||plan.method!=='local-retained-source-rules'||plan.signature!==dynamicMotionPlanSignature(state,options))return {ok:false,error:'原文、剪口、素材身份或输出已变化，请重新生成建议。'};
 const row=plan.rows.find(r=>r.sceneId===sceneId),candidate=row?.candidates.find(c=>c.entryId===row.selectedEntryId);
 if(!row||row.selectedEntryId==='keep'||!candidate)return {ok:false,error:'本场保留原编排；请先人工选择一个有依据的候选。'};
 return {ok:true,sceneId:row.sceneId,entryId:candidate.entryId,requiredData:[...candidate.requiredData],issues:[...row.warnings,...candidate.issues],requiresRendererSession:true,canApply:false};
}
