import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createAutoEditor} from '../server/auto-edit.mjs';
test('server restart preserves jobs and exposes an actionable interrupted status',async()=>{const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-job-'));try{const dir=path.join(ROOT,'.auto-jobs','test');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify({id:'test',status:'running',progress:48}));let response;const editor=createAutoEditor({ROOT,PUBLIC:path.join(ROOT,'public'),PROJECTS_DIR:path.join(ROOT,'projects'),json:(_,code,data)=>response={code,data},body:async()=>'',readEnvFile:()=>({}),isManualBusy:()=>false});await editor.route({method:'GET'},null,new URL('http://localhost/api/auto-edit/test'));assert.equal(response.code,200);assert.equal(response.data.status,'error');assert.match(response.data.error,/重启/);assert.equal(response.data.progress,48);assert.equal(editor.busy(),false);}finally{fs.rmSync(ROOT,{recursive:true,force:true});}});
test('invalid source paths are rejected before any pipeline is started',async()=>{const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-job-'));try{let response;const editor=createAutoEditor({ROOT,PUBLIC:ROOT,PROJECTS_DIR:ROOT,json:(_,code,data)=>response={code,data},body:async()=>JSON.stringify({clips:[{id:'a',src:'../private.mp4',inSec:0,outSec:1}]}),readEnvFile:()=>({}),isManualBusy:()=>false});await editor.route({method:'POST'},null,new URL('http://localhost/api/auto-edit'));assert.equal(response.code,400);assert.equal(editor.busy(),false);}finally{fs.rmSync(ROOT,{recursive:true,force:true});}});
test('invalid delivery modes cannot silently start an expensive full export',async()=>{
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-delivery-'));
 try{
  fs.mkdirSync(path.join(ROOT,'clips'));fs.writeFileSync(path.join(ROOT,'clips/a.mp4'),'fixture');let response,input;
  const editor=createAutoEditor({ROOT,PUBLIC:ROOT,PROJECTS_DIR:ROOT,json:(_,code,data)=>response={code,data},body:async()=>JSON.stringify(input),readEnvFile:()=>({}),isManualBusy:()=>false});
  for(const delivery of ['draft',{},['storyboard'],false]){
   input={clips:[{id:'a',src:'clips/a.mp4',inSec:0,outSec:1}],delivery};
   await editor.route({method:'POST'},null,new URL('http://localhost/api/auto-edit'));
   assert.equal(response.code,400);assert.match(response.data.error,/生成方式/);assert.equal(editor.busy(),false);
  }
  assert.deepEqual(fs.readdirSync(path.join(ROOT,'.auto-jobs')),[]);
 }finally{fs.rmSync(ROOT,{recursive:true,force:true});}
});
