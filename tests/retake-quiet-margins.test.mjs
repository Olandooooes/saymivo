import test from 'node:test';
import assert from 'node:assert/strict';
import {tightenQuietMargins} from '../scripts/retake-quiet-margins.mjs';

function fixture(){
 const src='clips/synthetic.mp4',source={src,sourceSha256:'a'.repeat(64),range:[0,5],quiet:[[.5,2],[2.5,4]],words:[
  {word:'前',startMs:0,endMs:500},{word:'废弃',startMs:2000,endMs:2500},{word:'后',startMs:4000,endMs:4500}]};
 const part={clipId:'one',src,clipInSec:0,clipOutSec:5,startSec:1.9,endSec:2.6,first:1,last:1,text:'废弃',boundaryStatus:'word-clock-and-quiet-checked'};
 const candidate={id:'synthetic',src,clipId:'one',kind:'retake',first:1,last:1,replacementFirst:2,replacementLast:2,
  remove:{startSec:1.9,endSec:2.6,text:'废弃'},earlier:{startSec:2,endSec:2.5,text:'废弃'},removeParts:[part],
  retain:{clipId:'one',src,startSec:4,endSec:4.5,text:'后'},retainParts:[],boundaryStatus:'word-clock-and-quiet-checked',evidence:[{kind:'synthetic-semantic'}]};
 return {source,candidate};
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('margins grow only inside each current quiet interval and retain 160ms around neighboring words',()=>{
 const f=fixture(),before=structuredClone(f),out=tightenQuietMargins(f.candidate,f.source);
 close(out.remove.startSec,.66);close(out.remove.endSec,3.84);assert.equal(out.evidence.at(-1).changed,true);
 assert.deepEqual(f,before);assert.deepEqual(out.earlier,f.candidate.earlier);assert.deepEqual(out.retain,f.candidate.retain);
 for(const key of ['first','last','replacementFirst','replacementLast'])assert.equal(out[key],f.candidate[key]);
 assert.equal(out.remove.text,f.candidate.remove.text);assert.deepEqual(out.removeParts.map(p=>[p.clipId,p.first,p.last]),[['one',1,1]]);
});

test('the union of independent clocks wins over a shorter primary retained word',()=>{
 const f=fixture(),independent={src:f.source.src,provider:'independent',words:[{word:'前',startMs:0,endMs:800},{word:'废弃',startMs:1950,endMs:2550},{word:'后',startMs:3800,endMs:4500}]};
 const out=tightenQuietMargins(f.candidate,f.source,{protectedSources:[independent]});close(out.remove.startSec,.96);close(out.remove.endSec,3.64);
 const unrelated={...independent,src:'clips/another.mp4'};const ignored=tightenQuietMargins(f.candidate,f.source,{protectedSources:[unrelated]});close(ignored.remove.startSec,.66);
});

test('quiet intervals separated by new sound cannot be bridged',()=>{
 const f=fixture();f.source.quiet=[[.5,1],[1.1,2],[2.5,3],[3.1,4]];
 const out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,1.13);close(out.remove.endSec,2.97);
 assert.deepEqual(out.evidence.at(-1).parts[0].start.quietRange,[1.1,2]);
});

test('unresolved words, zero-time markers and VAD speech with no word ownership all protect silence-looking audio',()=>{
 const f=fixture();f.source.unresolved=[{word:{word:'未确认',startMs:1400,endMs:1600}}];
 let out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,1.63);
 f.source.unresolved=[{word:{word:'零时长',startMs:1400,endMs:1400}}];out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,1.43);
 f.source.unresolved=[];f.source.speech=[[0,1.2]];out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,1.23);
 assert.ok(out.evidence.at(-1).parts[0].start.blockers.some(b=>b.kind==='vad-unassigned'));
 f.source.unresolved=[{reason:'no usable clock'}];out=tightenQuietMargins(f.candidate,f.source);assert.deepEqual(out.remove,f.candidate.remove);
});

