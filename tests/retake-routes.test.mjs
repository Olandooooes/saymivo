import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateRetakeRequest} from '../server/retake-input.mjs';
import {createRetakeAnalyzer} from '../server/retake-routes.mjs';
import {analyzeRetakes} from '../scripts/analyze-retakes.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'retake-test-')),PUBLIC=path.join(root,'public');
  fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips','synthetic.mp4'),'synthetic fixture, not private media');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {ROOT:root,PUBLIC,clips:[{id:'one',src:'clips/synthetic.mp4',inSec:0,outSec:10,speed:1,sourceDurationSec:10}]};}
const json=(res,status,data)=>{res.status=status;res.data=data;};
async function request(api,method,pathname,value){const res={};assert.equal(await api.route({method,value},res,new URL(pathname,'http://local')),true);return res;}

test('validate exact ordered snapshot, reject duplicate IDs, traversal, symlinks and cloud without consent',t=>{
  const f=fixture(t);assert.deepEqual(validateRetakeRequest({clips:f.clips},{PUBLIC:f.PUBLIC}).clips,f.clips);
  assert.throws(()=>validateRetakeRequest({clips:[...f.clips,...f.clips]},{PUBLIC:f.PUBLIC}),/编号/);
  assert.throws(()=>validateRetakeRequest({clips:f.clips,mode:'gemini'},{PUBLIC:f.PUBLIC}),/明确同意/);
  assert.throws(()=>validateRetakeRequest({clips:[{...f.clips[0],src:'clips/../outside.mp4'}]},{PUBLIC:f.PUBLIC}),/本地 MP4/);
  fs.writeFileSync(path.join(f.ROOT,'outside.mp4'),'outside');fs.symlinkSync(path.join(f.ROOT,'outside.mp4'),path.join(f.PUBLIC,'clips','link.mp4'));
  assert.throws(()=>validateRetakeRequest({clips:[{...f.clips[0],src:'clips/link.mp4'}]},{PUBLIC:f.PUBLIC}),/素材库/);
});
test('job progress is fractional, only one run starts, cancel prevents late completion',async t=>{
  const f=fixture(t);let complete,signal;const api=createRetakeAnalyzer({...f,json,body:async req=>JSON.stringify(req.value),
    runJob:async args=>{signal=args.signal;args.onProgress(.4,'synthetic pass');return await new Promise(resolve=>complete=resolve);}});
  const start=await request(api,'POST','/api/retakes/analyze',{clips:f.clips});assert.equal(start.status,202);await tick();
  const id=start.data.jobId,progress=await request(api,'GET','/api/retakes/'+id);assert.equal(progress.data.progress,.4);
  assert.equal((await request(api,'POST','/api/retakes/analyze',{clips:f.clips})).status,409);
  await request(api,'POST',`/api/retakes/${id}/cancel`);assert.equal(signal.aborted,true);assert.equal(api.busy(),true,'cancel request does not release a live process');
  assert.equal((await request(api,'POST','/api/retakes/analyze',{clips:f.clips})).status,409);
  complete({candidates:[]});await tick();
  assert.equal((await request(api,'GET','/api/retakes/'+id)).data.status,'cancelled');assert.equal(api.busy(),false);
  assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false,'analyzer never writes an engineering project');
});
test('shutdown aborts and waits for the active runner; subsequent analyze requests stay disabled',async t=>{
 const f=fixture(t);let complete,signal;
 const api=createRetakeAnalyzer({...f,json,body:async req=>JSON.stringify(req.value),runJob:async args=>{signal=args.signal;return await new Promise(resolve=>complete=resolve);}});
 const start=await request(api,'POST','/api/retakes/analyze',{clips:f.clips});await tick();
 const closing=api.shutdown();let settled=false;closing.then(()=>settled=true);await tick();
 assert.equal(signal.aborted,true);assert.equal(settled,false);assert.equal(api.busy(),true);
 assert.equal((await request(api,'POST','/api/retakes/analyze',{clips:f.clips})).status,503);
 complete({candidates:[{id:'late-candidate'}]});await closing;assert.equal(settled,true);assert.equal(api.busy(),false);
 const final=await request(api,'GET',`/api/retakes/${start.data.jobId}`);assert.equal(final.data.status,'cancelled');assert.deepEqual(final.data.candidates,[]);
 assert.equal(api.shutdown(),closing);assert.equal((await request(api,'POST','/api/retakes/analyze',{clips:f.clips})).status,503);
});
test('restart recovers completed jobs and marks interrupted jobs error',async t=>{
  const f=fixture(t);const options={...f,json,body:async req=>JSON.stringify(req.value),runJob:()=>new Promise(()=>{})};
  const api=createRetakeAnalyzer(options),start=await request(api,'POST','/api/retakes/analyze',{clips:f.clips});
  const recovered=createRetakeAnalyzer(options);assert.equal((await request(recovered,'GET','/api/retakes/'+start.data.jobId)).data.status,'error');
});
test('default local orchestrator never invokes cloud or reads source edit decisions',async t=>{
  const f=fixture(t),sourceFile=path.join(f.PUBLIC,'clips','synthetic.mp4'),sha=createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  const directory=path.join(f.ROOT,'.auto-jobs','synthetic');let cloudCalls=0,audioCalls=0;
  fs.mkdirSync(path.join(f.PUBLIC,'clips','reviews'),{recursive:true});
  fs.writeFileSync(path.join(f.PUBLIC,'clips','reviews','synthetic.source-edit-decisions.json'),'INVALID: must not be read');
  const result=await analyzeRetakes({clips:f.clips},{root:f.ROOT,PUBLIC:f.PUBLIC,directory,
    semanticReview:async()=>{cloudCalls++;throw Error('default local must not call');},audioPass:async args=>{
      audioCalls++;assert.equal(args.operation,'analyze');const request=JSON.parse(fs.readFileSync(args.input,'utf8'));
      assert.deepEqual(Object.keys(request).sort(),['analyzerVersion','public','root','sources']);
      assert.ok(request.sources[0].rawCache.includes('recognition-'));
      return {sources:[{src:f.clips[0].src,sourceSha256:sha,audioClock:{},durationSec:10,words:[],windows:[]}]};}});
  assert.equal(cloudCalls,0);assert.equal(audioCalls,1);assert.equal(result.audioUploaded,false);assert.equal(result.cloudTextSent,false);
  assert.deepEqual(result.snapshot.clips,f.clips);assert.deepEqual(result.candidates,[]);
});

