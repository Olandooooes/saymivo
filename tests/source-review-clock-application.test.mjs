import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {applySourceEditDecisions,applySourceCaptionTimings} from '../server/source-edit-decisions.mjs';
import {applyVisualReview} from '../server/source-visual-reviews.mjs';
import {applyCaptionTimingReviews} from '../src/caption-timing-review.mjs';
test('restored visual styles cannot lengthen reviewed cue ends, while normal cues retain their styled tail',()=>{
 const captions=[{id:'reviewed',clipId:'take',startMs:500,endMs:1000,words:[{text:'整句',startMs:500,endMs:1000}],holdMs:700},{id:'normal',clipId:'take',startMs:2000,endMs:2500,words:[{text:'普通',startMs:2000,endMs:2500}]}];
 const timed=applyCaptionTimingReviews(captions,[{id:'timing',anchor:{startMs:500,endMs:1000,text:'整句'},range:{startMs:600,endMs:1100},holdMs:0}]);
 const project={clips:[{id:'take',src:'clips/a.mp4'}],captions:timed.captions};
 const result=applyVisualReview(project,{version:1,decisions:[{kind:'caption-style',anchor:{startMs:0,endMs:3000},style:{topPct:88,scale:.6,holdMs:700}}]},'clips/a.mp4');
 const [reviewed,normal]=result.project.captions;
 assert.deepEqual([reviewed.startMs,reviewed.endMs,reviewed.holdMs],[600,1100,0]);
 assert.deepEqual(reviewed.words,captions[0].words,'whole-cue timing never changes estimated word onsets');
 assert.deepEqual([reviewed.topPct,reviewed.scale],[88,.6],'appearance still applies');
 assert.equal(normal.holdMs,700);assert.equal(project.captions[0].holdMs,0);
});
test('source clock isolation keeps legacy playback and accepts migrated post-cut and cue reviews only for the same clock',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-clock-application-'));try{
  fs.mkdirSync(path.join(PUBLIC,'clips/reviews'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/take.mp4'),'fixture');
  const sourceSha256=createHash('sha256').update('fixture').digest('hex'),clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sampleRate:16000,channels:1,sampleWidthBytes:2,sourceSha256,wavSha256:'a'.repeat(64)};
  const clips=[{id:'take',src:'clips/take.mp4',inSec:0,outSec:10,sourceDurationSec:10}],base={id:'cue',clipId:'take',words:[{text:'小',startMs:500,endMs:1000,accent:false}],startMs:500,endMs:1000};
  const review={version:1,sourceSha256,patches:[],editorialCuts:[],postCutCaptionReviews:[{id:'post',windowStartMs:0,windowEndMs:2000,acceptedText:['小'],replacementWords:[{word:'小',startMs:600,endMs:1100}]}],captionTimingReviews:[{id:'whole',anchor:{startMs:500,endMs:1000,text:'小'},range:{startMs:700,endMs:1200},holdMs:0}]};
  const save=()=>fs.writeFileSync(path.join(PUBLIC,'clips/reviews/take.json'),JSON.stringify(review));save();
  assert.equal(applySourceEditDecisions(clips,[base],{PUBLIC}).captions[0].startMs,600);
  assert.equal(applySourceCaptionTimings(clips,[base],{PUBLIC}).captions[0].startMs,700);
  const modern={...base,audioClock:clock};
  assert.equal(applySourceEditDecisions(clips,[modern],{PUBLIC}).captions[0].startMs,500,'unmigrated post-cut estimates do not leak');
  assert.equal(applySourceCaptionTimings(clips,[modern],{PUBLIC}).report[0].reason,'audio-clock-mismatch');
  review.audioClock=clock;save();
  assert.equal(applySourceEditDecisions(clips,[modern],{PUBLIC}).captions[0].startMs,600);
  assert.equal(applySourceCaptionTimings(clips,[modern],{PUBLIC}).captions[0].startMs,700);
  assert.equal(applySourceEditDecisions(clips,[base],{PUBLIC}).captions[0].startMs,500,'migrated records cannot change an old saved project');
  assert.equal(applySourceCaptionTimings(clips,[{...modern,audioClock:{...clock,wavSha256:'b'.repeat(64)}}],{PUBLIC}).captions[0].startMs,500);
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
