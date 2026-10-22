import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {captureSceneDesign,reviewedSceneDesign} from '../server/scene-design-review.mjs';
import {applyVisualReview} from '../server/source-visual-reviews.mjs';
const scene={id:'new-scene',clipId:'new-clip',src:'clips/raw.mp4',layout:'headline',startMs:1000,endMs:5000,sourceText:'同一句原话',title:'自动标题',sourceCaptionIds:['new-caption']};
test('reviewed scene appearance survives regenerated IDs without replacing source identity or user colour',()=>{
 const reviewed={...scene,title:'精修标题',tags:[{id:'right',text:'重点',x:.69,y:.12,atMs:500,endMs:3000}],tagTreatment:'kinetic'};
 const p={clips:[{id:scene.clipId,src:scene.src,inSec:1,outSec:5}],captions:[],presentation:{displayFont:'source-han',emphasisTheme:'tech-indigo',scenes:[scene]}};
 const decision={kind:'scene-design',layout:'headline',anchor:scene,design:captureSceneDesign(reviewed)},before=structuredClone(p);
 const result=applyVisualReview(p,{version:1,decisions:[decision]},scene.src);
 assert.equal(result.report[0].status,'applied');assert.equal(result.project.presentation.scenes[0].title,'精修标题');assert.equal(result.project.presentation.scenes[0].id,'new-scene');assert.deepEqual(result.project.presentation.scenes[0].sourceCaptionIds,['new-caption']);assert.equal(result.project.presentation.emphasisTheme,'tech-indigo');assert.deepEqual(p,before);
 for(const changed of [{...scene,layout:'speaker'},{...scene,sourceText:'另一句原话'}]){
  assert.equal(applyVisualReview({...p,presentation:{scenes:[changed]}},{version:1,decisions:[decision]},scene.src).report[0].status,'skipped');
 }
});
test('node timings follow matching text and reject changed node content',()=>{
 const target={...scene,layout:'cards',nodes:[{id:'fresh-a',text:'任务',atMs:0},{id:'fresh-b',text:'依据',atMs:200}]};
 const design=captureSceneDesign({...target,nodes:[{...target.nodes[0],atMs:300},{...target.nodes[1],atMs:800,focusMs:1200}]});
 const result=reviewedSceneDesign(target,design);assert.equal(result.scene.nodes[1].id,'fresh-b');assert.equal(result.scene.nodes[1].focusMs,1200);
 assert.equal(reviewedSceneDesign({...target,nodes:[target.nodes[0],{...target.nodes[1],text:'其他'}]},design).error,'changed-design-nodes');
 assert.ok(reviewedSceneDesign(target,{...design,startMs:0}).error);
 assert.ok(reviewedSceneDesign(target,{tags:[{id:'bad',text:'越界',x:.7,y:.9,atMs:0,endMs:9000}]}).error);
});
test('source matte reuse rejects missing frames, traversal and invalid timestamps',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-design-matte-'));
 try{
  const target={...scene,layout:'chapter'},personMatte={prefix:'broll-assets/person/frame-',sourceStartMs:1000,fps:30,count:2,timesMs:[1000,1033]};
  assert.equal(reviewedSceneDesign(target,{titleTreatment:'embedded',personMatte},{PUBLIC}).error,'missing-design-matte');
  fs.mkdirSync(path.join(PUBLIC,'broll-assets/person'),{recursive:true});for(const n of ['00000','00001'])fs.writeFileSync(path.join(PUBLIC,'broll-assets/person/frame-'+n+'.png'),'existence fixture');
  assert.ok(reviewedSceneDesign(target,{titleTreatment:'embedded',personMatte},{PUBLIC}).scene);
  assert.ok(reviewedSceneDesign(target,{personMatte:{...personMatte,prefix:'../outside'}},{PUBLIC}).error);
  assert.equal(reviewedSceneDesign(target,{personMatte:{...personMatte,timesMs:[1033,1000]}},{PUBLIC}).error,'invalid-design-matte-times');
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
test('media fit is restored only for the same media, and explicit absence of tags clears generated emphasis',()=>{
 const target={...scene,layout:'demo',media:{src:'broll-assets/recording.mp4',kind:'video',fit:'contain'},tags:[{id:'auto',text:'自动词',x:.04,y:.1,atMs:0,endMs:2000}]};
 const design=captureSceneDesign({...target,tags:undefined,media:{...target.media,fit:'cover'}});
 const result=reviewedSceneDesign(target,design);assert.equal(result.scene.media.fit,'cover');assert.deepEqual(result.scene.tags,[]);
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,src:'broll-assets/other.mp4'}},design).error,'changed-design-media');
});
test('speech text cues and recorded-media focus persist by content identity without changing source timing',()=>{
 const target={...scene,layout:'cards',nodes:[{id:'new-task',text:'把任务做完',atMs:0}]};
 const design=captureSceneDesign({...target,nodes:[{...target.nodes[0],textCues:[{text:'做完',atMs:1700}]}]});
 const restored=reviewedSceneDesign(target,design).scene;
 assert.deepEqual(restored.nodes[0].textCues,[{text:'做完',atMs:1700}]);assert.equal(restored.startMs,target.startMs);assert.equal(restored.endMs,target.endMs);
 assert.ok(reviewedSceneDesign(target,{...design,nodeTimings:[{...design.nodeTimings[0],textCues:[{text:'编造',atMs:1700}]}]}).error);
 assert.ok(reviewedSceneDesign(target,{...design,nodeTimings:[{...design.nodeTimings[0],textCues:[{text:'做完',atMs:6000}]}]}).error);
 const mediaScene={...scene,layout:'demo',media:{src:'broll-assets/demo.mp4',kind:'video',width:2400,height:790}};
 const authored={...mediaScene,media:{...mediaScene.media,camera:[{atMs:0,scale:1,x:0,y:0},{atMs:1000,scale:1.25,x:-10,y:5}]},highlights:[{id:'focus',mode:'spotlight',x:.1,y:.2,w:.5,h:.2,atMs:1000,endMs:3000}]};
 const mediaDesign=captureSceneDesign(authored),replayed=reviewedSceneDesign(mediaScene,mediaDesign).scene;
 assert.deepEqual(replayed.media.camera,authored.media.camera);assert.deepEqual(replayed.highlights,authored.highlights);
 assert.equal(reviewedSceneDesign({...mediaScene,media:{...mediaScene.media,src:'broll-assets/other.mp4'}},mediaDesign).error,'changed-design-media');
 assert.equal(reviewedSceneDesign(mediaScene,{highlights:authored.highlights}).error,'unbound-design-highlights');
});