test('another clock crossing the existing cut boundary freezes that side rather than swallowing new speech',()=>{
 const f=fixture(),other={src:f.source.src,words:[{word:'边界有义词',startMs:1700,endMs:1950}]};
 const out=tightenQuietMargins(f.candidate,f.source,{protectedSources:[other]});close(out.remove.startSec,1.9);
 assert.equal(out.evidence.at(-1).parts[0].start.reason,'protected-observation-at-existing-boundary');
 assert.equal(out.boundaryStatus,'needs-review');assert.equal(out.evidence.at(-1).requiresReview,true);
 assert.ok(out.evidence.at(-1).reviewReasons.includes('existing-cut-overlaps-retained-word-observation'));
});

test('a safety margin conflict is review but is not mislabeled as observed-word clipping',()=>{
 const f=fixture(),other={src:f.source.src,words:[{word:'未被切到的保留词',startMs:1600,endMs:1800}]};
 const out=tightenQuietMargins(f.candidate,f.source,{protectedSources:[other]}),proof=out.evidence.at(-1);
 assert.equal(out.boundaryStatus,'needs-review');assert.equal(proof.requiresReview,true);
 assert.ok(proof.reviewReasons.includes('retained-word-margin-under-160ms'));assert.ok(!proof.reviewReasons.includes('existing-cut-overlaps-retained-word-observation'));
 assert.equal(proof.parts[0].start.reason,'protected-safety-margin-at-existing-boundary');
});

test('uncertain holes in the existing removal and unlocated observations are review even without expanding coordinates',()=>{
 const f=fixture();f.source.unresolved=[{word:{word:'未知',startMs:2100,endMs:2200}}];
 let out=tightenQuietMargins(f.candidate,f.source);assert.equal(out.boundaryStatus,'needs-review');assert.ok(out.evidence.at(-1).reviewReasons.includes('existing-cut-overlaps-unresolved-or-unassigned-speech'));
 f.source.unresolved=[{reason:'unlocated'}];out=tightenQuietMargins(f.candidate,f.source);assert.equal(out.evidence.at(-1).changed,false);assert.equal(out.boundaryStatus,'needs-review');assert.deepEqual(out.remove,f.candidate.remove);
 assert.ok(out.evidence.at(-1).reviewReasons.includes('unlocated-unresolved-observation'));
});

test('a whole old quiet remnant is absorbed to its exact clip edge without creating a tiny orphan',()=>{
 const f=fixture();Object.assign(f.candidate.removeParts[0],{clipInSec:1.8,clipOutSec:2.69});
 const out=tightenQuietMargins(f.candidate,f.source),part=out.removeParts[0];close(part.startSec,1.8);close(part.endSec,2.69);
 assert.deepEqual(part.existingClipEdge,{start:true,end:true});assert.equal(part.boundaryStatus,'word-clock-and-quiet-checked');
});

test('a short remnant containing protected voice or leaving the same quiet interval is never silently swallowed',()=>{
 const f=fixture();f.candidate.removeParts[0].clipInSec=.6;
 let out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,1.9);assert.equal(out.evidence.at(-1).parts[0].start.reason,'expansion-would-leave-short-fragment');
 const g=fixture();g.source.quiet=[[1.81,2],[2.5,4]];g.candidate.removeParts[0].clipInSec=1.8;
 out=tightenQuietMargins(g.candidate,g.source);close(out.remove.startSec,1.9);assert.equal(out.evidence.at(-1).parts[0].start.reason,'expansion-would-leave-short-fragment');
});

test('absorbing an original clip edge never invents an adjacent clip or promotes prior review',()=>{
 const f=fixture();f.candidate.removeParts[0].clipInSec=1.8;f.candidate.removeParts[0].boundaryStatus='needs-review';f.candidate.boundaryStatus='needs-review';
 const out=tightenQuietMargins(f.candidate,f.source);assert.equal(out.removeParts.length,1);assert.equal(out.removeParts[0].clipId,'one');assert.equal(out.boundaryStatus,'needs-review');
 const invalid={...f.candidate,removeParts:undefined};assert.deepEqual(tightenQuietMargins(invalid,f.source).remove,invalid.remove);
});

