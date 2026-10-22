import {applyWordReviews} from '../scripts/word-reviews.mjs';
import {applyCaptionTimingReviews} from '../src/caption-timing-review.mjs';
import {sourceCaptionClock,reviewClockMatches} from '../src/source-review-clock.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {applyTrimPlan} from './auto-plan.mjs';

// Reuse explicit editorial decisions for these exact media bytes.
// This is prior project knowledge, not a claim of new semantic inference.
export function applySourceEditDecisions(clips,captions,{PUBLIC}){
 const sources=new Map(),postReviews=new Map(),plan=[],report=[];
 for(const clip of clips){
  if(!sources.has(clip.src)){
   const file=path.join(PUBLIC,'clips','reviews',path.basename(clip.src).replace(/\.[^.]+$/,'')+'.json');let cuts=[];
   if(fs.existsSync(file)){
    try{
     const review=JSON.parse(fs.readFileSync(file,'utf8')),hash=createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,clip.src))).digest('hex');
     const input=review.editorialCuts??[];
     if(review.sourceSha256===hash&&Array.isArray(input)&&input.length<=200&&input.every(c=>typeof c.id==='string'&&Number.isFinite(c.startMs)&&Number.isFinite(c.endMs)&&c.startMs>=0&&c.endMs>c.startMs&&(!clip.sourceDurationSec||c.endMs<=clip.sourceDurationSec*1000+1))){cuts=input.map(c=>({...c})).sort((a,b)=>a.startMs-b.startMs);const clock=sourceCaptionClock({clips,captions},clip.src);postReviews.set(clip.src,(Array.isArray(review.postCutCaptionReviews)?review.postCutCaptionReviews:[]).filter(p=>reviewClockMatches(p.audioClock??review.audioClock,clock)));}
    }catch{}
   }
   sources.set(clip.src,cuts);
  }
  const cuts=sources.get(clip.src);let cursor=clip.inSec;const segments=[];
  for(const cut of cuts){
   const start=Math.max(clip.inSec,cut.startMs/1000),end=Math.min(clip.outSec,cut.endMs/1000);if(end<=start||end<=cursor)continue;
   if(start>cursor)segments.push({inSec:cursor,outSec:start});
   report.push({src:clip.src,clipId:clip.id,id:cut.id,removedStartMs:Math.max(cursor,start)*1000,removedEndMs:end*1000,reason:cut.reason,evidence:cut.evidence??[]});cursor=end;
  }
  if(cursor<clip.outSec)segments.push({inSec:cursor,outSec:clip.outSec});
  if(report.some(r=>r.clipId===clip.id))plan.push({id:clip.id,segments});
 }
 const result=plan.length?applyTrimPlan(clips,captions,plan):{clips,captions};
 const captionAdjustments=[];
 const captionsClean=result.captions.flatMap(caption=>{
  const clip=result.clips.find(c=>c.id===caption.clipId),cuts=sources.get(clip?.src)??[];
  const words=caption.words.filter(word=>{const remove=cuts.some(cut=>Math.abs(cut.endMs-clip.inSec*1000)<1&&Math.abs(word.startMs-cut.endMs)<1&&(cut.dropBoundaryCaptionText??[]).includes(word.text.replace(/[，,。！？?!]/g,''))&&word.endMs-cut.endMs<=800);if(remove)captionAdjustments.push({captionId:caption.id,clipId:caption.clipId,word,reason:'已校对剪口残字，不改原声'});return !remove;});
  if(!words.length)return [];
  return [{...caption,words,startMs:Math.max(caption.startMs,words[0].startMs)}];
 });
 const finalCaptions=[];
 for(const clip of result.clips){
  const pages=captionsClean.filter(c=>c.clipId===clip.id).sort((a,b)=>a.startMs-b.startMs),patches=postReviews.get(clip.src)??[];
  if(!patches.length||!pages.length){finalCaptions.push(...pages);continue;}
  const words=pages.flatMap(c=>c.words).map(w=>({...w,word:w.text})),reviewed=applyWordReviews(words,patches);
  for(const entry of reviewed.report.filter(r=>r.status==='applied'))captionAdjustments.push({clipId:clip.id,reason:'剪辑后跨字幕页复用已校对词时间',...entry});
  if(!reviewed.report.some(r=>r.status==='applied')){finalCaptions.push(...pages);continue;}
  const groups=pages.map(()=>[]);
  for(const {word,text,...rest} of reviewed.words){
   let index=pages.findIndex(c=>rest.startMs>=c.startMs&&rest.startMs<c.endMs);
   if(index<0){index=pages.map((c,i)=>({c,i})).filter(x=>x.c.startMs<=rest.startMs).at(-1)?.i??0;}
   groups[index].push({...rest,text:word,accent:rest.accent??false});
  }
  groups.forEach((group,i)=>{if(group.length)finalCaptions.push({...pages[i],words:group,startMs:group[0].startMs,endMs:group.at(-1).endMs});});
 }
 return {...result,captions:finalCaptions,report,captionAdjustments};
}

// Run after ASR pages have been reflowed into readable caption cues. A source
// recognizer's arbitrary pages need not share the saved editor cue boundaries.
export function applySourceCaptionTimings(clips,captions,{PUBLIC}){
 const retimed=[],report=[];
 for(const src of new Set(clips.map(c=>c.src))){
  const sourceClips=clips.filter(c=>c.src===src),ids=new Set(sourceClips.map(c=>c.id));
  const group=captions.filter(c=>ids.has(c.clipId));let reviews=[];
  const file=path.join(PUBLIC,'clips/reviews',path.basename(src).replace(/\.[^.]+$/,'')+'.json');
  if(fs.existsSync(file))try{
   const review=JSON.parse(fs.readFileSync(file,'utf8')),hash=createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,src))).digest('hex');
   if(review.sourceSha256===hash){
    const clock=sourceCaptionClock({clips,captions},src);
    for(const item of Array.isArray(review.captionTimingReviews)?review.captionTimingReviews:[]){
     if(reviewClockMatches(item.audioClock??review.audioClock,clock))reviews.push(item);
     else report.push({src,id:item.id,status:'skipped',reason:'audio-clock-mismatch'});
    }
   }
   else report.push({src,status:'skipped',reason:'source-sha-mismatch'});
  }catch{report.push({src,status:'skipped',reason:'unreadable-timing-review'});}
  const timed=applyCaptionTimingReviews(group,reviews,{sourceDurationMs:Math.max(...sourceClips.map(c=>(c.sourceDurationSec??c.outSec)*1000)),clipRanges:Object.fromEntries(sourceClips.map(c=>[c.id,{startMs:c.inSec*1000,endMs:c.outSec*1000}]))});
  retimed.push(...timed.captions);report.push(...timed.report.map(r=>({...r,src})));
 }
 retimed.push(...captions.filter(c=>!clips.some(clip=>clip.id===c.clipId)));
 return {captions:retimed,report};
}
