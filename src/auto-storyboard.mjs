import {withLecturePageTransitions} from './lecture-transition.mjs';
import {shortSourceHeadline} from './source-headline.mjs';
import {attachCriteriaOverviews} from './criteria-overview.mjs';
import {attachSourceRecaps} from './source-recap.mjs';
import {sourceContrastTags,sourceManualTaskTags,sourceEmphasisTags} from './auto-source-tags.mjs';
import {balancedEmphasisTags} from './emphasis-layout.mjs';
import {readableSubtitle} from './reference-motion.mjs';

const strip=text=>text.trim().replace(/^[，。！？,?!；;\s]+|[，。！？,?!；;\s]+$/g,'');
const ordinal=text=>({第一:1,首先:1,第二:2,其次:2,第三:3,最后:3})[text.match(/^(第一|第二|第三|首先|其次|最后)/)?.[0]];
const title=text=>strip(text).split(/[，,。！？?!；;]/).find(Boolean)||'原声讲解';
const isAction=text=>/^(搜索|打开|提取|整理|导入|安排|标出|再整理|调整)/.test(strip(text));
const nodeCopy=text=>{
 const clean=strip(text),heading=title(clean);
 return {text:heading,detail:strip(clean.slice(heading.length))||undefined};
};

// Plan source-bound editable drafts, never fabricate screenshots or execution.
// A trim descendant belongs to its original source family, not another upload.
export function automaticStoryboard(captions=[],clips=[]){
 const families=new Map();
 for(const clip of clips){
  const base=clip.id.replace(/(?:-cut\d+)+$/,''),key=JSON.stringify([base,clip.src]);
  if(!families.has(key))families.set(key,{id:base,src:clip.src,clips:[],captions:[]});
  const family=families.get(key);family.clips.push(clip);
  for(const cap of captions.filter(c=>c.clipId===clip.id)){
   // A cue-only review has no new phonetic word timings. Use one planning
   // span for it; never redistribute the stored word estimates to fit.
   const planningWords=cap.timingScope==='cue'?[{text:readableSubtitle(cap.words),startMs:cap.startMs,endMs:cap.endMs}]:cap.words;
   const words=planningWords.filter(w=>w.endMs>clip.inSec*1000&&w.startMs<clip.outSec*1000&&w.endMs>w.startMs)
    .map(w=>({...w,startMs:Math.max(w.startMs,clip.inSec*1000),endMs:Math.min(w.endMs,clip.outSec*1000),captionId:cap.id}));
   if(words.length)family.captions.push({...cap,words});
  }
 }
 const scenes=[],chapters=[];
 for(const family of families.values()){
  const words=family.captions.sort((a,b)=>a.startMs-b.startMs).flatMap(c=>c.words);
  if(!words.length)continue;
  // Character anchors preserve the actual word onset for clause/node timing.
  let text='';const anchors=[];
  for(const word of words){
   const gap=/[A-Za-z0-9]$/.test(text)&&/^[A-Za-z0-9]/.test(word.text)?' ':'';
   for(const char of (gap+word.text).split('')){text+=char;anchors.push(word);}
  }
  const clauses=[],boundaries=new Set([0,text.length]);
  for(const match of text.matchAll(/[，。！？,?!；;]+/g))boundaries.add(match.index+match[0].length);
  // Local ASR often omits commas. Preserve character anchors while separating
  // explicit spoken actions; no punctuation or words are added to subtitles.
  for(const match of text.matchAll(/搜索资料|打开网页|提取信息|再整理成|而具备|关键的变化|我希望|安排画面|标出重点|再让我|找错资料|理解错要求|甚至做完|都可能|第一|第二|第三|所以|拿我|我更关心|这也是/g))boundaries.add(match.index);
  const definitions=[];
  for(const match of text.matchAll(/A\s*g\s*e\s*n\s*t[，,\s]*(?:也就是|称为|是指)智能体/gi)){
   boundaries.add(match.index);boundaries.add(match.index+match[0].length);
   definitions.push([match.index,match.index+match[0].length]);
   for(const boundary of boundaries)if(boundary>match.index&&boundary<match.index+match[0].length)boundaries.delete(boundary);
  }
  const positions=[...boundaries].sort((a,b)=>a-b);
  for(let i=0;i<positions.length-1;i++){
   const begin=positions[i],end=positions[i+1],value=text.slice(begin,end).trim();if(!strip(value))continue;
   const first=anchors[begin],last=anchors[end-1];
   clauses.push({text:readableSubtitle([value]),startMs:first.startMs,endMs:last.endMs,
    definition:definitions.some(([a,b])=>begin>=a&&end<=b),
    captionIds:[...new Set(anchors.slice(begin,end).map(w=>w.captionId))]});
  }
  // An ordinal alone is not a card: keep its spoken explanation attached
  // even when a pause or a retained cut separates the two subtitle pages.
  for(let i=0;i<clauses.length;i++){
   if(!/^(第一|第二|第三|首先|其次|最后)[，,、:：\s]*$/.test(clauses[i].text))continue;
   while(i+1<clauses.length&&!ordinal(strip(clauses[i+1].text))&&clauses[i+1].startMs-clauses[i].endMs<=3000&&!/^(拿我|我希望|所以|接下来|这也是|我更关心)/.test(clauses[i+1].text)){
    const next=clauses.splice(i+1,1)[0];
    clauses[i].text+=next.text;clauses[i].endMs=next.endMs;
    clauses[i].captionIds=[...new Set([...clauses[i].captionIds,...next.captionIds])];
    if(/[。！？?!]$/.test(next.text))break;
   }
  }
  const groups=[];let group=[];
  const flush=()=>{if(group.length)groups.push(group);group=[];};
  for(const clause of clauses){
   if(clause.definition){flush();groups.push([clause]);continue;}
   if(group.length&&isAction(clause.text)&&!isAction(group.at(-1).text))flush();
   const span=group.length?clause.endMs-group[0].startMs:0;
   const topic=/^(但|不过|然而|所以|接下来|举个例子|我希望|拿我|我更关心|这也是|第一|第二|第三|首先|其次|最后)/.test(clause.text);
   if(group.length&&(clause.startMs-group.at(-1).endMs>1200||span>9000||topic&&clause.startMs-group[0].startMs>2200))flush();
   group.push(clause);
   if(/[。！？?!]$/.test(clause.text)&&clause.endMs-group[0].startMs>=1800)flush();
  }flush();
  // Consecutive spoken criteria share a single persistent comparison scene.
  const merged=[];
  for(const item of groups){
   const previous=merged.at(-1),number=ordinal(strip(item[0].text));
   const lastNumber=previous?.filter(c=>ordinal(strip(c.text))).map(c=>ordinal(strip(c.text))).at(-1);
   if(previous&&number&&lastNumber&&number===lastNumber+1&&number<=3&&item.at(-1).endMs-previous[0].startMs<30000)previous.push(...item);
   else merged.push([...item]);
  }
  for(const [index,parts] of merged.entries()){
   const first=parts[0],last=parts.at(-1),id=`auto-scene-${scenes.length+1}`;
   const startMs=index===0?Math.min(...family.clips.map(c=>c.inSec*1000)):first.startMs;
   const endMs=merged[index+1]?.[0].startMs??Math.max(...family.clips.map(c=>c.outSec*1000));
   if(endMs<=startMs)continue;
   const sourceText=parts.map(c=>c.text).join(''),sourceCaptionIds=[...new Set(parts.flatMap(c=>c.captionIds))];
   const scene={id,clipId:family.id,src:family.src,startMs,endMs,layout:'speaker',title:title(first.text),
    sourceText,sourceCaptionIds,planningMethod:'local-rules',label:'原声讲解',sourceNote:'口述内容整理 · 可逐项调整'};
   const numbered=[];let current;
   for(const part of parts){
    if(ordinal(strip(part.text))){current={...part,text:strip(part.text).replace(/^(第一|第二|第三|首先|其次|最后)[，、,:：\s]*/,'' )};numbered.push(current);}
    else if(current){current.text+=strip(part.text);current.endMs=part.endMs;}
   }
   const actions=parts.filter(c=>isAction(c.text));
   let objects=[];
   if(numbered.length>=2&&numbered.length<=3){scene.layout='cards';scene.title=numbered.length===3?'三项要点，逐项看':'两项要点，逐项看';objects=numbered;}
   else if(actions.length>=2&&actions.length<=4){scene.layout='flow';scene.title=actions.some(a=>/搜索资料/.test(a.text))&&actions.some(a=>/整理成/.test(a.text))?'从资料到结果':'把步骤接起来';objects=actions;scene.illustrative=true;}
   else if(/也就是|称为|是指/.test(sourceText)&&endMs-startMs>=1600){scene.layout='chapter';scene.title=strip(sourceText);}
   else{
    const conditions=[...new Set(sourceText.match(/相应工具|工具|权限|任务目标/g)??[])];
    if(conditions.length>=2){scene.layout='stack';scene.stackStyle='folder';scene.title=conditions.join('与');scene.label='口述条件';objects=conditions.map(value=>({...first,text:value,startMs:parts.find(p=>p.text.includes(value))?.startMs??first.startMs}));}
    else if(index===0){scene.layout='headline';scene.title=shortSourceHeadline(sourceText)??scene.title;scene.body=parts.slice(1).map(p=>p.text).join('')||undefined;}
    else if(index===merged.length-1&&/总之|这也是|最后|感谢|关注/.test(sourceText)){scene.layout='outro';}
   }
   if(scene.layout==='chapter'&&first.definition){scene.title=scene.title.replace(/(?=也就是|称为|是指)/,'\n');scene.label='概念解释';scene.chapterTypography={labelScale:1.6,lineScales:[1.2,1.7],entry:'sweep',delayMs:100};}
   if(scene.layout==='speaker'){const contrast=sourceContrastTags(scene,words),manual=sourceManualTaskTags(scene,words),tags=contrast.length?contrast:manual.length?manual:sourceEmphasisTags(scene,words);if(tags.length){scene.tags=balancedEmphasisTags(tags,scenes.length%2?'left':'right');scene.tagTreatment='kinetic';}}
   if(objects.length){
    const uniqueTimes=new Set(objects.map(o=>o.startMs)).size===objects.length;
    scene.nodes=objects.map((o,i)=>({id:`${id}-node-${i+1}`,...(scene.layout==='flow'&&/^再?整理成一份你能检查的结果[。\s]*$/.test(strip(o.text))?{text:'整理结果',detail:'一份你能检查的结果'}:nodeCopy(o.text)),
     atMs:scene.layout==='cards'?0:Math.max(0,Math.min(endMs-startMs-1,o.startMs-startMs)),
     ...(scene.layout==='cards'?{focusMs:uniqueTimes?Math.max(0,o.startMs-startMs):Math.round((endMs-startMs-400)*i/objects.length)}:{}),
     ...(scene.layout==='stack'?{icon:/权限/.test(o.text)?'shield':'tools'}:scene.layout==='flow'?{icon:/搜索/.test(o.text)?'search':/提取|标出|调整/.test(o.text)?'edit':/整理/.test(o.text)?'check':'document'}:{})}));
    if(!uniqueTimes&&scene.layout==='cards')scene.sourceNote='口述内容整理 · 焦点时间为估计，可逐项调整';
   }
   if(scene.layout==='chapter'||scene.layout==='cards'||index===0)chapters.push({id:`chapter-${id}`,clipId:family.id,src:family.src,startMs,title:index===0?'开场':scene.layout==='cards'?title(scene.title):scene.title.length<=18?scene.title.replace(/\n/g,''):'概念解释'});
   if(['headline','chapter'].includes(scene.layout))scene.titleTreatment='airy';
   scenes.push(scene);
  }
 }
 return {scenes:withLecturePageTransitions(attachSourceRecaps(attachCriteriaOverviews(scenes))),chapters};
}
