import {projectStoryboard,sceneLabels,validateStoryboard} from './storyboard.mjs';

export function reviewTime(ms){
 const value=Math.max(0,Math.round(ms)),minutes=Math.floor(value/60000);
 return `${String(minutes).padStart(2,'0')}:${String(Math.floor(value/1000)%60).padStart(2,'0')}.${String(value%1000).padStart(3,'0')}`;
}
const range=(a,b)=>`${reviewTime(a)}—${reviewTime(b)}`;
const cell=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','&#124;').replace(/\r?\n/g,' / ');

// Read-only review of the saved plan. Object timings are clipped to each retained
// source fragment, then mapped through its actual clip speed and frame placement.
export function storyboardReview(project,fps=30){
 const scenes=project.presentation?.scenes??[],clips=project.clips??[];
 const rows=projectStoryboard(scenes,clips,fps).map(part=>{
  const scene=scenes.find(s=>s.id===part.sourceId),clip=clips.find(c=>c.id===part.clipId);
  const sourceStartMs=scene.startMs+part.sourceOffsetMs;
  const sourceEndMs=Math.min(scene.endMs,clip.outSec*1000);
  const events=[];
  const textCues=(scene.nodes??[]).flatMap(node=>(node.textCues??[]).map((cue,index)=>({...cue,id:node.id+'.text-'+index})));
  const comparison=scene.overviewComparison;
  const comparisonImages=comparison?['before','after'].map(key=>({...comparison[key],id:scene.id+'.comparison-'+key,text:`${comparison[key].label} · ${comparison[key].src}`})):[];
  for(const [kind,objects] of [['标签',scene.tags??[]],['高亮',scene.highlights??[]],['对象',scene.nodes??[]],['文字强调',textCues],['对照图片',comparisonImages],['对照加工项',comparison?.steps??[]]])for(const object of objects){
   const a=Math.max(sourceStartMs,scene.startMs+(object.atMs??0));
   const b=Math.min(sourceEndMs,scene.startMs+(object.endMs??(scene.endMs-scene.startMs)));
   if(b<=a)continue;
   events.push({id:object.id,kind,text:object.text??object.mode??'',startMs:part.startMs+(a-sourceStartMs)/part.speed,endMs:Math.min(part.endMs,part.startMs+(b-sourceStartMs)/part.speed)});
  }
  return {sceneId:scene.id,clipId:clip.id,startMs:part.startMs,endMs:part.endMs,sourceStartMs,sourceEndMs,source:clip.src,layout:scene.layout,title:scene.title??'',sourceText:scene.sourceText??'',sourceCaptionIds:scene.sourceCaptionIds??[],media:scene.media?{...scene.media}:null,overviewComparison:comparison?structuredClone(comparison):null,sourceNote:scene.sourceNote??'',referenceSceneId:scene.overviewSourceSceneId??scene.summarySourceSceneId??null,missing:scene.missing??null,events};
 });
 return {fps,rows,issues:validateStoryboard(scenes,clips),unretainedSceneIds:scenes.filter(s=>!rows.some(r=>r.sceneId===s.id)).map(s=>s.id)};
}

export function storyboardReviewMarkdown(project,fps=30){
 const review=storyboardReview(project,fps);
 const lines=['# 分镜与素材核对表','',`项目：${cell(project.name??project.presentation?.title??'未命名')} · ${fps} fps`,'','时间为毫秒时间码；同一源分镜跨剪口时分行列出。成片范围按保留片段与变速映射；不代表字幕已通过听审或参考效果已达标。','', '| 成片范围 | 原片范围 / 源分镜 | 画面与摘要 | 原话依据 | 配套素材与依据 | 待补 / 待查 |','|---|---|---|---|---|---|'];
 for(const row of review.rows){
  const comparison=row.overviewComparison?`原片对照 ${row.overviewComparison.before.label}：${row.overviewComparison.before.src}；成片对照 ${row.overviewComparison.after.label}：${row.overviewComparison.after.src}`:'';
  const media=[row.media?`${row.media.src}${row.media.kind==='video'?`；${row.media.freezeAtSec!==undefined?'定格 '+row.media.freezeAtSec+'s':`素材起点 ${row.media.startSec??0}s，速度 ${row.media.rate??1}×`}`:''}`:'',comparison].filter(Boolean).join('；')||'真人 / 可编辑图解';
  const provenance=[row.sourceNote,row.referenceSceneId?`引用分镜 ${row.referenceSceneId}`:''].filter(Boolean).join('；');
  const gaps=[row.missing,!row.sourceText&&!row.sourceCaptionIds.length?'未记录原话依据':'',row.media&&!row.sourceNote?'素材来源说明待补':''].filter(Boolean).join('；')||'无已登记缺口（仍需画面与听音验收）';
  lines.push(`| ${range(row.startMs,row.endMs)} | ${range(row.sourceStartMs,row.sourceEndMs)} / ${cell(row.sceneId)} / ${cell(row.source)} | ${cell(sceneLabels[row.layout]??row.layout)}：${cell(row.title)} | ${cell(row.sourceText)}；字幕 ${cell(row.sourceCaptionIds.join(', '))} | ${cell(media)}；${cell(provenance)} | ${cell(gaps)} |`);
 }
 lines.push('','## 对象时段（成片）','','| 源分镜 | 对象 | 保留的可见时段 |','|---|---|---|');
 for(const row of review.rows)for(const event of row.events)lines.push(`| ${cell(row.sceneId)} | ${cell(event.kind)} ${cell(event.text)} (${cell(event.id)}) | ${range(event.startMs,event.endMs)} |`);
 lines.push('','## 工程检查','');
 for(const issue of review.issues)lines.push(`- ${cell(issue.id)}：${cell(issue.message)}`);
 if(!review.issues.length)lines.push('未发现当前结构校验问题；不等同于内容、构图或声音验收通过。');
 if(review.unretainedSceneIds.length)lines.push(`未进入保留时间轴的源分镜：${review.unretainedSceneIds.map(cell).join('、')}`);
 return lines.join('\n')+'\n';
}
