import type {Caption} from './captions';
import type {Clip} from './timeline';
export type MotionKind='none'|'emphasis'|'steps'|'compare'|'number'|'card';
export type Motion={kind:MotionKind;title:string;body?:string;zoom?:number;label?:string;holdEndMs?:number;phaseStartMs?:number;phaseEndMs?:number;layout?:'speaker'|'headline'|'slide'|'spotlight'|'keyword';assetSrc?:string;focus?:{x:number;y:number;w:number;h:number}};
export const motionLabels:Record<MotionKind,string>={none:'原景别',emphasis:'重点拉近',steps:'步骤卡片',compare:'对比卡片',number:'数字强调',card:'概念卡片'};
export {captionText,suggestMotion,planMotions} from './motion-rules.mjs';
export function parseSrt(srt:string,clips:Clip[],fps=30):Caption[]{
 const time=(s:string)=>{const m=s.match(/(\d{1,3}):(\d\d):(\d\d)[,.](\d{3})/);return m?(+m[1]*3600 + +m[2]*60 + +m[3])*1000 + +m[4]:NaN;};
 const out:Caption[]=[];let count=0;
 for(const block of srt.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){
 const lines=block.trim().split('\n'),idx=lines.findIndex(l=>l.includes('-->'));if(idx<0)continue;
 const pair=lines[idx].split('-->'),a=time(pair[0]),b=time(pair[1]),text=lines.slice(idx+1).join('').replace(/<[^>]+>/g,'').trim();if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||!text)continue;
 // SRT milliseconds may round just past a clip's frame boundary; only create
 // fragments with a visible frame. Keep authored spaces on the following token.
 let offset=0;for(const clip of clips){const speed=clip.speed??1,dur=Math.max(1,Math.round(((clip.outSec-clip.inSec)/speed)*fps))/fps*1000;const start=Math.max(a,offset),end=Math.min(b,offset+dur);if(Math.round(end*fps/1000)>Math.round(start*fps/1000)){const startMs=clip.inSec*1000+(start-offset)*speed,endMs=clip.inSec*1000+(end-offset)*speed;const tokens=text.match(/\s*(?:[\u3400-\u9fff]|[a-zA-Z0-9]+|[^\s])/g)??[text];out.push({id:`srt-${Date.now()}-${count++}`,clipId:clip.id,startMs,endMs,topPct:80,words:tokens.map((text,i)=>({text,startMs:startMs+(endMs-startMs)*i/tokens.length,endMs:startMs+(endMs-startMs)*(i+1)/tokens.length,accent:false}))});}offset+=dur;}
 }
 return out;
}
