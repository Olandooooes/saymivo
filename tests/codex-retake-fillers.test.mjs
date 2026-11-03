import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileCodexFillerCandidates,fillerSemanticAssessment,fillerObservationAssessment,confirmCodexFillers,collectFillerRecall,observeFillerWindows} from '../scripts/codex-retake-fillers.mjs';

const fixture=(target='呃',before='我们',after='继续')=>{
 const src='clips/synthetic.mp4',words=[{id:0,word:before,startMs:100,endMs:300},{id:1,word:target,startMs:500,endMs:700},{id:2,word:after,startMs:1000,endMs:1200}],
  source={src,words,quiet:[[.32,.48],[.72,.98]],range:[0,2],provider:'whisper-medium',sourceSha256:'a'.repeat(64),wav:'/synthetic/source.wav'},
  clips=[{id:'one',src,inSec:0,outSec:2,speed:1}],stream=words.map((w,sourceIndex)=>({...w,sourceIndex,src,clipId:'one'})),
  decision={first:1,last:1,replacementFirst:-1,replacementLast:-1,kind:'filler',reason:'无意义犹豫音'};
 return {source,clips,stream,decision};
};
const compile=f=>compileCodexFillerCandidates([f.decision],f.stream,f.clips,[f.source]);
const record=(source,provider='whisper-small',words=source.words)=>({provider,freeRecognition:true,words,windowId:'candidate',range:[0,2]});

test('isolated hesitation has no invented replacement and carries explicit semantic proof',()=>{
 const f=fixture(),before=structuredClone(f),result=compile(f),c=result.candidates[0];
 assert.equal(result.blocked.length,0);assert.equal(c.kind,'filler');assert.equal(c.retain,null);assert.deepEqual(c.retainParts,[]);
 assert.equal(c.replacementFirst,-1);assert.equal(c.replacementLast,-1);assert.equal(c.semanticEligible,true);
 assert.ok(c.evidence.some(e=>e.kind==='filler-semantic'&&e.eligible===true));assert.equal(c.boundaryStatus,'word-clock-and-quiet-checked');
 assert.equal(c.removeParts.length,1);assert.deepEqual(f,before);
});

test('affirmative answers, expressive particles and homophonic meaningful words remain review',()=>{
 for(const f of [fixture('嗯','你愿意吗','好的'),fixture('啊','这个真好','我们继续'),fixture('哦','原来如此','接下来'),fixture('额','金','很高'),fixture('恩','感','情很深')]){
  const c=compile(f).candidates[0];assert.equal(c.semanticEligible,false);assert.equal(c.status,'review');assert.ok(c.evidence.some(e=>e.kind==='filler-semantic'&&e.eligible===false));
 }
 const f=fixture('额度');assert.equal(compile(f).candidates.length,0);assert.equal(compile(f).blocked.length,1);
});

test('clipped context, absent context and connected speech cannot gain automatic eligibility',()=>{
 const f=fixture();f.stream[0].trimmed=true;assert.equal(compile(f).candidates[0].semanticEligible,false);
 assert.equal(fillerSemanticAssessment([{word:'呃'}],0,0).eligible,false);
 const connected=fixture();connected.source.quiet=[];assert.equal(compile(connected).candidates[0].boundaryStatus,'needs-review');
 const malformed=fixture();malformed.decision.replacementFirst=0;assert.equal(compile(malformed).blocked.length,1);
 const remnant=fixture();remnant.clips[0].inSec=.33;const c=compile(remnant).candidates[0];assert.equal(c.removeParts[0].orphanFragmentRisk,true);assert.equal(c.boundaryStatus,'needs-review');
 const unresolved=fixture();Object.assign(unresolved.stream[1],{contextOnly:true,sourceIndex:-1,endMs:500});assert.equal(compile(unresolved).blocked.length,1);
});

test('free ASR must locate the filler in its own time and preserve both real neighboring words',()=>{
 const f=fixture(),c=compile(f).candidates[0];
 assert.equal(fillerObservationAssessment(c,f.source,record(f.source)).confirmed,true);
 assert.equal(fillerObservationAssessment(c,f.source,{...record(f.source),freeRecognition:false}).confirmed,false);
 const missing=f.source.words.filter(w=>w.id!==1);assert.equal(fillerObservationAssessment(c,f.source,record(f.source,'qwen',missing)).confirmed,false);
 const lexical=f.source.words.map(w=>w.id===1?{...w,word:'金额'}:w);assert.equal(fillerObservationAssessment(c,f.source,record(f.source,'qwen',lexical)).confirmed,false);
 const clipping=f.source.words.map(w=>w.id===0?{...w,endMs:600}:w);assert.equal(fillerObservationAssessment(c,f.source,record(f.source,'qwen',clipping)).confirmed,false);
 const late=f.source.words.map(w=>w.id===1?{...w,startMs:1500,endMs:1700}:w);assert.equal(fillerObservationAssessment(c,f.source,record(f.source,'qwen',late)).confirmed,false);
});

