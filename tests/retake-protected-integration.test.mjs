import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeCodexRetakes,protectedDifference} from '../scripts/analyze-codex-retakes.mjs';
import {prepareRetakeComparisons} from '../scripts/retake-comparison.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'protected-integration-')),PUBLIC=path.join(root,'public');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/synthetic.mp4'),'synthetic source bytes');fs.mkdirSync(path.join(root,'scripts'));
 const script=path.join(root,'scripts/normalize-retake-comparison.py');fs.writeFileSync(script,'synthetic converter; never executed');
 const sourceSha256=sha(fs.readFileSync(path.join(PUBLIC,'clips/synthetic.mp4'))),src='clips/synthetic.mp4',clips=[{id:'a',src,inSec:0,outSec:4,speed:1,sourceDurationSec:10},{id:'b',src,inSec:4,outSec:10,speed:1,sourceDurationSec:10}];
 const source={src,sourceSha256,wav:path.join(root,'unused.wav'),audioClock:{sourceSha256},range:[0,10],quiet:[[.75,1.1],[2.3,2.65],[4.5,4.8],[6.7,7.8]],words:[
  {word:'开场。',startMs:200,endMs:700},{word:'虽然没有纸',startMs:1200,endMs:2200},{word:'雖然沒有菜譜',startMs:5000,endMs:6600},{word:'继续。',startMs:8200,endMs:8800}]};
 let boundaries=0,recognitions=0;
 const normalization={version:'opencc-t2s-comparison-v1',packageVersion:'synthetic',scriptSha256:sha(fs.readFileSync(script)),configSha256:'a'.repeat(64),dictionaries:[{name:'synthetic',sha256:'b'.repeat(64)}],implementation:[{name:'synthetic',sha256:'c'.repeat(64)}],rawRecognitionChanged:false,expectedTextSupplied:false};
 const prepare=async(candidates,options)=>prepareRetakeComparisons(candidates,{...options,run:async(_,args)=>{
  const input=JSON.parse(fs.readFileSync(args[3]));fs.writeFileSync(args[4],JSON.stringify({texts:input.texts.map(text=>text.replaceAll('雖','虽').replaceAll('沒','没').replaceAll('譜','谱')),normalization}));
 }});
 const options={root,PUBLIC,directory:path.join(root,'job'),observe:async()=>structuredClone(source),prepareComparison:prepare,
  decide:async()=>[{first:1,last:1,replacementFirst:2,replacementLast:2,kind:'false-start',reason:'synthetic failed beginning'}],
  checkBoundaries:async input=>{boundaries++;return {candidates:input.candidates.map(c=>({id:c.id,safe:true}))};},
  confirm:async input=>{recognitions++;return {candidates:input.candidates.map(c=>({id:c.id,confirmed:false}))};}};
 return {source,request:{clips,mode:'codex',allowCloudText:true},options,prepare,calls:()=>({boundaries,recognitions})};
}

test('bound script-variant copies only permit fresh downstream validation and leave both original texts unchanged',async t=>{
 const f=fixture(t),before=structuredClone(f.source);assert.equal(protectedDifference(f.source.words[1].word,f.source.words[2].word),true);
 const result=await analyzeCodexRetakes(f.request,f.options),candidate=result.candidates[0],proof=candidate.evidence.find(value=>value.kind==='protected-assertion-comparison');
 assert.equal(candidate.protectedChanged,false);assert.equal(proof.previousProtectedChanged,true);assert.equal(proof.comparisonSource,'bound-opencc-copy');assert.match(proof.inputSha256,/^[a-f0-9]{64}$/);assert.equal(proof.automaticApproval,false);
 assert.deepEqual(f.calls(),{boundaries:1,recognitions:1});assert.equal(result.counts.approved,0);assert.equal(candidate.status,'review');
 assert.equal(candidate.remove.text,before.words[1].word);assert.equal(candidate.retain.text,before.words[2].word);assert.deepEqual(f.source,before);
});

test('a forged comparison binding keeps the original protection and skips expensive verification',async t=>{
 const f=fixture(t),result=await analyzeCodexRetakes(f.request,{...f.options,prepareComparison:async(candidates,options)=>{
  const value=await f.prepare(candidates,options);value.candidates[0].comparisonCopies.originalSha256='0'.repeat(64);return value;
 }});
 assert.equal(result.candidates[0].protectedChanged,true);assert.deepEqual(f.calls(),{boundaries:0,recognitions:0});assert.equal(result.counts.approved,0);
 assert.ok(result.warnings.some(value=>value.includes('比较副本绑定无效')));
});
