import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSelectedVadEnvelopeEvidence,proposeSelectedVadEnvelope,verifiedSelectedVadComponents,hasVerifiedSelectedVadContext} from '../scripts/retake-vad-envelope.mjs';
import {tightenQuietMargins} from '../scripts/retake-quiet-margins.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function fixture(){
 const src='clips/synthetic.mp4',clock={sourceSha256:'a'.repeat(64),wavSha256:'b'.repeat(64),sampleRate:16000};
 const source={src,sourceSha256:clock.sourceSha256,provider:'qwen-asr',audioClock:clock,range:[0,5],quiet:[[.5,2],[2.5,4]],words:[
  {word:'前',startMs:0,endMs:500},{word:'待删句',startMs:2000,endMs:2500},{word:'后',startMs:4000,endMs:4500}],unresolved:[]};
 const independent={...structuredClone(source),provider:'whisper-medium',version:'independent-full-speech-v1',speech:[[1.96,2.70]],
  clockRefinement:{version:'independent-window-alignment-v1',coverageRecomputed:true}};
 const proof={version:'verified-vad-context-v1',coverageVerified:true,src,sourceSha256:source.sourceSha256,provider:independent.provider,sourceVersion:independent.version,
  range:[0,5],paddedRanges:structuredClone(independent.speech),coreRanges:[[2.04,2.62]],padSec:.08,padMs:80,sampleRate:16000,wavSha256:clock.wavSha256,
  receiptPath:'/synthetic/raw/receipt.json',receiptSha256:'c'.repeat(64),observationPath:'/synthetic/raw/observations.json',observationSha256:'d'.repeat(64),
  cacheIdentity:'e'.repeat(64),refinedReceiptPath:'/synthetic/refined/receipt.json',refinedCacheIdentity:'f'.repeat(64)};
 const part={clipId:'one',src,clipInSec:0,clipOutSec:5,startSec:1.9,endSec:2.58,first:1,last:1,text:'待删句',boundaryStatus:'word-clock-and-quiet-checked'};
 const candidate={id:'synthetic',src,clipId:'one',kind:'retake',first:1,last:1,replacementFirst:2,replacementLast:2,remove:{startSec:1.9,endSec:2.58,text:'待删句'},
  earlier:{startSec:2,endSec:2.5,text:'待删句'},retain:{clipId:'one',src,startSec:4,endSec:4.5,text:'后'},retainParts:[],removeParts:[part],
  boundaryStatus:'word-clock-and-quiet-checked',status:'approved',confidence:'high',score:1,
  evidence:[{kind:'semantic',selected:[1]},{kind:'source-boundary-v2',safe:true},{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true}]};
 return {source,independent,protectedSources:[source,independent],speechEvidence:[proof],clips:[{id:'one',src,inSec:0,outSec:5,speed:1}],candidate};
}
// Explicit dependency injection stands in for real raw/refined receipt files
// in these pure synthetic tests. Production uses the actual receipt verifier.
async function prepare(f){f.envelopeEvidence=await prepareSelectedVadEnvelopeEvidence(f.protectedSources,{verifySpeech:async sources=>{
 assert.deepEqual(sources,[f.independent]);return {evidence:f.speechEvidence,warnings:[]};}});return f;}
const options=f=>({clips:f.clips,protectedSources:f.protectedSources,speechEvidence:f.speechEvidence,envelopeEvidence:f.envelopeEvidence});
const propose=f=>proposeSelectedVadEnvelope(f.candidate,f.source,options(f));
const tightened=(f,c)=>tightenQuietMargins(c,f.source,options(f));

test('a whole selected component becomes a fresh proposal and keeps all word indices and original observations',async()=>{
 const f=await prepare(fixture()),before=structuredClone(f);
 assert.equal(tightened(f,f.candidate).boundaryStatus,'needs-review','the old strict state-only rule still refuses its nonquiet guard');
 const p=propose(f),proof=p.evidence.at(-1),out=tightened(f,p);
 close(p.remove.startSec,1.9);close(p.remove.endSec,2.65);assert.equal(p.status,'review');assert.equal(p.score,0);
 assert.equal(proof.automaticApproval,false);assert.equal(proof.requiresFreshBoundaryAndFreeAsr,true);assert.equal(proof.parts.length,1);
 assert.deepEqual(proof.parts[0].components[0].component,[2.04,2.62]);
 close(out.remove.startSec,.66);close(out.remove.endSec,3.84);assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');assert.equal(out.status,'review');
 assert.equal(out.evidence.at(-1).expandedCutCheck,undefined);assert.equal(out.evidence.at(-1).parts[0].expandedCutCheck.safe,true);
 assert.equal(out.evidence.at(-1).selectedVadComponentProposals.length,1);
 for(const key of ['first','last','replacementFirst','replacementLast','earlier','retain','retainParts'])assert.deepEqual(out[key],f.candidate[key]);
 for(const kind of ['source-boundary-v2','acoustic-boundaries','independent-local-asr']){const e=p.evidence.find(e=>e.kind===kind);assert.equal(e.staleAfterBoundaryChange,true);assert.equal(e.safe??e.confirmed,false);}
 assert.deepEqual(f,before);
});

