import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {quietCutBounds} from './codex-retake-benchmark.mjs';
import {runBounded,CODEX_RETAKE_VERSION} from './codex-retake-decision.mjs';

const normal=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const text=words=>words.map(w=>w.word).join('');
const filler=/^[嗯恩呃额啊哦噢哎唉诶欸]+$/u;
const providerName=value=>/whisper.*medium|medium.*whisper/i.test(String(value))?'whisper-medium':/whisper.*small|small.*whisper/i.test(String(value))?'whisper-small':/qwen/i.test(String(value))?'qwen':null;
const family=value=>normal(value).replace(/[呃额]+/gu,'E').replace(/[嗯恩]+/gu,'M').replace(/(.)\1+/gu,'$1');
const overlap=(a,b)=>Math.min(a.endMs,b.endMs)>Math.max(a.startMs,b.startMs);

export function fillerSemanticAssessment(words,first,last){
 const selected=words.slice(first,last+1),value=normal(text(selected)),before=words.slice(Math.max(0,first-12),first),after=words.slice(last+1,last+7),reasons=[];
 if(!selected.length||!filler.test(value))reasons.push('包含有义词或非语气词内容');
 if([...selected,words[first-1],words[last+1]].filter(Boolean).some(w=>w.trimmed||w.contextOnly))reasons.push('已有剪口附近的词或上下文不完整');
 if(!before.length||!after.length)reasons.push('缺少两侧完整语义上下文');
 if(/[啊哦噢哎唉诶欸]/u.test(value))reasons.push('可能承载句意、态度或语调的叹词，保留待复核');
 const b=text(before),a=text(after),bp=normal(b),ap=normal(a);
 if(/[嗯恩]/u.test(value)&&(/[？?]/u.test(b)||/(?:吗|么|呢|是不是|能不能|有没有|可不可以|对不对|好不好|行不行|是否)[，,。！!]*$/u.test(b)||/[。！？?!]\s*$/u.test(b)||/^(?:对|是的|没错|可以|好的|好呀)/u.test(ap)))reasons.push('可能是回答、肯定或承接，保留原声');
 if(/额/u.test(value)&&(/(?:金|余|总|面|配|名|超|限|数|定)$/u.test(bp)||/^(?:外|度|头|角|尔)/u.test(ap)))reasons.push('额可能属于金额、额外等有义词，保留原声');
 if(/恩/u.test(value)&&(/(?:感|报|忘|谢|施|蒙|承)$/u.test(bp)||/^(?:情|人|典|惠|德|赐|爱)/u.test(ap)))reasons.push('恩可能属于感恩、恩情等有义词，保留原声');
 return {eligible:reasons.length===0,reasons,contextBefore:b,contextAfter:a,text:text(selected)};
}

function partQuiet(part,source){
 const safe=t=>source.quiet.some(([a,b])=>b-a>=.08&&a+.03-.001<=t&&t<=b-.03+.001)&&!source.words.some(w=>w.startMs/1000+.001<t&&t<w.endMs/1000-.001);
 return safe(part.startSec)&&safe(part.endSec)?'word-clock-and-quiet-checked':'needs-review';
}

