import {matchingSource} from '../src/storyboard.mjs';
import {projectFaceRectangle,suggestSideTextZones} from '../src/visual-profile-layout.mjs';
import {emphasisGeometry} from '../src/emphasis-layout.mjs';
const eligible=s=>s.layout==='speaker'&&s.tagTreatment==='kinetic'&&s.tags?.length;
export function sceneProfileSampleTimes(scene,clips){
 const times=[];
 for(const clip of clips.filter(c=>matchingSource(scene,c))){
  const a=Math.max(scene.startMs,clip.inSec*1000)/1000,b=Math.min(scene.endMs,clip.outSec*1000)/1000;
  if(b-a<.4)continue;
  const pad=Math.min(.35,(b-a)/4);
  times.push(a+pad,(a+b)/2,b-pad);
 }
 return [...new Set(times.map(t=>Math.round(t*1000)/1000))].sort((a,b)=>a-b);
}
export function visualLayoutSamples(project,src){
 const times=[];
 for(const scene of project.presentation?.scenes??[])if(scene.src===src&&eligible(scene)){
  const next=[...new Set([...times,...sceneProfileSampleTimes(scene,project.clips)])];
  if(next.length<=60)times.splice(0,times.length,...next);
 }
 return times.sort((a,b)=>a-b);
}
export function applyVisualProfileLayout(project,profile,{src,sourceSha256}){
 const p=structuredClone(project),report=[];
 if(!/^[a-f0-9]{64}$/.test(sourceSha256??'')||profile?.version!==1||profile.sourceSha256!==sourceSha256||!Array.isArray(profile.frames))return {project:p,report:[{src,status:'skipped',reason:'foreign-or-invalid-profile'}]};
 if(p.presentation?.format==='portrait')return {project:p,report:[{src,status:'skipped',reason:'portrait-projection-not-supported'}]};
 for(const scene of p.presentation?.scenes??[]){
  if(scene.src!==src||!eligible(scene))continue;
  const times=sceneProfileSampleTimes(scene,p.clips),frames=times.map(t=>profile.frames.find(f=>Math.abs(f.requestedAtSec-t)<.0001));
  const clips=p.clips.filter(c=>matchingSource(scene,c)&&c.outSec*1000>scene.startMs&&c.inSec*1000<scene.endMs);
  let reason;
  if(clips.some(c=>c.transform?.length))reason='authored-camera-keyframes';
  else if(!times.length||frames.some(f=>!f))reason='missing-scene-samples';
  else if(frames.some(f=>!Array.isArray(f.faces)||f.faces.length!==1||f.faces[0].confidence<.6))reason='missing-or-ambiguous-face';
  if(reason){report.push({src,sceneId:scene.id,status:'skipped',reason});continue;}
  const framing={x:50,y:50,scale:1,shiftY:0,...p.presentation.speaker,...scene.speaker};
  const faces=frames.map(f=>projectFaceRectangle(f.faces[0],{sourceWidth:f.width,sourceHeight:f.height,...framing}));
  if(faces.some(f=>!f)){report.push({src,sceneId:scene.id,status:'skipped',reason:'face-not-visible-after-crop'});continue;}
  const suggestion=suggestSideTextZones(faces);
  if(!suggestion.zones.length){report.push({src,sceneId:scene.id,status:'skipped',reason:suggestion.reason});continue;}
  const zones=suggestion.zones;
  const rows=new Map(),occupied=[];
  if(zones.length===1){
   for(const tag of [...scene.tags].sort((a,b)=>a.atMs-b.atMs)){
    const zone=zones[0],size=emphasisGeometry({...tag,x:zone.x,width:zone.width},1920,1080,tag.atMs).size;
    // CSS line-height + underline/margin + entrance movement, above captions.
    const height=size*1.12*tag.text.split('\n').length/1080+35/1080;
    const active=occupied.filter(box=>tag.atMs<box.endMs&&tag.endMs>box.atMs);
    const y=[.10,.32,.54].find(y=>y+height<=.76&&active.every(box=>y+height+.008<=box.y||box.y+box.height+.008<=y));
    if(y===undefined){reason=scene.tags.some(t=>t.text.includes('\n'))?'insufficient-vertical-space':'too-many-overlapping-tags';break;}
    rows.set(tag.id,y);occupied.push({y,height,atMs:tag.atMs,endMs:tag.endMs});
   }
   if(reason){report.push({src,sceneId:scene.id,status:'skipped',reason});continue;}
  }
  scene.tags=scene.tags.map((tag,i)=>{
   const preferred=zones.find(z=>z.side===(tag.x>=.5?'right':'left')),zone=preferred??zones[0];
   const y=zones.length===1?rows.get(tag.id):tag.y;
   return {...tag,x:zone.x,y,width:zone.width};
  });
  report.push({src,sceneId:scene.id,status:'applied',sampleTimesSec:times,zones,faceEnvelope:suggestion.faceEnvelope,scope:'Sparse full-screen source samples, not continuous tracking; reviewed scene designs apply afterwards'});
 }
 return {project:p,report};
}
