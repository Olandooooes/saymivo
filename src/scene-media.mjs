// All annotation/cursor coordinates live in intrinsic media space (0..1).
// Fit first, then apply one common camera transform to video and annotations.
export function fittedMediaRect(mediaWidth,mediaHeight,panelWidth,panelHeight,fit='contain'){
 const mw=Number.isFinite(mediaWidth)&&mediaWidth>0?mediaWidth:16,mh=Number.isFinite(mediaHeight)&&mediaHeight>0?mediaHeight:9;
 const ratio=fit==='cover'?Math.max(panelWidth/mw,panelHeight/mh):Math.min(panelWidth/mw,panelHeight/mh);
 const width=mw*ratio,height=mh*ratio;return {left:(panelWidth-width)/2,top:(panelHeight-height)/2,width,height};
}
const smooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function sampleMediaCamera(media={},ms=0){
 const base={x:media.x??0,y:media.y??0,scale:media.scale??1};
 const points=(media.camera??[]).filter(p=>Number.isFinite(p.atMs)).sort((a,b)=>a.atMs-b.atMs);
 if(!points.length)return base;const pick=p=>({...base,...p});
 if(ms<=points[0].atMs)return pick(points[0]);if(ms>=points.at(-1).atMs)return pick(points.at(-1));
 for(let i=1;i<points.length;i++){const b=points[i],a=points[i-1];if(ms<=b.atMs){const t=smooth((ms-a.atMs)/(b.atMs-a.atMs));return {x:(a.x??base.x)+((b.x??base.x)-(a.x??base.x))*t,y:(a.y??base.y)+((b.y??base.y)-(a.y??base.y))*t,scale:(a.scale??base.scale)+((b.scale??base.scale)-(a.scale??base.scale))*t};}}
 return base;
}
export function sampleMediaCursor(points=[],ms=0){
 const sorted=points.filter(p=>Number.isFinite(p.atMs)).sort((a,b)=>a.atMs-b.atMs);if(!sorted.length||ms<sorted[0].atMs)return null;
 let previous=sorted[0],next;for(const p of sorted){if(p.atMs<=ms)previous=p;else{next=p;break;}}
 const t=next?Math.max(0,Math.min(1,(ms-previous.atMs)/(next.atMs-previous.atMs))):0;
 const click=sorted.filter(p=>p.click&&ms>=p.atMs&&ms-p.atMs<600).at(-1);
 return {x:previous.x+((next?.x??previous.x)-previous.x)*t,y:previous.y+((next?.y??previous.y)-previous.y)*t,clickAge:click?ms-click.atMs:null,clickX:click?.x,clickY:click?.y};
}
export function activeHighlights(regions=[],ms=0){return regions.filter(r=>ms>=r.atMs&&ms<(r.endMs??Infinity));}
// Consecutive spotlights share one moving opening instead of flashing to a
// second rectangle. Simultaneous independent regions remain independent.
export function sampleFocusRegions(regions=[],ms=0,transitionMs=350){
 return activeHighlights(regions,ms).map(current=>{
  const previous=regions.filter(r=>r.id!==current.id&&Number.isFinite(r.endMs)&&r.endMs<=current.atMs&&current.atMs-r.endMs<=1).sort((a,b)=>b.endMs-a.endMs)[0];
  if(!previous||transitionMs<=0)return {...current};
  // Long jumps across unrelated controls should settle before they read as a
  // spotlight on the empty space between targets. Nearby text rows stay soft.
  const distance=Math.hypot(current.x+current.w/2-previous.x-previous.w/2,current.y+current.h/2-previous.y-previous.h/2);
  const travelMs=distance>.5?Math.min(transitionMs,120):transitionMs;
  const p=smooth((ms-current.atMs)/travelMs),sample={...current};
  for(const key of ['x','y','w','h'])sample[key]=previous[key]+(current[key]-previous[key])*p;
  return sample;
 });
}
