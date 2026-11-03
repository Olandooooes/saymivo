import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {retakeCapabilities,createRetakeAnalyzer,runRetakeProcess} from '../server/retake-routes.mjs';
import {validateRetakeRequest} from '../server/retake-input.mjs';
import {retakeRequest} from '../editor/retake-request.mjs';

function fixture(t){
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'codex-retake-test-')),PUBLIC=path.join(ROOT,'public');
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips','synthetic.mp4'),'synthetic media fixture');
 t.after(()=>fs.rmSync(ROOT,{force:true,recursive:true}));
 return {ROOT,PUBLIC,clips:[{id:'one',src:'clips/synthetic.mp4',inSec:0,outSec:10,speed:1,sourceDurationSec:10}]};
}
const write=(root,file,content,mode)=>{const destination=path.join(root,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content,{mode});};
const json=(res,status,data)=>Object.assign(res,{status,data});
async function request(api,method,pathname,value){const res={};await api.route({method,value},res,new URL(pathname,'http://local'));return res;}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Codex requests require explicit text consent and preserve only immutable source snapshots',t=>{
 const f=fixture(t),clips=f.clips.map(clip=>({...clip,label:'private project label',transform:[{t:0,scale:1}]}));
 assert.throws(()=>retakeRequest(clips,{mode:'codex'}),/明确同意/);
 assert.throws(()=>validateRetakeRequest({clips,mode:'codex'},{PUBLIC:f.PUBLIC}),/明确同意/);
 const input=retakeRequest(clips,{mode:'codex',allowCloudText:true});
 assert.deepEqual(input,{clips:f.clips,mode:'codex',policy:'conservative',allowCloudText:true});
 assert.deepEqual(validateRetakeRequest(input,{PUBLIC:f.PUBLIC}),input);
 assert.equal(retakeRequest(clips,{mode:'local',allowCloudText:true}).allowCloudText,undefined);
});

test('installed models never activate Codex until the explicit validation gate is enabled',t=>{
 const f=fixture(t);
 for(const executable of ['.venv-align/bin/python','.venv/bin/python','.tools/bin/ffmpeg','bin/codex'])write(f.ROOT,executable,'synthetic executable',0o700);
 for(const model of ['qwen3-asr-0.6b/model.safetensors','qwen3-forced-aligner-0.6b/model.safetensors','whisper-medium/model.bin'])write(f.ROOT,'.models/'+model,'synthetic model');
 const env={PATH:path.join(f.ROOT,'bin')};
 const disabled=retakeCapabilities({...f,env});assert.equal(disabled.codex.dependenciesReady,true);assert.equal(disabled.codex.ready,false);assert.match(disabled.codex.reason,/尚未启用/);
 assert.equal(retakeCapabilities({...f,env:{...env,SAYMIVO_CODEX_RETAKES_ENABLED:'1'}}).codex.ready,true);
 fs.rmSync(path.join(f.ROOT,'.models','whisper-medium','model.bin'));
 const missing=retakeCapabilities({...f,env:{...env,SAYMIVO_CODEX_RETAKES_ENABLED:'1'}});assert.equal(missing.codex.ready,false);assert.match(missing.codex.reason,/独立原声复核/);
});
test('default capability route reads the local flag without enabling missing dependencies; process environment wins',async t=>{
 const f=fixture(t),previous=process.env.SAYMIVO_CODEX_RETAKES_ENABLED;
 try{
  delete process.env.SAYMIVO_CODEX_RETAKES_ENABLED;
  const api=createRetakeAnalyzer({...f,json,body:async req=>JSON.stringify(req.value),readEnvFile:()=>({SAYMIVO_CODEX_RETAKES_ENABLED:'1'})});
  const fromFile=(await request(api,'GET','/api/retakes/capabilities')).data;assert.equal(fromFile.codex.enabled,true);assert.equal(fromFile.codex.ready,false,'flag cannot substitute for local model dependencies');
  process.env.SAYMIVO_CODEX_RETAKES_ENABLED='0';
  const overridden=(await request(api,'GET','/api/retakes/capabilities')).data;assert.equal(overridden.codex.enabled,false);assert.equal(overridden.codex.ready,false);
 }finally{if(previous===undefined)delete process.env.SAYMIVO_CODEX_RETAKES_ENABLED;else process.env.SAYMIVO_CODEX_RETAKES_ENABLED=previous;}
});

test('capability denial rejects Codex before creating a job or invoking any inference',async t=>{
 const f=fixture(t);let runs=0;
 const capability={local:{ready:true},codex:{ready:false,reason:'真实声音验收未通过'}};
 const api=createRetakeAnalyzer({...f,json,body:async req=>JSON.stringify(req.value),capabilities:()=>capability,runJob:async()=>{runs++;}});
 assert.deepEqual((await request(api,'GET','/api/retakes/capabilities')).data,capability);
 const result=await request(api,'POST','/api/retakes/analyze',{clips:f.clips,mode:'codex',allowCloudText:true});
 assert.equal(result.status,400);assert.match(result.data.error,/验收未通过/);assert.equal(runs,0);assert.equal(api.busy(),false);
 assert.deepEqual(fs.readdirSync(path.join(f.ROOT,'.auto-jobs','retakes')),[]);
});

test('enabled Codex dispatches the validated mode and retains route cancellation semantics',async t=>{
 const f=fixture(t);let args,complete;
 const api=createRetakeAnalyzer({...f,json,body:async req=>JSON.stringify(req.value),capabilities:()=>({codex:{ready:true}}),runJob:async value=>{args=value;return await new Promise(resolve=>complete=resolve);}});
 const start=await request(api,'POST','/api/retakes/analyze',{clips:f.clips,mode:'codex',allowCloudText:true});assert.equal(start.status,202);await tick();
 assert.equal(args.mode,'codex');assert.equal(JSON.parse(fs.readFileSync(args.inputFile)).allowCloudText,true);
 await request(api,'POST',`/api/retakes/${start.data.jobId}/cancel`);assert.equal(args.signal.aborted,true);
 complete({candidates:[]});await tick();assert.equal((await request(api,'GET',`/api/retakes/${start.data.jobId}`)).data.status,'cancelled');
 assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});

test('runtime chooses the production Codex analyzer, never the isolated benchmark script',async t=>{
 const f=fixture(t),inputFile=path.join(f.ROOT,'input.json'),outputFile=path.join(f.ROOT,'output.json');
 fs.writeFileSync(inputFile,'{}');
 write(f.ROOT,'scripts/analyze-codex-retakes.mjs',"import fs from 'node:fs';fs.writeFileSync(process.argv[3],JSON.stringify({provider:'production-codex'}));");
 write(f.ROOT,'scripts/analyze-retakes.mjs',"throw Error('legacy branch must not run');");
 const result=await runRetakeProcess({...f,inputFile,outputFile,logFile:path.join(f.ROOT,'log'),mode:'codex',signal:new AbortController().signal,onProgress:()=>{}});
 assert.equal(result.provider,'production-codex');
});
