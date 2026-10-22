import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAutoEditor} from '../server/auto-edit.mjs';
test('unknown or rejected display fonts are refused before automatic processing starts',async()=>{
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-auto-font-')),PUBLIC=path.join(ROOT,'public');
 try{
  fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'not decoded');
  let result,input;
  const editor=createAutoEditor({ROOT,PUBLIC,PROJECTS_DIR:path.join(PUBLIC,'projects'),body:async()=>JSON.stringify(input),json:(_,code,data)=>{result={code,data};},readEnvFile:()=>({}),isManualBusy:()=>false});
  for(const displayFont of ['zcool','unavailable',{id:'source-han'}]){
   input={clips:[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:5}],displayFont};
   assert.equal(await editor.route({method:'POST'},{},new URL('http://localhost/api/auto-edit')),true);
   assert.equal(result.code,400);assert.match(result.data.error,/字体/);assert.equal(editor.busy(),false);
  }
  assert.deepEqual(fs.readdirSync(path.join(ROOT,'.auto-jobs')),[]);
 }finally{fs.rmSync(ROOT,{recursive:true,force:true});}
});
