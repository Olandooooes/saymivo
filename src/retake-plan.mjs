import {reviewClockMatches} from './source-review-clock.mjs';
import {restoreKeeperCaptionPrefixes} from './retake-keeper-captions.mjs';

const finite = Number.isFinite;
const fail = message => { throw Error(message); };
const overlap = (a,b) => a.startSec < b.endSec && b.startSec < a.endSec;
const candidateParts=(candidate,role)=>role==='retain'&&candidate.kind==='filler'?[]:candidate[role+'Parts']??[{...candidate[role],clipId:role==='remove'?candidate.clipId:(candidate.retain?.clipId??candidate.clipId),src:candidate.src}];
export const retakeClipSnapshot = clips => clips.map(c => ({id:c.id,src:c.src,inSec:c.inSec,outSec:c.outSec,
  speed:c.speed??1,sourceDurationSec:c.sourceDurationSec}));
const projectData = p => ({clips:p.clips??[],captions:p.captions??[],brolls:p.brolls??[],
  presentation:p.presentation??{},music:p.music??null,accentColor:p.accentColor});
const signature = p => JSON.stringify(projectData(p));
const captionTextKey=text=>String(text??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

// Old caption clocks can extend beyond a newly measured audio cut. Remove only
// a complete, uniquely nearest word sequence in the exact deleted instance;
// never infer finer token times or rewrite surviving token timestamps.
function captionsAfterDeletedText(captions,cuts){
 const excluded=new Map(),warnings=[],rewritten=new Set();let cleaned=0,unresolved=0;
 for(const [clipId,parts]of cuts){
  const entries=captions.flatMap((caption,captionIndex)=>caption.clipId===clipId?
   (caption.words??[]).map((word,wordIndex)=>({captionIndex,wordIndex,word,key:captionTextKey(word.text)})):[])
   .sort((a,b)=>a.word.startMs-b.word.startMs||a.captionIndex-b.captionIndex||a.wordIndex-b.wordIndex);
  if(!entries.length)continue;
  for(const part of parts){
   const target=captionTextKey(part.text),start=part.startSec*1000,end=part.endSec*1000;
   const near=entry=>finite(entry.word.startMs)&&finite(entry.word.endMs)&&entry.word.endMs>=entry.word.startMs&&
    entry.word.endMs>=start-500&&entry.word.startMs<=end+500;
   const matches=[];
   if(target)for(let first=0;first<entries.length;first++){
    if(!entries[first].key||!near(entries[first]))continue;
    let text='';
    for(let last=first;last<entries.length;last++){
     if(!near(entries[last]))break;
     text+=entries[last].key;
     if(!target.startsWith(text))break;
     if(text===target){
      const words=entries.slice(first,last+1);
      matches.push({words,distance:Math.abs(words[0].word.startMs-start)+Math.abs(words.at(-1).word.endMs-end)});
      break;
     }
    }
   }
   matches.sort((a,b)=>a.distance-b.distance);
   // Equally near alternatives are ambiguous; never choose by array order.
   if(!matches.length||matches[1]&&Math.abs(matches[0].distance-matches[1].distance)<=1){unresolved++;continue;}
   if(matches[0].words.some(entry=>excluded.get(entry.captionIndex)?.has(entry.wordIndex))){unresolved++;continue;}
   for(const entry of matches[0].words){
    if(!excluded.has(entry.captionIndex))excluded.set(entry.captionIndex,new Set());
    excluded.get(entry.captionIndex).add(entry.wordIndex);
   }
   cleaned++;
  }
 }
 if(cleaned)warnings.push(`已按完整删除文字清理 ${cleaned} 组旧字幕词；旧字幕时钟与新识别可能不同，请复核剪口附近显示，不能据此认定字幕已全部清理。`);
 if(unresolved)warnings.push(`有 ${unresolved} 处删除文字未能在同一片段邻近字幕中完整、唯一匹配；未猜删字幕词，仍需检查剪口附近字幕。`);
 return {warnings,rewritten,captions:captions.flatMap((caption,index)=>{
  const removed=excluded.get(index);if(!removed)return [caption];
  const words=caption.words.filter((_,wordIndex)=>!removed.has(wordIndex));
  if(!words.length||!words.some(word=>captionTextKey(word.text)))return [];
  const result={...caption,words,startMs:Math.min(...words.map(word=>word.startMs)),endMs:Math.max(...words.map(word=>word.endMs))};
  // Review restoration spans described the previous, now partly deleted cue.
  delete result.reviewOriginalTiming;delete result.reviewOriginalWords;
  rewritten.add(result);
  return [result];
 })};
}

// Compute a new edit only. The caller owns one undo transaction; media bytes,
// recognition caches and source-review decisions are never written here.
export function applyRetakePlan(project, analysis, options={}) {
 try {
  const current=projectData(project),session=options.session;
  if(analysis?.status!=='done'||!analysis.id||!Array.isArray(analysis.snapshot?.clips))fail('分析尚未完成，不能应用剪口。');
  if(session&&(session.jobId!==analysis.id||session.afterSignature!==signature(current)))fail('分析后工程已改变，请重新分析当前时间线。');
  const base=session?.base??structuredClone(current);
  if(JSON.stringify(retakeClipSnapshot(base.clips))!==JSON.stringify(retakeClipSnapshot(analysis.snapshot.clips)))fail('分析对应的原片范围或顺序已改变，请重新分析。');
  const ids=new Set();
  for(const clip of base.clips){
   if(!clip.id||ids.has(clip.id)||!clip.src||![clip.inSec,clip.outSec,clip.sourceDurationSec,clip.speed??1].every(finite)||clip.inSec<0||clip.outSec<=clip.inSec||clip.outSec>clip.sourceDurationSec+1e-6||(clip.speed??1)<=0)fail('当前原片参数无效，未应用剪口。');
   ids.add(clip.id);
  }
  const candidates=new Map();
  for(const c of analysis.candidates??[]){if(!c.id||candidates.has(c.id))fail('候选编号无效，未应用剪口。');candidates.set(c.id,c);}
  const selected=options.candidateIds??[...candidates.values()].filter(c=>c.status==='approved'&&c.confidence==='high').map(c=>c.id);
  const allIds=new Set(session?.appliedIds??[]);
  for(const id of selected){
   const c=candidates.get(id);if(!c)fail('所选候选不属于这次分析。');
   if(!allIds.has(id)&&!(c.status==='approved'&&c.confidence==='high')&&!options.allowReview)fail('待复核候选需要明确选择后才能应用。');
   allIds.add(id);
  }
  const cuts=new Map();
  for(const id of allIds){
   const c=candidates.get(id),clip=base.clips.find(p=>p.id===c?.clipId);
   if(!c||!clip||c.src!==clip.src||!['approved','review'].includes(c.status)||!['high','review'].includes(c.confidence)||!finite(c.score)||c.score<0||c.score>1||!['local-sequence-alignment','gemini-semantic','codex-word-decisions'].includes(c.method))fail('候选来源或置信信息无效，未应用剪口。');
   const source=(analysis.sources??[]).find(s=>s.src===c.src);
   if(!source||!/^[a-f0-9]{64}$/i.test(source.sourceSha256??'')||source.audioClock?.sourceSha256!==source.sourceSha256||!reviewClockMatches(source.audioClock,source.audioClock))fail('候选缺少对应原片的识别时钟，未应用剪口。');
   const filler=c.kind==='filler',retainedClip=filler?null:base.clips.find(p=>p.id===(c.retain?.clipId??c.clipId));
   if(filler){
    if(c.method!=='codex-word-decisions'||c.retain!==null||!Array.isArray(c.retainParts)||c.retainParts.length)fail('语气词取舍不能虚构替代录制。');
    if(c.status==='approved'&&!c.evidence?.some(e=>e?.kind==='filler-semantic'&&e.eligible===true))fail('语气词缺少独立的无意义填充音判断。');
   }else if(!retainedClip||retainedClip.src!==clip.src||c.retain?.src&&c.retain.src!==retainedClip.src||c.method!=='codex-word-decisions'&&retainedClip.id!==clip.id)fail('保留版本没有绑定本次分析的正确原片实例。');
   const partitioned=c.removeParts!==undefined||c.retainParts!==undefined;
   if(partitioned&&(c.method!=='codex-word-decisions'||!Array.isArray(c.removeParts)||!Array.isArray(c.retainParts)))fail('分段取舍缺少完整的删除与保留范围。');
   for(const role of filler?['remove']:['remove','retain']){
    const parts=candidateParts(c,role),range=c[role];
    if(!range||![range.startSec,range.endSec].every(finite)||!Array.isArray(parts)||!parts.length||parts.length>512||parts[0].clipId!==(role==='remove'?c.clipId:retainedClip.id))fail('分段取舍没有绑定正确的首片段。');
    let previous=-1,sourceEnd=-1;const owners=new Set();
    for(const part of parts){
     const ownerIndex=base.clips.findIndex(p=>p.id===part.clipId),owner=base.clips[ownerIndex];
     if(!owner||owner.src!==c.src||part.src&&part.src!==c.src||owners.has(owner.id)||ownerIndex<=previous||part.startSec<sourceEnd||![part.startSec,part.endSec].every(finite)||part.startSec<owner.inSec||part.endSec>owner.outSec||part.endSec<=part.startSec)fail('候选剪口超出分析时的原片范围或分段顺序无效。');
     owners.add(owner.id);previous=ownerIndex;sourceEnd=part.endSec;
    }
    if(range.startSec!==parts[0].startSec||range.endSec!==parts.at(-1).endSec)fail('分段取舍与总体原片范围不一致。');
   }
   if(!filler&&overlap(c.remove,c.retain))fail('删除范围与保留版本重叠，未应用剪口。');
   if(c.status==='approved'&&(c.confidence!=='high'||!Array.isArray(c.evidence)||!c.evidence.some(e=>e?.kind==='independent-local-asr'&&e.confirmed===true)||!c.evidence.some(e=>e?.kind==='acoustic-boundaries'&&e.safe===true)||(c.method==='codex-word-decisions'?!c.evidence.some(e=>e?.kind==='source-boundary-v2'&&e.safe===true&&e.sourceSha256===source.sourceSha256):c.remove.endSec>c.retain.startSec)))fail('自动剪口缺少高置信原声与边界依据，请重新分析。');
   for(const part of candidateParts(c,'remove')){if(!cuts.has(part.clipId))cuts.set(part.clipId,[]);cuts.get(part.clipId).push({...part});}
  }
  for(const id of allIds){const c=candidates.get(id);for(const part of candidateParts(c,'retain'))if((cuts.get(part.clipId)??[]).some(r=>overlap(r,part)))fail('某个保留版本被另一剪口覆盖，请重新分析。');}
  if(!allIds.size)return {ok:true,changed:false,project:current,appliedIds:[],session:{jobId:analysis.id,base,appliedIds:[],afterSignature:signature(current),retainedClipIds:Object.fromEntries(base.clips.map(c=>[c.id,[c.id]]))}};
  const taken=new Set(base.clips.map(c=>c.id)),mapping=new Map(),clips=[];
  const fps=finite(options.fps)&&options.fps>0?options.fps:30;
  for(const clip of base.clips){
   const ranges=(cuts.get(clip.id)??[]).sort((a,b)=>a.startSec-b.startSec),merged=[];
   for(const r of ranges){const last=merged.at(-1);if(last&&r.startSec<=last.endSec)last.endSec=Math.max(last.endSec,r.endSec);else merged.push({...r});}
   const parts=[];let cursor=clip.inSec;
   for(const r of merged){if(r.startSec>cursor)parts.push({inSec:cursor,outSec:r.startSec});cursor=Math.max(cursor,r.endSec);}
   if(cursor<clip.outSec)parts.push({inSec:cursor,outSec:clip.outSec});
   mapping.set(clip.id,parts.map((part,i)=>{
    if((part.outSec-part.inSec)/(clip.speed??1)*fps<1-1e-6)fail('剪口留下不足一帧的片段，请重新检查边界。');
    let id=clip.id;if(i){let n=i;do{id=`${clip.id}-retake${n++}`;}while(taken.has(id));taken.add(id);}
    const next={...clip,...part,id};clips.push(next);return next;
   }));
  }
  if(!clips.length)fail('剪口会移除全部原声，未应用。');
  const captionCleanup=captionsAfterDeletedText(base.captions,cuts);
  const remap=(items,words=false)=>items.flatMap(item=>{
   if(!item.clipId)fail('现有字幕或配套轨没有绑定原片，请先整理时间绑定再精剪。');
   // Mapping contains every source instance, including those untouched by the
   // cuts. Their legacy caption bounds/tokens must remain byte-for-byte data.
   if(!cuts.has(item.clipId))return [item];
   const parts=mapping.get(item.clipId);if(!parts)return [item];
   return parts.flatMap((part,i)=>{
    const startMs=Math.max(item.startMs,part.inSec*1000),endMs=Math.min(item.endMs,part.outSec*1000);
    if(endMs<=startMs)return [];
    const result={...item,id:i?`${item.id}-retake-${part.id}`:item.id,clipId:part.id,startMs,endMs};
    if(words){
     // A cut elsewhere in this same source instance must not re-tokenize a
     // wholly retained cue. In particular its first token may have an observed
     // zero duration exactly at the cue start; no synthetic time is needed.
     if(startMs===item.startMs&&endMs===item.endMs&&!captionCleanup.rewritten.has(item))return [result];
     result.words=item.words.filter(w=>w.endMs>startMs&&w.startMs<endMs);
     if(item.words.length&&!result.words.length)return [];
     if(captionCleanup.rewritten.has(item)&&result.words.length){
      result.startMs=Math.max(part.inSec*1000,Math.min(...result.words.map(w=>w.startMs)));
      result.endMs=Math.min(part.outSec*1000,Math.max(...result.words.map(w=>w.endMs)));
      if(result.endMs<=result.startMs)return [];
     }
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
  const projectedCaptions=remap(captionCleanup.captions,true);
  const restored=restoreKeeperCaptionPrefixes({beforeCaptions:base.captions,captions:projectedCaptions,candidates:[...allIds].map(id=>candidates.get(id)),sources:analysis.sources??[],mapping,clips});
  const next={...base,clips,captions:restored.captions,brolls:remap(base.brolls),presentation};
  const afterSignature=signature(next),appliedIds=[...allIds];
  return {ok:true,changed:afterSignature!==signature(current),project:next,appliedIds,warnings:[...captionCleanup.warnings,...restored.warnings],
   session:{jobId:analysis.id,base,appliedIds,afterSignature,retainedClipIds:Object.fromEntries([...mapping].map(([id,parts])=>[id,parts.map(p=>p.id)]))}};
 } catch(error){return {ok:false,changed:false,error:error instanceof Error?error.message:String(error)};}
}

// Locate only the exact retained descendants of one analyzed clip instance.
// A deleted version seeks to its closest surviving cut boundary instead.
export function retakeSourceFrame(clips,retainedIds,sourceSec,fps=30){
 if(!finite(sourceSec)||!finite(fps)||fps<=0)return null;
 let from=0,best=null;
 for(const clip of clips){
  const frames=Math.max(1,Math.round((clip.outSec-clip.inSec)/(clip.speed??1)*fps));
  if(retainedIds.includes(clip.id)){
   const exact=sourceSec>=clip.inSec&&sourceSec<clip.outSec;
   const distance=sourceSec<clip.inSec?clip.inSec-sourceSec:sourceSec>=clip.outSec?sourceSec-clip.outSec:0;
   const frame=from+Math.max(0,Math.min(frames-1,Math.round((sourceSec-clip.inSec)/(clip.speed??1)*fps)));
   if(!best||distance<best.distance)best={frame,exact,distance};
  }
  from+=frames;
 }
 return best?{frame:best.frame,exact:best.exact}:null;
}
