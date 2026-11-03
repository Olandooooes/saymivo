import {reviewClockMatches} from './source-review-clock.mjs';
import {readableCaptionWordGroups} from './caption-pages.mjs';

export const KEEPER_CAPTION_VERSION='verified-keeper-caption-words-v1';
const finite=Number.isFinite,near=(a,b)=>Math.abs(a-b)<=.001;
const key=value=>{
 const chars=Array.from(String(value??'').normalize('NFKC').toLowerCase().replace(/−/g,'-').replace(/’/g,"'").replace(/\s/gu,''));
 return chars.filter((char,index)=>{
  const before=chars[index-1]??'',after=chars[index+1]??'';
  return /[\p{L}\p{N}\p{S}]/u.test(char)||/\p{P}/u.test(char)&&/\p{Nd}/u.test(before)&&/\p{Nd}/u.test(after)||
   '+-'.includes(char)&&/\p{Nd}/u.test(after)||char==='%'||char==="'"&&/\p{L}/u.test(before)&&/\p{L}/u.test(after);
 }).join('');
};
const parts=c=>c.retainParts??[{...c.retain,clipId:c.retain?.clipId??c.clipId,src:c.src}];
const approved=(c,source)=>c.status==='approved'&&c.confidence==='high'&&c.kind!=='filler'&&c.method==='codex-word-decisions'&&
 c.evidence?.some(e=>e.kind==='independent-local-asr'&&e.confirmed===true)&&c.evidence.some(e=>e.kind==='acoustic-boundaries'&&e.safe===true)&&
 c.evidence.some(e=>e.kind==='source-boundary-v2'&&e.safe===true&&e.sourceSha256===source.sourceSha256);
const samePart=(a,b)=>a.clipId===b.clipId&&a.src===b.src&&a.startSec===b.startSec&&a.endSec===b.endSec&&a.text===b.text;
const timedWords=(words,part)=>Array.isArray(words)&&words.length>0&&words.every((w,index)=>typeof w.word==='string'&&key(w.word)&&finite(w.startMs)&&finite(w.endMs)&&w.endMs>w.startMs&&
 w.startMs>=part.startSec*1000-.001&&w.endMs<=part.endSec*1000+.001&&(!index||w.startMs>=words[index-1].endMs))&&
 near(words[0].startMs,part.startSec*1000)&&near(words.at(-1).endMs,part.endSec*1000)&&words.map(w=>w.word).join('')===part.text;

