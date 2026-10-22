import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {applyVisualReview,applySourceVisualReviews} from '../server/source-visual-reviews.mjs';
const anchor={startMs:0,endMs:3000,sourceText:'同一句原话'};
const base=()=>({clips:[{id:'new-id',src:'clips/a.mp4'}],captions:[{id:'new-caption',clipId:'new-id',startMs:100,endMs:900,words:[{text:'原话',startMs:100,endMs:900}],topPct:84,scale:.65}],presentation:{scenes:[{id:'new-scene',src:'clips/a.mp4',layout:'speaker',...anchor}]}});
const speaker={x:50,y:50,scale:1.1,shiftY:-5};
test('source anchors survive new IDs while unrelated data and input stay intact',()=>{
 const p=base(),before=structuredClone(p);const r=applyVisualReview(p,{version:1,decisions:[{kind:'speaker',anchor,speaker},{kind:'caption-style',anchor,style:{topPct:88,scale:.55,holdMs:0}}]},'clips/a.mp4');
 assert.deepEqual(p,before);assert.deepEqual(r.project.clips,p.clips);assert.deepEqual(r.project.captions[0].words,p.captions[0].words);assert.deepEqual(r.project.presentation.scenes[0].speaker,speaker);assert.equal(r.project.captions[0].topPct,88);assert.equal(r.project.captions[0].holdMs,0);assert.equal(r.report.filter(x=>x.status==='applied').length,2);
});
test('foreign source, duplicate anchor, changed wording and invalid values do not apply a layout',()=>{
 for(const mutate of [p=>p.presentation.scenes[0].src='clips/b.mp4',p=>p.presentation.scenes.push({...p.presentation.scenes[0],id:'duplicate'}),p=>p.presentation.scenes[0].sourceText='不同原话']){
  const p=base();mutate(p);const r=applyVisualReview(p,{version:1,decisions:[{kind:'speaker',anchor,speaker}]},'clips/a.mp4');assert.ok(r.report.every(x=>x.status==='skipped'));assert.deepEqual(r.project,p);
 }
 const p=base();assert.deepEqual(applyVisualReview(p,{version:1,decisions:[{kind:'speaker',anchor,speaker:{...speaker,scale:99}}]},'clips/a.mp4').project,p);
});
test('overview return rebases node and caption references from current generated scenes',()=>{
 const p=base();p.presentation.scenes.push({id:'fresh-overview',src:'clips/a.mp4',layout:'overview',startMs:5000,endMs:7000,sourceText:'总览原话',title:'总览',nodes:[{id:'fresh-node',text:'任务'}],sourceCaptionIds:['fresh-evidence']});
 const r=applyVisualReview(p,{version:1,decisions:[{kind:'overview-return',anchor,overviewAnchor:{startMs:5000,endMs:7000,sourceText:'总览原话'},activeNodeIndex:0}]},'clips/a.mp4');
 const scene=r.project.presentation.scenes[0];assert.equal(scene.activeNodeId,'fresh-node');assert.equal(scene.overviewSourceSceneId,'fresh-overview');assert.ok(scene.sourceCaptionIds.includes('fresh-evidence'));assert.equal(scene.startMs,0);assert.equal(scene.sourceText,anchor.sourceText);
});
test('disk loader refuses a record whose source bytes have a different SHA',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'visual-review-'));try{
 fs.mkdirSync(path.join(dir,'clips/reviews'),{recursive:true});fs.writeFileSync(path.join(dir,'clips/a.mp4'),'actual bytes');fs.writeFileSync(path.join(dir,'clips/reviews/a.visual.json'),JSON.stringify({version:1,sourceSha256:'wrong',decisions:[{kind:'speaker',anchor,speaker}]}));
 const p=base(),r=applySourceVisualReviews(p,{PUBLIC:dir});assert.deepEqual(r.project,p);assert.equal(r.report[0].reason,'source-sha-mismatch');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('disk visual reviews stay inside their complete audio clock and retain legacy compatibility',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'visual-clock-'));try{
  fs.mkdirSync(path.join(PUBLIC,'clips/reviews'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/a.mp4'),'actual bytes');
  const sourceSha256=createHash('sha256').update('actual bytes').digest('hex'),audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256,wavSha256:'a'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
  const file=path.join(PUBLIC,'clips/reviews/a.visual.json'),review={version:1,sourceSha256,decisions:[{kind:'speaker',anchor,speaker}]};
  const save=clock=>fs.writeFileSync(file,JSON.stringify({...review,...(clock===undefined?{}:{audioClock:clock})}));
  const legacy=base(),modern=base();modern.captions[0].audioClock=audioClock;
  save(undefined);assert.deepEqual(applySourceVisualReviews(legacy,{PUBLIC}).project.presentation.scenes[0].speaker,speaker);
  assert.equal(applySourceVisualReviews(modern,{PUBLIC}).report[0].reason,'audio-clock-mismatch');
  save(audioClock);assert.deepEqual(applySourceVisualReviews(modern,{PUBLIC}).project.presentation.scenes[0].speaker,speaker);
  for(const p of [legacy,{...modern,captions:[{...modern.captions[0],audioClock:{...audioClock,wavSha256:'b'.repeat(64)}}]},{...modern,captions:[...modern.captions,{...legacy.captions[0],id:'missing-clock'}]}]){
   const before=structuredClone(p),result=applySourceVisualReviews(p,{PUBLIC});assert.deepEqual(result.project,before);assert.deepEqual(p,before);assert.equal(result.report[0].reason,'audio-clock-mismatch');
  }
  save(undefined);const mixed={...modern,captions:[...modern.captions,{...legacy.captions[0],id:'missing-clock'}]};assert.equal(applySourceVisualReviews(mixed,{PUBLIC}).report[0].reason,'audio-clock-mismatch','mixed clocks cannot masquerade as legacy');
  const foreignClock={...audioClock,sourceSha256:'c'.repeat(64)};save(foreignClock);const foreign=base();foreign.captions[0].audioClock=foreignClock;assert.equal(applySourceVisualReviews(foreign,{PUBLIC}).report[0].reason,'audio-clock-mismatch','clock must also identify the current media bytes');
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
