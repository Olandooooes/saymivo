import test from 'node:test';import assert from 'node:assert/strict';
import {resolveMediaCues,validRegionTemplates} from '../src/media-cues.mjs';
import {bindAutomaticSceneMedia} from '../src/auto-scene-media.mjs';
const scene={id:'risk',clipId:'raw',src:'clips/raw.mp4',layout:'speaker',title:'检查',startMs:1000,endMs:6000,sourceText:'做完了却没检查，结果跑偏',sourceCaptionIds:['c']};
const captions=[{id:'c',words:[{text:'做完了却没检查',startMs:1800,endMs:3000},{text:'结果跑偏',startMs:4200,endMs:5200}]}];
const first={id:'first',cue:'做完了却没检查',mode:'spotlight',x:.1,y:.5,w:.8,h:.1},second={...first,id:'second',cue:'结果跑偏',y:.65};
test('authored regions and camera follow unique source-word cues rather than fixed guessed times',()=>{
 const asset={regions:[first,second,{...first,id:'mark',mode:'highlight',endCue:'结果跑偏'}],cameraHints:[{cue:first.cue,scale:1.1,x:-2,y:-3}]};
 const result=resolveMediaCues(scene,asset,captions);assert.deepEqual(result.highlights.map(h=>h.atMs),[800,3200,800]);assert.equal(result.highlights[0].endMs,3200);assert.equal(result.highlights[2].endMs,3200);assert.equal(result.camera[1].atMs,800);assert.equal(result.highlights[0].x,first.x);
});
test('missing, ambiguous and unrelated caption cues never produce guessed annotations',()=>{
 for(const input of [[],[{id:'other',words:captions[0].words}],[{id:'c',words:[...captions[0].words,{text:first.cue,startMs:5400,endMs:5800}]}]]){
  const result=resolveMediaCues(scene,{regions:[first]},input);assert.equal(result.highlights.length,0);assert.equal(result.report[0].status,'skipped');
 }
 assert.equal(validRegionTemplates([{...first,x:.9,w:.5}]),false);
});
test('registered image templates become editable spotlight scenes with explicit unresolved-cue warnings',()=>{
 const asset={id:'check',src:'broll-assets/check.svg',kind:'image',width:1600,height:900,label:'本人讲义',keywords:['没检查','跑偏'],regions:[first,second]};
 const result=bindAutomaticSceneMedia([scene],[asset],captions);assert.equal(result.scenes[0].layout,'spotlight');assert.equal(result.scenes[0].highlights.length,2);assert.equal(result.scenes[0].media.cursor,undefined);
 const missing=bindAutomaticSceneMedia([scene],[asset],[]);assert(missing.scenes[0].missing);assert.equal(missing.scenes[0].highlights,undefined);
});
