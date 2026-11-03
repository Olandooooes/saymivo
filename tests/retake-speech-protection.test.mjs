import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareSpeechProtectionEvidence} from '../scripts/retake-speech-protection.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(', ')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+': '+stable(value[key])).join(', ')+'}':JSON.stringify(value);
function fixture(t,{pad=80,identitySourceSha256='a'.repeat(64),identityWavSha256='b'.repeat(64),identityRange=[0,10],speech=[[0,.5],[1,2],[3,3.1],[5,5.16],[9.5,10]]}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'speech-protection-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'scripts'),{recursive:true});const scripts={};
 for(const file of ['retake-full-audit.py','source_audio.py','source-audio-clock.json']){const relative='scripts/'+file;fs.writeFileSync(path.join(root,relative),'synthetic identity '+file);scripts[relative]=sha(fs.readFileSync(path.join(root,relative)));}
 const source={src:'clips/synthetic.mp4',sourceSha256:'a'.repeat(64),provider:'whisper-medium',version:'independent-full-speech-v1',clock:{wavSha256:'b'.repeat(64)},range:[0,10],speech,
  words:[],unresolved:[{reason:'explicit-unknown',startMs:1000,endMs:1800}]};
 const identity={version:source.version,sourceSha256:identitySourceSha256,wavSha256:identityWavSha256,range:identityRange,scripts,parameters:{vadPadMs:pad}};
 const id=sha(stable(identity)),cache=path.join(root,'.auto-jobs/codex-independent-evidence',id);fs.mkdirSync(cache,{recursive:true});
 const raw={...source,audioUploaded:false,geminiCalled:false},observationPath=path.join(cache,'observations.json'),receiptPath=path.join(cache,'receipt.json');
 fs.writeFileSync(observationPath,JSON.stringify(raw));fs.writeFileSync(receiptPath,JSON.stringify({identity,payloadSha256:sha(fs.readFileSync(observationPath))}));
 return {root,source:{...source,cache},identity,receiptPath,observationPath,verifyClocks:async()=>({valid:true,receiptPath:'synthetic verified clock receipt',cacheIdentity:'c'.repeat(64)})};
}
const run=({root,source,verifyClocks})=>prepareSpeechProtectionEvidence([source],{root,verifyClocks});

test('verified VAD provenance removes only complete context pads and preserves clipped edges, short ranges, and explicit unknowns',async t=>{
 const data=fixture(t),before=structuredClone(data.source),result=await run(data);
 assert.deepEqual(result.warnings,[]);assert.equal(result.evidence.length,1);const proof=result.evidence[0];
 assert.equal(proof.coverageVerified,true);assert.equal(proof.padSec,.08);assert.equal(proof.padMs,80);
 assert.deepEqual(proof.paddedRanges,before.speech);assert.deepEqual(proof.coreRanges,[[0,.42],[1.08,1.92],[3,3.1],[5,5.16],[9.58,10]]);
 assert.equal(proof.receiptSha256,sha(fs.readFileSync(data.receiptPath)));assert.equal(proof.observationSha256,sha(fs.readFileSync(data.observationPath)));
 assert.equal(proof.src,before.src);assert.equal(proof.sourceVersion,before.version);assert.equal(proof.provider,before.provider);assert.deepEqual(data.source,before);
 proof.coreRanges[0][0]=99;assert.deepEqual(data.source.speech,before.speech);
});

test('the recorded pad is used without a fixed 80ms rule and zero pad does not change speech',async t=>{
 const alternate=fixture(t,{pad:125,speech:[[1,2]]});assert.deepEqual((await run(alternate)).evidence[0].coreRanges,[[1.125,1.875]]);
 const zero=fixture(t,{pad:0});assert.deepEqual((await run(zero)).evidence[0].coreRanges,zero.source.speech);
});