test('tag animation timings survive scene-design capture and replay without moving the spoken cue',()=>{
 const tag={id:'question',text:'两行\n问题',x:.69,y:.12,atMs:500,endMs:3000};
 const target={...scene,layout:'speaker',tagTreatment:'kinetic',tags:[tag]};
 const authored={...target,tags:[{...tag,animation:{inMs:0,outMs:190,lineDelayMs:42},lineAtMs:[500,1400]}]};
 const design=captureSceneDesign(authored),replayed=reviewedSceneDesign(target,design).scene;
 assert.deepEqual(replayed.tags[0].animation,{inMs:0,outMs:190,lineDelayMs:42});
 assert.deepEqual(replayed.tags[0].lineAtMs,[500,1400]);
 assert.equal(replayed.tags[0].atMs,tag.atMs);assert.equal(replayed.tags[0].endMs,tag.endMs);
 assert.equal(target.tags[0].animation,undefined);
 assert.equal(reviewedSceneDesign(target,{tags:[{...tag,animation:{inMs:2000,outMs:2000,lineDelayMs:500}}]}).scene.tags[0].atMs,500);
 for(const animation of [null,[],false,{inMs:-1},{outMs:2001},{lineDelayMs:501},{inMs:NaN},{outMs:Infinity},{curve:'other'}]){
  assert.equal(reviewedSceneDesign(target,{tags:[{...tag,animation}]}).error,'invalid-scene-design');
 }
 assert.equal(reviewedSceneDesign(target,{tags:[{...tag,animation:{}}]}).scene.tags[0].atMs,500);
 for(const lineAtMs of [null,[],[500],[500,1000,1500],[NaN,1000],[499,1000],[500,3000],[1200,1100]]){
  assert.equal(reviewedSceneDesign(target,{tags:[{...tag,lineAtMs}]}).error,'invalid-scene-design');
 }
 assert.deepEqual(reviewedSceneDesign(target,{tags:[{...tag,lineAtMs:[499.9995,1000]}]}).scene.tags[0].lineAtMs,[499.9995,1000]);
 assert.deepEqual(reviewedSceneDesign(target,{tags:[{...tag,lineAtMs:[500,500]}]}).scene.tags[0].lineAtMs,[500,500]);
});

test('media start offsets persist for the same recording and fit its available duration and rate',()=>{
 const target={...scene,layout:'demo',startMs:104880,endMs:112990,
  media:{src:'broll-assets/demo.mp4',kind:'video',width:1920,height:1080,durationSec:10,startSec:0,rate:1,camera:[{atMs:0,scale:1,x:0,y:0}]} };
 const authored={...target,media:{...target.media,startSec:.26}},before=structuredClone(target);
 const design=captureSceneDesign(authored),restored=reviewedSceneDesign(target,design).scene;
 assert.equal(design.mediaFraming.startSec,.26);assert.equal(restored.media.startSec,.26);
 assert.equal(restored.startMs,target.startMs);assert.equal(restored.endMs,target.endMs);assert.deepEqual(restored.media.camera,target.media.camera);assert.equal(restored.media.rate,1);assert.deepEqual(target,before);
 for(const startSec of [-1,NaN,Infinity,1.9,10])assert.ok(reviewedSceneDesign(target,{...design,mediaFraming:{...design.mediaFraming,startSec}}).error);
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,rate:2}},design).error,'out-of-bounds-design-media-start');
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,rate:NaN}},design).error,'invalid-design-media-start');
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,src:'broll-assets/other.mp4'}},design).error,'changed-design-media');
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,durationSec:undefined}},design).error,'unknown-design-media-duration');
 assert.equal(reviewedSceneDesign({...target,media:{...target.media,kind:'image'}},design).error,'invalid-design-media-start');
 const oldDesign={mediaFraming:{src:target.media.src,fit:'cover'}};
 assert.equal(reviewedSceneDesign(authored,oldDesign).scene.media.startSec,.26,'legacy design without a start offset keeps the target offset');
 const frozen={...target,media:{...target.media,freezeAtSec:9.5}};
 assert.equal(reviewedSceneDesign(frozen,design).scene.media.startSec,.26,'frozen media does not consume scene-length playback');
 assert.ok(reviewedSceneDesign({...frozen,media:{...frozen.media,freezeAtSec:10}},design).error);
});
