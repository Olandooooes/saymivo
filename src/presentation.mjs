import {validEmphasisTheme} from './emphasis-theme.mjs';
import {displayFontConfig} from './display-fonts.mjs';
import {automaticStoryboard} from './auto-storyboard.mjs';
import {referencePlan} from './reference-motion.mjs';
export const validSourceCanvas=canvas=>Boolean(canvas&&['width','height'].every(k=>Number.isInteger(canvas[k])&&canvas[k]>=320&&canvas[k]<=7680&&canvas[k]%2===0));
export function sourceCanvasForClip(clip){
 if(!Number.isFinite(clip?.sourceWidth)||!Number.isFinite(clip?.sourceHeight)||clip.sourceWidth<=0||clip.sourceHeight<=0)return null;
 const canvas={width:Math.round(clip.sourceWidth/clip.sourceHeight*1080/2)*2,height:1080};
 return validSourceCanvas(canvas)?canvas:null;
}
export const presentationSize=p=>p?.format==='source'
 ?validSourceCanvas(p.canvas)?{width:p.canvas.width,height:p.canvas.height}:{width:1920,height:1080}
 :p?.format==='landscape'?{width:1920,height:1080}:{width:1080,height:1920};
export function knowledgePlan(captions,clips,options={}){
 const canvas=options.format==='source'?(validSourceCanvas(options.canvas)?{...options.canvas}:sourceCanvasForClip(clips[0])):null;
 const presentation={...(validEmphasisTheme(options.emphasisTheme)?{emphasisTheme:options.emphasisTheme}:{}),...(displayFontConfig(options.displayFont)?{displayFont:options.displayFont}:{}),theme:'knowledge',style:options.style==='reference'?'reference':'clean',motionPace:['calm','brisk'].includes(options.motionPace)?options.motionPace:'balanced',format:options.format==='source'?'source':options.format==='portrait'?'portrait':'landscape',...(canvas?{canvas}:{}),title:String(options.title??'知识讲解').slice(0,40),chapters:[]};
 const size=presentationSize(presentation),wide=size.width>size.height;
 const seen=new Set();
 const styled=captions.map((c,i)=>{const motion=c.motion?{...c.motion,layout:c.motion.layout??(c.motion.kind==='number'&&options.style==='reference'?'keyword':c.motion.kind==='emphasis'?'headline':'slide')}:undefined;
 if(motion?.kind==='card'){const next=captions[i+1],prev=captions[i-1],text=c.words.map(w=>w.text).join('');if(next?.clipId===c.clipId&&!text.includes(motion.title)&&next.words.map(w=>w.text).join('').includes(motion.title))motion.body=text+next.words.map(w=>w.text).join('');else if(prev?.clipId===c.clipId&&text.replace(/[。！？,.?!]/g,'')===motion.title&&c.startMs-prev.endMs<800)motion.body=prev.words.map(w=>w.text).join('')+text;}
 if(motion&&!seen.has(motion.title)&&presentation.chapters.length<5){seen.add(motion.title);presentation.chapters.push({id:'chapter-'+c.id,clipId:c.clipId,src:clips.find(x=>x.id===c.clipId)?.src,startMs:c.startMs,title:motion.title.slice(0,18)});}
 return {...c,motion,topPct:wide?91:86,scale:wide?.72:.9};});
 if(options.independentScenes&&presentation.style==='reference'&&presentation.format==='landscape'&&!styled.some(c=>c.motion?.assetSrc)){
  const planned=automaticStoryboard(styled,clips);
  if(planned.scenes.length)return {captions:styled.map(({motion,...caption})=>({...caption,topPct:91,scale:.65})),presentation:{...presentation,...planned}};
 }
 if(clips.length){const first=clips[0];if(presentation.chapters[0]?.clipId===first.id&&presentation.chapters[0].startMs-first.inSec*1000<1000)presentation.chapters[0].startMs=first.inSec*1000;else presentation.chapters.unshift({id:'opening',clipId:first.id,src:first.src,startMs:first.inSec*1000,title:'开场'});}
 return {captions:options.style==='reference'?referencePlan(styled,clips):styled,presentation};
}
export function projectChapters(chapters=[],clips=[],fps=30){
 let from=0;const placed=clips.map(c=>{const p={c,from};from+=Math.max(1,Math.round((c.outSec-c.inSec)/(c.speed??1)*fps))/fps*1000;return p;});
 const out=[];for(const ch of chapters){
  const family=placed.filter(({c})=>c.id===ch.clipId||(ch.src===c.src&&c.id.startsWith(ch.clipId+'-')));
  const hit=family.find(({c})=>ch.startMs>=c.inSec*1000&&ch.startMs<c.outSec*1000)??family.find(({c})=>ch.startMs<c.inSec*1000);
  if(hit)out.push({...ch,at:hit.from+Math.max(0,ch.startMs-hit.c.inSec*1000)/(hit.c.speed??1)});
 }
 return out.sort((a,b)=>a.at-b.at).filter((c,i,a)=>!i||c.at-a[i-1].at>250);
}
export function speakerBox(layout,width,height){
 const wide=width>height;
 if(layout==='editorial')return wide?{left:width*.17,top:0,width,height,radius:0}:{left:0,top:height*.24,width,height:height*.69,radius:0};
 if(layout==='slide'||layout==='spotlight'){const size=width*(wide?.205:.32);return {left:width-size-width*.035,top:height*(wide?.46:.62),width:size,height:size,radius:size/2};}
 if(layout==='keyword'&&wide)return {left:width*.45,top:0,width:width*.55,height,radius:0};
 if(layout==='headline')return wide?{left:width*.45,top:0,width:width*.55,height,radius:0}:{left:0,top:height*.24,width,height:height*.65,radius:0};
 return {left:0,top:0,width,height,radius:0};
}
