import {createHash} from 'node:crypto';
import {prepareSpeechProtectionEvidence} from './retake-speech-protection.mjs';

export const SELECTED_VAD_ENVELOPE_VERSION='selected-vad-component-proposal-v1';
const EPS=1e-6,contexts=new WeakMap(),proposals=new WeakMap();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const overlap=(a,b)=>Math.min(a[1],b[1])>Math.max(a[0],b[0])+EPS;
const within=(a,b)=>a[0]>=b[0]-EPS&&a[1]<=b[1]+EPS;
const validRange=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&0<=value[0]&&value[0]<value[1];
const span=word=>word&&Number.isFinite(word.startMs)&&Number.isFinite(word.endMs)&&word.startMs>=0&&word.endMs>word.startMs?[word.startMs/1000,word.endMs/1000]:null;
const unknownSpan=value=>{
 if(!value||typeof value!=='object')return null;
 const word=value.word&&typeof value.word==='object'?value.word:value;
 if(Number.isFinite(word.startMs)&&Number.isFinite(word.endMs)&&word.startMs>=0&&word.endMs>=word.startMs)return [word.startMs/1000,word.endMs/1000];
 if(Number.isFinite(word.startSec)&&Number.isFinite(word.endSec)&&word.startSec>=0&&word.endSec>=word.startSec)return [word.startSec,word.endSec];
 if(Array.isArray(value.words)&&value.words.length){const ranges=value.words.map(span);if(ranges.every(Boolean))return [Math.min(...ranges.map(r=>r[0])),Math.max(...ranges.map(r=>r[1]))];}
 return null;
};
const touches=(range,other)=>other[0]===other[1]?range[0]-EPS<=other[0]&&other[0]<=range[1]+EPS:overlap(range,other);
const guard=(range,seconds)=>[Math.max(0,range[0]-seconds),range[1]+seconds];
const clocksOf=(source,others)=>[source,...others].filter(s=>s?.src===source.src).flatMap(s=>[s,...(s.observationPasses??[]).map(p=>({...s,...p,observationPasses:undefined}))]);
const exactClip=(part,clips)=>clips.findIndex(clip=>clip.id===part.clipId&&clip.src===part.src&&Math.abs(clip.inSec-part.clipInSec)<=EPS&&Math.abs(clip.outSec-part.clipOutSec)<=EPS&&Number.isFinite(clip.speed??1)&&(clip.speed??1)>0);
const complete=(word,clip)=>span(word)&&!word.contextOnly&&!word.trimmed&&!word.independentUnresolved&&within(span(word),[clip.inSec,clip.outSec]);
const geometry=c=>({kind:c.kind,remove:c.remove,removeParts:c.removeParts,first:c.first,last:c.last,replacementFirst:c.replacementFirst,replacementLast:c.replacementLast,retain:c.retain,retainParts:c.retainParts});
const lexicalClock=source=>digest((source.words??[]).map(w=>[w.word,w.startMs,w.endMs]));

// This context can only be created by the server's actual raw/refined receipt
// verifier. A persisted coverageVerified flag or a copied JSON proof is not an
// authorization to consume a VAD component. No recognizer is loaded here.
export async function prepareSelectedVadEnvelopeEvidence(protectedSources,{root=process.cwd(),verifySpeech=prepareSpeechProtectionEvidence}={}){
 const selected=(protectedSources??[]).filter(s=>s?.clockRefinement?.version==='independent-window-alignment-v1'&&s.clockRefinement.coverageRecomputed===true);
 const checked=await verifySpeech(selected,{root});
 const evidence=(checked.evidence??[]).filter(e=>e.coverageVerified===true&&sha(e.receiptSha256)&&sha(e.observationSha256)&&sha(e.refinedCacheIdentity)&&sha(e.wavSha256)&&typeof e.receiptPath==='string'&&typeof e.refinedReceiptPath==='string');
 const context={version:SELECTED_VAD_ENVELOPE_VERSION,verifiedSources:evidence.length,warnings:[...(checked.warnings??[])]};
 contexts.set(context,{protectedDigest:digest(protectedSources??[]),evidence:structuredClone(evidence)});return context;
}