test('an old edge at the measured quiet edge is explicitly marked and stays review under the ordinary 30ms gate',()=>{
 const f=fixture();f.source.words=f.source.words.slice(1);f.source.quiet=[[0,2],[2.5,4]];
 f.candidate.remove.startSec=.1;f.candidate.removeParts[0].startSec=.1;
 const out=tightenQuietMargins(f.candidate,f.source);close(out.remove.startSec,0);assert.equal(out.removeParts[0].existingClipEdge.start,true);
 assert.equal(out.removeParts[0].boundaryStatus,'needs-review');assert.equal(out.boundaryStatus,'needs-review');
 assert.equal(out.evidence.at(-1).parts[0].requiresExistingClipEdgeException,true);
});

test('verified coverage distinguishes an interior word gap from an unobserved word and still protects the cut edge',()=>{
 const f=fixture();f.source.words=[f.source.words[0],{word:'废',startMs:2000,endMs:2100},{word:'弃',startMs:2200,endMs:2500},f.source.words[2]];
 f.candidate.last=2;f.candidate.removeParts[0].last=2;f.candidate.replacementFirst=3;f.candidate.replacementLast=3;
 f.source.speech=[[2,2.5]];
 assert.equal(tightenQuietMargins(f.candidate,f.source).boundaryStatus,'needs-review','unknown coverage stays conservative');
 f.source.clockRefinement={version:'independent-window-alignment-v1',coverageRecomputed:true,rawEvidenceSha256:'a'.repeat(64),refinedEvidenceSha256:'b'.repeat(64),cacheIdentity:'c'.repeat(64),receiptPath:'/synthetic/verified-receipt.json'};
 const speechEvidence=[{src:f.source.src,sourceSha256:f.source.sourceSha256,provider:f.source.provider,sourceVersion:f.source.version,paddedRanges:f.source.speech,coreRanges:f.source.speech,coverageVerified:true}];
 const checked=tightenQuietMargins(f.candidate,f.source,{speechEvidence});assert.equal(checked.boundaryStatus,'word-clock-and-quiet-checked');
 f.source.unresolved=[{startMs:2130,endMs:2180,reason:'explicitly-unobserved-speech'}];
 assert.equal(tightenQuietMargins(f.candidate,f.source,{speechEvidence}).boundaryStatus,'needs-review','explicit unknown speech is never discarded as an interior pause');
 f.source.unresolved=[];f.source.speech=[[1.8,2.2]];
 speechEvidence[0].paddedRanges=f.source.speech;speechEvidence[0].coreRanges=f.source.speech;const crossing=tightenQuietMargins(f.candidate,f.source,{speechEvidence});assert.equal(crossing.boundaryStatus,'needs-review');assert.ok(crossing.evidence.at(-1).reviewReasons.includes('existing-cut-overlaps-unresolved-or-unassigned-speech'));
});

function vadStateOnlyFixture({leading=false}={}){
 const f=fixture(),clock={sourceSha256:f.source.sourceSha256,wavSha256:'b'.repeat(64),sampleRate:16000};
 Object.assign(f.source,{provider:'qwen-asr',version:'synthetic-source-v1',audioClock:structuredClone(clock)});
 Object.assign(f.candidate,{status:'review',confidence:'review',score:0});
 const padded=leading?[[1.84,2.04]]:[[2.46,2.66]],core=leading?[[1.92,1.96]]:[[2.54,2.58]],
  protectedSource={src:f.source.src,sourceSha256:f.source.sourceSha256,provider:'whisper-medium',version:'independent-full-speech-v1',
   clock:structuredClone(clock),audioClock:structuredClone(clock),range:[...f.source.range],quiet:structuredClone(f.source.quiet),
   words:structuredClone(f.source.words),speech:padded,unresolved:[]},
  speechEvidence=[{version:'verified-vad-context-v1',coverageVerified:true,src:f.source.src,sourceSha256:f.source.sourceSha256,
   provider:protectedSource.provider,sourceVersion:protectedSource.version,range:[...f.source.range],paddedRanges:structuredClone(padded),
   coreRanges:structuredClone(core),padSec:.08,padMs:80,sampleRate:16000,wavSha256:clock.wavSha256,
   receiptPath:'/synthetic/vad/receipt.json',receiptSha256:'c'.repeat(64),observationPath:'/synthetic/vad/observations.json',
   observationSha256:'d'.repeat(64),cacheIdentity:'e'.repeat(64),refinedReceiptPath:'/synthetic/refined/receipt.json',refinedCacheIdentity:'f'.repeat(64)}];
 return {...f,protectedSources:[protectedSource],speechEvidence};
}
const runVadStateOnly=f=>tightenQuietMargins(f.candidate,f.source,{protectedSources:f.protectedSources,speechEvidence:f.speechEvidence});

