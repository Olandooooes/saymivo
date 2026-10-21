import {captionText,planMotions} from '../src/motion-rules.mjs';

// All times remain anchored to the original source, including split captions.
export function applyTrimPlan(clips,captions,plan){
 const out=[],caps=[];
 for(const clip of clips){
  const segments=plan.find(p=>p.id===clip.id)?.segments??[{inSec:clip.inSec,outSec:clip.outSec}];
  for(const [i,seg]of segments.entries()){
   const c={...clip,...seg,id:i?`${clip.id}-cut${i}`:clip.id};out.push(c);
   for(const cap of captions.filter(c=>c.clipId===clip.id)){
    const a=Math.max(cap.startMs,c.inSec*1000),b=Math.min(cap.endMs,c.outSec*1000);if(b<=a)continue;
    const words=cap.words.filter(w=>w.endMs>a&&w.startMs<b).map(w=>({...w,startMs:Math.max(a,w.startMs),endMs:Math.min(b,w.endMs)}));
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
  const raw=captions.filter(c=>c.clipId===clip.id).flatMap(c=>c.words).sort((a,b)=>a.startMs-b.startMs);const words=[];
  for(const w of raw){
   const prev=words.at(-1);
   if(prev&&/^[a-zA-Z0-9]+$/.test(prev.text)&&/^[a-zA-Z0-9]+[.,。]?$/i.test(w.text)&&w.startMs-prev.endMs<150){prev.text+=w.text;prev.endMs=w.endMs;}
   else words.push({...w,text:w.text.replace(/,/g,'，').replace(/\?/g,'？')});
  }
  let group=[];const flush=()=>{if(!group.length)return;out.push({id:`auto-c${out.length}`,clipId:clip.id,startMs:group[0].startMs,endMs:group.at(-1).endMs,topPct:89,scale:.95,words:group});group=[];};
  const weight=s=>Array.from(s).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.52:1),0);
  for(const w of words){if(group.length&&(w.startMs-group.at(-1).endMs>400||weight(group.map(w=>w.text).join('')+w.text)>15))flush();group.push(w);if(/[。！？?!，,]$/.test(w.text))flush();}flush();
 }
 return out;
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
