import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {discoverObservedFillers} from '../scripts/retake-filler-discovery.mjs';
import {analyzeCodexRetakes} from '../scripts/analyze-codex-retakes.mjs';
import {applyRetakePlan} from '../src/retake-plan.mjs';

function fixture(){
 const src='clips/synthetic.mp4',words=[{word:'我们',startMs:100,endMs:300},{word:'呃',startMs:500,endMs:700},{word:'继续',startMs:1000,endMs:1200}];
 const source={src,words,quiet:[[.32,.48],[.72,.98]],range:[0,2],provider:'qwen',sourceSha256:'a'.repeat(64),wav:'/unused/synthetic.wav'};
 const clips=[{id:'one',src,inSec:0,outSec:2,speed:1,sourceDurationSec:2}];
 const pass={sources:[source],words:words.map((w,sourceIndex)=>({...w,id:sourceIndex,sourceIndex,src,clipId:'one'})),decisions:[]};
 return {source,clips,pass};
}
const semantic=async words=>{const first=words.findIndex(w=>w.word==='呃');return first<0?[]:[{first,last:first,replacementFirst:-1,replacementLast:-1,kind:'filler',reason:'合成无意义犹豫音'}];};
const observation=f=>async(request,{provider})=>request.windows.map(w=>({windowId:w.id,src:f.source.src,range:w.range,provider,freeRecognition:true,
 words:f.source.words.filter(word=>word.startMs>=w.range[0]*1000&&word.endMs<=w.range[1]*1000)}));
const options=f=>({root:'/unused',directory:'/unused',observe:observation(f),decide:semantic});

test('zero initial Codex cuts still probes a real observed filler before asking for a semantic decision',async()=>{
 const f=fixture(),before=structuredClone(f),order=[];
 const result=await discoverObservedFillers(f.pass,f.clips,{...options(f),observe:async(...args)=>{order.push('observe');return observation(f)(...args);},decide:async words=>{order.push('semantic');return semantic(words);}});
 assert.deepEqual(order,['observe','observe','semantic']);assert.equal(result.entries.length,1);assert.equal(result.entries[0].probed,true);assert.equal(result.decisions.length,1);
 assert.deepEqual(f,before);
});

test('context-only or uncertain neighbors are probed but their original protection cannot be cleared',async()=>{
 for(const index of [1,2]){
  const f=fixture();Object.assign(f.pass.words[index],{contextOnly:true,independentUnresolved:true});let calls=0;
  const result=await discoverObservedFillers(f.pass,f.clips,{...options(f),observe:async(...args)=>{calls++;return observation(f)(...args);},decide:async()=>assert.fail('uncertainty must block semantics')});
  assert.equal(calls,2);assert.equal(result.decisions.length,0);assert.match(result.entries[0].reason,/不自动解除原保护/);
 }
});

test('affirmative answers and lexical words are never automatically proposed',async()=>{
 const f=fixture();f.source.words[0].word='你愿意吗';f.source.words[1].word='嗯';f.source.words[2].word='好的';
 f.pass.words=f.source.words.map((w,sourceIndex)=>({...w,id:sourceIndex,sourceIndex,src:f.source.src,clipId:'one'}));
 const result=await discoverObservedFillers(f.pass,f.clips,{...options(f),observe:async()=>assert.fail('answer should not consume probe budget')});
 assert.equal(result.decisions.length,0);assert.match(result.entries[0].reason,/回答/);assert.equal(result.entries[0].probed,false);
 f.source.words[1].word='额度';assert.equal((await discoverObservedFillers(f.pass,f.clips,options(f))).entries.length,0);
});