// Append only the original, indivisible source observations after all normal
// recognition and boundary gates have passed. No caption or word is rewritten.
export function createKeeperCaptionEvidence(candidate,source){
 const clock=source?.audioClock??source?.clock;
 if(!source||!approved(candidate,source)||candidate.src!==source.src||clock?.sourceSha256!==source.sourceSha256||!reviewClockMatches(clock,clock))return null;
 const retained=parts(candidate),proof=[];
 for(const part of retained){
  if(!Number.isInteger(part.first)||!Number.isInteger(part.last)||part.first<0||part.last<part.first)return null;
  const words=source.words.slice(part.first,part.last+1).map((word,index)=>({word:word.word,startMs:word.startMs,endMs:word.endMs,sourceIndex:part.first+index}));
  if(!timedWords(words,part))return null;
  proof.push({clipId:part.clipId,src:part.src??candidate.src,startSec:part.startSec,endSec:part.endSec,text:part.text,first:part.first,last:part.last,words});
 }
 if(!proof.length||key(proof.map(p=>p.text).join(''))!==key(candidate.retain?.text))return null;
 return {version:KEEPER_CAPTION_VERSION,candidateId:candidate.id,src:candidate.src,sourceSha256:source.sourceSha256,audioClock:structuredClone(clock),parts:proof,
  independentRecognitionConfirmed:true,boundariesConfirmed:true,rawRecognitionChanged:false};
}
function verifiedProof(candidate,source){
 const proof=candidate.keeperCaptionEvidence;
 if(!source||!approved(candidate,source)||!proof||proof.version!==KEEPER_CAPTION_VERSION||proof.candidateId!==candidate.id||proof.src!==candidate.src||proof.sourceSha256!==source.sourceSha256||
  proof.audioClock?.sourceSha256!==source.sourceSha256||!reviewClockMatches(proof.audioClock,source.audioClock)||proof.independentRecognitionConfirmed!==true||proof.boundariesConfirmed!==true||proof.rawRecognitionChanged!==false)return null;
 const retained=parts(candidate);
 if(!Array.isArray(proof.parts)||proof.parts.length!==retained.length||proof.parts.some((part,index)=>!samePart(part,{...retained[index],src:retained[index].src??candidate.src})||!Number.isInteger(part.first)||!Number.isInteger(part.last)||part.first!==retained[index].first||part.last!==retained[index].last||!timedWords(part.words,part)||
  part.words.some((word,i)=>word.sourceIndex!==part.first+i)||part.last!==part.first+part.words.length-1))return null;
 if(key(proof.parts.map(p=>p.text).join(''))!==key(candidate.retain?.text))return null;
 return proof;
}
const wordSignature=(clipId,word)=>JSON.stringify([clipId,word.text,word.startMs,word.endMs]);
function lostCaptionRuns(before,after,mapping,part){
 const descendants=new Set((mapping.get(part.clipId)??[]).map(clip=>clip.id)),available=new Map();
 for(const caption of after)if(descendants.has(caption.clipId))for(const word of caption.words??[]){const sig=wordSignature(part.clipId,word);available.set(sig,(available.get(sig)??0)+1);}
 const entries=before.flatMap((caption,captionIndex)=>caption.clipId===part.clipId?(caption.words??[]).map((word,wordIndex)=>({word,captionIndex,wordIndex})):[])
  .sort((a,b)=>a.word.startMs-b.word.startMs||a.captionIndex-b.captionIndex||a.wordIndex-b.wordIndex);
 const runs=[];let run=[];const flush=()=>{if(run.length)runs.push(run);run=[];};
 for(const entry of entries){const sig=wordSignature(part.clipId,entry.word),count=available.get(sig)??0;if(count){available.set(sig,count-1);flush();continue;}
  const word=entry.word,nearCut=finite(word.startMs)&&finite(word.endMs)&&word.endMs>=word.startMs&&word.endMs>=part.startSec*1000-500&&word.startMs<=part.endSec*1000+500;
  if(!nearCut||!key(word.text)){flush();continue;}run.push(entry);
 }flush();return runs;
}
const styleKey=caption=>{
 const {id,clipId,startMs,endMs,words,reviewOriginalTiming,reviewOriginalWords,...style}=caption;return JSON.stringify(style);
};
function referenceSpans(words,offset=0){
 const spans=[];for(const word of words){const text=key(word.text),start=offset;offset+=text.length;if(text)spans.push({start,end:offset,accent:word.accent===true});}return spans;
}
function accentFor(start,end,references){
 const relevant=references.filter(span=>span.start<end&&span.end>start);if(!relevant.length||relevant[0].start>start||relevant.at(-1).end<end)return false;
 return relevant.every(span=>span.accent===true);
}

