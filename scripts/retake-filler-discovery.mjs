import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectFillerRecall,fillerSemanticAssessment,fillerObservationAssessment,observeFillerWindows} from './codex-retake-fillers.mjs';
import {callCodexDecisions,validateCodexDecisions} from './codex-retake-decision.mjs';

const pure=value=>/^[嗯恩呃额]+$/u.test(String(value??'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,''));
const overlaps=(a,b)=>a.startMs<b.endMs&&b.startMs<a.endMs;

// Observation only: neither a pattern match nor a successful probe authorizes
// editing. Original context flags, source words and all later gates survive.
export function assessFillerDiscovery(candidate,source,records){
 const observations=['qwen','whisper-medium'].map(provider=>{
  const subwindows=records.filter(r=>r.provider===provider);
  const record={provider,freeRecognition:subwindows.length>0&&subwindows.every(r=>r.freeRecognition===true),
   words:subwindows.flatMap(r=>r.words??[]),subwindows};
  return {record,assessment:fillerObservationAssessment(candidate,source,record)};
 });
 return {confirmed:observations.every(o=>o.assessment.confirmed),observations};
}

export async function discoverObservedFillers(pass,clips,{root,directory,signal,protectedSources=[],
 decide=callCodexDecisions,observe=observeFillerWindows,budget={remaining:4,seen:new Set()}}={}){
 const decisions=[],entries=[];
 const recall=collectFillerRecall({sources:pass.sources,clips});
 for(const observed of recall.observed){
  const source=pass.sources.find(s=>s.src===observed.src);
  for(const [index,word]of pass.words.entries()){
   if(word.src!==observed.src||word.sourceIndex!==observed.sourceIndex)continue;
   if(pass.decisions.some(d=>d.first<=index&&index<=d.last||d.kind!=='filler'&&d.replacementFirst<=index&&index<=d.replacementLast))continue;
   const clip=clips.find(c=>c.id===word.clipId&&c.src===word.src);
   if(!clip||word.startMs<clip.inSec*1000||word.endMs>clip.outSec*1000)continue;
   const key=JSON.stringify([word.src,clip.id,word.startMs,word.endMs]);
   if(budget.seen.has(key))continue;budget.seen.add(key);
   const entry={id:'filler-probe-'+createHash('sha256').update(key).digest('hex').slice(0,16),src:word.src,clipId:clip.id,
    first:word.sourceIndex,last:word.sourceIndex,startMs:word.startMs,endMs:word.endMs,word:word.word,probed:false,records:[],reason:''};
   entries.push(entry);
   const semantic=fillerSemanticAssessment(pass.words,index,index);
   const hardReasons=semantic.reasons.filter(reason=>!reason.includes('上下文不完整'));
   if(hardReasons.length){entry.reason=hardReasons.join('；');continue;}
   const before=pass.words[index-1],after=pass.words[index+1];
   if(!before||!after||before.clipId!==clip.id||after.clipId!==clip.id){entry.reason='缺少同一片段两侧完整上下文';continue;}
   const range=[Math.max(clip.inSec,before.startMs/1000-.25),Math.min(clip.outSec,after.endMs/1000+.25)];
   if(range[1]<=range[0]||range[1]-range[0]>8){entry.reason='补观察窗口超过8秒，保留原声';continue;}
   if(budget.remaining<=0){entry.reason='本次4条补观察预算已用完，保留原声';continue;}
   budget.remaining--;entry.attempted=true;
   const windows=[{id:entry.id,src:word.src,range},{id:entry.id+'::isolated',src:word.src,range:[word.startMs/1000,word.endMs/1000]}];
   try{
    for(const provider of ['qwen','whisper-medium']){
     signal?.throwIfAborted();
     const records=await observe({root,sources:[source],windows},{root,directory:path.join(directory,entry.id),signal,provider});
     if(!Array.isArray(records)||records.some(r=>r.provider!==provider||r.src!==word.src||r.freeRecognition!==true||!windows.some(w=>w.id===r.windowId)))throw Error('补观察来源或自由识别收据不一致');
     entry.records.push(...records);
    }
    entry.probed=true;
   }catch(error){signal?.throwIfAborted();entry.reason='补观察未完成：'+error.message;continue;}
   const target={first:word.sourceIndex,last:word.sourceIndex,remove:{startSec:word.startMs/1000,endSec:word.endMs/1000}};
   const assessment=assessFillerDiscovery(target,source,entry.records);
   // Keep contradictory original clocks as vetoes even if a fresh short decode
   // agrees. Never turn a lexical syllable into an automatically deleted filler.
   const conflict=[source,...protectedSources].filter(s=>s.src===source.src).flatMap(s=>[s,...(s.observationPasses??[])])
    .some(s=>(s.words??[]).some(w=>overlaps(w,word)&&!pure(w.word)));
   if(conflict){entry.reason='已有识别在同一位置出现有义词，保留原声';continue;}
   if(!semantic.eligible){entry.reason=semantic.reasons.join('；')+'；补观察不自动解除原保护';continue;}
   if(!assessment.confirmed){entry.reason='双识别或两侧保留词未确认：'+[...new Set(assessment.observations.flatMap(o=>o.assessment.reasons))].join('；');continue;}
   const lo=Math.max(0,index-12),hi=Math.min(pass.words.length,index+8),window=pass.words.slice(lo,hi).map((w,id)=>({...w,id}));
   try{
    const proposed=await decide(window,{directory:path.join(directory,entry.id,'semantic'),signal});
    const validated=validateCodexDecisions({cuts:proposed},window);
    const decision=validated.find(d=>d.kind==='filler'&&d.first===index-lo&&d.last===index-lo);
    if(!decision){entry.reason='Codex未确认这是无意义语气词，保留原声';continue;}
    decisions.push({...decision,first:index,last:index});entry.reason='补观察及语义通过，仍须原有剪口检查';
   }catch(error){signal?.throwIfAborted();entry.reason='语义补查未完成：'+error.message;}
  }
 }
 return {decisions,entries};
}