export function hasVerifiedSelectedVadContext(protectedSources,envelopeEvidence){
 const context=contexts.get(envelopeEvidence);return Boolean(context?.evidence.length&&context.protectedDigest===digest(protectedSources??[]));
}

function activeData(source,protectedSources,parts){
 const clocks=clocksOf(source,protectedSources),words=[],unknown=[],invalid=[];
 for(const [index,clock]of clocks.entries()){
  for(const word of clock.words??[]){const range=span(word);if(!range){invalid.push({clock:index,reason:'invalid-observed-word'});continue;}words.push({word,range,clock:index,provider:clock.provider??clock.recognizer});}
  for(const value of clock.unresolved??[]){const range=unknownSpan(value);if(!range)invalid.push({clock:index,reason:'unlocated-unresolved'});else unknown.push({range,clock:index,reason:value.reason??'unresolved'});}
  for(const key of ['unassignedSpeech','uncoveredSpeech','uncoveredSpeechPasses'])for(const value of clock[key]??[]){const range=validRange(value)?value:unknownSpan(value);if(!range)invalid.push({clock:index,reason:'unlocated-unassigned-speech'});else unknown.push({range,clock:index,reason:key});}
 }
 return {clocks,words,unknown,invalid,retained:words.filter(w=>!parts.some(p=>within(w.range,[p.startSec,p.endSec])))};
}
function quietFor(old,value,source,other,wav){
 if((source.audioClock??source.clock)?.wavSha256!==wav||(other.audioClock??other.clock)?.wavSha256!==wav)return null;
 const added=[Math.min(old,value),Math.max(old,value)];
 for(const a of source.quiet??[])for(const b of other.quiet??[]){
  if(!validRange(a)||!validRange(b))continue;const common=[Math.max(a[0],b[0]),Math.min(a[1],b[1])];
  if(common[1]>common[0]&&within(added,common)&&value>=common[0]+.03-EPS&&value<=common[1]-.03+EPS)return common;
 }return null;
}
function anchorFor(clock,side,part,cut,clips,partIndex,removedParts){
 const before=side==='start',eligible=[];
 for(const word of clock.words??[]){const range=span(word);if(!range)continue;
  if(before?range[1]>part.startSec+EPS:range[0]<part.endSec-EPS)continue;
  const instances=clips.map((clip,index)=>({clip,index})).filter(({clip,index})=>clip.src===part.src&&(before?index===partIndex||index===partIndex-1:index===partIndex||index===partIndex+1)&&overlap(range,[clip.inSec,clip.outSec]));
  for(const instance of instances)eligible.push({word,range,...instance});
 }
 eligible.sort((a,b)=>before?b.index-a.index||b.range[1]-a.range[1]:a.index-b.index||a.range[0]-b.range[0]);
 const found=eligible[0];if(!found||!complete(found.word,found.clip))return {reason:'missing-complete-adjacent-retained-word'};
 if(removedParts.some(p=>overlap(found.range,[p.startSec,p.endSec])))return {reason:'adjacent-anchor-is-also-selected-for-removal'};
 const current=clips[partIndex];
 if(found.index!==partIndex){const left=before?found.clip:current,right=before?current:found.clip;
  if(left.src!==right.src||left.outSec>right.inSec+EPS)return {reason:'cross-clip-source-rewind-or-other-source'};
 }
 const speed=current.speed??1,margin=found.index===partIndex?(before?cut[0]-found.range[1]:found.range[0]-cut[1])/speed:
  before?(cut[0]-current.inSec)/speed+(found.clip.outSec-found.range[1])/(found.clip.speed??1):(current.outSec-cut[1])/speed+(found.range[0]-found.clip.inSec)/(found.clip.speed??1);
 if(margin<.16-EPS)return {reason:'joined-retained-word-margin-under-160ms',marginSec:margin};
 return {word:found.word.word,range:found.range,clipId:found.clip.id,clipRange:[found.clip.inSec,found.clip.outSec],clipIndex:found.index,marginSec:margin,crossClip:found.index!==partIndex};
}

