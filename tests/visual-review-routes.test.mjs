import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {visualReviewRoute} from '../server/visual-review-routes.mjs';import {applySourceVisualReviews} from '../server/source-visual-reviews.mjs';
const fixture=()=>{const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'visual-route-')),PUBLIC=path.join(ROOT,'public');fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,'clips/raw.mp4'),'source fixture');return {ROOT,PUBLIC};};
const scene={id:'old',src:'clips/raw.mp4',layout:'speaker',startMs:0,endMs:3000,sourceText:'原话',speaker:{x:50,y:50,scale:1.1,shiftY:-5}};
const input={src:scene.src,scene,captions:[{startMs:100,endMs:1000,topPct:88,scale:.55,holdMs:0}]};
const caller=ctx=>async(action,input)=>{let result;await visualReviewRoute({...ctx,req:{method:'POST'},res:{},url:new URL('http://localhost/api/visual-reviews/'+action),body:async()=>JSON.stringify(input),json:(_,code,data)=>{result={code,data};}});return result;};
test('save visual settings, reuse across new IDs, undo, and preserve later edits',async()=>{
 const ctx=fixture();try{
 const call=caller(ctx),first=await call('save',input);assert.equal(first.code,200);assert.equal(first.data.count,2);
 const project={clips:[{id:'new-clip',src:scene.src}],captions:[{id:'new-cap',clipId:'new-clip',startMs:100,endMs:1000,topPct:84,scale:.65,words:[{text:'原话',startMs:100,endMs:1000}]}],presentation:{scenes:[{...scene,id:'new-scene',speaker:undefined}]}};
 const applied=applySourceVisualReviews(project,ctx);assert.equal(applied.project.captions[0].topPct,88);assert.equal(applied.project.captions[0].holdMs,0);assert.equal(applied.project.presentation.scenes[0].speaker.scale,1.1);assert.deepEqual(applied.project.captions[0].words,project.captions[0].words);
 const second=await call('save',{...input,scene:{...scene,speaker:{...scene.speaker,scale:1.2}}});assert.equal(second.code,200);
 assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,409);
 assert.equal((await call('undo',{src:scene.src,token:second.data.token})).code,200);
 assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,200);
 assert.deepEqual(applySourceVisualReviews(project,ctx).project,project);
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});
test('invalid source, invalid styles and changed media cannot overwrite a saved review',async()=>{
 const ctx=fixture();try{
 const call=caller(ctx);assert.equal((await call('save',input)).code,200);const file=path.join(ctx.PUBLIC,'clips/reviews/raw.visual.json'),saved=fs.readFileSync(file,'utf8');
 for(const bad of [{...input,src:'../secret.mp4'},{...input,scene:{...scene,sourceText:''}},{...input,captions:[{...input.captions[0],scale:99}]},{...input,captions:[{...input.captions[0],holdMs:-1}]}]){assert.equal((await call('save',bad)).code,400);assert.equal(fs.readFileSync(file,'utf8'),saved);}
 fs.writeFileSync(path.join(ctx.PUBLIC,'clips/raw.mp4'),'changed bytes');assert.equal((await call('save',input)).code,400);assert.equal(fs.readFileSync(file,'utf8'),saved);
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});
test('criteria preview linked to a cards scene saves its design without treating it as an overview return',async()=>{
 const ctx=fixture();try{
  const preview={...scene,layout:'overview',overviewMode:'preview',overviewSourceSceneId:'criteria',title:'三项判断',nodes:[{id:'task',text:'任务',atMs:500}]};
  const result=await caller(ctx)('save',{src:scene.src,scene:preview,captions:[],overviewSource:{...scene,id:'criteria',layout:'cards'}});
  assert.equal(result.code,200);
  const review=JSON.parse(fs.readFileSync(path.join(ctx.PUBLIC,'clips/reviews/raw.visual.json')));
  assert.ok(review.decisions.some(d=>d.kind==='scene-design'));assert.ok(!review.decisions.some(d=>d.kind==='overview-return'));
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});

test('recording start saves and reuses by source identity with bounded seeks and reversible history',async()=>{
 const ctx=fixture();try{
  const call=caller(ctx),demo={...scene,layout:'demo',startMs:104880,endMs:112990,
   media:{src:'broll-assets/demo.mp4',kind:'video',width:1920,height:1080,durationSec:10,startSec:.26,rate:1,camera:[{atMs:0,scale:1,x:0,y:0}]}};
  const first=await call('save',{src:scene.src,scene:demo,captions:[]});assert.equal(first.code,200);
  const file=path.join(ctx.PUBLIC,'clips/reviews/raw.visual.json'),read=()=>JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(read().decisions.find(d=>d.kind==='scene-design').design.mediaFraming.startSec,.26);
  const target={...demo,id:'regenerated',media:{...demo.media,startSec:0}},project={clips:[{id:'fresh',src:scene.src}],captions:[],presentation:{scenes:[target]}};
  const applied=applySourceVisualReviews(project,ctx);assert.equal(applied.project.presentation.scenes[0].media.startSec,.26);assert.deepEqual(applied.project.clips,project.clips);assert.deepEqual(applied.project.presentation.scenes[0].media.camera,demo.media.camera);
  const saved=fs.readFileSync(file,'utf8');assert.equal((await call('save',{src:scene.src,scene:{...demo,media:{...demo.media,startSec:2}},captions:[]})).code,400);assert.equal(fs.readFileSync(file,'utf8'),saved);
  const foreign={...project,presentation:{scenes:[{...target,media:{...target.media,src:'broll-assets/other.mp4'}}]}};
  assert.equal(applySourceVisualReviews(foreign,ctx).project.presentation.scenes[0].media.startSec,0);
  const second=await call('save',{src:scene.src,scene:{...demo,media:{...demo.media,startSec:.3}},captions:[]});assert.equal(second.code,200);
  assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,409);
  assert.equal((await call('undo',{src:scene.src,token:second.data.token})).code,200);assert.equal(applySourceVisualReviews(project,ctx).project.presentation.scenes[0].media.startSec,.26);
  assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,200);assert.deepEqual(applySourceVisualReviews(project,ctx).project,project);
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});
test('clocked visual saves initialize once, refuse cross-clock mixing, and undo the exact namespace history',async()=>{
 const ctx=fixture();try{
  const call=caller(ctx),sourceSha256=createHash('sha256').update('source fixture').digest('hex'),audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256,wavSha256:'a'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
  const first=await call('save',{...input,audioClock});assert.equal(first.code,200);
  const file=path.join(ctx.PUBLIC,'clips/reviews/raw.visual.json'),read=()=>JSON.parse(fs.readFileSync(file,'utf8')),saved=fs.readFileSync(file,'utf8');assert.deepEqual(read().audioClock,audioClock);
  for(const bad of [undefined,null,{}, {...audioClock,wavSha256:'b'.repeat(64)},{...audioClock,sourceSha256:'b'.repeat(64)},{...audioClock,sampleRate:1}]){
   assert.equal((await call('save',{...input,audioClock:bad})).code,400);assert.equal(fs.readFileSync(file,'utf8'),saved);
  }
  const second=await call('save',{...input,audioClock:{...audioClock,sourcePath:'different receipt location'},scene:{...scene,speaker:{...scene.speaker,scale:1.2}}});assert.equal(second.code,200);
  assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,409);
  assert.equal((await call('undo',{src:scene.src,token:second.data.token})).code,200);assert.equal(fs.readFileSync(file,'utf8'),saved);
  assert.equal((await call('undo',{src:scene.src,token:first.data.token})).code,200);assert.equal(read().audioClock,undefined);assert.deepEqual(read().decisions,[]);
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});
test('a populated legacy visual review cannot be silently migrated by a clocked save',async()=>{
 const ctx=fixture();try{
  const call=caller(ctx);assert.equal((await call('save',input)).code,200);
  const file=path.join(ctx.PUBLIC,'clips/reviews/raw.visual.json'),saved=fs.readFileSync(file,'utf8');
  const audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:createHash('sha256').update('source fixture').digest('hex'),wavSha256:'a'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
  assert.equal((await call('save',{...input,audioClock})).code,400);assert.equal(fs.readFileSync(file,'utf8'),saved);
 }finally{fs.rmSync(ctx.ROOT,{recursive:true,force:true});}
});
