import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {applySourceEditDecisions} from '../server/source-edit-decisions.mjs';
test('source-bound edit decisions cross pause splits without deleting unrelated retained speech',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-edits-'));
 try{
  fs.mkdirSync(path.join(PUBLIC,'clips/reviews'),{recursive:true});const media=path.join(PUBLIC,'clips/raw.mp4');fs.writeFileSync(media,'integrity fixture');
  const sourceSha256=createHash('sha256').update(fs.readFileSync(media)).digest('hex');
  fs.writeFileSync(path.join(PUBLIC,'clips/reviews/raw.json'),JSON.stringify({sourceSha256,editorialCuts:[{id:'repeat',startMs:3000,endMs:7000,reason:'已校对重复片段'}]}));
  const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:5,sourceDurationSec:10},{id:'raw-cut1',src:'clips/raw.mp4',inSec:6,outSec:10,sourceDurationSec:10}];
  const captions=[{id:'a',clipId:'raw',startMs:1000,endMs:2000,words:[{text:'前句',startMs:1000,endMs:2000}]},{id:'b',clipId:'raw-cut1',startMs:8000,endMs:9000,words:[{text:'后句',startMs:8000,endMs:9000}]}];
  const before=structuredClone({clips,captions}),result=applySourceEditDecisions(clips,captions,{PUBLIC});
  assert.deepEqual(result.clips.map(c=>[c.inSec,c.outSec]),[[0,3],[7,10]]);assert.equal(result.report.length,2);assert.deepEqual(result.captions.map(c=>c.words[0].text),['前句','后句']);assert.deepEqual({clips,captions},before);
  fs.writeFileSync(media,'different source bytes');assert.deepEqual(applySourceEditDecisions(clips,captions,{PUBLIC}).clips,clips);
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
test('reviewed cut-boundary cleanup and timing reuse can cross original caption pages',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-postcut-'));
 try{
  fs.mkdirSync(path.join(PUBLIC,'clips/reviews'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'integrity fixture');
  const sourceSha256=createHash('sha256').update('integrity fixture').digest('hex');
  fs.writeFileSync(path.join(PUBLIC,'clips/reviews/raw.json'),JSON.stringify({sourceSha256,editorialCuts:[{id:'repeat',startMs:3000,endMs:7000,dropBoundaryCaptionText:['求']}],postCutCaptionReviews:[{id:'retained',windowStartMs:7000,windowEndMs:10000,acceptedText:['后句'],replacementWords:[{word:'后',startMs:7800,endMs:8200},{word:'句',startMs:8200,endMs:8800}]}]}));
  const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:10,sourceDurationSec:10}],caption=(id,words)=>({id,clipId:'raw',startMs:words[0].startMs,endMs:words.at(-1).endMs,words});
  const captions=[caption('before',[{text:'前句',startMs:1000,endMs:2000}]),caption('tail',[{text:'求',startMs:6900,endMs:7400},{text:'后',startMs:7500,endMs:8000}]),caption('next',[{text:'句',startMs:8000,endMs:9000}])];
  const result=applySourceEditDecisions(clips,captions,{PUBLIC});const words=result.captions.flatMap(c=>c.words);
  assert.deepEqual(words.map(w=>w.text),['前句','后','句']);assert.equal(words[1].startMs,7800);assert.equal(words[2].endMs,8800);assert.equal(result.captionAdjustments.length,2);assert.equal(captions[1].words[0].text,'求');
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
