import {matchingSource,projectStoryboard} from './storyboard.mjs';
import {visualPresets,visualContentRect,visualPresetIssues,applyVisualPreset,visualSequence} from './visual-presets.mjs';
import {presentationSize} from './presentation.mjs';
import {reviewClockMatches,sourceCaptionClock} from './source-review-clock.mjs';
import {fitMeasuredText} from './text-fit.mjs';
import {orbitGeometry,unequalGroupGeometry,evidenceGroups} from './diagram-layout.mjs';

const semanticRules={
 scope:/范围|覆盖|生态|受众|观众|复杂|边界|任何软件|所有软件/g,
 group:/集合|一组|包含|工具|多个|外部|账号|权限|平台/g,
 process:/步骤|流程|首先|第一步|第二步|第三步|然后|接着|先检查|再验证|最后一步/g,
 relation:/关系|连接|调用|传递|依赖|接口|协作|服务端|客户端|API|MCP/gi,
 evidence:/证据|截图|案例|页面|官网|演示|可以看到|验证结果|测试结果|复现结果|仓库|GitHub/gi,
 negation:/不代表|不是|不能|不等于|并非|不一定|无法|不要|没有|不会|不保证|未完成|不认为|复制不了|做不到|未能|不了|不|没|未/g,
 contrast:/对比|相比|区别|过去|现在|之前|之后|而不是|但是|不过|一方面|另一方面/g,
 ending:/总结|结尾|结论|记住|最后提醒|最后问|三个问题|先问三件事|最后三件事/g,
};
const names={scope:'范围',group:'集合',process:'步骤',relation:'关系',evidence:'证据',negation:'否定或限制',contrast:'对比',ending:'结尾'};
const unique=items=>[...new Set(items)];
const overlap=(a,b,c,d)=>Math.min(b,d)-Math.max(a,c)>0.001;
const wordsText=words=>words.map(word=>word.text).join('');
const visibleText=scene=>[scene.title,scene.body,...(scene.nodes??[]).flatMap(n=>[n.text,n.detail,...(n.bullets??[])])].filter(Boolean).join('\n');
const symbolCount=text=>Array.from(text.replace(/\s/g,'')).length;
const getSignals=text=>Object.entries(semanticRules).map(([kind,pattern])=>({kind,label:names[kind],terms:unique(text.match(pattern)??[])})).filter(signal=>signal.terms.length);
// Overlapping replays are separate viewings, never extra reading time. Use
// their fastest exposure over a union of source intervals; ordinary disjoint
// retained cuts still add up with each clip's actual speed.
function retainedTime(clips,start,end){
 const intervals=clips.map(clip=>({start:Math.max(start,clip.inSec*1000),end:Math.min(end,clip.outSec*1000),speed:clip.speed??1})).filter(interval=>interval.end>interval.start);
 const boundaries=unique(intervals.flatMap(interval=>[interval.start,interval.end])).sort((a,b)=>a-b);let duration=0;
 for(let i=1;i<boundaries.length;i++){const a=boundaries[i-1],b=boundaries[i],cover=intervals.filter(interval=>overlap(a,b,interval.start,interval.end));if(cover.length)duration+=(b-a)/Math.max(...cover.map(interval=>interval.speed));}
 return duration;
}

// Exact in-memory snapshot, deliberately not a lossy hash or a persisted log.
// Playhead/selection are excluded; all inputs that affect semantics or rendering
// are included. Equivalent-but-reordered objects safely require regeneration.
export function motionPlanSignature(state){
 return JSON.stringify({clips:state.clips??[],captions:state.captions??[],presentation:state.presentation??{},meta:state.meta??null,brolls:state.brolls??[],accentColor:state.accentColor??null});
}

