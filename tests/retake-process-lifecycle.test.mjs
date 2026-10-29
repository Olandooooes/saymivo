import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {runRetakeProcess,installRetakeShutdown,createRetakeAnalyzer} from '../server/retake-routes.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let n=0;n<150;n++){if(predicate())return;await delay(10);}throw Error('synthetic process was not ready');}
function fixture(t,source){
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'retake-lifecycle-')),PUBLIC=path.join(ROOT,'public'),inputFile=path.join(ROOT,'input.json'),outputFile=path.join(ROOT,'output.json'),pidFile=path.join(ROOT,'pid'),childPidFile=path.join(ROOT,'child-pid');
 fs.mkdirSync(path.join(ROOT,'scripts'));fs.mkdirSync(PUBLIC);fs.writeFileSync(path.join(ROOT,'scripts','analyze-codex-retakes.mjs'),source);
 fs.writeFileSync(inputFile,JSON.stringify({pidFile,childPidFile}));
 t.after(()=>{for(const file of [pidFile,childPidFile])if(fs.existsSync(file)){const pid=Number(fs.readFileSync(file));if(Number.isInteger(pid)&&pid>0)try{process.kill(pid,'SIGKILL');}catch{}}fs.rmSync(ROOT,{recursive:true,force:true});});
 return {ROOT,PUBLIC,inputFile,outputFile,pidFile,childPidFile,logFile:path.join(ROOT,'log'),mode:'codex',onProgress:()=>{},killGraceMs:50,cleanupWaitMs:500};
}
const stubborn="import fs from 'node:fs';const input=JSON.parse(fs.readFileSync(process.argv[2]));process.on('SIGTERM',()=>{});fs.writeFileSync(input.pidFile,String(process.pid));setInterval(()=>{},1000);";
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

test('cancel escalates to KILL and waits for a TERM-resistant runner to actually close',async t=>{
 const f=fixture(t,stubborn),controller=new AbortController(),running=runRetakeProcess({...f,signal:controller.signal});
 await until(()=>fs.existsSync(f.pidFile));const pid=Number(fs.readFileSync(f.pidFile));assert.equal(alive(pid),true);
 controller.abort(Error('synthetic cancel'));await assert.rejects(running,/synthetic cancel/);assert.equal(alive(pid),false);
});

test('a total job timeout terminates a stuck runner instead of leaving the analyzer busy forever',async t=>{
 const f=fixture(t,stubborn);await assert.rejects(runRetakeProcess({...f,signal:new AbortController().signal,timeoutMs:120}),/超时/);
 if(fs.existsSync(f.pidFile))assert.equal(alive(Number(fs.readFileSync(f.pidFile))),false);
});

test('a leader closing before its TERM-resistant grandchild does not clear escalation',async t=>{
 if(process.platform==='win32')return t.skip('POSIX process-group guarantee');
 const childCode="const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>process.exit(),5000);";
 const f=fixture(t,`import fs from 'node:fs';import {spawn}from'node:child_process';const input=JSON.parse(fs.readFileSync(process.argv[2]));fs.writeFileSync(input.pidFile,String(process.pid));spawn(process.execPath,['-e',${JSON.stringify(childCode)},input.childPidFile],{stdio:'ignore'});setInterval(()=>{},1000);`);
 const controller=new AbortController(),running=runRetakeProcess({...f,signal:controller.signal});await until(()=>fs.existsSync(f.childPidFile));
 const parent=Number(fs.readFileSync(f.pidFile)),child=Number(fs.readFileSync(f.childPidFile));controller.abort(Error('synthetic tree cancel'));
 await assert.rejects(running,/synthetic tree cancel/);assert.equal(alive(parent),false);assert.equal(alive(child),false);
});

test('production runner opts all nested stages into its dedicated managed process group',async t=>{
 const f=fixture(t,"import fs from 'node:fs';fs.writeFileSync(process.argv[3],JSON.stringify({managed:process.env.SAYMIVO_RETAKE_MANAGED_PROCESS_GROUP}));");
 const result=await runRetakeProcess({...f,signal:new AbortController().signal});assert.equal(result.managed,process.platform==='win32'?'0':'1');
});

test('server shutdown aborts owned analysis before closing connections or reporting exit',async()=>{
 const processRef=new EventEmitter(),events=[],exits=[];processRef.exit=code=>exits.push(code);let finishJob,finishServer;
 const analyzer={shutdown:()=>{events.push('abort jobs');return new Promise(resolve=>finishJob=resolve);}};
 const server={close:resolve=>{events.push('stop accepting');finishServer=resolve;},closeIdleConnections:()=>events.push('close idle'),closeAllConnections:()=>{events.push('close remaining');finishServer();}};
 const shutdown=installRetakeShutdown({server,analyzer,processRef});
 try{
  processRef.emit('SIGTERM');await tick();assert.deepEqual(events,['stop accepting','close idle','abort jobs']);assert.deepEqual(exits,[]);
  processRef.emit('SIGTERM');processRef.emit('SIGINT');processRef.emit('SIGHUP');await tick();assert.deepEqual(exits,[]);
  finishJob();await tick();assert.deepEqual(events,['stop accepting','close idle','abort jobs','close remaining']);assert.deepEqual(exits,[0]);
  await shutdown.shutdown();assert.equal(events.filter(event=>event==='abort jobs').length,1);
 }finally{shutdown.dispose();assert.equal(processRef.listenerCount('SIGTERM'),0);assert.equal(processRef.listenerCount('SIGINT'),0);assert.equal(processRef.listenerCount('SIGHUP'),0);}
});

test('HTTP analyzer shutdown waits for its real active runner before server exit',async t=>{
 const f=fixture(t,stubborn),processRef=new EventEmitter(),exits=[];processRef.exit=code=>exits.push(code);
 fs.mkdirSync(path.join(f.PUBLIC,'clips'));fs.writeFileSync(path.join(f.PUBLIC,'clips','synthetic.mp4'),'synthetic source');
 const clips=[{id:'clip',src:'clips/synthetic.mp4',inSec:0,outSec:10,speed:1,sourceDurationSec:10}];
 const analyzer=createRetakeAnalyzer({...f,json:(res,status,data)=>Object.assign(res,{status,data}),body:async req=>JSON.stringify(req.value),
  capabilities:()=>({codex:{ready:true}}),runJob:args=>{const value=JSON.parse(fs.readFileSync(args.inputFile));fs.writeFileSync(args.inputFile,JSON.stringify({...value,pidFile:f.pidFile,childPidFile:f.childPidFile}));return runRetakeProcess({...args,killGraceMs:50});}});
 const start={};await analyzer.route({method:'POST',value:{clips,mode:'codex',allowCloudText:true}},start,new URL('http://local/api/retakes/analyze'));
 await until(()=>fs.existsSync(f.pidFile));const pid=Number(fs.readFileSync(f.pidFile));let finishServer;
 const hook=installRetakeShutdown({analyzer,processRef,server:{close:resolve=>finishServer=resolve,closeAllConnections:()=>finishServer()}});
 try{
  processRef.emit('SIGTERM');assert.equal(analyzer.busy(),true);assert.deepEqual(exits,[]);
  await hook.shutdown();await until(()=>exits.length===1);assert.deepEqual(exits,[0]);assert.equal(alive(pid),false);assert.equal(analyzer.busy(),false);
  const status={};await analyzer.route({method:'GET'},status,new URL(`http://local/api/retakes/${start.data.jobId}`));assert.equal(status.data.status,'cancelled');
 }finally{hook.dispose();}
});