test('already enclosed selected-component tails get a fresh proof without claiming a geometry change',async()=>{
 const f=fixture();f.candidate.remove.endSec=2.7;f.candidate.removeParts[0].endSec=2.7;await prepare(f);
 const p=propose(f);assert.notEqual(p,f.candidate);assert.deepEqual(p.remove,f.candidate.remove);assert.equal(p.evidence.at(-1).changed,false);
 assert.equal(p.status,'review');assert.equal(p.evidence.find(e=>e.kind==='source-boundary-v2').safe,false);
 assert.equal(tightened(f,p).boundaryStatus,'word-clock-and-quiet-checked');
});

test('the same complete-component rule handles a leading edge without inventing word timing',async()=>{
 const f=fixture();f.independent.speech=[[1.72,2.48]];f.speechEvidence[0].paddedRanges=structuredClone(f.independent.speech);f.speechEvidence[0].coreRanges=[[1.8,2.4]];await prepare(f);
 const p=propose(f),out=tightened(f,p);close(p.remove.startSec,1.77);close(p.remove.endSec,2.58);
 assert.deepEqual(p.evidence.at(-1).parts[0].components[0].component,[1.8,2.4]);
 close(out.remove.startSec,.66);close(out.remove.endSec,3.84);assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');
 assert.deepEqual(f.source.words[1],{word:'待删句',startMs:2000,endMs:2500});
});

test('a VAD component containing any preceding retained word cannot be reclassified as the selected take',async()=>{
 const f=fixture();f.independent.speech=[[.32,2.7]];f.speechEvidence[0].paddedRanges=structuredClone(f.independent.speech);f.speechEvidence[0].coreRanges=[[.4,2.62]];await prepare(f);
 assert.equal(propose(f),f.candidate);assert.equal(tightened(f,f.candidate).boundaryStatus,'needs-review');
});

test('copied receipt flags, persisted proposals, and changed geometry do not grant component ownership',async()=>{
 const f=await prepare(fixture());
 assert.equal(hasVerifiedSelectedVadContext(f.protectedSources,f.envelopeEvidence),true);
 const forged={...options(f),envelopeEvidence:structuredClone(f.envelopeEvidence)};
 assert.equal(hasVerifiedSelectedVadContext(f.protectedSources,forged.envelopeEvidence),false);
 assert.equal(proposeSelectedVadEnvelope(f.candidate,f.source,forged),f.candidate);
 const p=propose(f);assert.equal(verifiedSelectedVadComponents(p,f.source,options(f)).length,1);
 assert.equal(verifiedSelectedVadComponents(structuredClone(p),f.source,options(f)).length,0);
 assert.equal(tightened(f,structuredClone(p)).boundaryStatus,'needs-review');
 p.removeParts[0].endSec+=.01;p.remove.endSec+=.01;
 assert.equal(verifiedSelectedVadComponents(p,f.source,options(f)).length,0);assert.equal(tightened(f,p).boundaryStatus,'needs-review');
});

test('actual missing receipt files fail closed without loading a recognition model',async()=>{
 const f=fixture();f.envelopeEvidence=await prepareSelectedVadEnvelopeEvidence(f.protectedSources,{root:'/private/tmp/nonexistent-retake-envelope-root'});
 assert.equal(f.envelopeEvidence.verifiedSources,0);assert.ok(f.envelopeEvidence.warnings.length);assert.equal(propose(f),f.candidate);
});

test('changed source clocks, words, or explicit evidence after verification invalidate the process-bound context',async()=>{
 for(const change of [f=>{f.protectedSources[1].audioClock.wavSha256='9'.repeat(64);},f=>{f.protectedSources[1].words[1].endMs=2600;},f=>{f.protectedSources[1].unresolved.push({reason:'new',startMs:2400,endMs:2600});}]){
  const f=await prepare(fixture());change(f);assert.equal(propose(f),f.candidate);
 }
});

test('an unselected overlapping word, trimmed word, or explicit low-energy uncertainty cannot be swallowed',async()=>{
 for(const change of [
  f=>{f.independent.words.splice(2,0,{word:'独有后缀',startMs:2520,endMs:2690});},
  f=>{f.source.words[1].trimmed=true;},
  f=>{f.independent.words[1].contextOnly=true;},
  f=>{f.independent.unresolved=[{reason:'low-energy-but-unknown',startMs:2590,endMs:2610}];},
  f=>{f.independent.unresolved=[{reason:'no-clock'}];},
  f=>{f.independent.uncoveredSpeech=[[2.59,2.61]];}
 ]){const f=fixture();change(f);await prepare(f);assert.equal(propose(f),f.candidate);}
});