// Source indices always refer to the supplied pass, never another recognizer's
// stream. The caller may combine candidate source-time ranges only AFTER gates.
export function compileCodexFillerCandidates(decisions,words,clips,evidenceSources){
 const candidates=[],blocked=[];
 for(const [index,d]of decisions.entries()){
  if(d.kind!=='filler')continue;
  const selected=words.slice(d.first,d.last+1),source=evidenceSources.find(s=>s.src===selected[0]?.src);
  if(!selected.length||!source||!Array.isArray(source.words)||!Array.isArray(source.quiet)||d.replacementFirst!==-1||d.replacementLast!==-1||!filler.test(normal(text(selected)))){blocked.push({decision:d,reason:'语气词取舍包含未验证的有义文字或虚构替代，保留原声'});continue;}
  if(selected.some(w=>w.trimmed||w.contextOnly||!Number.isInteger(w.sourceIndex)||w.sourceIndex<0||w.sourceIndex>=source.words.length||!Number.isFinite(w.startMs)||!Number.isFinite(w.endMs)||w.endMs<=w.startMs)){
   blocked.push({decision:d,reason:'语气词本身的原片词时间或完整发音未确认，保留原声'});continue;
  }
  if(selected.some((w,i)=>w.src!==source.src||i&&w.sourceIndex!==selected[i-1].sourceIndex+1)){blocked.push({decision:d,reason:'语气词跨过未知原片词或来源，保留原声'});continue;}
  const groups=[];let bad=false;
  for(const w of selected){const clip=clips.find(c=>c.id===w.clipId);if(!clip||clip.src!==source.src){bad=true;break;}let group=groups.at(-1);if(group?.clip.id!==clip.id){if(group&&clip.inSec<group.clip.outSec-.00001){bad=true;break;}group={clip,words:[]};groups.push(group);}group.words.push(w);}
  if(bad){blocked.push({decision:d,reason:'语气词的片段实例或原片顺序不完整，保留原声'});continue;}
  const first=selected[0].sourceIndex,last=selected.at(-1).sourceIndex,
   bounds=quietCutBounds({first,last},source.words,source.quiet,[groups[0].clip.inSec,groups.at(-1).clip.outSec]),
   semantic=fillerSemanticAssessment(words,d.first,d.last),start=selected[0].startMs/1000,end=selected.at(-1).endMs/1000;
  const removeParts=groups.map(({clip,words:partWords})=>{const part={clipId:clip.id,src:clip.src,clipInSec:clip.inSec,clipOutSec:clip.outSec,
   startSec:Math.max(clip.inSec,bounds.startSec),endSec:Math.min(clip.outSec,bounds.endSec),text:text(partWords),first:partWords[0].sourceIndex,last:partWords.at(-1).sourceIndex};
   // Reject tiny new remnants instead of silently widening a cut beyond its
   // observed speech and quiet boundaries. No content-specific snapping.
   part.orphanFragmentRisk=[part.startSec-clip.inSec,clip.outSec-part.endSec].some(seconds=>seconds>.001&&seconds<.15);
   part.boundaryStatus=part.orphanFragmentRisk?'needs-review':partQuiet(part,source);return part;});
  const boundaryStatus=bounds.boundaryStatus==='word-clock-and-quiet-checked'&&removeParts.every(p=>p.boundaryStatus==='word-clock-and-quiet-checked')?'word-clock-and-quiet-checked':'needs-review';
  const id='codex-filler-'+createHash('sha256').update(JSON.stringify([removeParts.map(p=>p.clipId),start,end])).digest('hex').slice(0,20);
  candidates.push({id,src:source.src,clipId:groups[0].clip.id,kind:'filler',first,last,replacementFirst:-1,replacementLast:-1,
   remove:{startSec:bounds.startSec,endSec:bounds.endSec,text:text(selected)},earlier:{startSec:start,endSec:end,text:text(selected)},
   removeParts,retain:null,retainParts:[],boundaryStatus,semanticEligible:semantic.eligible,fillerSemanticEligible:semantic.eligible,
   protectedChanged:!semantic.eligible,status:'review',confidence:'review',score:0,method:'codex-word-decisions',reason:d.reason+(semantic.reasons.length?'；'+semantic.reasons.join('；'):'')+(removeParts.some(p=>p.orphanFragmentRisk)?'；剪口会留下过短孤立片段，保留待复核':''),
   evidence:[{kind:'codex-decision',version:CODEX_RETAKE_VERSION,decisionIndex:index},{kind:'filler-semantic',...semantic}]});
 }
 return {candidates,blocked};
}

