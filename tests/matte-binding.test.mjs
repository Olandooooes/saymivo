import test from 'node:test';
import assert from 'node:assert/strict';
import {matteSceneSnapshot,sameMatteScene,validateMatteBinding} from '../editor/matte-binding.mjs';
const scene={id:'s',clipId:'c',src:'clips/synthetic.mp4',startMs:0,endMs:100};
const matte={src:scene.src,prefix:'broll-assets/synthetic/frame-',sourceSha256:'a'.repeat(64),width:16,height:9,
 sourceStartMs:0,fps:30,count:3,timesMs:[0,1000/30,2000/30],endMs:100};

test('binding uses the exact current scene source snapshot, not title or callback identity',()=>{
 assert.deepEqual(matteSceneSnapshot({...scene,title:'New title'}),scene);
 assert.equal(sameMatteScene(scene,{...scene,title:'New title'}),true);
 assert.equal(validateMatteBinding(matte,scene,{...scene,title:'New title'}).ok,true);
 for(const patch of [{id:'other'},{clipId:'other'},{src:'clips/other.mp4'},{startMs:1},{endMs:101}])assert.equal(validateMatteBinding(matte,scene,{...scene,...patch}).ok,false);
});
test('binding requires valid source proof, dimensions, complete ordered clocks and safe local prefix',()=>{
 for(const patch of [{sourceSha256:'fake'},{src:'clips/other.mp4'},{prefix:'https://outside/frames-'},{fps:NaN},{fps:0},
  {width:undefined},{height:0},{count:2},{timesMs:[0,0,66]},{timesMs:[0,33,NaN]},
  {sourceStartMs:1},{endMs:NaN},{endMs:1000}]){
  assert.equal(validateMatteBinding({...matte,...patch},scene,scene).ok,false,JSON.stringify(patch));
 }
});
test('last frame remains available at end minus one, missing first/last frames are rejected',()=>{
 assert.equal(validateMatteBinding(matte,scene,scene).ok,true);
 const late={...matte,sourceStartMs:30,timesMs:[30,30+1000/30,30+2000/30],endMs:130};
 assert.equal(validateMatteBinding(late,scene,scene).ok,false,'old one-frame tolerance accepted this missing first frame');
 assert.equal(validateMatteBinding({...matte,endMs:90},scene,scene).ok,false,'partial last frame may not silently disappear');
});