test('a new boundary must remain in one actual common quiet interval and inside the exact original clip',async()=>{
 for(const change of [
  f=>{f.independent.quiet=[[.5,2],[2.5,2.6],[2.64,4]];},
  f=>{f.independent.quiet=[[.5,2],[2.64,4]];},
  f=>{f.independent.quiet=[[.5,1.92],[2.5,4]];},
  f=>{f.candidate.removeParts[0].clipOutSec=2.6;f.clips[0].outSec=2.6;},
  f=>{f.clips[0].outSec=4.99;},
  f=>{f.candidate.removeParts[0].clipOutSec=2.75;f.clips[0].outSec=2.75;}
 ]){const f=fixture();change(f);await prepare(f);assert.equal(propose(f),f.candidate);}
});

test('another unconnected VAD island is never borrowed and still stops quiet growth at its full guard',async()=>{
 const f=fixture();f.independent.speech.push([2.9,3.1]);f.speechEvidence[0].paddedRanges=structuredClone(f.independent.speech);f.speechEvidence[0].coreRanges.push([2.98,3.02]);await prepare(f);
 const p=propose(f),out=tightened(f,p),proof=out.evidence.at(-1);
 assert.equal(p.evidence.at(-1).parts[0].components.length,1);close(out.remove.endSec,2.95);
 assert.ok(proof.parts[0].end.blockers.some(b=>b.kind==='vad-unassigned'&&b.span[0]===2.98));
 assert.equal(proof.selectedVadComponentProposals.length,1);assert.equal(proof.parts[0].expandedCutCheck.safe,true);
 const bare=fixture();bare.independent.speech=[[2.48,2.7]];bare.speechEvidence[0].paddedRanges=structuredClone(bare.independent.speech);bare.speechEvidence[0].coreRanges=[[2.56,2.62]];await prepare(bare);
 assert.equal(propose(bare),bare.candidate,'a detached state island does not actually overlap a selected word');
});

function crossClipFixture(){
 const f=fixture();f.candidate.removeParts[0].clipOutSec=3;f.clips[0].outSec=3;
 f.clips.push({id:'two',src:f.source.src,inSec:3.8,outSec:5,speed:1});
 f.candidate.retain.clipId='two';return f;
}

test('a complete word in the actual immediately adjacent monotone clip can anchor the fresh proposal',async()=>{
 const f=await prepare(crossClipFixture()),p=propose(f);assert.notEqual(p,f.candidate);
 const anchors=p.evidence.at(-1).parts[0].components[0].anchors;
 assert.ok(anchors.every(a=>a.after.crossClip&&a.after.clipId==='two'&&a.after.marginSec>=.16));
 const out=tightened(f,p);assert.equal(out.removeParts.length,1);assert.equal(out.removeParts[0].clipId,'one');assert.equal(out.status,'review');
 assert.equal(out.boundaryStatus,'word-clock-and-quiet-checked');close(out.remove.endSec,3);
});

test('source-time gaps cannot substitute for 160ms of actual retained playback next to a cross-clip join',async()=>{
 const f=crossClipFixture();f.candidate.removeParts[0].clipOutSec=2.7;f.clips[0].outSec=2.7;f.clips[1].inSec=3.95;await prepare(f);
 assert.equal(propose(f),f.candidate,'50ms tail plus 50ms next-clip head is only 100ms despite the source gap');
});

test('cross-clip anchors cannot skip another clip, rewind source time, hide a partial word, or use another source',async()=>{
 for(const change of [
  f=>{f.clips.splice(1,0,{id:'other',src:'clips/other.mp4',inSec:0,outSec:1,speed:1});},
  f=>{f.clips[1].src='clips/other.mp4';},
  f=>{f.clips[1].inSec=2.9;},
  f=>{f.clips[1].inSec=4.05;},
  f=>{f.clips[1].inSec=4.05;for(const source of [f.source,f.independent])source.words.push({word:'不能跳过半词找这个锚',startMs:4600,endMs:4900});},
  f=>{f.independent.words[2].contextOnly=true;},
  f=>{f.candidate.removeParts.push({clipId:'two',src:f.source.src,clipInSec:3.8,clipOutSec:5,startSec:3.9,endSec:4.6,first:2,last:2,boundaryStatus:'word-clock-and-quiet-checked'});}
 ]){const f=crossClipFixture();change(f);await prepare(f);assert.equal(propose(f),f.candidate);}
});

test('fresh proposals preserve explicit unknown before the take and stop later margin growth at its 30ms guard',async()=>{
 const f=fixture();f.source.unresolved=[{startMs:1100,endMs:1400,reason:'unknown-before-take'}];await prepare(f);
 const p=propose(f),out=tightened(f,p);assert.notEqual(p,f.candidate);close(out.remove.startSec,1.43);
 assert.deepEqual(f.source.unresolved,[{startMs:1100,endMs:1400,reason:'unknown-before-take'}]);
 assert.equal(out.evidence.at(-1).parts[0].expandedCutCheck.safe,true);
});
