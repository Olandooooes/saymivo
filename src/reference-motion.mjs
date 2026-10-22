import {normalizeSubtitleTerms} from './subtitle-terms.mjs';
const endOf=c=>c.motion?.holdEndMs??c.endMs;
export const easeOut=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
export function sceneEnvelope(ms,start,end,pace='balanced'){
 const enter=pace==='calm'?480:pace==='brisk'?240:340,exit=pace==='calm'?240:160;
 const duration=Math.max(1,end-start),inMs=Math.min(enter,duration/2),outMs=Math.min(exit,duration/3);
 return {enter:easeOut((ms-start)/inMs),exit:easeOut((end-ms)/outMs)};
}
export function activeScene(captions,ms,clipId){
 return captions.filter(c=>c.motion&&(clipId==null||c.clipId===clipId||clipId.startsWith((c.clipId??'!')+'-'))&&ms>=c.startMs&&ms<endOf(c)).sort((a,b)=>b.startMs-a.startMs)[0];
}
export function referencePlan(captions,clips){
 // Visual cues are independent from subtitle pages. Hold lecture layouts over
 // following speech, but never extend the spoken subtitle or change source time.
 return captions.map(c=>{if(!c.motion)return {...c};const clip=clips.find(x=>x.id===c.clipId);if(!clip)return {...c};
 const next=captions.filter(x=>x.clipId===c.clipId&&x.motion&&x.startMs>c.startMs).sort((a,b)=>a.startMs-b.startMs)[0];
 const topic=captions.filter(x=>x.clipId===c.clipId&&x.startMs>c.startMs&&/^(最近|接下来|下面|另一方面|第二|第三|最后)/.test(x.words.map(w=>w.text).join(''))).sort((a,b)=>a.startMs-b.startMs)[0];
 const layout=c.motion.layout??(c.motion.kind==='number'?'keyword':c.motion.kind==='emphasis'?'headline':'slide');
 const hold=(layout==='slide'||layout==='spotlight')?Math.min(next?.startMs??Infinity,topic?.startMs??Infinity,clip.outSec*1000,Math.max(c.endMs,c.startMs+8000)):Math.min(c.endMs,clip.outSec*1000);
 return {...c,motion:{...c.motion,layout,holdEndMs:hold,label:c.motion.label??(c.motion.kind==='steps'?'分步讲解':c.motion.kind==='compare'?'换个角度':c.motion.kind==='number'?'数字重点':c.motion.kind==='emphasis'?'重点表达':'关键概念')}};
 });
}
export function projectScenes(captions,clips,fps=30){
 let fromMs=0;const out=[];
 for(const clip of clips){const start=clip.inSec*1000,end=clip.outSec*1000,speed=clip.speed??1;const duration=Math.max(1,Math.round((end-start)/speed/1000*fps))/fps*1000;
 for(const c of captions){if(!c.motion||!(c.clipId===clip.id||clip.id.startsWith((c.clipId??'!')+'-')))continue;
 const a=Math.max(c.startMs,start),b=Math.min(endOf(c),end);if(b<=a)continue;
 out.push({...c,id:c.id+':'+clip.id,clipId:clip.id,startMs:fromMs+(a-start)/speed,endMs:Math.min(fromMs+duration,fromMs+(b-start)/speed),motion:{...c.motion,holdEndMs:undefined,phaseStartMs:fromMs+(c.startMs-start)/speed,phaseEndMs:fromMs+(endOf(c)-start)/speed}});
 }fromMs+=duration;}
 return out.sort((a,b)=>a.startMs-b.startMs);
}
export function headlineLines(text,limit=8){
 const lines=[];
 for(const paragraph of String(text).split(/\r?\n/)){
  const words=paragraph.trim().match(/[A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?[%亿万倍秒天个]?|\s+|[^\s]/g)??[];
  let line='',weight=0,pendingSpace=false;
  for(const word of words){if(/^\s+$/.test(word)){pendingSpace=true;continue;}
   const gap=pendingSpace&&/[A-Za-z0-9]$/.test(line)&&/^[A-Za-z0-9]/.test(word)?' ':'';
   const w=/^[A-Za-z]/.test(word)?word.length*.55:word.length;
   if(line&&weight+w+(gap?.3:0)>limit){lines.push(line);line='';weight=0;}
   line+=(line?gap:'')+word;weight+=w+(line&&gap?.3:0);pendingSpace=false;
  }if(line)lines.push(line);
 }return lines;
}
export function readableSubtitle(words){
 let text='';for(const word of words){const next=typeof word==='string'?word:word.text;
  const space=/[A-Za-z0-9]$/.test(text)&&/^[A-Za-z0-9]/.test(next)?' ':'';text+=space+next;
 }
 // Known technical terms may arrive as character/subword tokens after ASR or correction.
 return normalizeSubtitleTerms(text);
}
