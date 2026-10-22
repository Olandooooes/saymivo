import {mergeChineseCaptionTails,readableCaptionWordGroups} from '../src/caption-pages.mjs';
import {captionText,planMotions} from '../src/motion-rules.mjs';
import {applyCaptionTimingReviews} from '../src/caption-timing-review.mjs';
import {normalizeSubtitleTerms} from '../src/subtitle-terms.mjs';

// All times remain anchored to the original source, including split captions.
export function applyTrimPlan(clips,captions,plan){
 const out=[],caps=[],reservedIds=new Set(clips.map(c=>c.id));
 for(const clip of clips){
  const segments=plan.find(p=>p.id===clip.id)?.segments??[{inSec:clip.inSec,outSec:clip.outSec}];
  for(const [i,seg]of segments.entries()){
   let id=clip.id;if(i){let suffix=1;while(reservedIds.has(`${clip.id}-cut${suffix}`))suffix++;id=`${clip.id}-cut${suffix}`;reservedIds.add(id);}
   const c={...clip,...seg,id};out.push(c);
   for(const cap of captions.filter(c=>c.clipId===clip.id)){
    const a=Math.max(cap.startMs,c.inSec*1000),b=Math.min(cap.endMs,c.outSec*1000);if(b<=a)continue;
    const wordStart=cap.timingScope==='cue'?c.inSec*1000:a,wordEnd=cap.timingScope==='cue'?c.outSec*1000:b;
    const words=cap.words.filter(w=>w.endMs>wordStart&&w.startMs<wordEnd&&Math.min(w.endMs,wordEnd)-Math.max(w.startMs,wordStart)>=Math.min(80,(w.endMs-w.startMs)*.5)).map(w=>({...w,startMs:Math.max(wordStart,w.startMs),endMs:Math.min(wordEnd,w.endMs)}));
    if(words.length)caps.push({...cap,id:`${cap.id}-${i}`,clipId:c.id,startMs:a,endMs:b,words});
   }
  }
 }
 return {clips:out,captions:caps};
}

// Reflow ASR pages into short readable Chinese caption lines, without rewriting speech.
export function styleCaptions(captions,clips){
 const out=[];
 for(const clip of clips){
  const sourcePages=captions.filter(c=>c.clipId===clip.id),clock=sourcePages[0]?.audioClock;
  const sharedClock=clock&&sourcePages.every(c=>JSON.stringify(c.audioClock)===JSON.stringify(clock))?clock:undefined;
  const raw=sourcePages.flatMap(c=>c.words).sort((a,b)=>a.startMs-b.startMs);const words=[];
  for(const w of raw){
   const prev=words.at(-1);
   if(prev&&/^[a-zA-Z0-9]+$/.test(prev.text)&&/^[a-zA-Z0-9]+[.,。]?$/i.test(w.text)&&w.startMs-prev.endMs<150){prev.text+=(prev.text.length>1&&w.text.replace(/[.,。]$/,'').length>1?' ':'')+w.text;prev.endMs=w.endMs;}
   else words.push({...w,text:w.text.replace(/,/g,'，').replace(/\?/g,'？')});
  }
  // Normalize the merged token in place, without expanding its source-time span
  // into newly interpolated character timings.
  for(const word of words)word.text=normalizeSubtitleTerms(word.text);
  for(const group of readableCaptionWordGroups(words))out.push({id:`auto-c${out.length}`,clipId:clip.id,startMs:group[0].startMs,endMs:group.at(-1).endMs,topPct:89,scale:.95,words:group,...(sharedClock?{audioClock:sharedClock}:{})});
 }
 const styled=mergeChineseCaptionTails(out),reviews=captions.filter(c=>c.timingScope==='cue').map(c=>({id:'project-cue-'+c.id,anchor:c.reviewOriginalTiming??{startMs:c.words[0]?.startMs,endMs:c.words.at(-1)?.endMs,text:c.words.map(w=>w.text).join('')},range:{startMs:c.startMs,endMs:c.endMs},holdMs:c.holdMs??0}));
 return applyCaptionTimingReviews(styled,reviews,{clipRanges:Object.fromEntries(clips.map(c=>[c.id,{startMs:c.inSec*1000,endMs:c.outSec*1000}]))}).captions;
}

export function automaticMotionPlan(captions,clips,kinds){
 const styled=styleCaptions(captions,clips);
 // A term may fall on the next subtitle page: retain the spoken clause as context.
 const contextual={...(kinds??{})};const titles=new Map();
 if(!kinds)for(const [i,c]of styled.entries()){
  const prev=styled[i-1]?.clipId===c.clipId?styled[i-1]:null,next=styled[i+1]?.clipId===c.clipId?styled[i+1]:null;
  const text=captionText(c),context=(prev?captionText(prev):'')+text+(next?captionText(next):'');
  const term=text.match(/[A-Za-z][A-Za-z0-9]{2,}/)?.[0]??(next&&next.endMs-next.startMs<1100?captionText(next).match(/[A-Za-z][A-Za-z0-9]{2,}/)?.[0]:null);
  if(term&&/介绍|叫|称|岗位|工具|概念|火爆/.test(context)){contextual[c.id]='card';titles.set(c.id,term);}
 }
 const planned=planMotions(styled,clips,25,contextual);let last=-Infinity;
 let offset=0;const positions=new Map();for(const c of clips){positions.set(c.id,{offset,inMs:c.inSec*1000,speed:c.speed??1});offset+=(c.outSec-c.inSec)/(c.speed??1)*1000;}
 for(const c of planned.captions){
  const pos=positions.get(c.clipId);const t=pos.offset+(c.startMs-pos.inMs)/pos.speed;
  if(c.endMs-c.startMs<1100||t-last<2800)c.motion=undefined;
  if(c.motion){
   c.motion.zoom=1.035;
   if(c.motion.kind==='card'){const term=titles.get(c.id)??captionText(c).match(/[A-Za-z][A-Za-z0-9]{2,}/)?.[0];if(term)c.motion.title=term;}
   last=t;
  }
  for(const w of c.words)w.accent=/[A-Za-z]{3,}|\d+|关键|核心|重点/.test(w.text);
 }
 return planned;
}