// Enclose only the verified component that actually contains a selected edge
// word. This is a fresh geometric proposal, not an exception to the old cut's
// safety check and never an approval. The full VAD/unknown data stay unchanged.
export function proposeSelectedVadEnvelope(candidate,source,{clips=[],protectedSources=[],envelopeEvidence}={}){
 const certified=contexts.get(envelopeEvidence);
 if(!certified||certified.protectedDigest!==digest(protectedSources)||candidate.kind==='filler'||!Array.isArray(source?.words)||!Array.isArray(candidate.removeParts)||!candidate.removeParts.length)return candidate;
 if(!protectedSources.filter(s=>s?.src===source.src).flatMap(s=>[s,...(s.observationPasses??[]).map(p=>({...s,...p}))]).some(clock=>clock.sourceSha256===source.sourceSha256&&(clock.audioClock??clock.clock)?.wavSha256===(source.audioClock??source.clock)?.wavSha256&&lexicalClock(clock)===lexicalClock(source)))return candidate;
 const data=activeData(source,protectedSources,candidate.removeParts);if(data.invalid.length)return candidate;
 const result=structuredClone(candidate),permissions=[],parts=[],rejections=[];
 for(const [partNumber,part]of candidate.removeParts.entries()){
  const partIndex=exactClip(part,clips),cut=[part.startSec,part.endSec],next=[...cut],selected=source.words?.slice(part.first,part.last+1)??[];
  if(part.src!==source.src||candidate.src!==source.src||partIndex<0||part.boundaryStatus!=='word-clock-and-quiet-checked'||!Number.isInteger(part.first)||!Number.isInteger(part.last)||part.first<0||part.last<part.first||part.last>=source.words.length||!selected.length||selected.some(w=>!complete(w,clips[partIndex])||!within(span(w),cut))){rejections.push({partNumber,reason:'invalid-selected-word-or-exact-clip'});continue;}
  const owned=[];
  for(const receipt of certified.evidence){
   const observed=protectedSources.find(s=>s.src===source.src&&s.sourceSha256===source.sourceSha256&&s.provider===receipt.provider&&s.version===receipt.sourceVersion&&JSON.stringify(s.speech)===JSON.stringify(receipt.paddedRanges));
   if(!observed||receipt.src!==source.src||receipt.sourceSha256!==source.sourceSha256)continue;
   for(const component of receipt.coreRanges??[]){
    if(!validRange(component))continue;
    const componentGuard=guard(component,.03),first=span(selected[0]),last=span(selected.at(-1)),ownsFirst=overlap(component,first),ownsLast=overlap(component,last),needsStart=componentGuard[0]<cut[0]-EPS&&ownsFirst,needsEnd=componentGuard[1]>cut[1]+EPS&&ownsLast;
    // An already enclosed tail needs the same complete-component ownership
    // proof; it cannot borrow the narrower, quiet-only state exception.
    if(!ownsFirst&&!ownsLast||!needsStart&&!needsEnd&&!within(componentGuard,cut))continue;
    const actual=data.words.filter(w=>overlap(w.range,component));
    if(!actual.length||actual.some(w=>!within(w.range,cut)||!complete(w.word,clips[partIndex]))){rejections.push({partNumber,component,reason:'component-contains-unselected-or-incomplete-word'});continue;}
    if(data.unknown.some(u=>touches(componentGuard,guard(u.range,.03)))){rejections.push({partNumber,component,reason:'explicit-unknown-in-selected-component'});continue;}
    const proposal=[needsStart?componentGuard[0]:next[0],needsEnd?componentGuard[1]:next[1]];
    if(!within(proposal,[part.clipInSec,part.clipOutSec])||!within(componentGuard,proposal)){rejections.push({partNumber,component,reason:'component-leaves-exact-clip'});continue;}
    if(proposal[0]-part.clipInSec>EPS&&proposal[0]-part.clipInSec<.15-EPS||part.clipOutSec-proposal[1]>EPS&&part.clipOutSec-proposal[1]<.15-EPS){rejections.push({partNumber,component,reason:'component-proposal-leaves-short-fragment'});continue;}
    const sharedQuiet={};let rejected=false;
    for(const [side,index]of [['start',0],['end',1]]){
     const common=quietFor(cut[index],proposal[index],source,observed,receipt.wavSha256);
     if(!common){rejections.push({partNumber,component,reason:'new-component-boundary-lacks-same-measured-quiet',side});rejected=true;break;}sharedQuiet[side]=common;
    }
    if(rejected)continue;
    if(data.retained.some(w=>touches(proposal,guard(w.range,.16)))||data.unknown.some(u=>touches(proposal,guard(u.range,.03)))){rejections.push({partNumber,component,reason:'retained-word-or-explicit-unknown-guard'});continue;}
    const anchors=data.clocks.map((clock,index)=>({clock:index,provider:clock.provider??clock.recognizer,before:anchorFor(clock,'start',part,proposal,clips,partIndex,candidate.removeParts),after:anchorFor(clock,'end',part,proposal,clips,partIndex,candidate.removeParts)}));
    if(anchors.some(a=>a.before.reason||a.after.reason)){rejections.push({partNumber,component,reason:'unconfirmed-adjacent-retained-anchor',anchors});continue;}
    next[0]=Math.min(next[0],proposal[0]);next[1]=Math.max(next[1],proposal[1]);
    const proof={partNumber,clipId:part.clipId,component:[...component],componentGuard,quiet:sharedQuiet,anchors,sourceSha256:receipt.sourceSha256,wavSha256:receipt.wavSha256,provider:receipt.provider,
     receiptPath:receipt.receiptPath,receiptSha256:receipt.receiptSha256,refinedReceiptPath:receipt.refinedReceiptPath,refinedCacheIdentity:receipt.refinedCacheIdentity};
    owned.push(proof);permissions.push(proof);
   }
  }
  if(owned.length){Object.assign(result.removeParts[partNumber],{startSec:next[0],endSec:next[1]});parts.push({partNumber,clipId:part.clipId,before:cut,after:next,components:owned});}
 }
 if(!parts.length)return candidate;
 result.remove={...result.remove,startSec:result.removeParts[0].startSec,endSec:result.removeParts.at(-1).endSec};
 result.status='review';result.confidence='review';result.score=0;
 result.evidence=(result.evidence??[]).map(e=>['source-boundary-v2','acoustic-boundaries','independent-local-asr'].includes(e.kind)?{...e,...(Object.hasOwn(e,'safe')?{safe:false}:{}),...(Object.hasOwn(e,'confirmed')?{confirmed:false}:{}),staleAfterBoundaryChange:true}:e);
 const changed=parts.some(part=>part.before.some((value,index)=>Math.abs(value-part.after[index])>EPS));
 result.evidence.push({kind:'selected-vad-component-proposal',version:SELECTED_VAD_ENVELOPE_VERSION,changed,automaticApproval:false,requiresFreshBoundaryAndFreeAsr:true,parts,rejections,
  scope:'new proposal enclosing only an observed selected-take VAD component; all explicit uncertainty and retained-word margins remain protected'});
 proposals.set(result,{context:envelopeEvidence,sourceDigest:digest(source),protectedDigest:digest(protectedSources),clipsDigest:digest(clips),geometryDigest:digest(geometry(result)),permissions});return result;
}

// The quiet helper may recognize only the components of the exact in-memory
// proposal, never a serialized diagnostic field supplied by a caller.
export function verifiedSelectedVadComponents(candidate,source,{clips=[],protectedSources=[],envelopeEvidence}={}){
 const permission=proposals.get(candidate);
 return permission&&contexts.has(envelopeEvidence)&&permission.context===envelopeEvidence&&permission.sourceDigest===digest(source)&&permission.protectedDigest===digest(protectedSources)&&permission.clipsDigest===digest(clips)&&permission.geometryDigest===digest(geometry(candidate))?permission.permissions:[];
}