test('local orchestration discovers recovered takes from repaired evidence instead of collapsed baseline words',async t=>{
 const f=fixture(t),sha=createHash('sha256').update(fs.readFileSync(path.join(f.PUBLIC,'clips','synthetic.mp4'))).digest('hex');
 const baseline={src:f.clips[0].src,sourceSha256:sha,audioClock:{},durationSec:10,
  words:[{word:'我们检查一个',startMs:1000,endMs:7000}],speech:[[1,2],[6,8]],quiet:[[2,6]],windows:[]};
 const token=(word,startMs,endMs)=>({word,startMs,endMs});
 const repaired={...baseline,words:[token('我们',1000,1300),token('检查',1300,1600),token('一个',1600,2000),
  token('我们',6000,6300),token('检查',6300,6600),token('一个',6600,7000),token('具体功能。',7000,8000)],repairPasses:[{startSec:.6,endSec:8.4}]};
 const calls=[];
 const result=await analyzeRetakes({clips:f.clips},{root:f.ROOT,PUBLIC:f.PUBLIC,directory:path.join(f.ROOT,'job'),audioPass:async args=>{
  calls.push(args.operation);
  if(args.operation==='analyze')return {sources:[baseline]};
  if(args.operation==='repair'){
   const request=JSON.parse(fs.readFileSync(args.input));assert.deepEqual(request.sources[0].words,baseline.words);return {sources:[repaired]};
  }
  assert.equal(args.operation,'confirm');return {confirmations:{},boundaries:{}};
 }});
 assert.deepEqual(calls,['analyze','repair','confirm']);assert.equal(result.counts.candidates,1);
 assert.equal(result.candidates[0].earlier.text,'我们检查一个');assert.equal(result.candidates[0].retain.startSec,6);
 assert.equal(result.candidates[0].status,'review','recovery alone never forges approval');
 assert.equal(result.sources[0].repairPasses,1);assert.equal(result.cloudTextSent,false);
});