test('Qwen omission falls back to small with existing medium observation; two passes from one provider never count twice',async()=>{
 const f=fixture(),c=compile(f).candidates[0],calls=[];
 const result=await confirmCodexFillers({root:'/synthetic',sources:[f.source],candidates:[c]},{directory:'/unused',observe:async(req,{provider})=>{
  calls.push(provider);return req.windows.map(w=>({...record(f.source,provider,provider==='qwen'?f.source.words.filter(w=>w.id!==1):f.source.words),windowId:w.id}));
 }});
 assert.deepEqual(calls,['qwen','whisper-small']);assert.equal(result.candidates[0].confirmed,true);assert.deepEqual(result.candidates[0].providers,['whisper-medium','whisper-small']);
 const repeated=await confirmCodexFillers({root:'/synthetic',sources:[{...f.source,provider:undefined}],candidates:[c]},{directory:'/unused',observe:async(req)=>req.windows.flatMap(w=>[1,2].map(()=>({...record(f.source,'qwen'),windowId:w.id})))});
 assert.equal(repeated.candidates[0].confirmed,false);
});

test('ambiguous semantic particles are not sent for expensive confirmation or promoted by ASR',async()=>{
 const f=fixture('嗯','你愿意吗','好的'),c=compile(f).candidates[0];let called=0;
 const result=await confirmCodexFillers({root:'/synthetic',sources:[f.source],candidates:[c]},{directory:'/unused',observe:async()=>{called++;return [];}});
 assert.equal(called,0);assert.equal(result.candidates[0].confirmed,false);
});

test('isolated free reread can recover an omitted filler but a lexical contradiction vetoes automatic deletion',async()=>{
 const f=fixture(),c=compile(f).candidates[0],input={root:'/synthetic',sources:[{...f.source,provider:undefined}],candidates:[c]};
 const result=await confirmCodexFillers(input,{directory:'/unused',observe:async(req,{provider})=>req.windows.map(window=>({
  ...record(f.source,provider,window.id.endsWith('::isolated')?[f.source.words[1]]:f.source.words.filter(w=>w.id!==1)),windowId:window.id}))});
 assert.equal(result.candidates[0].confirmed,true);
 const conflict=await confirmCodexFillers(input,{directory:'/unused',observe:async(req,{provider})=>req.windows.map(window=>({
  ...record(f.source,provider,provider==='qwen'?f.source.words.map(w=>w.id===1?{...w,word:'二'}:w):f.source.words),windowId:window.id}))});
 assert.equal(conflict.candidates[0].confirmed,false);
});

test('independent recall retains its own source index space and never merges words into the primary recognizer',()=>{
 const f=fixture(),before=structuredClone(f.source),recall=collectFillerRecall({sources:[f.source],clips:f.clips});
 assert.equal(recall.requiresSemanticDecision,true);assert.equal(recall.observed[0].sourceIndex,1);assert.notEqual(recall.evidenceSources[0],f.source);
 assert.deepEqual(f.source,before);assert.deepEqual(recall.evidenceSources[0].words,before.words);
});

test('recognizer input contains audio windows only and requires a fresh free-recognition receipt',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'filler-observe-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const f=fixture();
 const rows=await observeFillerWindows({root:'/synthetic',sources:[f.source],windows:[{id:'one',src:f.source.src,range:[0,2]}]},{provider:'qwen',directory,run:async(command,args)=>{
  assert.equal(command,'/synthetic/.venv-align/bin/python');const input=JSON.parse(fs.readFileSync(args[1]));assert.deepEqual(Object.keys(input).sort(),['root','sources','windows']);assert.deepEqual(Object.keys(input.sources[0]).sort(),['sourceSha256','src','wav']);
  assert.ok(!JSON.stringify(input).includes('无意义'));fs.writeFileSync(args[2],JSON.stringify({provider:'qwen',expectedTextSupplied:false,audioUploaded:false,modelSha256:'b'.repeat(64),observations:[record(f.source,'qwen')]}));
 }});
 assert.equal(rows[0].freeRecognition,true);
});