export function sceneSpeechContext(state,scene){
 const all=(state.clips??[]).filter(clip=>matchingSource(scene,clip)&&overlap(scene.startMs,scene.endMs,clip.inSec*1000,clip.outSec*1000));
 const owner=all.find(clip=>clip.id===scene.clipId),byId=new Map(all.map(clip=>[clip.id,clip]));
 const warnings=[],records=[],matchedCaptionIds=[];
 const src=scene.src??all[0]?.src,clock=src?sourceCaptionClock(state,src):undefined;
 if(clock===null)warnings.push('当前原片的字幕时钟不完整或互相冲突，需重新核对');
 if(clock&&scene.personMatte?.sourceSha256&&clock.sourceSha256!==scene.personMatte.sourceSha256)warnings.push('字幕与人物遮挡层的原片校验不一致');
 for(const cap of state.captions??[]){
  const clip=byId.get(cap.clipId);if(!clip)continue;
  const start=Math.max(scene.startMs,clip.inSec*1000,cap.startMs),end=Math.min(scene.endMs,clip.outSec*1000,cap.endMs);
  if(end<=start)continue;
  // Different manually edited instances may share exactly the same media. The
  // explicitly anchored instance wins overlapping source seconds.
  if(cap.audioClock!==undefined&&!reviewClockMatches(cap.audioClock,cap.audioClock)){warnings.push('字幕不是可确认的原片零点时钟，未用于推荐');continue;}
  const allWords=cap.words??[],words=allWords.filter(word=>overlap(word.startMs,word.endMs,start,end));
  if(!words.length)continue;
  const text=wordsText(words),outside=allWords.filter(word=>!words.includes(word));
  if(cap.startMs<clip.inSec*1000-.001||cap.endMs>clip.outSec*1000+.001)warnings.push('有字幕句子被剪口截断，需听审上下文后再选动效');
  if(getSignals(wordsText(outside)).some(signal=>signal.kind==='negation')||getSignals(wordsText(allWords)).some(signal=>signal.kind==='negation')&&!getSignals(text).some(signal=>signal.kind==='negation'))warnings.push('同一句的限制或否定落在本场之外，需复核完整语义');
  records.push({clipId:clip.id,start,end,text,words});matchedCaptionIds.push(cap.id);
 }
 records.sort((a,b)=>a.start-b.start||a.end-b.end);
 for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
  const a=records[i],b=records[j];if(a.clipId!==b.clipId&&overlap(a.start,a.end,b.start,b.end)&&a.text!==b.text)warnings.push('同源重叠实例字幕不一致；一场会投影到各实例，保留原编排并复核');
 }
 const chosenRecords=records.filter(record=>!owner||record.clipId===owner.id||!overlap(record.start,record.end,owner.inSec*1000,owner.outSec*1000));
 const uniqueWords=new Map();for(const record of chosenRecords)for(const word of record.words)uniqueWords.set(JSON.stringify([word.startMs,word.endMs,word.text]),word);
 const words=[...uniqueWords.values()].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 const retainedMs=retainedTime(all,scene.startMs,scene.endMs);
 return {text:wordsText(words),words,matchedCaptionIds:unique(matchedCaptionIds),warnings:unique(warnings),retainedMs,clips:all};
}

