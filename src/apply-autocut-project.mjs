// Apply explicit retained ranges without moving source clocks or losing cross-cut cues.
// No media or recognition cache is modified. Caller owns the undo transaction.
export function applyAutocutProject(base, plan, fps=30) {
 if(!Array.isArray(plan)||!Number.isFinite(fps)||fps<=0)throw Error('停顿剪辑计划无效');
 const byId=new Map(),mapping=new Map(),clips=[],taken=new Set(base.clips.map(c=>c.id));
 for(const row of plan){
  if(byId.has(row.id)||!base.clips.some(c=>c.id===row.id)||!Array.isArray(row.segments)||!row.segments.length)throw Error('停顿剪辑片段不匹配');
  byId.set(row.id,row.segments);
 }
 for(const clip of base.clips){
  const ranges=byId.get(clip.id);if(!ranges){clips.push(clip);continue;}
  let cursor=clip.inSec;
  const parts=ranges.map((range,i)=>{
   if(![range.inSec,range.outSec].every(Number.isFinite)||range.inSec<cursor-1e-9||range.outSec>clip.outSec+1e-9||(range.outSec-range.inSec)/(clip.speed??1)*fps<1-1e-6)throw Error('停顿剪口越界、重叠或不足一帧');
   cursor=range.outSec;let id=clip.id;
   if(i){let n=i;do{id=`${clip.id}-pause${n++}`;}while(taken.has(id));taken.add(id);}
   const part={...clip,...range,id};clips.push(part);return part;
  });mapping.set(clip.id,parts);
 }
  const remap=(items,words=false)=>items.flatMap(item=>{
   if(!item.clipId)fail('现有字幕或配套轨没有绑定原片，请先整理时间绑定再精剪。');
   const parts=mapping.get(item.clipId);if(!parts)return [item];
   return parts.flatMap((part,i)=>{
    const startMs=Math.max(item.startMs,part.inSec*1000),endMs=Math.min(item.endMs,part.outSec*1000);
    if(endMs<=startMs)return [];
    const result={...item,id:i?`${item.id}-retake-${part.id}`:item.id,clipId:part.id,startMs,endMs};
    if(words){
     result.words=item.words.filter(w=>w.endMs>startMs&&w.startMs<endMs);
     if(item.words.length&&!result.words.length)return [];
     if(startMs!==item.startMs||endMs!==item.endMs){
      delete result.reviewOriginalTiming;
      if(item.reviewOriginalWords)result.reviewOriginalWords=item.reviewOriginalWords.filter(w=>w.endMs>startMs&&w.startMs<endMs);
     }
    }
    return [result];
   });
  });
  const sceneIds=new Set((base.presentation.scenes??[]).map(s=>s.id));
  const scenes=base.presentation.scenes?.flatMap(scene=>{
   if(typeof scene.src==='string'&&scene.src.length)return [scene];
   const parts=mapping.get(scene.clipId);if(!parts)return [scene];
   const visible=parts.filter(p=>scene.endMs>p.inSec*1000&&scene.startMs<p.outSec*1000);
   return visible.map((part,i)=>{
    let id=scene.id;if(i){const stem=`${scene.id}-retake-${part.id}`;id=stem;let n=1;while(sceneIds.has(id))id=`${stem}-${n++}`;sceneIds.add(id);}
    // Preserve the original source-time extent: projectStoryboard clamps its
    // visible intersection while retaining every animation's original phase.
    return {...scene,id,clipId:part.id};
   });
  });
  const chapters=base.presentation.chapters?.flatMap(chapter=>{
   if(typeof chapter.src==='string'&&chapter.src.length)return [chapter];
   const parts=mapping.get(chapter.clipId);if(!parts)return [chapter];
   const part=parts.find(p=>chapter.startMs>=p.inSec*1000&&chapter.startMs<p.outSec*1000)??parts.find(p=>chapter.startMs<p.inSec*1000);
   return part?[{...chapter,clipId:part.id}]:[];
  });
  const presentation={...base.presentation,...(scenes?{scenes}:{}),...(chapters?{chapters}:{})};
  const next={...base,clips,captions:remap(base.captions,true),brolls:remap(base.brolls),presentation};
  return next;
}