test('touching padded neighbors retain both facing edges because the actual shared pad can be shorter than the maximum',async t=>{
 const data=fixture(t,{speech:[[1,2],[2,3]]}),before=structuredClone(data.source.speech),result=await run(data);
 assert.deepEqual(result.warnings,[]);assert.deepEqual(result.evidence[0].coreRanges,[[1.08,2],[2,2.92]]);
 assert.deepEqual(result.evidence[0].paddedRanges,before);assert.deepEqual(data.source.speech,before);
 // A true VAD core can extend to1.97 and restart at2.03; a 30ms shared pad
 // yields these touching observations. Inferring80ms would erase50ms of it.
 assert.ok(result.evidence[0].coreRanges[0][1]>=1.97);assert.ok(result.evidence[0].coreRanges[1][0]<=2.03);
});

test('one-sample split-rounding gaps preserve both facing edges while clearly separated neighbors retain ordinary full-pad inference',async t=>{
 const tick=1/16000,data=fixture(t,{speech:[[1,2],[2+tick,3],[3.5,4.5]]}),result=await run(data),proof=result.evidence[0];
 assert.deepEqual(result.warnings,[]);assert.deepEqual(proof.coreRanges,[[1.08,2],[2+tick,2.92],[3.58,4.42]]);
 assert.equal(proof.sampleRate,16000);assert.match(proof.padInference,/one-sample/);
 const separated=fixture(t,{speech:[[1,2],[2+2*tick,3]]});
 assert.deepEqual((await run(separated)).evidence[0].coreRanges,[[1.08,1.92],[2+2*tick+.08,2.92]]);
});

test('missing or rejected refined-clock evidence never authorizes padding removal or loads a model',async t=>{
 const data=fixture(t);let calls=0;
 const rejected=await prepareSpeechProtectionEvidence([data.source],{root:data.root,verifyClocks:async()=>{calls++;return {valid:false};}});
 assert.equal(calls,1);assert.deepEqual(rejected.evidence,[]);assert.match(rejected.warnings[0],/重定位时钟收据未通过.*保留全部语音保护/);
 const noReceipt=await prepareSpeechProtectionEvidence([data.source],{root:data.root});assert.deepEqual(noReceipt.evidence,[]);assert.match(noReceipt.warnings[0],/缺少重定位收据/);
});

for(const [label,change]of [
 ['missing raw receipt',data=>fs.rmSync(data.receiptPath)],
 ['damaged raw payload',data=>fs.appendFileSync(data.observationPath,' ')],
 ['changed raw identity pad',data=>{const receipt=JSON.parse(fs.readFileSync(data.receiptPath));receipt.identity.parameters.vadPadMs=79;fs.writeFileSync(data.receiptPath,JSON.stringify(receipt));}],
 ['changed current speech',data=>{data.source.speech=[[1,3]];}],
 ['changed cached script',data=>fs.appendFileSync(path.join(data.root,'scripts/retake-full-audit.py'),'changed')],
 ['unmanaged cache path',data=>{data.source.cache=path.join(data.root,'outside','a'.repeat(64));}],
])test(label+' fails closed with an actionable warning',async t=>{
 const data=fixture(t),before=structuredClone(data.source);change(data);const result=await run(data);
 assert.deepEqual(result.evidence,[]);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/VAD上下文收据未通过.*保留全部语音保护/);
 assert.deepEqual(data.source.unresolved,before.unresolved);
});

for(const [label,options]of [
 ['source identity',{identitySourceSha256:'d'.repeat(64)}],['WAV identity',{identityWavSha256:'d'.repeat(64)}],['range identity',{identityRange:[0,11]}],
 ['negative pad',{pad:-1}],['string pad',{pad:'80'}],['noninteger pad',{pad:80.5}],
])test('mismatched '+label+' cannot produce evidence',async t=>{
 const data=fixture(t,options),result=await run(data);assert.deepEqual(result.evidence,[]);assert.equal(result.warnings.length,1);
});

test('one invalid source does not suppress a separately verified source and no invalid map is returned',async t=>{
 const data=fixture(t),invalid={...data.source,src:'clips/invalid.mp4',cache:path.join(data.root,'invalid')};
 const result=await prepareSpeechProtectionEvidence([invalid,data.source],{root:data.root,verifyClocks:data.verifyClocks});
 assert.equal(result.evidence.length,1);assert.equal(result.evidence[0].src,data.source.src);assert.equal(result.warnings.length,1);
});
