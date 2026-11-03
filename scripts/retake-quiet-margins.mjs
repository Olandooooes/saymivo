import {verifiedSelectedVadComponents} from './retake-vad-envelope.mjs';

const EPS=1e-6;
const finite=Number.isFinite;
const overlaps=(a,b)=>Math.min(a[1],b[1])>Math.max(a[0],b[0])+EPS;
const intersects=(a,b)=>b[0]===b[1]?a[0]-EPS<=b[0]&&b[0]<=a[1]+EPS:overlaps(a,b);
const inRange=(inner,outer)=>inner[0]>=outer[0]-EPS&&inner[1]<=outer[1]+EPS;
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const family=value=>{const name=String(value??'').toLowerCase();return name.includes('whisper')?'whisper':name.includes('qwen')?'qwen':null;};
const providerOf=source=>source.provider??source.recognizer;
const wavOf=source=>(source.audioClock??source.clock)?.wavSha256;
const union=intervals=>{
 const merged=[];for(const interval of intervals.map(value=>[...value]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
  const last=merged.at(-1);if(last&&interval[0]<=last[1]+EPS)last[1]=Math.max(last[1],interval[1]);else merged.push(interval);
 }return merged;
};
function interval(value,arraySeconds=false){
 if(Array.isArray(value)&&arraySeconds&&value.length===2&&value.every(finite)&&value[0]>=0&&value[1]>=value[0])return [...value];
 if(!value||typeof value!=='object')return null;
 for(const [first,last,scale]of [['startSec','endSec',1],['startMs','endMs',1000]])if(finite(value[first])&&finite(value[last])&&value[first]>=0&&value[last]>=value[first])return [value[first]/scale,value[last]/scale];
 if(value.word&&typeof value.word==='object')return interval(value.word);
 if(Array.isArray(value.words)&&value.words.length){const ranges=value.words.map(word=>interval(word));if(ranges.every(Boolean))return [Math.min(...ranges.map(r=>r[0])),Math.max(...ranges.map(r=>r[1]))];}
 return null;
}
function subtract(range,covered){
 let pieces=[range];for(const word of covered)pieces=pieces.flatMap(([a,b])=>word[1]<=a+EPS||word[0]>=b-EPS?[[a,b]]:[[a,Math.min(b,word[0])],[Math.max(a,word[1]),b]].filter(([x,y])=>y>x+EPS));return pieces;
}
function protectionClocks(source,protectedSources){
 const clocks=[];for(const original of [source,...protectedSources].filter(value=>value&&(!value.src||!source.src||value.src===source.src))){
  clocks.push(original);for(const pass of original.observationPasses??[])clocks.push({...original,...pass,observationPasses:undefined,speech:undefined,uncoveredSpeechPasses:undefined});
 }return clocks;
}
function protections(source,protectedSources,originalParts,speechEvidence){
 const clocks=protectionClocks(source,protectedSources),words=[],uncertain=[],speech=[];let unlocated=false;
 for(const [index,clock]of clocks.entries()){
  const provider=clock.provider??clock.recognizer??`clock-${index}`;
  for(const word of clock.words??[]){const span=interval(word);if(!span||span[1]<=span[0]){unlocated=true;continue;}words.push({span,kind:'word',provider});}
  for(const value of clock.unresolved??[]){const span=interval(value);if(!span)unlocated=true;else uncertain.push({span,kind:'unresolved',provider});}
  const vad=speechEvidence.find(value=>value.coverageVerified===true&&value.src===clock.src&&value.sourceSha256===clock.sourceSha256&&value.provider===clock.provider&&value.sourceVersion===clock.version&&JSON.stringify(value.paddedRanges)===JSON.stringify(clock.speech));
  for(const key of ['speech','unassignedSpeech','uncoveredSpeech','uncoveredSpeechPasses'])for(const value of (key==='speech'&&vad?vad.coreRanges:clock[key])??[]){const span=interval(value,true);if(!span)unlocated=true;else speech.push({span,kind:'vad-unassigned',provider,coverageChecked:key==='speech'&&Boolean(vad),...(key==='speech'&&vad?{coreSpeechRange:[...span],coverageEvidence:{src:vad.src,sourceSha256:vad.sourceSha256,wavSha256:vad.wavSha256,provider:vad.provider,sourceVersion:vad.sourceVersion,padSec:vad.padSec,receiptPath:vad.receiptPath,receiptSha256:vad.receiptSha256,refinedReceiptPath:vad.refinedReceiptPath,refinedCacheIdentity:vad.refinedCacheIdentity}}:{}),src:clock.src,sourceSha256:clock.sourceSha256});}
 }
 const observed=union(words.map(word=>word.span));
 for(const value of speech)for(const span of subtract(value.span,observed))uncertain.push({...value,span});
 const retained=words.filter(word=>!originalParts.some(part=>inRange(word.span,[part.startSec,part.endSec])));
 const quietMeasurements=[source,...protectedSources].filter(value=>value&&value.src===source.src&&value.sourceSha256===source.sourceSha256&&Array.isArray(value.quiet));
 return {ranges:[...retained.map(word=>({...word,guard:[Math.max(0,word.span[0]-.16),word.span[1]+.16]})),...uncertain.map(value=>({...value,guard:[Math.max(0,value.span[0]-.03),value.span[1]+.03]}))],unlocated,clockCount:clocks.length,wordCount:words.length,quietMeasurements,originalParts};
}
function sameQuiet(quiet,point){
 return quiet.filter(([a,b])=>a-EPS<=point&&point<=b+EPS).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0]??null;
}
function completeWord(word,part){
 const span=interval(word);return span&&span[1]>span[0]&&!word.trimmed&&!word.contextOnly&&!word.independentUnresolved&&inRange(span,[part.clipInSec,part.clipOutSec]);
}
function vadStateOnlyException(part,value,protectedData,source){
 const receipt=value.coverageEvidence,cut=[part.startSec,part.endSec];
 if(value.kind!=='vad-unassigned'||!value.coverageChecked||!receipt||!isSha(receipt.receiptSha256)||!isSha(receipt.refinedCacheIdentity)||!isSha(receipt.wavSha256)
  ||typeof receipt.receiptPath!=='string'||!receipt.receiptPath||typeof receipt.refinedReceiptPath!=='string'||!receipt.refinedReceiptPath
  ||value.src!==source.src||value.sourceSha256!==source.sourceSha256||!family(value.provider)||protectedData.unlocated)return null;
 // Explicit uncertainty and retained-word guards remain hard vetoes. A VAD
 // state exception never certifies a word, an unknown voice or a close cut.
 if(protectedData.ranges.some(other=>(other.kind==='word'||other.kind==='unresolved'||other.kind==='vad-unassigned'&&!other.coverageChecked)&&intersects(cut,other.guard)))return null;
 if(!Number.isInteger(part.first)||!Number.isInteger(part.last)||part.first<0||part.last<part.first||part.last>=source.words.length)return null;
 const selected=source.words.slice(part.first,part.last+1);
 if(!selected.length||selected.some(word=>!completeWord(word,part)||!inRange(interval(word),cut)))return null;
 let deleted,retained,direction,deletedIndex,retainedIndex,retainedMarginSec;
 const last=source.words[part.last],next=source.words[part.last+1],first=source.words[part.first],previous=source.words[part.first-1];
 if(completeWord(last,part)&&completeWord(next,part)&&last.endMs/1000<=value.span[0]+EPS&&next.startMs/1000>=value.span[1]-EPS&&next.startMs/1000-part.endSec>=.16-EPS){
  deleted=last;retained=next;direction='after-selected-take';deletedIndex=part.last;retainedIndex=part.last+1;retainedMarginSec=next.startMs/1000-part.endSec;
 }else if(completeWord(first,part)&&completeWord(previous,part)&&previous.endMs/1000<=value.span[0]+EPS&&first.startMs/1000>=value.span[1]-EPS&&part.startSec-previous.endMs/1000>=.16-EPS){
  deleted=first;retained=previous;direction='before-selected-take';deletedIndex=part.first;retainedIndex=part.first-1;retainedMarginSec=part.startSec-previous.endMs/1000;
 }else return null;
 const retainedSpan=interval(retained),bracket=[Math.min(deleted.startMs,retained.startMs)/1000,Math.max(deleted.endMs,retained.endMs)/1000];
 if(protectedData.originalParts.some(other=>intersects(retainedSpan,[other.startSec,other.endSec])))return null;
 if(protectedData.ranges.some(other=>(other.kind==='unresolved'||other.kind==='vad-unassigned'&&!other.coverageChecked)&&intersects(bracket,other.guard)))return null;
 const vadMeasurements=protectedData.quietMeasurements.filter(measurement=>family(providerOf(measurement))===family(value.provider)&&wavOf(measurement)===receipt.wavSha256);
 const otherMeasurements=protectedData.quietMeasurements.filter(measurement=>family(providerOf(measurement))&&family(providerOf(measurement))!==family(value.provider)&&wavOf(measurement)===receipt.wavSha256);
 for(const measured of vadMeasurements)for(const other of otherMeasurements)for(const a of measured.quiet)for(const b of other.quiet){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||!a.every(finite)||!b.every(finite))continue;
  const common=[Math.max(a[0],b[0]),Math.min(a[1],b[1])];if(common[1]<=common[0]||!inRange(value.guard,common))continue;
  const anchor=(word,index,role)=>({role,sourceIndex:index,word:word.word,startSec:word.startMs/1000,endSec:word.endMs/1000,clipId:part.clipId});
  return {kind:'vad-state-only',span:[...value.span],guard:[...value.guard],coreSpeechRange:[...value.coreSpeechRange],padSec:receipt.padSec,quietIntersection:common,direction,
   anchors:{deleted:anchor(deleted,deletedIndex,'complete-selected-word'),retained:anchor(retained,retainedIndex,'complete-adjacent-retained-word')},retainedMarginSec,
   measurements:[{provider:providerOf(measured),quietRange:[...a],sourceSha256:measured.sourceSha256,wavSha256:wavOf(measured)},
    {provider:providerOf(other),quietRange:[...b],sourceSha256:other.sourceSha256,wavSha256:wavOf(other)}],
   receipt:{receiptPath:receipt.receiptPath,receiptSha256:receipt.receiptSha256,refinedReceiptPath:receipt.refinedReceiptPath,refinedCacheIdentity:receipt.refinedCacheIdentity,sourceSha256:receipt.sourceSha256,wavSha256:receipt.wavSha256},
   existingCutOnly:true,growthAuthorized:false,retainedMarginBasis:'original cut coordinates',scope:'only dismisses a coarse VAD-state objection at existing coordinates; same-source quiet consistency is not independent speech recognition or edit approval'};
 }
 return null;
}
function currentCutConflicts(part,protectedData,source,selectedComponents=[]){
 if(protectedData.unlocated)return {reasons:['unlocated-unresolved-observation'],vadStateOnlyExceptions:[],allowedVadRanges:[]};
 const cut=[part.startSec,part.endSec],reasons=[],vadStateOnlyExceptions=[],allowedVadRanges=[];
 for(const value of protectedData.ranges){
  // A freshly proposed envelope may contain the complete original VAD
  // component. This permission is process-bound to its verified source and
  // geometry; diagnostic JSON cannot grant it. All original ranges still
  // protect subsequent growth, and the new cut still needs fresh ASR/boundary
  // receipts before approval.
  if(value.kind==='vad-unassigned'&&value.coverageChecked&&selectedComponents.some(component=>component.clipId===part.clipId&&component.sourceSha256===value.sourceSha256&&component.provider===value.provider&&JSON.stringify(component.component)===JSON.stringify(value.coreSpeechRange)&&inRange(component.componentGuard,cut))){allowedVadRanges.push(value);continue;}
  // VAD remains active across normal gaps between observed words. After a
  // verified coverage pass, actual missing speech is explicit unresolved
  // evidence above. An interior VAD state alone is not an extra word. It
  // still protects every expansion and any gap crossing the actual cut edge.
  const selected=source.words.slice(part.first,part.last+1),betweenSelectedWords=selected.some(w=>w.endMs/1000<=value.span[0]+EPS)&&selected.some(w=>w.startMs/1000>=value.span[1]-EPS);
  if(value.kind==='vad-unassigned'&&value.coverageChecked&&inRange(value.guard,cut)&&betweenSelectedWords){allowedVadRanges.push(value);continue;}
  if(intersects(cut,value.span)||intersects(cut,value.guard)){const exception=vadStateOnlyException(part,value,protectedData,source);if(exception){vadStateOnlyExceptions.push(exception);allowedVadRanges.push(value);continue;}}
  if(intersects(cut,value.span))reasons.push(value.kind==='word'?'existing-cut-overlaps-retained-word-observation':'existing-cut-overlaps-unresolved-or-unassigned-speech');
  else if(intersects(cut,value.guard))reasons.push(value.kind==='word'?'retained-word-margin-under-160ms':'uncertain-speech-margin-under-30ms');
 }
 return {reasons:[...new Set(reasons)],vadStateOnlyExceptions,allowedVadRanges};
}
function growSide(part,side,quiet,protectedRanges){
 const start=side==='start',old=start?part.startSec:part.endSec,edge=start?part.clipInSec:part.clipOutSec,gap=sameQuiet(quiet,old);
 if(!gap)return {value:old,reason:'current-boundary-not-in-measured-quiet',quietRange:null};
 const region=start?[Math.max(edge,gap[0]),old]:[old,Math.min(edge,gap[1])];
 const relevant=protectedRanges.filter(value=>intersects(region,value.guard));
 // A different word clock crossing the current boundary cannot be explained
 // away as quiet. Leave this side untouched and expose the conflict.
 const crossing=relevant.filter(value=>value.guard[0]<old-EPS&&value.guard[1]>old+EPS||value.guard[0]===value.guard[1]&&Math.abs(value.guard[0]-old)<=EPS);
 if(crossing.length){const rawCrossing=crossing.some(value=>value.span[0]<old-EPS&&value.span[1]>old+EPS||value.span[0]===value.span[1]&&Math.abs(value.span[0]-old)<=EPS);
  return {value:old,reason:rawCrossing?'protected-observation-at-existing-boundary':'protected-safety-margin-at-existing-boundary',quietRange:gap,blockers:crossing};}
 let value=start?Math.max(edge,gap[0]+.03):Math.min(edge,gap[1]-.03);
 for(const blocker of relevant){if(start&&blocker.guard[1]<=old+EPS)value=Math.max(value,blocker.guard[1]);if(!start&&blocker.guard[0]>=old-EPS)value=Math.min(value,blocker.guard[0]);}
 value=start?Math.min(old,value):Math.max(old,value);
 const remaining=start?value-edge:edge-value;
 let existingClipEdge=false;
 if(remaining>EPS&&remaining<.15){
  const fragment=start?[edge,old]:[old,edge];
  // Absorbing a previously existing clip boundary creates no new acoustic
  // edge there. Both the entire old remnant and its protection checks must be
  // inside this ONE measured quiet interval; never jump to another gap.
  if(inRange(fragment,gap)&&!protectedRanges.some(blocker=>intersects(fragment,blocker.guard))){value=edge;existingClipEdge=true;}
  else return {value:old,reason:'expansion-would-leave-short-fragment',quietRange:gap,blockers:relevant};
 }
 if(Math.abs(value-edge)<=EPS&&Math.abs(value-old)>EPS)existingClipEdge=true;
 return {value,reason:Math.abs(value-old)>EPS?'expanded-inside-same-measured-quiet':'no-additional-safe-quiet',quietRange:gap,existingClipEdge,blockers:relevant};
}
function checkedSideGrowth(part,side,quiet,protectedData,exceptions){
 const old=side==='start'?part.startSec:part.endSec,grown=growSide(part,side,quiet,protectedData.ranges),
  added=side==='start'?[grown.value,old]:[old,grown.value];
 const collisions=exceptions.filter(value=>intersects(added,value.guard)||value.guard[0]<old-EPS&&value.guard[1]>old+EPS);
 if(collisions.length)return {...grown,value:old,existingClipEdge:false,reason:'growth-touches-original-vad-exception',additionalRange:[old,old],
  proposedAdditionalRange:added,exceptionGuards:collisions.map(value=>[...value.guard])};
 return {...grown,additionalRange:added};
}
function checkExpandedCut(original,proposed,protectedData,allowedVadRanges){
 const cut=[proposed.startSec,proposed.endSec],added=[[proposed.startSec,original.startSec],[original.endSec,proposed.endSec]],allowed=new Set(allowedVadRanges),collisions=[];
 if(protectedData.unlocated)collisions.push({reason:'unlocated-unresolved-observation'});
 for(const value of protectedData.ranges){
  if(!intersects(cut,value.span)&&!intersects(cut,value.guard))continue;
  // Only the original, already checked VAD states may be disregarded. Their
  // full protections remain in growSide; consuming even their guard as new
  // margin would use the exception as evidence for an additional deletion.
  if(allowed.has(value)&&!added.some(range=>intersects(range,value.guard)))continue;
  collisions.push({kind:value.kind,provider:value.provider,span:[...value.span],guard:[...value.guard],
   reason:allowed.has(value)?'original-vad-protection-consumed-by-growth':value.kind==='word'?'expanded-cut-clips-retained-word-or-margin':'expanded-cut-overlaps-unresolved-or-vad-protection'});
 }
 return {safe:collisions.length===0,originalCut:[original.startSec,original.endSec],proposedCut:cut,additionalRanges:added,collisions,
  scope:'all original word, unknown and VAD protection ranges; only original checked VAD states may be excepted inside the original cut'};
}

