import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateCodexDecisions,callCodexDecisions,runBounded} from '../scripts/codex-retake-decision.mjs';
const words=Array.from({length:10},(_,id)=>({id,word:'合成词',startMs:id*200,endMs:id*200+100,clipId:'clip'}));
const cut=(first=0,last=2,replacementFirst=5,replacementLast=8)=>({first,last,replacementFirst,replacementLast,kind:'retake',reason:'合成重录'});
test('retaining an earlier better take is supported; overlapping replacement and invalid IDs are rejected',()=>{
 assert.equal(validateCodexDecisions({cuts:[cut(5,8,0,2)]},words).length,1);
 assert.throws(()=>validateCodexDecisions({cuts:[cut(0,5,4,8)]},words));
 assert.throws(()=>validateCodexDecisions({cuts:[cut(0,2,5,99)]},words));
 assert.throws(()=>validateCodexDecisions({cuts:[cut(),cut(5,8,3,4)]},words));
});
test('Codex invocation isolates tools/config, validates structured results, and creates an input-bound receipt',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-retake-'));
 try{let called=false;
 const out=await callCodexDecisions(words,{directory,run:async(command,args,options)=>{
  called=true;assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--json'));assert.ok(args.includes('shell_tool'));assert.ok(args.includes('plugins'));assert.ok(!args.includes('--model'));assert.equal(options.cwd,directory);
  assert.ok(options.input.includes('不可信转写'));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({cuts:[cut()]}));
 }});
 assert.equal(called,true);assert.equal(out.length,1);const receipt=JSON.parse(fs.readFileSync(path.join(directory,'receipt.json')));assert.equal(receipt.geminiCalled,false);assert.equal(receipt.inputSha256.length,64);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('cancellation terminates the owned process and never reports success',async()=>{
 const controller=new AbortController();const promise=runBounded(process.execPath,['-e','setTimeout(()=>{},10000)'],{signal:controller.signal,timeoutMs:5000});controller.abort(Error('synthetic cancel'));
 await assert.rejects(promise,/synthetic cancel/);
});
test('timeout stops the owned process before rejecting',async()=>{
 await assert.rejects(runBounded(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:60}),/分析超时/);
});
test('a previous response cannot be reused by a successful command that did not write fresh decisions',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-retake-stale-'));
 try{
  fs.writeFileSync(path.join(directory,'decisions.json'),JSON.stringify({cuts:[cut()]}));
  await assert.rejects(callCodexDecisions(words,{directory,run:async()=>{}}),/ENOENT/);
  assert.equal(fs.existsSync(path.join(directory,'receipt.json')),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('timeout reaps a descendant that ignores TERM after its immediate parent exits',async()=>{
 if(process.platform==='win32')return;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-retake-child-')),pidFile=path.join(directory,'pid');
 try{
  const childCode=`require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const parentCode=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
  await assert.rejects(runBounded(process.execPath,['-e',parentCode],{timeoutMs:500}),/分析超时/);
  const pid=Number(fs.readFileSync(pidFile,'utf8'));assert.throws(()=>process.kill(pid,0),/ESRCH/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