test('contradictory original lexical observations veto even two agreeing short-window fixtures',async()=>{
 const f=fixture(),other={...f.source,provider:'whisper-medium',words:f.source.words.map((w,i)=>i===1?{...w,word:'公'}:w)};
 const result=await discoverObservedFillers(f.pass,f.clips,{...options(f),protectedSources:[other],decide:async()=>assert.fail('lexical contradiction must survive')});
 assert.equal(result.entries[0].probed,true);assert.equal(result.decisions.length,0);assert.match(result.entries[0].reason,/有义词/);
});

test('missing or zero-time observations and provider mismatch never produce a decision',async()=>{
 for(const mode of ['missing','zero','provider']){
  const f=fixture();const result=await discoverObservedFillers(f.pass,f.clips,{...options(f),observe:async(req,{provider})=>observation(f)(req,{provider}).then(rows=>rows.map(row=>({...row,
   provider:mode==='provider'?'qwen':row.provider,words:mode==='missing'?row.words.filter(w=>w.word!=='呃'):row.words.map(w=>w.word==='呃'?{...w,endMs:w.startMs}:w)}))),decide:async()=>assert.fail('bad observation must not reach semantics')});
  assert.equal(result.decisions.length,0);assert.ok(result.entries[0].reason);
 }
});

test('a semantic rejection remains a rejection after positive acoustic fixtures',async()=>{
 const f=fixture(),result=await discoverObservedFillers(f.pass,f.clips,{...options(f),decide:async()=>[]});
 assert.equal(result.decisions.length,0);assert.match(result.entries[0].reason,/Codex未确认/);
});

test('one shared budget prevents repeated passes from restarting observation',async()=>{
 const f=fixture(),budget={remaining:1,seen:new Set()},opts={...options(f),budget};
 assert.equal((await discoverObservedFillers(f.pass,f.clips,opts)).entries.length,1);
 assert.equal((await discoverObservedFillers(f.pass,f.clips,opts)).entries.length,0);assert.equal(budget.remaining,0);
});

async function pipeline(t,{boundary=true}={}){
 const f=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'filler-discovery-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const PUBLIC=path.join(root,'public'),file=path.join(PUBLIC,f.source.src);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic identity only; not media');
 f.source.sourceSha256=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 f.source.audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:f.source.sourceSha256,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
 let main=0,probes=0;
 const result=await analyzeCodexRetakes({clips:f.clips,mode:'codex',allowCloudText:true},{root,PUBLIC,directory:path.join(root,'job'),
  observe:async()=>structuredClone(f.source),independentObserve:null,discoverFillers:discoverObservedFillers,
  observeFiller:async(...args)=>{probes++;return observation(f)(...args);},
  decide:async(words,{directory})=>directory.includes(path.sep+'filler-discovery'+path.sep)?semantic(words):(main++,[]),
  checkBoundaries:async input=>({candidates:input.candidates.map(c=>({id:c.id,safe:boundary,evidence:{synthetic:true}}))}),
  confirmFiller:async()=>assert.fail('new probes must be reused, not decoded again'),confirm:async()=>assert.fail('no retakes')});
 return {f,result,main,probes};
}

test('production orchestration recovers a candidate from zero cuts and applies only after every gate',async t=>{
 const {f,result,main,probes}=await pipeline(t);assert.equal(main,1);assert.equal(probes,2);
 assert.equal(result.counts.fillersApproved,1);assert.equal(result.fillerDiscovery.found,1);assert.equal(result.fillerDiscovery.probed,1);
 const applied=applyRetakePlan({clips:f.clips,captions:[],brolls:[],presentation:{},music:null},{...result,id:'synthetic',status:'done'});
 assert.equal(applied.ok,true,applied.error);assert.equal(applied.changed,true);assert.equal(applied.appliedIds.length,1);
});

test('positive probe and semantic fixtures cannot bypass a failed final boundary check',async t=>{
 const {result}=await pipeline(t,{boundary:false});assert.equal(result.counts.fillersApproved,0);assert.equal(result.counts.review,1);
 assert.match(result.fillerDiscovery.entries[0].reason,/独立验证未全部通过/);
});
