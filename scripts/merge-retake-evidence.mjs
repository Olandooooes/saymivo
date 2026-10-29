import {comparisonTextsForCandidate,normalizeRetakeComparison} from './retake-comparison.mjs';
const parts=(c,key)=>c[key+'Parts']??(c[key]?[{...c[key],clipId:key==='remove'?c.clipId:c.retain?.clipId??c.clipId,src:c.src}]:[]);
const overlap=(a,b)=>a.clipId===b.clipId&&a.src===b.src&&a.startSec<b.endSec&&b.startSec<a.endSec;
const removalOverlap=(a,b)=>parts(a,'remove').some(x=>parts(b,'remove').some(y=>overlap(x,y)));
const keepOverlap=(a,b)=>a.kind==='filler'&&b.kind==='filler'||parts(a,'retain').some(x=>parts(b,'retain').some(y=>overlap(x,y)));
const approved=c=>c.status==='approved'&&c.confidence==='high';
const defer=(c,reason)=>{c.status='review';c.confidence='review';c.score=0;c.reason+='；'+reason;};

// Different recognizers keep their own indices and verification receipts.
// Only already-verified source ranges may be combined here.
export function mergeRetakeEvidence(input){
 const pending=input.map(value=>structuredClone(value)),candidates=[],duplicates=[],conflicts=[],warnings=[];
 const comparison=new Map(pending.map(candidate=>{const value=comparisonTextsForCandidate(candidate);if(value.warning)warnings.push(value.warning);return [candidate,value.texts];}));
 // Resolve the complete overlap component before deduplication. Otherwise a
 // bridging proposal can conflict with one member while hiding another.
 while(pending.length){
  const group=[pending.shift()];let changed=true;
  while(changed){changed=false;for(let i=pending.length-1;i>=0;i--)if(group.some(c=>c.src===pending[i].src&&removalOverlap(c,pending[i]))){group.push(pending.splice(i,1)[0]);changed=true;}}
  const equivalent=(a,b)=>normalizeRetakeComparison(comparison.get(a).remove)===normalizeRetakeComparison(comparison.get(b).remove)&&keepOverlap(a,b)&&
   (a.kind==='filler'&&b.kind==='filler'||normalizeRetakeComparison(comparison.get(a).retain)===normalizeRetakeComparison(comparison.get(b).retain));
  const inconsistent=[];for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)if(!equivalent(group[i],group[j]))inconsistent.push([group[i].id,group[j].id]);
  if(inconsistent.length){
   for(const c of group)defer(c,'不同识别对同一处取舍不一致，保留待复核');conflicts.push(...inconsistent);candidates.push(...group);continue;
  }
  const keep=group.find(approved)??group[0];
  for(const other of group.filter(c=>c!==keep)){
   keep.evidence.push({kind:'recall-corroboration',candidateId:other.id,provider:other.originPass,status:other.status,sourceRange:other.remove});
   keep.originPasses=[...new Set([...(keep.originPasses??[keep.originPass]),...(other.originPasses??[other.originPass])].filter(Boolean))];
   duplicates.push({candidateId:other.id,representedBy:keep.id,reason:'same-source-take'});
  }
  candidates.push(keep);
 }
 const automatic=candidates.filter(approved);
 const keeperConflicts=automatic.filter(c=>automatic.some(other=>other!==c&&parts(other,'remove').some(r=>parts(c,'retain').some(k=>overlap(r,k)))));
 for(const c of keeperConflicts){
  defer(c,'整片合并后保留版本与另一处删除冲突，原声保留');conflicts.push([c.id,'retained-version-conflict']);
 }
 return {candidates,duplicates,conflicts,warnings};
}