// Restore only a prefix demonstrably lost in this transaction. The surviving
// cues must already be a nonempty exact suffix of verified keeper words.
export function restoreKeeperCaptionPrefixes({beforeCaptions,captions,candidates,sources,mapping,clips}){
 let current=captions;const warnings=[];let restored=0;
 for(const candidate of candidates){
  const source=sources.find(item=>item.src===candidate.src),proof=verifiedProof(candidate,source);if(!proof)continue;
  for(const part of proof.parts){
   const owners=(mapping.get(part.clipId)??[]).filter(clip=>clip.src===candidate.src&&part.startSec>=clip.inSec-.000001&&part.endSec<=clip.outSec+.000001);
   if(owners.length!==1)continue;const owner=owners[0];if(!clips.some(clip=>clip.id===owner.id&&clip.src===candidate.src&&clip.inSec===owner.inSec&&clip.outSec===owner.outSec))continue;
   const selected=current.map((caption,index)=>({caption,index})).filter(({caption})=>caption.clipId===owner.id&&caption.startMs<part.endSec*1000&&caption.endMs>part.startSec*1000);
   if(!selected.length||selected.some(({caption})=>caption.motion||caption.timingScope==='cue'||caption.reviewOriginalTiming||caption.reviewOriginalWords||caption.audioClock&&!reviewClockMatches(caption.audioClock,proof.audioClock)))continue;
   selected.sort((a,b)=>a.caption.startMs-b.caption.startMs||a.index-b.index);
   const suffixWords=selected.flatMap(({caption})=>caption.words??[]),suffix=key(suffixWords.map(word=>word.text).join('')),full=key(part.words.map(word=>word.word).join(''));
   if(Array.from(suffix).length<4||full.length<=suffix.length||!full.endsWith(suffix))continue;const missing=full.slice(0,full.length-suffix.length);
   const lost=[];
   for(const remove of candidate.removeParts??[{...candidate.remove,clipId:candidate.clipId,src:candidate.src}])for(const run of lostCaptionRuns(beforeCaptions,captions,mapping,remove)){
    const value=key(run.map(entry=>entry.word.text).join(''));let at=value.indexOf(missing);
    while(at>=0){lost.push({run,at});at=value.indexOf(missing,at+1);}
   }
   if(lost.length!==1)continue;
   const prefixReferences=referenceSpans(lost[0].run.map(entry=>entry.word)).flatMap(span=>{const start=Math.max(span.start,lost[0].at),end=Math.min(span.end,lost[0].at+missing.length);return end>start?[{...span,start:start-lost[0].at,end:end-lost[0].at}]:[];});
   const references=[...prefixReferences,...referenceSpans(suffixWords,missing.length)];
   const styles=[];let offset=missing.length;
   for(const {caption}of selected){const start=offset;offset+=key(caption.words.map(word=>word.text).join('')).length;styles.push({start,end:offset,caption});}
   const runs=[];let run=null,position=0,unsafe=false;
   for(const observed of part.words){const start=position,end=start+key(observed.word).length;position=end;
    const matches=styles.filter(style=>style.start<end&&style.end>start),template=matches[0]?.caption??selected[0].caption;
    if(matches.some(style=>styleKey(style.caption)!==styleKey(template))){unsafe=true;break;}
    const word={text:observed.word,startMs:observed.startMs,endMs:observed.endMs,accent:accentFor(start,end,references)};
    if(!run||styleKey(run.template)!==styleKey(template)){run={template,words:[]};runs.push(run);}run.words.push(word);
   }
   if(unsafe||!runs.length)continue;
   const punctuation=suffixWords.at(-1)?.text.match(/[\p{P}\s]+$/u)?.[0]??'';
   const finalWord=runs.at(-1).words.at(-1);finalWord.text=finalWord.text.replace(/[\p{P}\s]+$/u,'')+punctuation;
   const selectedIndices=new Set(selected.map(item=>item.index)),ids=new Set(current.filter((_,index)=>!selectedIndices.has(index)).map(caption=>caption.id)),pages=[];
   for(const {template,words}of runs)for(const group of readableCaptionWordGroups(words,{protectedPhrases:template.protectedPhrases??[]})){
    let id=template.id,n=0;while(ids.has(id))id=`${template.id}-keeper-${candidate.id}-${++n}`;ids.add(id);
    pages.push({...template,id,clipId:owner.id,words:group,startMs:group[0].startMs,endMs:group.at(-1).endMs,audioClock:template.audioClock??structuredClone(proof.audioClock)});
   }
   const insertion=Math.min(...selectedIndices);current=current.flatMap((caption,index)=>index===insertion?pages:selectedIndices.has(index)?[]:[caption]);restored++;
  }
 }
 if(restored)warnings.push(`已依据独立确认的保留版原词时间，恢复 ${restored} 处因本次剪口丢失的字幕前缀；其余字幕保持原文。`);
 return {captions:current,warnings,restored};
}
