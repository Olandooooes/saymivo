import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captionReviewRoute} from '../server/caption-review-routes.mjs';
import {applyWordReviews} from '../scripts/word-reviews.mjs';
import {createHash} from 'node:crypto';
import {SOURCE_AUDIO_CLOCK} from '../scripts/transcript-profile.mjs';
test('save, regenerate and undo preserve later reviews and reject invalid timing',async()=>{
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-review-route-')),PUBLIC=path.join(ROOT,'public');
 try{
  fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'integrity fixture, not decoded');
  const call=async(action,input)=>{let result;await captionReviewRoute({req:{method:'POST'},res:{},url:new URL('http://localhost/api/caption-reviews/'+action),ROOT,PUBLIC,body:async()=>JSON.stringify(input),json:(_,code,data)=>{result={code,data};}});return result;};
  const sourceSha256=createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,'clips/raw.mp4'))).digest('hex');
  const audioClock={...SOURCE_AUDIO_CLOCK,sourceSha256,wavSha256:'a'.repeat(64)};
  const beforeWords=[{word:'agent',startMs:1500,endMs:2200}],replacementWords=[{word:'Agent',startMs:1500,endMs:2200}],input={src:'clips/raw.mp4',audioClock,beforeWords,replacementWords};
  const legacy=await call('save',{...input,audioClock:undefined});assert.equal(legacy.code,400);assert.match(legacy.data.error,/音频时钟/);assert.equal(fs.existsSync(path.join(PUBLIC,'clips/reviews/raw.json')),false);
  const first=await call('save',input);assert.equal(first.code,200);
  const file=path.join(PUBLIC,'clips/reviews/raw.json'),read=()=>JSON.parse(fs.readFileSync(file));
  assert.deepEqual(applyWordReviews(beforeWords,read().patches).words,replacementWords);
  assert.deepEqual(read().patches[0].audioClock,audioClock);assert.equal(read().audioClock,undefined,'saving one patch cannot upgrade an entire legacy review');
  const original=fs.readFileSync(file,'utf8');
  for(const changed of [undefined,{...audioClock,version:'legacy'},{...audioClock,sourceSha256:'0'.repeat(64)},{...audioClock,wavSha256:'g'.repeat(64)}]){assert.equal((await call('save',{...input,audioClock:changed})).code,400);assert.equal(fs.readFileSync(file,'utf8'),original);}
  const snapshot=fs.readFileSync(file,'utf8');assert.equal((await call('save',{...input,replacementWords:[{word:'坏时间',startMs:2200,endMs:1500}]})).code,400);assert.equal(fs.readFileSync(file,'utf8'),snapshot);
  const second=await call('save',{...input,replacementWords:[{word:'Agent工具',startMs:1500,endMs:2200}]});assert.equal(second.code,200);
  assert.equal((await call('undo',{src:input.src,token:first.data.token})).code,409);assert.equal(read().patches[0].replacementWords[0].word,'Agent工具');
  assert.equal((await call('undo',{src:input.src,token:second.data.token})).code,200);assert.equal(read().patches[0].replacementWords[0].word,'Agent');
  assert.equal((await call('undo',{src:input.src,token:first.data.token})).code,200);assert.equal(read().patches.length,0);
 }finally{fs.rmSync(ROOT,{recursive:true,force:true});}
});
