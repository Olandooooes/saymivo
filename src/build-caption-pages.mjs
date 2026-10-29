import {readableCaptionWordGroups} from './caption-pages.mjs';
// Runs are isolated by clip: never move text across an actual edit.
export function buildCaptionPages(words,accentIdx=[],topByClip={},options={}) {
 const accents=new Set(accentIdx),runs=[];let current=[];let clipId=null;
 const flush=()=>{if(current.length)runs.push({clipId,words:current});current=[];};
 words.forEach((w,i)=>{
  if(w.clipId!==clipId){flush();clipId=w.clipId;}
  if(!w.word?.trim())return;
  const previous=current.at(-1);
  const prefix=w.spaceBefore && previous && /[A-Za-z0-9]$/.test(previous.text) && /^[A-Za-z0-9]/.test(w.word)?' ':'';
  current.push({text:prefix+w.word,startMs:w.srcStartMs,endMs:w.srcEndMs,accent:accents.has(i)});
 });flush();
 return runs.flatMap(run=>readableCaptionWordGroups(run.words,options).map(group=>({clipId:run.clipId,words:group,startMs:group[0].startMs,endMs:group.at(-1).endMs,topPct:topByClip[run.clipId]??80,...(options.protectedPhrases?{protectedPhrases:options.protectedPhrases}:{})})))
 .map((page,i)=>({...page,id:`c${i}`}));
}

// Reflow display pages only; explicit timing reviews, motion and style boundaries stay intact.
export function reflowCaptionPages(captions,options={}){
 const out=[];let run=[];let signature='';
 const flush=()=>{if(!run.length)return;const template=run[0];
  const words=run.flatMap(c=>c.words),protectedPhrases=[...new Set([...run.flatMap(c=>c.protectedPhrases??[]),...(options.protectedPhrases??[])])];
  for(const group of readableCaptionWordGroups(words,{...options,protectedPhrases}))out.push({...template,...(protectedPhrases.length?{protectedPhrases}:{}),words:group,startMs:group[0].startMs,endMs:group.at(-1).endMs});
  run=[];};
 for(const cap of captions){
  if(cap.motion||cap.timingScope==='cue'||cap.reviewOriginalTiming){flush();out.push(cap);signature='';continue;}
  const key=JSON.stringify([cap.clipId,cap.topPct,cap.scale,cap.styleOverride,cap.holdMs,cap.audioClock]);
  if(run.length&&(key!==signature||cap.startMs<run.at(-1).endMs)){flush();}
  signature=key;run.push(cap);
 }flush();
 return out.map((cap,i)=>({...cap,id:`reflow-${i}`}));
}