test('a trailing VAD-state guard freezes only its side while the opposite side grows through protected quiet',()=>{
 const f=vadStateOnlyFixture(),before=structuredClone(f),out=runVadStateOnly(f),proof=out.evidence.at(-1),part=out.removeParts[0],exception=proof.parts[0].vadStateOnlyExceptions[0];
 assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');assert.equal(part.boundaryStatus,'word-clock-and-quiet-checked');
 close(part.startSec,.66);close(part.endSec,2.6);assert.equal(out.remove.text,f.candidate.remove.text);
 assert.equal(proof.version,'same-measured-quiet-v4');assert.equal(proof.changed,true);assert.equal(proof.requiresReview,false);
 assert.equal(out.status,'review');assert.equal(out.confidence,'review');assert.equal(out.score,0);
 assert.deepEqual(exception.span,[2.54,2.58]);close(exception.guard[0],2.51);close(exception.guard[1],2.61);
 assert.deepEqual(exception.quietIntersection,[2.5,4]);assert.ok(exception.anchors);assert.ok(exception.receipt);
 assert.equal(exception.receipt.receiptSha256,f.speechEvidence[0].receiptSha256);assert.equal(exception.receipt.wavSha256,f.source.audioClock.wavSha256);
 assert.equal(exception.anchors.deleted.clipId,'one');assert.equal(exception.anchors.retained.clipId,'one');assert.ok(exception.retainedMarginSec>=.16);
 assert.equal(exception.existingCutOnly,true);assert.equal(exception.growthAuthorized,false);
 assert.equal(proof.parts[0].end.reason,'growth-touches-original-vad-exception');
 assert.equal(proof.parts[0].expandedCutCheck.safe,true);assert.deepEqual(proof.parts[0].expandedCutCheck.collisions,[]);
 assert.deepEqual(out.earlier,f.candidate.earlier);assert.deepEqual(out.retain,f.candidate.retain);assert.deepEqual(f,before);
});

test('the same narrow VAD-state exception supports a leading cut with complete same-instance anchors',()=>{
 const f=vadStateOnlyFixture({leading:true}),out=runVadStateOnly(f),proof=out.evidence.at(-1);
 assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');close(out.remove.startSec,1.9);close(out.remove.endSec,3.84);
 assert.equal(proof.changed,true);assert.equal(proof.parts[0].start.reason,'growth-touches-original-vad-exception');
 assert.deepEqual(proof.parts[0].vadStateOnlyExceptions[0].span,[1.92,1.96]);
 assert.deepEqual(proof.parts[0].vadStateOnlyExceptions[0].quietIntersection,[.5,2]);
});

function enclosedVadFixture(){
 const f=vadStateOnlyFixture();f.candidate.remove.endSec=2.7;f.candidate.removeParts[0].endSec=2.7;return f;
}

test('a fully enclosed original VAD exception does not freeze either independently safe quiet margin',()=>{
 const f=enclosedVadFixture(),before=structuredClone(f),out=runVadStateOnly(f),proof=out.evidence.at(-1),part=proof.parts[0];
 close(out.remove.startSec,.66);close(out.remove.endSec,3.84);
 assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');assert.equal(out.status,'review');
 assert.equal(part.vadStateOnlyExceptions.length,1);assert.equal(part.vadStateOnlyExceptions[0].growthAuthorized,false);
 assert.equal(part.start.reason,'expanded-inside-same-measured-quiet');assert.equal(part.end.reason,'expanded-inside-same-measured-quiet');
 assert.deepEqual(part.expandedCutCheck.originalCut,[1.9,2.7]);assert.equal(part.expandedCutCheck.safe,true);
 assert.deepEqual(part.expandedCutCheck.collisions,[]);assert.equal(part.expandedCutCheck.revertedToOriginal,undefined);
 assert.deepEqual(out.earlier,f.candidate.earlier);assert.deepEqual(out.retain,f.candidate.retain);
 for(const key of ['first','last','replacementFirst','replacementLast'])assert.equal(out[key],f.candidate[key]);
 assert.deepEqual(f,before);
});

