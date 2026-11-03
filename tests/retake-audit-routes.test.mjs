import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Writable,PassThrough} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createRetakeAnalyzer,runRetakeProcess} from '../server/retake-routes.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const json=(res,status,data)=>Object.assign(res,{status,data});
async function request(api,method,pathname,value){const res={};await api.route({method,value},res,new URL(pathname,'http://local'));return res;}
function fixture(t){
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'retake-audit-route-')),PUBLIC=path.join(ROOT,'public');
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips','synthetic.mp4'),'synthetic');
 t.after(()=>fs.rmSync(ROOT,{recursive:true,force:true}));
 return {ROOT,PUBLIC,clips:[{id:'one',src:'clips/synthetic.mp4',inSec:0,outSec:10,sourceDurationSec:10,speed:1}]};
}
async function completed(t,extra={}){
 const f=fixture(t),runs=[];let completeAudit,signal;
 const api=createRetakeAnalyzer({...f,json,body:async req=>req.raw??JSON.stringify(req.value),prepareAudit:async()=>({}),
  runJob:async args=>{runs.push(args);if(args.mode!=='audit')return {candidates:[],sources:[]};signal=args.signal;args.onProgress(.4,'合成声音审计');return new Promise(resolve=>completeAudit=resolve);},...extra});
 const start=await request(api,'POST','/api/retakes/analyze',{clips:f.clips});await tick();
 return {...f,api,id:start.data.jobId,runs,get signal(){return signal;},finish:result=>completeAudit(result)};
}
const snapshots={projectBefore:{clips:[]},projectAfter:{clips:[]}};
test('audit takes server analysis, stays separate from completed job, and cancellation never claims undo',async t=>{
 const f=await completed(t),start=await request(f.api,'POST',`/api/retakes/${f.id}/audit`,snapshots);assert.equal(start.status,202);await tick();
 assert.equal(f.runs[1].mode,'audit');const input=JSON.parse(fs.readFileSync(f.runs[1].inputFile));assert.equal(input.analysis.id,f.id);assert.equal(input.analysis.status,'done');
 const running=(await request(f.api,'GET',`/api/retakes/${f.id}`)).data;assert.equal(running.status,'done');assert.equal(running.audit.progress,.4);
 assert.equal((await request(f.api,'POST','/api/retakes/analyze',{clips:f.clips})).status,409);
 const cancel=await request(f.api,'POST',`/api/retakes/${f.id}/cancel`);assert.equal(cancel.data.status,'done');assert.equal(cancel.data.audit.status,'cancelled');assert.match(cancel.data.audit.label,/未撤销/);assert.equal(f.signal.aborted,true);assert.equal(f.api.busy(),true);
 f.finish({summary:{late:true}});await tick();assert.equal((await request(f.api,'GET',`/api/retakes/${f.id}`)).data.audit.status,'cancelled');assert.equal(f.api.busy(),false);
});
test('audit rejects over 2MiB and injected analysis/paths before any worker, and requires done job',async t=>{
 const f=await completed(t);
 assert.equal((await request(f.api,'POST',`/api/retakes/${f.id}/audit`,{...snapshots,analysis:{candidates:[]}})).status,400);
 const res={};await f.api.route({method:'POST',raw:' '.repeat(2*1024*1024+1)},res,new URL(`/api/retakes/${f.id}/audit`,'http://local'));assert.equal(res.status,400);assert.match(res.data.error,/2MiB/);
 assert.equal(f.runs.length,1);
 const stream=new PassThrough(),streamRes={};stream.method='POST';stream.headers={};
 const pending=f.api.route(stream,streamRes,new URL(`/api/retakes/${f.id}/audit`,'http://local'));
 stream.write(Buffer.alloc(2*1024*1024+1,32));stream.end();await pending;
 assert.equal(streamRes.status,400);assert.match(streamRes.data.error,/2MiB/);assert.equal(f.runs.length,1);
});
test('completion exposes only parent-job scoped links; old audit dirs remain immutable on retry',async t=>{
 const f=await completed(t),one=await request(f.api,'POST',`/api/retakes/${f.id}/audit`,snapshots);await tick();
 f.finish({status:'review-materials-ready',summary:{joins:2},signalStatus:'unverified',listeningPerformed:false});await tick();
 const job=(await request(f.api,'GET',`/api/retakes/${f.id}`)).data;
 assert.equal(job.status,'done');assert.equal(job.audit.status,'done');assert.deepEqual(job.audit.summary,{joins:2});assert.match(job.audit.indexUrl,new RegExp(`/api/retakes/${f.id}/audit/files/${one.data.auditId}/index.html$`));assert.doesNotMatch(JSON.stringify(job.audit),new RegExp(f.ROOT));
 const second=await request(f.api,'POST',`/api/retakes/${f.id}/audit`,snapshots);await tick();assert.notEqual(second.data.auditId,one.data.auditId);assert.equal(fs.existsSync(f.runs[1].inputFile),true);
 await request(f.api,'POST',`/api/retakes/${f.id}/cancel`);f.finish({});await tick();
});
test('file routes allow declared audio/html/report with ranges, and reject private files and symlink escape',async t=>{
 const f=await completed(t),start=await request(f.api,'POST',`/api/retakes/${f.id}/audit`,snapshots);await tick();
 const directory=path.join(path.dirname(f.runs[1].inputFile),'artifacts');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'after-full.wav'),'0123456789');fs.writeFileSync(path.join(directory,'input.json'),'private');
 const outside=path.join(f.ROOT,'outside.wav');fs.writeFileSync(outside,'private outside');fs.symlinkSync(outside,path.join(directory,'before-full.wav'));
 f.finish({summary:{},signalStatus:'unverified'});await tick();
 const prefix=`/api/retakes/${f.id}/audit/files/${start.data.auditId}/`;
 assert.equal((await request(f.api,'GET',prefix+'input.json')).status,404);assert.equal((await request(f.api,'GET',prefix+'before-full.wav')).status,404);assert.equal((await request(f.api,'GET',prefix+'source-0.wav')).status,404);
 const chunks=[],res=new Writable({write(chunk,encoding,callback){chunks.push(chunk);callback();}});res.writeHead=(status,headers)=>Object.assign(res,{status,headers});
 const finished=once(res,'finish');await f.api.route({method:'GET',headers:{range:'bytes=2-5'}},res,new URL(prefix+'after-full.wav','http://local'));await finished;
 assert.equal(res.status,206);assert.equal(res.headers['Content-Range'],'bytes 2-5/10');assert.equal(Buffer.concat(chunks).toString(),'2345');
});
test('shutdown and restart cancel only an audit while preserving completed analysis',async t=>{
 const f=await completed(t);await request(f.api,'POST',`/api/retakes/${f.id}/audit`,snapshots);await tick();
 const closing=f.api.shutdown();assert.equal(f.signal.aborted,true);f.finish({});await closing;
 const job=(await request(f.api,'GET',`/api/retakes/${f.id}`)).data;assert.equal(job.status,'done');assert.equal(job.audit.status,'cancelled');
});
test('restart marks interrupted audit error while keeping its completed analysis done',async t=>{
 const f=fixture(t),id=randomUUID(),auditId=randomUUID(),directory=path.join(f.ROOT,'.auto-jobs','retakes',id,'audits',auditId);
 fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(f.ROOT,'.auto-jobs','retakes',id,'status.json'),JSON.stringify({id,status:'done',candidates:[],audit:{id:auditId,status:'running',progress:.4}}));
 const api=createRetakeAnalyzer({...f,json,body:async()=>''}),job=(await request(api,'GET',`/api/retakes/${id}`)).data;
 assert.equal(job.status,'done');assert.equal(job.audit.status,'error');assert.match(job.audit.error,/不会撤销/);assert.equal(api.busy(),false);
});
test('runtime dispatches audit to its dedicated worker rather than ASR or Codex',async t=>{
 const f=fixture(t);fs.mkdirSync(path.join(f.ROOT,'scripts'));fs.writeFileSync(path.join(f.ROOT,'scripts','run-retake-audit.mjs'),"import fs from 'node:fs';fs.writeFileSync(process.argv[3],JSON.stringify({audit:true}));");
 const inputFile=path.join(f.ROOT,'input.json'),outputFile=path.join(f.ROOT,'output.json');fs.writeFileSync(inputFile,'{}');
 assert.deepEqual(await runRetakeProcess({...f,inputFile,outputFile,logFile:path.join(f.ROOT,'log'),mode:'audit',signal:new AbortController().signal,onProgress:()=>{}}),{audit:true});
});
