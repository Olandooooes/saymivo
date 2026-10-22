const normalize=text=>text.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
export function validRegionTemplates(regions=[]){
 return Array.isArray(regions)&&regions.length<=16&&new Set(regions.map(r=>r?.id)).size===regions.length&&regions.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=80&&typeof r.cue==='string'&&r.cue.trim().length>=2&&r.cue.length<=80&&(r.endCue===undefined||typeof r.endCue==='string'&&r.endCue.length>=2&&r.endCue.length<=80)&&['highlight','spotlight','underline'].includes(r.mode)&&['x','y','w','h'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=1.001&&r.y+r.h<=1.001);
}
export function validCameraHints(hints=[]){return Array.isArray(hints)&&hints.length<=8&&hints.every(h=>h&&typeof h.cue==='string'&&h.cue.length>=2&&h.cue.length<=80&&['scale','x','y'].every(k=>Number.isFinite(h[k]))&&h.scale>=1&&h.scale<=3&&Math.abs(h.x)<=30&&Math.abs(h.y)<=30);}
export function resolveMediaCues(scene,asset,captions=[]){
 const ids=new Set(scene.sourceCaptionIds??[]),words=captions.filter(c=>ids.has(c.id)).flatMap(c=>c.words).filter(w=>w.endMs>scene.startMs&&w.startMs<scene.endMs).sort((a,b)=>a.startMs-b.startMs);
 let text='';const anchors=[];
 for(const word of words)for(const char of normalize(word.text).split('')){text+=char;anchors.push(word);}
 const duration=scene.endMs-scene.startMs,report=[];
 const locate=cue=>{if(typeof cue!=='string')return null;const value=normalize(cue);if(!value)return null;const at=text.indexOf(value);if(at<0||text.indexOf(value,at+1)>=0)return null;return Math.max(0,anchors[at].startMs-scene.startMs);};
 let highlights=[];
 for(const region of validRegionTemplates(asset.regions)?asset.regions??[]:[]){
  const atMs=locate(region.cue),end=region.endCue?locate(region.endCue):duration;
  if(atMs===null||atMs>=duration||end===null||end<=atMs||!['highlight','spotlight','underline'].includes(region.mode)||!['x','y','w','h'].every(k=>Number.isFinite(region[k]))||region.x<0||region.y<0||region.w<=0||region.h<=0||region.x+region.w>1.001||region.y+region.h>1.001){report.push({id:region.id,status:'skipped',reason:'触发词不唯一、不在本段或区域无效'});continue;}
  highlights.push({id:`auto-${region.id}`,x:region.x,y:region.y,w:region.w,h:region.h,mode:region.mode,atMs,endMs:Math.min(duration,end)});
  report.push({id:region.id,status:'bound',cue:region.cue,atMs});
 }
 highlights=highlights.map(region=>{if(region.mode!=='spotlight')return region;const next=highlights.filter(h=>h.mode==='spotlight'&&h.atMs>region.atMs).sort((a,b)=>a.atMs-b.atMs)[0];return next?{...region,endMs:Math.min(region.endMs,next.atMs)}:region;});
 const camera=[{atMs:0,scale:1,x:0,y:0}];
 for(const hint of validCameraHints(asset.cameraHints)?asset.cameraHints??[]:[]){const atMs=locate(hint.cue);if(atMs===null||atMs>=duration)continue;const point={atMs,scale:hint.scale,x:hint.x,y:hint.y};const previous=camera.findIndex(p=>p.atMs===atMs);if(previous>=0)camera[previous]=point;else camera.push(point);}
 camera.sort((a,b)=>a.atMs-b.atMs);
 return {highlights,camera:camera.length>1||camera[0].scale!==1?camera:undefined,report};
}