test('other VAD ranges stay protected during growth and never become new state-only exceptions',()=>{
 const f=enclosedVadFixture();f.protectedSources[0].speech.push([3.02,3.28]);
 f.speechEvidence[0].paddedRanges=structuredClone(f.protectedSources[0].speech);f.speechEvidence[0].coreRanges.push([3.1,3.2]);
 const out=runVadStateOnly(f),part=out.evidence.at(-1).parts[0];
 close(out.remove.startSec,.66);close(out.remove.endSec,3.07);
 assert.equal(part.vadStateOnlyExceptions.length,1);assert.deepEqual(part.vadStateOnlyExceptions[0].span,[2.54,2.58]);
 assert.ok(part.end.blockers.some(value=>value.kind==='vad-unassigned'&&value.span[0]===3.1));
 assert.equal(part.expandedCutCheck.safe,true);assert.deepEqual(part.expandedCutCheck.collisions,[]);
});

test('unknown and retained-word guards remain active on the growing side of an original VAD exception',()=>{
 const unknown=enclosedVadFixture();unknown.source.unresolved=[{startMs:900,endMs:1100,reason:'new-unknown-in-margin'}];
 const first=runVadStateOnly(unknown),firstPart=first.evidence.at(-1).parts[0];
 close(first.remove.startSec,1.13);close(first.remove.endSec,3.84);
 assert.equal(firstPart.vadStateOnlyExceptions.length,1);assert.ok(firstPart.start.blockers.some(value=>value.kind==='unresolved'));
 assert.equal(firstPart.expandedCutCheck.safe,true);
 const retained=enclosedVadFixture();retained.protectedSources[0].words.splice(1,0,{word:'另一份完整保留词',startMs:1200,endMs:1400});
 const second=runVadStateOnly(retained),secondPart=second.evidence.at(-1).parts[0];
 close(second.remove.startSec,1.56);close(second.remove.endSec,3.84);
 assert.equal(secondPart.vadStateOnlyExceptions.length,1);assert.ok(secondPart.start.blockers.some(value=>value.kind==='word'&&value.span[0]===1.2));
 assert.equal(secondPart.expandedCutCheck.safe,true);
});

test('changed quiet geometry invalidates old approval receipts without changing semantic selections or original evidence',()=>{
 const f=enclosedVadFixture();Object.assign(f.candidate,{status:'approved',confidence:'high',score:.99});
 f.candidate.evidence.push({kind:'source-boundary-v2',safe:true,sourceSha256:f.source.sourceSha256},
  {kind:'acoustic-boundaries',safe:true},{kind:'independent-local-asr',confirmed:true});
 const before=structuredClone(f),out=runVadStateOnly(f),proof=out.evidence.at(-1);
 assert.equal(proof.changed,true);assert.equal(out.status,'review');assert.equal(out.confidence,'review');assert.equal(out.score,0);
 for(const kind of ['source-boundary-v2','acoustic-boundaries','independent-local-asr']){
  const item=out.evidence.find(value=>value.kind===kind);assert.equal(item.staleAfterBoundaryChange,true);
  if(kind==='independent-local-asr')assert.equal(item.confirmed,false);else assert.equal(item.safe,false);
 }
 assert.deepEqual(out.evidence[0],f.candidate.evidence[0]);assert.deepEqual(out.retain,f.candidate.retain);
 assert.deepEqual(f,before);
});

test('VAD residual protection needs one complete common quiet interval including the full 30ms guard',()=>{
 for(const [label,quiet]of [['guard begins outside shared quiet',[[.5,2],[2.52,4]]],
                           ['disjoint measured gaps cannot be stitched',[[.5,2],[2.5,2.56],[2.57,4]]]]){
  const f=vadStateOnlyFixture();f.protectedSources[0].quiet=quiet;
  const out=runVadStateOnly(f),proof=out.evidence.at(-1);
  assert.equal(out.boundaryStatus,'needs-review',label);assert.ok(proof.requiresReview,label);
  assert.equal(proof.parts[0].vadStateOnlyExceptions?.length??0,0,label);
 }
});

