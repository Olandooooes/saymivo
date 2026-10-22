const normalize=text=>String(text??'').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
const rangeValid=r=>r&&Number.isFinite(r.startMs)&&Number.isFinite(r.endMs)&&r.startMs>=0&&r.endMs>r.startMs;
export const validCaptionTimingReview=review=>typeof review?.id==='string'&&rangeValid(review.anchor)&&typeof review.anchor.text==='string'&&normalize(review.anchor.text).length>0&&rangeValid(review.range)&&(review.holdMs===undefined||Number.isFinite(review.holdMs)&&review.holdMs>=0&&review.holdMs<=1000);

// Whole-cue boundaries are independent from uncertain per-word timestamps.
// Stage every requested change before validating neighbours, so a paired edit
// cannot fail just because the old shared boundary temporarily overlaps.
export function applyCaptionTimingReviews(captions,reviews=[],{sourceDurationMs=Infinity,clipRanges={}}={}){
 const staged=captions.map(c=>({...c})),report=[],changed=new Set();
 for(const review of reviews){
  if(!validCaptionTimingReview(review)||review.range.endMs>sourceDurationMs){report.push({id:review?.id,status:'skipped',reason:'invalid cue range'});continue;}
  const matches=captions.map((c,index)=>({c,index})).filter(({c})=>{
   const a=review.anchor,original=c.reviewOriginalTiming;
   return normalize(c.words.map(w=>w.text).join(''))===normalize(a.text)&&
    [original??c].some(r=>Math.abs(r.startMs-a.startMs)<=1&&Math.abs(r.endMs-a.endMs)<=1);
  });
  if(matches.length!==1){report.push({id:review.id,status:'skipped',reason:matches.length?'ambiguous source cue':'source cue differs'});continue;}
  const {index}=matches[0],c=staged[index],bounds=clipRanges[c.clipId];
  if(bounds&&(review.range.startMs<bounds.startMs||review.range.endMs>bounds.endMs)){report.push({id:review.id,status:'skipped',reason:'outside retained clip'});continue;}
  const next={...c,...review.range,holdMs:review.holdMs??0,timingScope:'cue',reviewOriginalTiming:c.reviewOriginalTiming??{...review.anchor}};
  staged[index]=next;changed.add(index);
  report.push({id:review.id,captionId:c.id,status:c.startMs===next.startMs&&c.endMs===next.endMs&&c.holdMs===next.holdMs&&c.timingScope==='cue'?'unchanged':'applied',before:{startMs:c.startMs,endMs:c.endMs},after:{startMs:next.startMs,endMs:next.endMs},scope:'cue bounds only; word estimates preserved'});
 }
 const groups=new Map();
 staged.forEach((c,index)=>{const key=c.clipId??'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push({c,index});});
 const conflict=[...groups.values()].some(group=>group.sort((a,b)=>a.c.startMs-b.c.startMs).some((entry,i)=>i&&(changed.has(entry.index)||changed.has(group[i-1].index))&&entry.c.startMs<group[i-1].c.endMs));
 if(conflict)return {captions,report:report.map(r=>['applied','unchanged'].includes(r.status)?{...r,status:'skipped',reason:'batch conflicts with adjacent cue'}:r)};
 return {captions:staged,report};
}
