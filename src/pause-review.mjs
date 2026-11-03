// Source-time ranges only. A deselected deletion restores the exact original interval.
export function pauseCuts(clips,plan){
 const rows=new Map(plan.map(p=>[p.id,p.segments]));return clips.flatMap(clip=>{
  const segments=rows.get(clip.id);if(!segments)return [];
  let cursor=clip.inSec;const cuts=[];
  for(const s of [...segments,{inSec:clip.outSec,outSec:clip.outSec}]){
   if(s.inSec>cursor+1e-8)cuts.push({id:`${clip.id}:${cursor}:${s.inSec}`,clipId:clip.id,src:clip.src,startSec:cursor,endSec:s.inSec});cursor=s.outSec;
  }return cuts;
 });
}
export function selectedPausePlan(clips,cuts,selected){
 const ids=new Set(selected);return clips.flatMap(clip=>{
  const chosen=cuts.filter(c=>c.clipId===clip.id&&ids.has(c.id)).sort((a,b)=>a.startSec-b.startSec);
  if(!chosen.length)return [];
  let cursor=clip.inSec;const segments=[];
  for(const c of chosen){
   if(![c.startSec,c.endSec].every(Number.isFinite)||c.startSec<cursor||c.endSec>clip.outSec||c.endSec<=c.startSec)throw Error('停顿删除范围无效');
   if(c.startSec>cursor)segments.push({inSec:cursor,outSec:c.startSec});cursor=c.endSec;
  }
  if(cursor<clip.outSec)segments.push({inSec:cursor,outSec:clip.outSec});
  if(!segments.length)throw Error('不能删除整段原声');
  return [{id:clip.id,segments}];
 });
}
