import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {autoMediaLibraryRoute,loadAutoMediaLibrary} from '../server/auto-media-library.mjs';
test('local SVG registration validates authored regions and preserves templates when disabled',async()=>{
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-media-library-')),PUBLIC=path.join(ROOT,'public');
 try{
  fs.mkdirSync(path.join(PUBLIC,'broll-assets'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'broll-assets/check.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100" height="100"/></svg>');
  const call=async(input)=>{let result;await autoMediaLibraryRoute({req:{method:'POST'},res:{},url:new URL('http://localhost/api/auto-media-library'),ROOT,PUBLIC,body:async()=>JSON.stringify(input),json:(_,code,data)=>{result={code,data};},run:async()=>{throw Error('SVG must not require a video probe');}});return result;};
  const input={src:'broll-assets/check.svg',label:'本人检查讲义',sourceNote:'编辑讲义',keywords:['检查','结果'],regions:[{id:'r',cue:'检查结果',mode:'spotlight',x:.1,y:.2,w:.8,h:.1}],cameraHints:[{cue:'检查结果',scale:1.1,x:-2,y:0}]};
  assert.equal((await call(input)).code,200);assert.equal(loadAutoMediaLibrary(ROOT,PUBLIC)[0].width,1600);
  const file=path.join(ROOT,'.auto-media-library.json'),before=fs.readFileSync(file,'utf8');assert.equal((await call({...input,regions:[{...input.regions[0],x:.9}]})).code,400);assert.equal(fs.readFileSync(file,'utf8'),before);
  assert.equal((await call({src:input.src,enabled:false})).code,200);assert.equal(loadAutoMediaLibrary(ROOT,PUBLIC).length,0);assert.equal(loadAutoMediaLibrary(ROOT,PUBLIC,{includeDisabled:true})[0].regions.length,1);
 }finally{fs.rmSync(ROOT,{recursive:true,force:true});}
});
