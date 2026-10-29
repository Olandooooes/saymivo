import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createPersonMatteAnalyzer,validateMatteRequest,validateMatteFrames} from '../server/person-matte-routes.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'matte-test-')),PUBLIC=path.join(ROOT,'public');
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips','synthetic.mp4'),'public synthetic fixture');
 t.after(()=>fs.rmSync(ROOT,{recursive:true,force:true}));return {ROOT,PUBLIC,input:{src:'clips/synthetic.mp4',startMs:0,endMs:2000/30,fps:30}};
}
function rgba(directory,index,{alpha=true,width=16,height=9}={}){
 const b=Buffer.alloc(26);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);b[24]=8;b[25]=alpha?6:2;
 fs.writeFileSync(path.join(directory,`frame-${String(index).padStart(5,'0')}.png`),b);
}
const json=(res,status,data)=>{res.status=status;res.data=data;};
async function request(api,method,url,value){const res={};assert.equal(await api.route({method,value},res,new URL(url,'http://local')),true);return res;}

test('matte requests reject external files, traversal, long spans and malformed SHA',t=>{
 const f=fixture(t);assert.deepEqual(validateMatteRequest(f.input,{PUBLIC:f.PUBLIC}),f.input);
 for(const patch of [{src:'clips/../private.mp4'},{endMs:10001},{fps:12},{sourceSha256:'fake'},{startMs:-1}])assert.throws(()=>validateMatteRequest({...f.input,...patch},{PUBLIC:f.PUBLIC}));
 fs.writeFileSync(path.join(f.ROOT,'outside.mp4'),'not a library asset');fs.symlinkSync(path.join(f.ROOT,'outside.mp4'),path.join(f.PUBLIC,'clips','link.mp4'));
 assert.throws(()=>validateMatteRequest({...f.input,src:'clips/link.mp4'},{PUBLIC:f.PUBLIC}),/素材库/);
});
test('frame validation preserves true source times and requires full-size RGBA alpha',t=>{
 const f=fixture(t),directory=path.join(f.ROOT,'frames');fs.mkdirSync(directory);rgba(directory,0);rgba(directory,1);
 const report={count:2,fps:30,sourceOriginSec:5,sourceTimestamps:[0,1/30],alphaCoverage:[.25,.3]};
 const options={report,directory,input:f.input,source:{width:16,height:9,sourceOriginSec:5},sourceSha256:'a'.repeat(64),prefix:'broll-assets/test/frame-'};
 const matte=validateMatteFrames(options);assert.equal(matte.sourceStartMs,matte.timesMs[0]);assert.equal(matte.endMs,2000/30);assert.equal(matte.src,f.input.src);assert.equal(matte.sourceSha256,'a'.repeat(64));
 assert.throws(()=>validateMatteFrames({...options,report:{...report,sourceTimestamps:[0,0]}}),/时间戳/);
 assert.throws(()=>validateMatteFrames({...options,report:{...report,sourceOriginSec:0}}),/时钟/);
 for(const origin of [undefined,NaN,Infinity])assert.throws(()=>validateMatteFrames({...options,report:{...report,sourceOriginSec:origin}}),/时钟/);
 assert.throws(()=>validateMatteFrames({...options,report:{...report,alphaCoverage:[1,1]}}),/透明人物/);
 rgba(directory,1,{alpha:false});assert.throws(()=>validateMatteFrames(options),/RGBA/);
});
test('done job returns the proof fields inside personMatte without writing a project',async t=>{
 const f=fixture(t),matte={prefix:'broll-assets/test/frame-',sourceStartMs:0,fps:30,count:2,timesMs:[0,1000/30],src:f.input.src,sourceSha256:'a'.repeat(64),width:16,height:9,endMs:2000/30};
 const api=createPersonMatteAnalyzer({...f,json,body:async r=>JSON.stringify(r.value),platform:'darwin',runJob:async a=>{a.onProgress(.6,'synthetic frame pass');return {personMatte:matte};}});
 const created=await request(api,'POST','/api/person-matte/analyze',f.input);assert.equal(created.status,202);await tick();
 const done=await request(api,'GET','/api/person-matte/'+created.data.jobId);assert.equal(done.data.status,'done');assert.equal(done.data.progress,1);assert.deepEqual(done.data.result.personMatte,matte);
 await request(api,'POST',`/api/person-matte/${created.data.jobId}/cancel`);assert.equal(done.data.status,'done');assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});
test('cancel stops the job and cleans late partial output only',async t=>{
 const f=fixture(t);let release,signal,assetDirectory;
 const api=createPersonMatteAnalyzer({...f,json,body:async r=>JSON.stringify(r.value),platform:'darwin',runJob:async a=>{signal=a.signal;assetDirectory=a.assetDirectory;return await new Promise(resolve=>release=resolve);}});
 const created=await request(api,'POST','/api/person-matte/analyze',f.input);await tick();const id=created.data.jobId;
 assert.equal((await request(api,'POST','/api/person-matte/analyze',f.input)).status,409);
 await request(api,'POST',`/api/person-matte/${id}/cancel`);assert.equal(signal.aborted,true);
 fs.mkdirSync(assetDirectory,{recursive:true});fs.writeFileSync(path.join(assetDirectory,'late.png'),'late synthetic output');release({personMatte:{}});await tick();
 assert.equal((await request(api,'GET','/api/person-matte/'+id)).data.status,'cancelled');assert.equal(fs.existsSync(assetDirectory),false);assert.equal(fs.readFileSync(path.join(f.PUBLIC,f.input.src),'utf8'),'public synthetic fixture');
});
test('native failure removes only generated partial assets and remains actionable',async t=>{
 const f=fixture(t);let asset;
 const api=createPersonMatteAnalyzer({...f,json,body:async r=>JSON.stringify(r.value),platform:'darwin',runJob:async a=>{asset=a.assetDirectory;fs.mkdirSync(asset,{recursive:true});throw Error('Cannot read source: local decoder unavailable');}});
 const created=await request(api,'POST','/api/person-matte/analyze',f.input);await tick();const status=await request(api,'GET','/api/person-matte/'+created.data.jobId);
 assert.equal(status.data.status,'error');assert.match(status.data.error,/decoder/);assert.equal(fs.existsSync(asset),false);
});
test('unsupported platforms do not start a job or silently use a cloud fallback',async t=>{
 const f=fixture(t);let calls=0;const api=createPersonMatteAnalyzer({...f,json,body:async r=>JSON.stringify(r.value),platform:'linux',runJob:async()=>calls++});
 const response=await request(api,'POST','/api/person-matte/analyze',f.input);assert.equal(response.status,400);assert.equal(calls,0);
});