export function fillerObservationAssessment(candidate,source,record){
 const reasons=[],first=candidate.first,last=candidate.last,target={startMs:source.words[first].startMs,endMs:source.words[last].endMs},
  cut={startMs:candidate.remove.startSec*1000,endMs:candidate.remove.endSec*1000},expected=family(source.words.slice(first,last+1).map(w=>w.word).join(''));
 if(record?.freeRecognition!==true||!['qwen','whisper-medium','whisper-small'].includes(record?.provider))return {confirmed:false,reasons:['不是独立自由识别观察']};
 const valid=(record.words??[]).filter(w=>Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&w.endMs>w.startMs);
 const inCut=valid.filter(w=>overlap(w,cut));
 if(inCut.some(w=>!filler.test(normal(w.word))))reasons.push('待删范围内独立识别到有义语音');
 const observed=inCut.filter(w=>filler.test(normal(w.word))&&overlap(w,target));
 if(!observed.length||family(text(observed))!==expected)reasons.push('独立识别未在目标时段重现同类语气词');
 if(observed.some(w=>w.startMs<cut.startMs-1||w.endMs>cut.endMs+1))reasons.push('独立语气词观察超出实际剪口');
 const neighbors=[];
 for(const [side,i]of [['before',first-1],['after',last+1]]){
  const primary=source.words[i];
  const supported=primary&&!filler.test(normal(primary.word))&&valid.some(w=>normal(w.word).includes(normal(primary.word))&&overlap(w,primary)&&(side==='before'?w.endMs<=cut.startMs+1:w.startMs>=cut.endMs-1));
  neighbors.push({side,sourceWordIndex:i,supported:Boolean(supported)});if(!supported)reasons.push('独立识别未确认'+(side==='before'?'前侧':'后侧')+'保留词');
 }
 return {confirmed:reasons.length===0,reasons,provider:record.provider,observedFillerWords:observed,neighbors};
}

export function fillerObservationWindows(candidates,sources){
 return candidates.filter(c=>c.kind==='filler'&&c.semanticEligible!==false).map(c=>{
  const source=sources.find(s=>s.src===c.src),lo=Math.max(0,c.first-4),hi=Math.min(source.words.length-1,c.last+4),duration=source.audioClock?.durationSec??source.clock?.durationSec??source.range[1];
  return {id:c.id,src:c.src,range:[Math.max(0,source.words[lo].startMs/1000-.25),Math.min(duration,source.words[hi].endMs/1000+.25)]};
 }).filter(w=>w.range[1]>w.range[0]&&w.range[1]-w.range[0]<=19);
}

// Independent full/core/VAD recall is supplied by codex-retake-recall.mjs. Keep
// its pass intact rather than mixing Whisper indices into a Qwen source list.
export function collectFillerRecall({sources,clips,passId='filler-observed-recall'}){
 const evidenceSources=structuredClone(sources),observed=[];
 for(const source of evidenceSources)for(const [sourceIndex,w]of source.words.entries())if(filler.test(normal(w.word))&&w.endMs>w.startMs&&clips.some(c=>c.src===source.src&&w.startMs>=c.inSec*1000&&w.endMs<=c.outSec*1000))observed.push({src:source.src,sourceIndex,word:w.word,startMs:w.startMs,endMs:w.endMs});
 return {id:passId,evidenceSources,sources:evidenceSources,observed,requiresSemanticDecision:true,audioUploaded:false};
}

export async function observeFillerWindows(request,{provider,root=request.root,directory,signal,run=runBounded}={}){
 const token=randomUUID(),input=path.join(directory,`filler-${provider}-${token}.input.json`),output=path.join(directory,`filler-${provider}-${token}.json`);
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(input,JSON.stringify({root,sources:request.sources.map(s=>({src:s.src,wav:s.wav,sourceSha256:s.sourceSha256})),windows:request.windows}));
 const python=path.join(root,provider==='qwen'?'.venv-align/bin/python':'.venv/bin/python');
 await run(python,[path.join(root,'scripts/observe-codex-fillers.py'),input,output,provider],{cwd:root,signal,timeoutMs:1200000,log:path.join(directory,'filler-observations.log')});
 const result=JSON.parse(fs.readFileSync(output));if(result.provider!==provider||result.expectedTextSupplied!==false||result.audioUploaded!==false)throw Error('语气词确认缺少独立自由识别收据');
 return result.observations.map(record=>({...record,freeRecognition:true,modelSha256:result.modelSha256}));
}