test('one matching quiet VAD residual cannot hide another residual whose guard crosses the measured quiet edge',()=>{
 const f=vadStateOnlyFixture();f.protectedSources[0].speech.unshift([1.88,2.12]);
 f.speechEvidence[0].paddedRanges=structuredClone(f.protectedSources[0].speech);f.speechEvidence[0].coreRanges.unshift([1.96,2.04]);
 const out=runVadStateOnly(f),proof=out.evidence.at(-1);
 assert.equal(out.boundaryStatus,'needs-review');assert.ok(proof.requiresReview);
 assert.ok(proof.reviewReasons.includes('existing-cut-overlaps-unresolved-or-unassigned-speech'));
 assert.deepEqual([out.removeParts[0].startSec,out.removeParts[0].endSec],[1.9,2.6]);
 assert.equal(proof.parts[0].expandedCutCheck.revertedToOriginal,true);
 assert.equal(proof.parts[0].expandedCutCheck.finalSafe,false);
});

test('a neighboring word outside the exact current clip cannot anchor a VAD-state exception',()=>{
 const trailing=vadStateOnlyFixture();trailing.candidate.removeParts[0].clipOutSec=3.5;
 const leading=vadStateOnlyFixture({leading:true});leading.candidate.removeParts[0].clipInSec=1;
 for(const f of [trailing,leading]){
  const out=runVadStateOnly(f),proof=out.evidence.at(-1);
  assert.equal(out.boundaryStatus,'needs-review');assert.equal(proof.parts[0].vadStateOnlyExceptions?.length??0,0);
 }
});

test('explicit unknown, unlocated speech and retained-word safety guards are never waived as low-energy VAD state',()=>{
 const changes=[
  f=>{f.source.unresolved=[{reason:'explicit-low-energy-unknown',startMs:2550,endMs:2560}];},
  f=>{f.source.unresolved=[{reason:'unknown-in-the-adjacent-word-context',startMs:3000,endMs:3100}];},
  f=>{f.source.unresolved=[{reason:'unlocated'}];},
  f=>{f.protectedSources[0].words.push({word:'近邻保留词',startMs:2700,endMs:3000});}
 ];
 for(const change of changes){const f=vadStateOnlyFixture();change(f);const out=runVadStateOnly(f),proof=out.evidence.at(-1);
  assert.equal(out.boundaryStatus,'needs-review');assert.ok(proof.requiresReview);
  assert.equal(out.status,'review');assert.equal(out.score,0);
 }
});

test('VAD-state exceptions require bound receipts, unchanged padded ranges, source identity and different recognizer families',()=>{
 const changes=[
  f=>{f.speechEvidence=[];},
  f=>{delete f.speechEvidence[0].receiptPath;},
  f=>{delete f.speechEvidence[0].receiptSha256;},
  f=>{delete f.speechEvidence[0].refinedReceiptPath;},
  f=>{f.speechEvidence[0].coverageVerified=false;},
  f=>{f.speechEvidence[0].paddedRanges=[[2.47,2.66]];},
  f=>{f.speechEvidence[0].sourceSha256='1'.repeat(64);},
  f=>{f.protectedSources[0].sourceSha256='2'.repeat(64);},
  f=>{f.speechEvidence[0].wavSha256='3'.repeat(64);},
  f=>{f.protectedSources[0].provider='qwen-alternate';f.speechEvidence[0].provider='qwen-alternate';}
 ];
 for(const change of changes){const f=vadStateOnlyFixture();change(f);const out=runVadStateOnly(f),proof=out.evidence.at(-1);
  assert.equal(out.boundaryStatus,'needs-review');assert.equal(proof.parts[0].vadStateOnlyExceptions?.length??0,0);
 }
});

test('a VAD-state exception cannot restore an initially unverified part or promote a candidate',()=>{
 const f=vadStateOnlyFixture();f.candidate.removeParts[0].boundaryStatus='needs-review';f.candidate.boundaryStatus='needs-review';
 const out=runVadStateOnly(f);assert.equal(out.boundaryStatus,'needs-review');assert.equal(out.removeParts[0].boundaryStatus,'needs-review');
 assert.equal(out.status,'review');assert.equal(out.confidence,'review');assert.equal(out.score,0);
 close(out.removeParts[0].startSec,.66);close(out.removeParts[0].endSec,2.6);
});
