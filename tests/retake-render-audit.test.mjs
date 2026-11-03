import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareRetakeAuditInput} from '../scripts/audit-retake-render.mjs';
import {applyRetakePlan,retakeClipSnapshot} from '../src/retake-plan.mjs';

function fixture(t){
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'automatic-retake-audit-')),PUBLIC=path.join(ROOT,'public'),jobDirectory=path.join(ROOT,'job');
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.mkdirSync(jobDirectory);
 const src='clips/synthetic.mp4',file=path.join(PUBLIC,src);fs.writeFileSync(file,'synthetic source identity, not private media');
 const sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex'),audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:sha,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
 const clips=[{id:'one',src,inSec:0,outSec:4,sourceDurationSec:12,speed:1},{id:'two',src,inSec:6,outSec:12,sourceDurationSec:12,speed:1}];
 const projectBefore={clips,captions:[],brolls:[],presentation:{},music:null,accentColor:'#123'};
 const candidate={id:'auto',src,clipId:'one',remove:{startSec:1,endSec:2,text:'失败重录'},retain:{clipId:'two',src,startSec:7,endSec:9,text:'完整表达'},status:'approved',confidence:'high',score:1,method:'codex-word-decisions',reason:'合成取舍',evidence:[{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true},{kind:'source-boundary-v2',safe:true,sourceSha256:sha}]};
 const analysis={id:'audit-job',status:'done',snapshot:{clips:retakeClipSnapshot(clips)},sources:[{src,sourceSha256:sha,audioClock}],candidates:[candidate]};
 const projectAfter=applyRetakePlan(projectBefore,analysis).project;
 fs.writeFileSync(path.join(jobDirectory,'verification-input.json'),JSON.stringify({sources:[{src,sourceSha256:sha,words:[{id:0,word:'合成',startMs:200,endMs:600}]}]}));
 t.after(()=>fs.rmSync(ROOT,{recursive:true,force:true}));return {ROOT,PUBLIC,jobDirectory,projectBefore,projectAfter,analysis,file};
}
test('audit reconstructs only approved edits and retains prior pause cuts exactly',async t=>{
 const f=fixture(t),input=await prepareRetakeAuditInput(f,f);
 assert.deepEqual(input.beforeClips.map(c=>[c.inSec,c.outSec]),[[0,4],[6,12]]);
 assert.deepEqual(input.afterClips.map(c=>[c.inSec,c.outSec]),[[0,1],[2,4],[6,12]]);
 assert.deepEqual(input.appliedCandidateIds,['auto']);assert.equal(input.sources[0].words[0].word,'合成');assert.equal(input.listeningPerformed,false);
});
test('manual extra deletion and unapplied automatic decisions fail before rendering',async t=>{
 const f=fixture(t);
 await assert.rejects(prepareRetakeAuditInput({...f,projectAfter:{...f.projectAfter,clips:f.projectAfter.clips.slice(1)}},f),/Actual clips differ/);
 await assert.rejects(prepareRetakeAuditInput({...f,projectAfter:f.projectBefore},f),/Actual clips differ/);
});
test('changed original or mismatched word evidence cannot be audited',async t=>{
 const f=fixture(t);fs.writeFileSync(f.file,'changed source');await assert.rejects(prepareRetakeAuditInput(f,f),/Source video changed/);
});
test('expanded evidence retains separate independent clocks, aliases and unresolved observations',async t=>{
 const f=fixture(t),src=f.clips?.[0]?.src??f.projectBefore.clips[0].src,sourceSha256=f.analysis.sources[0].sourceSha256;
 const main=[{word:'主识别',startMs:200,endMs:600}],core=[{word:'独立',startMs:190,endMs:610}],vad=[{word:'另一窗口',startMs:180,endMs:620}];
 fs.writeFileSync(path.join(f.jobDirectory,'evidence-sources.json'),JSON.stringify({sources:[
  {src,sourceSha256,provider:'qwen',words:main,unresolved:[{startMs:900,endMs:980,reason:'clock-overlap'}]},
  {src,sourceSha256,provider:'whisper',words:core,observationPasses:[{id:'core',provider:'whisper',words:core},{id:'vad',provider:'whisper',words:vad,unresolved:[{reason:'unlocated'}]}]}
 ]}));
 const input=await prepareRetakeAuditInput(f,f),clocks=input.sources[0].observationClocks;
 assert.equal(clocks.length,4);assert.equal(clocks.filter(clock=>clock.aliasOf).length,1);
 assert.deepEqual(clocks.filter(clock=>clock.passId).map(clock=>clock.passId),['core','vad']);
 assert.equal(clocks.find(clock=>clock.passId==='vad').unresolved[0].reason,'unlocated');
 assert.equal(input.sources[0].words[0].word,'主识别');
 fs.writeFileSync(path.join(f.jobDirectory,'evidence-sources.json'),JSON.stringify({sources:[{src,sourceSha256:'0'.repeat(64),words:[]}]}));
 await assert.rejects(prepareRetakeAuditInput(f,f),/another source/);
});

