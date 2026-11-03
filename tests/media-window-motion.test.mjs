import {test} from 'node:test';import assert from 'node:assert/strict';
import {sampleMediaWindow,sampleMediaCamera} from '../src/scene-media.mjs';
test('outer image window moves and resizes independently of intrinsic camera',()=>{
 const media={windowKeyframes:[{atMs:0,x:.1,y:.1,width:.5,height:.5},{atMs:1000,x:0,y:0,width:1,height:1}],camera:[{atMs:0,scale:1,x:0,y:0},{atMs:1000,scale:1.5,x:4,y:8}]};
 assert.deepEqual(sampleMediaWindow(media,500),{x:.05,y:.05,width:.75,height:.75});assert.equal(sampleMediaCamera(media,500).scale,1.25);assert.deepEqual(sampleMediaWindow(media,2000),{x:0,y:0,width:1,height:1});
 for(let ms=0;ms<1000;ms+=13){const r=sampleMediaWindow(media,ms);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1&&r.y+r.height<=1);}
});
test('legacy geometry remains full panel and invalid keys cannot cause a negative crop',()=>{
 assert.deepEqual(sampleMediaWindow({},400),{x:0,y:0,width:1,height:1});assert.deepEqual(sampleMediaWindow({windowKeyframes:[{atMs:0,x:0,y:0,width:-1,height:1}]},0),{x:0,y:0,width:1,height:1});
});
