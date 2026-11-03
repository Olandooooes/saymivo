import {reflowCaptionPages} from './build-caption-pages.mjs';
// Source-anchored, local-only matching. No transcript-specific names or offsets.
const textOf=c=>c.words.map(w=>w.text).join('');
export const talkingMotionNames={emphasis:'完整论点强调',contrast:'转折对照',steps:'顺序步骤'};
export function projectedTalkingCaptions(captions,clips,fps=30){
 let offset=0;const out=[];
 for(const clip of clips){
  const speed=clip.speed??1,duration=Math.max(1,Math.round((clip.outSec-clip.inSec)/speed*fps))/fps*1000;
  for(const c of captions){
   if(c.clipId!==clip.id||c.startMs<clip.inSec*1000-.01||c.endMs>clip.outSec*1000+.01)continue;
   out.push({...c,src:clip.src,at:offset+(c.startMs-clip.inSec*1000)/speed,until:offset+(c.endMs-clip.inSec*1000)/speed});
  }offset+=duration;
 }return out.sort((a,b)=>a.at-b.at);
}
export function talkingMotionSignature(captions,clipId,startMs,endMs){
 return JSON.stringify(captions.filter(c=>c.clipId===clipId).flatMap(c=>c.words).filter(w=>w.endMs>startMs&&w.startMs<endMs).map(w=>[w.text,w.startMs,w.endMs]));
}
export function matchTalkingMotion(captions,clips,{startMs=0,endMs=30000,fps=30,limit=3}={}){
 const caps=projectedTalkingCaptions(reflowCaptionPages(captions),clips,fps).filter(c=>c.at>=startMs&&c.until<=endMs&&!c.motion),candidates=[];
 const add=(kind,run,items,reason)=>{
  const first=run[0],last=run.at(-1),duration=last.until-first.at;
  if(duration<1800||duration>18000||items.some(i=>Array.from(i.text).length>70)||items.length>4)return;
  candidates.push({id:`talk-${kind}-${first.clipId}-${first.startMs}`,kind,clipId:first.clipId,src:first.src,startMs:first.startMs,endMs:last.endMs,items,reason,signature:talkingMotionSignature(captions,first.clipId,first.startMs,last.endMs),renderer:'reference-blue',topPct:10,leftPct:4,widthPct:28,scale:1,entryMs:220,at:first.at,until:last.until});
 };
 const consecutive=(a,b)=>b&&a.clipId===b.clipId&&b.startMs>=a.endMs-1&&b.startMs-a.endMs<950;
 for(let i=0;i<caps.length;i++){
  const c=caps[i],text=textOf(c),next=caps[i+1];
  // Preserve the qualifiers, including negation. Never turn a limitation into a promise.
  if(/不是|并非/.test(text)){
   let run=[c],full=text;
   if(!/而是/.test(full)&&consecutive(c,next)){run.push(next);full+=textOf(next);}
   const split=full.indexOf('而是');
   if(split>1){let boundary=run.flatMap(x=>x.words).find(w=>w.startMs>c.startMs&&full.slice(0,split).length<=run.flatMap(x=>x.words).filter(v=>v.endMs<=w.startMs).map(v=>v.text).join('').length)?.startMs;
    add('contrast',run,[{text:full.slice(0,split),atMs:c.startMs},{text:full.slice(split),atMs:boundary??run.at(-1).startMs}],'识别到明确的“不是／并非…而是…”结构，保留两侧原话与否定。');}
  }
  if(/^(首先|第一[步点项]?|先[，,：:])/.test(text)){
   const run=[c],items=[{text,atMs:c.startMs}];let j=i+1;
   while(j<caps.length&&caps[j].clipId===c.clipId&&caps[j].startMs-run.at(-1).endMs<2500&&caps[j].until-c.at<=18000){
    const t=textOf(caps[j]);
    if(/^(其次|然后|接着|最后|第二[步点项]?|第三[步点项]?)/.test(t)){
     if(items.length>=3)break;items.push({text:t,atMs:caps[j].startMs});
    }else if(items.at(-1).text.length<7||(!/[。！？!?]$/.test(items.at(-1).text)&&items.at(-1).text.length+t.length<=32))items.at(-1).text+=t;
    else break;
    run.push(caps[j++]);
   }
   if(items.length>=2&&items.every(x=>x.text.length>=7))add('steps',run,items,'识别到至少两个明确顺序标记，逐项显示原文，不补造步骤。');
  }
  if(/关键|核心|本质|不代表|不等于|就是|叫做|全称/.test(text)){
   const run=[c];let full=text;
   // If the statement continues, keep its next cue rather than extracting a fragment.
   if(!/[。！？!?]$/.test(text)&&consecutive(c,next)&&/^(走向|转向|而是|并且)/.test(textOf(next))&&Array.from(full+textOf(next)).length<=56){run.push(next);full+=textOf(next);}
   if(Array.from(full).length>=6&&Array.from(full).length<=56)add('emphasis',run,[{text:full,atMs:c.startMs}],'原话含定义、重点或限制信号；显示完整字幕内容，不改写结论。');
  }
 }
 const selected=[];
 for(const c of candidates.sort((a,b)=>({steps:3,contrast:2,emphasis:1}[b.kind]-{steps:3,contrast:2,emphasis:1}[a.kind])||a.at-b.at)){
  if(selected.length>=limit)break;
  if(selected.some(s=>c.at<s.until+1000&&c.until+1000>s.at))continue;
  selected.push(c);
 }
 return selected.map(({at,until,...cue})=>cue).sort((a,b)=>clips.findIndex(c=>c.id===a.clipId)-clips.findIndex(c=>c.id===b.clipId)||a.startMs-b.startMs);
}
export function projectTalkingMotion(cues,captions,clips,fps=30){
 const positions=new Map();let offset=0;
 for(const clip of clips){const duration=Math.max(1,Math.round((clip.outSec-clip.inSec)/(clip.speed??1)*fps))/fps*1000;positions.set(clip.id,{clip,offset});offset+=duration;}
 return cues.flatMap(cue=>{
  const p=positions.get(cue.clipId);if(!p||p.clip.src!==cue.src||cue.startMs<p.clip.inSec*1000||cue.endMs>p.clip.outSec*1000||talkingMotionSignature(captions,cue.clipId,cue.startMs,cue.endMs)!==cue.signature)return [];
  const speed=p.clip.speed??1,toMs=t=>p.offset+(t-p.clip.inSec*1000)/speed;
  return [{...cue,signature:JSON.stringify(JSON.parse(cue.signature).map(([text,start,end])=>[text,toMs(start),toMs(end)])),entryMs:cue.entryMs/speed,startMs:toMs(cue.startMs),endMs:toMs(cue.endMs),items:cue.items.map(i=>({...i,atMs:toMs(i.atMs)}))}];
 });
}