test('superseded raw times remain diagnostic evidence and never become an active clipping clock',async t=>{
 const f=fixture(t),src=f.projectBefore.clips[0].src,sourceSha256=f.analysis.sources[0].sourceSha256;
 const raw=[{word:'同一自由识别词',startMs:190,endMs:3000}],aligned=[{word:'同一自由识别词',startMs:200,endMs:600}],clockRefinement={version:'synthetic-refinement',rawEvidenceSha256:'c'.repeat(64)};
 fs.writeFileSync(path.join(f.jobDirectory,'evidence-sources.json'),JSON.stringify({sources:[{src,sourceSha256,provider:'whisper-medium',timingProvider:'qwen-forced-aligner',words:aligned,clockRefinement,observationPasses:[{id:'core',words:aligned}],rawObservationPasses:[{id:'core',provider:'whisper-medium',words:raw,unresolved:[{reason:'raw-time-stretched'}]}]}]}));
 let verified=0;const input=await prepareRetakeAuditInput(f,{...f,verifyClocks:async(source,{root})=>{verified++;assert.equal(root,f.ROOT);assert.deepEqual(source.clockRefinement,clockRefinement);}}),source=input.sources[0];assert.equal(verified,1);
 assert.ok(source.observationClocks.every(clock=>clock.words[0].endMs===600));assert.equal(source.observationClocks[0].provider,'whisper-medium');assert.equal(source.observationClocks[0].timingProvider,'qwen-forced-aligner');
 assert.equal(source.supersededClocks[0].words[0].endMs,3000);assert.equal(source.supersededClocks[0].unresolved[0].reason,'raw-time-stretched');assert.deepEqual(source.supersededClocks[0].clockRefinement,clockRefinement);
});


test('claimed superseded clocks without a valid local refinement receipt fail before audit',async t=>{
 const f=fixture(t),src=f.projectBefore.clips[0].src,sourceSha256=f.analysis.sources[0].sourceSha256;
 fs.writeFileSync(path.join(f.jobDirectory,'evidence-sources.json'),JSON.stringify({sources:[{src,sourceSha256,provider:'whisper-medium',words:[{word:'合成',startMs:200,endMs:600}],rawObservationPasses:[],clockRefinement:{version:'forged'}}]}));
 await assert.rejects(prepareRetakeAuditInput(f,f),/独立词时钟|refin|时钟|收据/);
});

test('overlapping supplied-text boundary windows remain separate observations, never one ASR transcript',async t=>{
 const f=fixture(t),candidate=f.analysis.candidates[0];
 const first={side:'remove',sourceRange:[0,3],observedGroups:[{valid:true,text:'合成',startSec:1.1,endSec:1.3},{valid:true,text:'删除',startSec:1.3,endSec:1.5}]};
 const overlapping={side:'retain',sourceRange:[.5,3.5],observedGroups:[{valid:true,text:'合成',startSec:1.12,endSec:1.32}]};
 candidate.evidence.at(-1).details={alignments:[first,overlapping]};
 candidate.evidence.push({kind:'source-boundary-v2',details:{alignments:[first]}});
 f.analysis.candidates.push({...candidate,id:'other-review',status:'review',evidence:[{kind:'source-boundary-v2',details:{alignments:[overlapping]}}]});
 const input=await prepareRetakeAuditInput(f,f),source=input.sources[0],clocks=source.observationClocks.filter(clock=>clock.kind==='forced-alignment');
 assert.equal(clocks.length,4);assert.equal(new Set(clocks.map(clock=>clock.id)).size,4);
 assert.deepEqual(clocks.map(clock=>clock.words.map(word=>word.word)),[['合成','删除'],['合成'],['合成','删除'],['合成']]);
 assert.ok(clocks.every(clock=>clock.role==='supplied-text-timestamps'&&clock.independentRecognition===false));
 assert.ok(clocks.every(clock=>clock.scope.includes('not independent speech recognition')));
 assert.deepEqual(clocks[0].observationSourceRangeSec,[0,3]);assert.equal(clocks[0].alignmentSide,'remove');
 assert.deepEqual(clocks.map(clock=>[clock.candidateId,clock.evidenceIndex,clock.alignmentIndex]),[['auto',2,0],['auto',2,1],['auto',3,0],['other-review',0,0]]);
 assert.equal(clocks[0].alignmentSha256,createHash('sha256').update(JSON.stringify(first)).digest('hex'));
 assert.ok(!('independentWords' in source));assert.ok(!source.observationClocks.some(clock=>clock.id==='forced-boundary-groups'));
 assert.deepEqual((await prepareRetakeAuditInput(f,f)).sources[0].observationClocks.map(clock=>clock.id),source.observationClocks.map(clock=>clock.id));
});

test('invalid supplied-text boundary groups remain unresolved within their own window',async t=>{
 const f=fixture(t),candidate=f.analysis.candidates[0];
 candidate.evidence.at(-1).details={alignments:[{side:'remove',sourceRange:[0,3],observedGroups:[
  {valid:false,text:'未知',startSec:1.1,endSec:1.4,reason:'zero-or-conflicting-observation'},
  {valid:true,text:'错误时间',startSec:1.5,endSec:1.2},
  {valid:true,text:'无定位'}
 ]},{side:'retain',sourceRange:[6,10],observedGroups:[]}]};
 const input=await prepareRetakeAuditInput(f,f),clocks=input.sources[0].observationClocks.filter(clock=>clock.kind==='forced-alignment');
 assert.equal(clocks.length,2);assert.deepEqual(clocks.map(clock=>clock.words.length),[0,0]);
 assert.equal(clocks[0].unresolved.length,3);assert.deepEqual(clocks[0].unresolved[0],candidate.evidence.at(-1).details.alignments[0].observedGroups[0]);
 assert.equal(clocks[0].unresolved[1].reason,'invalid-supplied-text-boundary-group');assert.deepEqual(clocks[1].unresolved,[]);
});