function itemReadingWindows(scene,clips){
 const sequence=visualSequence(scene,0);
 return sequence.nodes.map((node,index)=>{
  const start=scene.startMs+sequence.starts[index],end=scene.startMs+(sequence.starts[index+1]??sequence.duration);
  const retainedMs=retainedTime(clips,start,end);
  return {nodeId:node.id,characters:symbolCount([node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n')),retainedMs};
 });
}

function textBoxes(scene,id,rect,width,height){
 const nodes=visualSequence(scene,0).nodes,header={text:scene.title,width:rect.width,height:height*.07,minFont:height*(['orbit-evidence','grouped-evidence'].includes(id)?.024:.023),maxFont:height*.041};
 const joined=node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n');
 if(id==='person-backdrop')return [{text:scene.embeddedText?.backdrop??scene.title,width:width*.94,height:height*.56,minFont:height*.10,maxFont:height*.64,weight:900},...(scene.embeddedText?.headline?[{text:scene.embeddedText.headline,width:width*.38,height:height*.20,minFont:height*.04,maxFont:height*.12}]:[])];
 if(id==='floating-evidence')return [header,...(scene.body?[{text:scene.body,width:rect.width,height:height*.065,minFont:height*.025,maxFont:height*.034}]:[])];
 if(id==='orbit-evidence'){
  const orbit=orbitGeometry(rect,0);
  return [header,...nodes.flatMap(node=>[{text:node.text,width:orbit.radius*1.4-32,height:orbit.radius*.44-32,minFont:height*.026,maxFont:height*.052},{text:[node.detail??scene.body??'',...(node.bullets??[])].filter(Boolean).join('\n'),width:rect.width,height:height*.10,minFont:height*.026,maxFont:height*.037}])];
 }
 if(id==='grouped-evidence'){
  const geometry=unequalGroupGeometry(rect),groups=evidenceGroups(scene),boxes=[header];
  for(const name of ['primary','secondary']){
   const box=geometry[name],members=groups[name],padding=height*.022,category=members[0]?.category,titleHeight=category?height*.052:0;
   const imageHeight=name==='primary'&&(scene.media||members[0]?.assetSrc)?box.height*.46:0;
   if(category)boxes.push({text:category,width:box.width-2*padding,height:titleHeight,minFont:height*.023,maxFont:height*.033});
   const rowHeight=(box.height-2*padding-titleHeight-imageHeight-(members.length-1)*8)/Math.max(1,members.length);
   for(const node of members)boxes.push({text:joined(node),width:box.width-2*padding-(node.icon?height*.031+12:0),height:Math.max(1,rowHeight-6),minFont:height*.025,maxFont:height*(name==='primary'?.043:.033)});
  }
  const label=scene.links?.find(link=>link.label)?.label;if(label)boxes.push({text:label,width:Math.max(1,geometry.secondary.x-geometry.primary.x-geometry.primary.width-16),height:height*.055,minFont:height*.021,maxFont:height*.031});
  return boxes;
 }
 const body=id==='fine-process'?{height:height*.35,minFont:height*.035,maxFont:height*.095}:id==='clear-type'?{height:rect.height-height*.15,minFont:height*.034,maxFont:height*.14}:{height:rect.height-height*.09,minFont:height*.04,maxFont:height*.16};
 return [...(nodes.length>1?[header]:[]),...nodes.map(node=>({text:joined(node),width:rect.width,...body}))];
}

function candidateFor(scene,preset,signals,context,options){
 const {width,height}=options.size,left=visualContentRect({...scene,visualPreset:{id:preset.id,version:1,side:'left'}},width,height),right=visualContentRect({...scene,visualPreset:{id:preset.id,version:1,side:'right'}},width,height);
 const side=left.width>=right.width?'left':'right',settings={side,...(preset.id==='grouped-evidence'&&scene.visualPreset?.primaryNodeIds?{primaryNodeIds:[...scene.visualPreset.primaryNodeIds]}:{})},candidate={...scene,visualPreset:{id:preset.id,version:1,...settings}},rect=side==='left'?left:right;
 const issues=visualPresetIssues(candidate,preset.id),reasons=[],warnings=[],has=kind=>signals.some(signal=>signal.kind===kind),count=context.activeNodeIds?.length??scene.nodes?.length??0;
 let score=0,semanticRole='none',automaticAllowed=true;
 if(!options.measure){automaticAllowed=false;warnings.push('尚未完成所选字体的实际测量，保留当前编排');}
 if(preset.id==='type-relay'){
  if(has('contrast')){score=87;semanticRole='contrast';reasons.push('对比内容逐项占主画面，避免等宽多列挤字');}
  else if(has('ending')){score=85;semanticRole='ending';reasons.push('结尾问题或要点逐项读清');}
  else if(count>1){score=43;semanticRole='objects';reasons.push('多个完整对象可逐项接力');}
  if(has('negation')&&getSignals(visibleText(scene)).some(signal=>signal.kind==='negation')){score=97;semanticRole='negation';reasons.splice(0,reasons.length,'完整限制句逐项讲清，保留否定和条件');}
 }
 if(preset.id==='clear-type'){
  if(has('negation')){score=96;semanticRole='negation';reasons.push('限制或否定保留完整句子，持续真人讲解');}
  else if(has('ending')){score=80;semanticRole='ending';reasons.push('结尾保留真人，用完整短句强调');}
  else if(has('contrast')){score=77;semanticRole='contrast';reasons.push('转折处以完整透明文字突出原话');}
  else if(symbolCount(visibleText(scene))<45){score=37;semanticRole='emphasis';reasons.push('短句可轻量强调，保留真人画面');}
  warnings.push('全幅真人侧区采用保守边界，需播放确认脸、手和字幕避让');
  if(scene.visualPreset?.id!=='clear-type'){automaticAllowed=false;warnings.push('尚未确认全幅真人避让，不自动改用透明融字；可预览后人工选用');}
 }
 if(preset.id==='person-backdrop'&&!has('negation')&&symbolCount(scene.embeddedText?.backdrop??scene.title)<=12){
  score=has('ending')?65:60;semanticRole='title';reasons.push('短标题且具备同源完整人物遮挡层，可作视觉支点');
 }
 if(preset.id==='floating-evidence'&&has('evidence')){score=95;semanticRole='evidence';reasons.push('口播正在引用案例或验证，已有真实媒体可成为证据主画面');}
 if(preset.id==='fine-process'&&(has('process')||has('relation'))&&count>=2){score=has('process')?94:84;semanticRole=has('process')?'process':'relation';reasons.push('步骤或调用关系适合按原有节点时点逐项连线');}
 if(preset.id==='orbit-evidence'&&has('scope')){score=92;semanticRole='scope';reasons.push('范围或复杂性可由概念圈点配合真实资料解释；点阵不编码实际数量');}
 if(preset.id==='grouped-evidence'&&has('group')&&(has('relation')||has('scope'))&&count>=2){score=93;semanticRole='group';reasons.push('集合与外部对象用异宽容器和关系线表达');}
 if(has('negation')&&['person-backdrop','orbit-evidence'].includes(preset.id)){score=0;warnings.push('含否定或能力边界，不自动改成巨型能力词或范围图');}
 if(!score)reasons.push('本场语义不要求这类表达，不为增加花样强选');
 if(!context.retainedMs)issues.push('本场没有保留的口播时间');
 const windows=itemReadingWindows(scene,context.clips),rate=symbolCount(visibleText(scene))/Math.max(.001,context.retainedMs/1000);
 if(['type-relay','clear-type','fine-process','orbit-evidence'].includes(preset.id)&&windows.some(window=>window.retainedMs>0&&window.characters/(window.retainedMs/1000)>14)){automaticAllowed=false;warnings.push('某对象保留的阅读时窗较短，需逐场预览或保留原编排');}
 let pages=1;
 if(options.measure&&!issues.length){
  for(const box of textBoxes(candidate,preset.id,rect,width,height)){const fit=fitMeasuredText(box.text,{...box,measure:(text,size)=>options.measure(text,size,box.weight??400)});pages=Math.max(pages,fit.pages.length);if(fit.unplaceable)issues.push('完整文字无法容纳最小可读字号');}
 }
 if(pages>1)warnings.push(`完整文字需分为最多${pages}页，须核对实际阅读时间`);
 if(rate>14&&context.retainedMs>0){automaticAllowed=false;warnings.push('本场完整字量高于本地阅读预算，方案不改文案也不延长口播');}
 if(pages>1&&context.clips.some(clip=>clip.inSec*1000>scene.startMs+.001||clip.outSec*1000<scene.endMs-.001)){automaticAllowed=false;warnings.push('跨剪口分页可能有页面不在保留窗口，需逐场播放复核');}
 return {id:preset.id,score,semanticRole,automaticAllowed,reasons,warnings:unique(warnings),issues:unique(issues),options:settings,pages};
}

export function generateMotionPlan(state,{preserveExisting=true,measure}={}){
 const scenes=state.presentation?.scenes??[],size=presentationSize(state.presentation),fps=state.meta?.fps??30,rows=[];
 const projected=projectStoryboard(scenes,state.clips??[],fps),order=new Map();for(const scene of projected)if(!order.has(scene.sourceId))order.set(scene.sourceId,scene.startMs);
 let previous=null;
 for(const scene of [...scenes].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity))){
  const context=sceneSpeechContext(state,scene),readingWindows=itemReadingWindows(scene,context.clips),activeNodeIds=readingWindows.filter(window=>window.retainedMs>0).map(window=>window.nodeId);
  context.activeNodeIds=activeNodeIds;
  const spokenSignals=getSignals(context.text),writtenSignals=getSignals(visibleText({...scene,nodes:scene.nodes?.filter(node=>activeNodeIds.includes(node.id))}));
  const signals=Object.keys(semanticRules).map(kind=>{const spoken=spokenSignals.find(signal=>signal.kind===kind),written=writtenSignals.find(signal=>signal.kind===kind);return {kind,label:names[kind],terms:unique([...(spoken?.terms??[]),...(written?.terms??[])]),sources:[...(spoken?['当前保留字幕']:[]),...(written?['当前可见场景文字']:[])]};}).filter(signal=>signal.terms.length),warnings=[...context.warnings];
  if(readingWindows.some(window=>!window.retainedMs))warnings.push('部分对象没有保留的口播时窗，未用它们驱动语义推荐，请预览确认');
  if(!context.text)warnings.push('本场没有可确认的当前字幕，只能依据已写内容作保守建议');
  const negated=spokenSignals.some(s=>s.kind==='negation'),titleNegated=getSignals(scene.title).some(s=>s.kind==='negation');
  if(negated&&!titleNegated&&/所有|任何|任意|随便|都能|一键|100%|百分之百/.test(scene.title))warnings.push('口播含否定，但标题像无条件能力承诺；保留并人工核对，不自动改写');
  const candidates=visualPresets.map(preset=>candidateFor(scene,preset,signals,context,{size,measure})).sort((a,b)=>b.score-a.score);
  const eligible=candidates.filter(candidate=>!candidate.issues.length&&candidate.automaticAllowed&&candidate.score>=35),best=eligible[0];let chosen=best;
  // Only a close, semantically-supported alternative can reduce repetition.
  if(best?.id===previous){const alternative=eligible.find(candidate=>candidate.id!==previous&&candidate.semanticRole===best.semanticRole&&candidate.score>=best.score-8);if(alternative)chosen=alternative;}
  const blocked=context.warnings.length>0||warnings.some(w=>w.includes('能力承诺'))||!context.retainedMs;
  const selected=blocked||preserveExisting&&scene.visualPreset?'keep':chosen?.id??'keep';
  const reasons=selected==='keep'?[scene.visualPreset&&preserveExisting?'保留已有人工选择，可逐场解除保留':blocked?'当前证据或语义需要复核，保留原编排':'没有足够明确且满足条件的视觉语义，保留原编排']:[...(chosen?.reasons??[])];
  if(chosen&&chosen!==best&&selected!=='keep')reasons.push('使用语义近分的可行表达，减少相邻重复');
  const selectedCandidate=candidates.find(candidate=>candidate.id===selected);
  const row={sceneId:scene.id,title:scene.title,sourceStartMs:scene.startMs,sourceEndMs:scene.endMs,retainedMs:context.retainedMs,spokenText:context.text,matchedCaptionIds:context.matchedCaptionIds,signals,candidates,recommended:chosen?.id??null,selected,options:selectedCandidate?.options??{},reasons,baseWarnings:unique(warnings),warnings:unique([...warnings,...(selectedCandidate?.warnings??[])]),characters:symbolCount(visibleText(scene)),readingWindows};
  rows.push(row);previous=selected==='keep'?scene.visualPreset?.id??null:selected;
 }
 return {version:1,method:'local-semantic-rules',measurement:measure?'provided-font-metrics':'unmeasured',signature:motionPlanSignature(state),rows};
}

export function updateMotionPlanSelection(plan,sceneId,selected){
 const row=plan.rows.find(row=>row.sceneId===sceneId);if(!row)return {ok:false,error:'方案中没有这场分镜'};
 const candidate=row.candidates.find(candidate=>candidate.id===selected);
 if(selected!=='keep'&&(!candidate||candidate.issues.length))return {ok:false,error:candidate?.issues.join('；')??'未知动效'};
 return {ok:true,plan:{...plan,rows:plan.rows.map(item=>item.sceneId!==sceneId?item:{...item,selected,options:candidate?.options??{},reasons:selected==='keep'?['人工选择保留当前编排']:[...(candidate?.reasons??[]),'已由人工修改本场选择'],warnings:unique([...(item.baseWarnings??[]),...(candidate?.warnings??[])])})}};
}

export function applyMotionPlanToStore(store,plan){
 const state=store.getState();
 if(plan?.version!==1||plan.method!=='local-semantic-rules'||motionPlanSignature(state)!==plan.signature)return {ok:false,error:'工程已变化，请重新生成方案后再应用'};
 if(plan.measurement!=='provided-font-metrics'&&plan.rows?.some(row=>row.selected!=='keep'))return {ok:false,error:'尚未实际测量所选字体，请从工作台重新生成方案'};
 if(!Array.isArray(plan.rows)||new Set(plan.rows.map(row=>row.sceneId)).size!==plan.rows.length||plan.rows.length!==(state.presentation.scenes??[]).length)return {ok:false,error:'全片方案的分镜集合无效，请重新生成'};
 let presentation=state.presentation;
 for(const row of plan.rows){
  const scene=presentation.scenes?.find(scene=>scene.id===row.sceneId);if(!scene)return {ok:false,error:'分镜已不存在，请重新生成方案'};
  if(row.selected==='keep')continue;
  const candidate=row.candidates.find(candidate=>candidate.id===row.selected);if(!candidate||candidate.issues.length)return {ok:false,error:'有未满足条件的动效，未应用整案'};
  const result=applyVisualPreset(presentation,row.sceneId,row.selected,candidate.options);if(!result.ok)return result;presentation=result.presentation;
 }
 if(JSON.stringify(presentation)===JSON.stringify(state.presentation))return {ok:true,changed:false};
 state.setPresentation(presentation);return {ok:true,changed:true};
}
