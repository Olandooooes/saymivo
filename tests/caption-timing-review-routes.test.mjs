import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captionTimingReviewRoute} from '../server/caption-timing-review-routes.mjs';
import {applySourceCaptionTimings} from '../server/source-edit-decisions.mjs';
test('cue timing saves as an atomic source-bound review, replays without new cuts, and undoes without deleting later reviews',async()=>{
 const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-cue-review-')),PUBLIC=path.join(ROOT,'public');
 try{
  fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'source bytes');
  const call=async(action,input)=>{let result;await captionTimingReviewRoute({req:{method:'POST'},res:{},url:new URL('http://local/api/caption-timing-reviews/'+action),ROOT,PUBLIC,body:async()=>JSON.stringify(input),json:(_,code,data)=>{result={code,data};}});return result;};
  const cue=(id,text,startMs,endMs)=>({id,clipId:'raw',startMs,endMs,holdMs:700,words:[{text,startMs,endMs,accent:false}]}),captions=[cue('a','第一句',1000,2000),cue('b','所以第二句',2000,3000)];
  const reviews=captions.map((c,i)=>({anchor:{startMs:c.startMs,endMs:c.endMs,text:c.words[0].text},range:i?{startMs:2400,endMs:3300}:{startMs:1300,endMs:2200},holdMs:0}));
  const first=await call('save',{src:'clips/raw.mp4',reviews});assert.equal(first.code,200);assert.equal(first.data.count,2);
  const file=path.join(PUBLIC,'clips/reviews/raw.json'),snapshot=fs.readFileSync(file,'utf8');
  const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:4,sourceDurationSec:4}];
  const result=applySourceCaptionTimings(clips,captions,{PUBLIC});
  assert.deepEqual(result.captions.map(c=>[c.startMs,c.endMs,c.holdMs]),[[1300,2200,0],[2400,3300,0]]);assert.deepEqual(result.captions.map(c=>c.words),captions.map(c=>c.words));assert.equal(result.report.filter(r=>r.status==='applied').length,2);
  assert.equal((await call('save',{src:'clips/raw.mp4',reviews:[{...reviews[0],range:{startMs:2200,endMs:1300}}]})).code,400);assert.equal(fs.readFileSync(file,'utf8'),snapshot);
  const second=await call('save',{src:'clips/raw.mp4',...reviews[1],range:{startMs:2500,endMs:3350}});assert.equal(second.code,200);
  assert.equal((await call('undo',{src:'clips/raw.mp4',token:first.data.token})).code,409);assert.equal(JSON.parse(fs.readFileSync(file)).captionTimingReviews.length,2);
  assert.equal((await call('undo',{src:'clips/raw.mp4',token:second.data.token})).code,200);
  assert.equal((await call('undo',{src:'clips/raw.mp4',token:first.data.token})).code,200);assert.equal(JSON.parse(fs.readFileSync(file)).captionTimingReviews.length,0);
  await call('save',{src:'clips/raw.mp4',reviews});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'different source bytes');
  assert.deepEqual(applySourceCaptionTimings(clips,captions,{PUBLIC}).captions,captions);assert.equal((await call('save',{src:'clips/raw.mp4',reviews})).code,400);
 }finally{fs.rmSync(ROOT,{recursive:true,force:true});}
});