// Only acoustic margins change. Semantic source-word indices, the selected
// takes, text and clip ownership remain byte-for-byte equivalent data.
export function tightenQuietMargins(candidate,source,{clips=[],protectedSources=[],speechEvidence=[],envelopeEvidence}={}){
 const result=structuredClone(candidate),original=candidate.removeParts??[],quiet=(source.quiet??[]).filter(value=>Array.isArray(value)&&value.length===2&&value.every(finite)&&value[0]>=0&&value[1]>value[0]).map(value=>[...value]);
 const proof={kind:'quiet-margin',version:'same-measured-quiet-v4',sourceSha256:source.sourceSha256??null,retainedWordMarginSec:.16,quietEdgeMarginSec:.03,minimumFragmentSec:.15,changed:false,requiresReview:false,reviewReasons:[],parts:[]};
 if(!original.length||original.some(part=>part.src!==source.src||![part.startSec,part.endSec,part.clipInSec,part.clipOutSec].every(finite)||!(0<=part.clipInSec&&part.clipInSec<=part.startSec&&part.startSec<part.endSec&&part.endSec<=part.clipOutSec))){proof.reason='missing-or-invalid-exact-clip-parts';result.evidence=[...(result.evidence??[]),proof];return result;}
 const protectedData=protections(source,protectedSources,original,speechEvidence);proof.protectedClockCount=protectedData.clockCount;proof.observedWordCount=protectedData.wordCount;
 const selectedComponents=verifiedSelectedVadComponents(candidate,source,{clips,protectedSources,envelopeEvidence});
 proof.selectedVadComponentProposals=selectedComponents.map(component=>({clipId:component.clipId,component:component.component,componentGuard:component.componentGuard,receiptSha256:component.receiptSha256,preverificationOnly:true}));
 proof.vadContextReceipts=speechEvidence.filter(value=>value.src===source.src).map(({receiptPath,receiptSha256,padSec,coverageVerified})=>({receiptPath,receiptSha256,padSec,coverageVerified}));
 result.removeParts=original.map((part,partNumber)=>{
  const before=[part.startSec,part.endSec];
  const checked=currentCutConflicts(part,protectedData,source,selectedComponents.filter(component=>component.partNumber===partNumber)),conflicts=[...checked.reasons];
  const sides=protectedData.unlocated?{start:{value:part.startSec,reason:'unlocated-unresolved-observation'},end:{value:part.endSec,reason:'unlocated-unresolved-observation'}}:
   {start:checkedSideGrowth(part,'start',quiet,protectedData,checked.vadStateOnlyExceptions),end:checkedSideGrowth(part,'end',quiet,protectedData,checked.vadStateOnlyExceptions)};
  let next={...part,startSec:sides.start.value,endSec:sides.end.value};
  const expandedCutCheck=checkExpandedCut(part,next,protectedData,checked.allowedVadRanges);
  if(!expandedCutCheck.safe){
   const originalCheck=checkExpandedCut(part,part,protectedData,checked.allowedVadRanges);
   if(originalCheck.safe)conflicts.push('proposed-growth-overlaps-protected-observation');
   expandedCutCheck.revertedToOriginal=true;expandedCutCheck.finalCut=[part.startSec,part.endSec];expandedCutCheck.finalSafe=originalCheck.safe;
   for(const side of ['start','end']){const old=side==='start'?part.startSec:part.endSec;if(Math.abs(sides[side].value-old)>EPS)sides[side]={...sides[side],value:old,existingClipEdge:false,reason:'expanded-cut-protection-check-failed',proposedAdditionalRange:sides[side].additionalRange,additionalRange:[old,old]};}
   next={...part};
  }else{expandedCutCheck.finalCut=[next.startSec,next.endSec];expandedCutCheck.finalSafe=true;}
  const changed=Math.abs(next.startSec-part.startSec)>EPS||Math.abs(next.endSec-part.endSec)>EPS;
  // Do not promote a previously unverified semantic/acoustic proposal.
  const ordinaryQuietPoint=point=>quiet.some(([a,b])=>a+.03-EPS<=point&&point<=b-.03+EPS);
  const ordinaryQuiet=ordinaryQuietPoint(next.startSec)&&ordinaryQuietPoint(next.endSec);
  next.boundaryStatus=part.boundaryStatus==='word-clock-and-quiet-checked'&&ordinaryQuiet&&!conflicts.length?'word-clock-and-quiet-checked':'needs-review';
  if(sides.start.existingClipEdge||sides.end.existingClipEdge)next.existingClipEdge={...(part.existingClipEdge??{}),...(sides.start.existingClipEdge?{start:true}:{}),...(sides.end.existingClipEdge?{end:true}:{})};
  proof.parts.push({clipId:part.clipId,before,after:[next.startSec,next.endSec],changed,coordinatesFrozen:!changed,requiresReview:Boolean(conflicts.length),reviewReasons:conflicts,requiresExistingClipEdgeException:!ordinaryQuiet,vadStateOnlyExceptions:checked.vadStateOnlyExceptions,expandedCutCheck,start:sides.start,end:sides.end});proof.changed||=changed;proof.requiresReview||=Boolean(conflicts.length);proof.reviewReasons.push(...conflicts);return next;
 });
 if(proof.changed)result.remove={...result.remove,startSec:result.removeParts[0].startSec,endSec:result.removeParts.at(-1).endSec};
 if(proof.changed){
  // This helper is normally called before verification. If a caller supplies
  // an older approved candidate, its receipts refer to the old coordinates
  // and cannot authorize the newly expanded cut.
  result.status='review';result.confidence='review';result.score=0;
  result.evidence=(result.evidence??[]).map(item=>['source-boundary-v2','acoustic-boundaries','independent-local-asr'].includes(item.kind)?
   {...item,...(Object.hasOwn(item,'safe')?{safe:false}:{}),...(Object.hasOwn(item,'confirmed')?{confirmed:false}:{}),staleAfterBoundaryChange:true}:item);
 }
 // Freezing an already conflicting boundary is NOT a safety pass. This gate
 // applies even when no quiet-margin coordinate changed at all.
 result.boundaryStatus=candidate.boundaryStatus==='word-clock-and-quiet-checked'&&result.removeParts.every(part=>part.boundaryStatus==='word-clock-and-quiet-checked')?'word-clock-and-quiet-checked':'needs-review';
 proof.reviewReasons=[...new Set(proof.reviewReasons)];
 if(proof.requiresReview){result.status='review';result.confidence='review';result.score=0;
  result.reason=(result.reason??'')+'；现有剪口与其他词时间、未确认语音或保护余量不一致，保留待复核';}
 result.evidence=[...(result.evidence??[]),proof];return result;
}