export async function confirmCodexFillers(request,{root=request.root,directory,signal,observe=observeFillerWindows}={}){
 const candidates=request.candidates.filter(c=>c.kind==='filler'),windows=fillerObservationWindows(candidates,request.sources),records=new Map(windows.map(w=>[w.id,[]]));
 // A full independent ASR pass is already a free observation. Reuse its words;
 // do not load the same recognizer again just to repeat identical evidence.
 for(const window of windows){const source=request.sources.find(s=>s.src===window.src),provider=providerName(source.provider??source.recognizer);if(provider)records.get(window.id).push({windowId:window.id,src:window.src,range:window.range,provider,freeRecognition:true,provenance:'existing-free-source-observation',words:source.words.filter(w=>w.endMs>window.range[0]*1000&&w.startMs<window.range[1]*1000)});}
 const assess=c=>{const source=request.sources.find(s=>s.src===c.src),all=(records.get(c.id)??[]).map(record=>({record,assessment:fillerObservationAssessment(c,source,record)})),passing=new Set(all.filter(x=>x.assessment.confirmed).map(x=>x.record.provider)),conflict=all.some(x=>x.assessment.reasons.some(reason=>/有义语音|超出实际剪口/u.test(reason)));return {all,passing,conflict};};
 const errors=[];
 for(const provider of ['qwen','whisper-medium','whisper-small']){
  signal?.throwIfAborted();const pending=windows.filter(w=>{const c=candidates.find(c=>c.id===w.id),a=assess(c);return a.passing.size<2&&!a.all.some(x=>x.record.provider===provider&&x.assessment.confirmed);});if(!pending.length)continue;
  // A short isolated free decode can recover fillers dropped by contextual
  // ASR. Keep the contextual decode too: it protects neighboring syllables and
  // any contradictory lexical observation vetoes automatic deletion.
  const probeWindows=pending.flatMap(w=>{const c=candidates.find(c=>c.id===w.id);return [w,{id:w.id+'::isolated',src:w.src,range:[c.remove.startSec,c.remove.endSec]}];});
  try{
   const observed=await observe({...request,windows:probeWindows},{root,directory,signal,provider});
   if(!Array.isArray(observed)||observed.some(record=>record.provider!==provider))throw Error('自由识别观察的provider与本次模型不一致');
   for(const window of pending){
    const local=observed.filter(record=>record.windowId===window.id||record.windowId===window.id+'::isolated');if(!local.length)continue;
    const existing=records.get(window.id).filter(record=>record.provider===provider),subwindows=[...existing.flatMap(record=>record.subwindows??[record]),...local],unique=new Map();
    for(const record of subwindows)for(const word of record.words??[])unique.set(JSON.stringify([word.word,word.startMs,word.endMs]),word);
    const merged={windowId:window.id,src:window.src,range:window.range,provider,freeRecognition:subwindows.every(record=>record.freeRecognition===true),provenance:'context-and-isolated-free-observations',subwindows,words:[...unique.values()].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)};
    records.set(window.id,[...records.get(window.id).filter(record=>record.provider!==provider),merged]);
   }
  }
  catch(error){signal?.throwIfAborted();errors.push({provider,reason:error.message});}
 }
 return {version:1,provider:'dual-free-local-filler-observations',audioUploaded:false,geminiCalled:false,candidates:candidates.map(c=>{
  const a=assess(c),eligible=c.semanticEligible===true||c.evidence?.some(e=>e.kind==='filler-semantic'&&e.eligible===true),confirmed=eligible&&a.passing.size>=2&&!a.conflict;
  return {id:c.id,confirmed,reason:confirmed?'两种本地自由识别均确认孤立语气词及两侧保留词':'语义、双自由识别或两侧保留词未全部确认，保留原声',providers:[...a.passing],observations:a.all,errors};
 })};
}
