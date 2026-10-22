import test from 'node:test';
import assert from 'node:assert/strict';
import {lectureTransition,withLecturePageTransitions,closingTextTransition} from '../src/lecture-transition.mjs';
test('lecture-to-outro has no simultaneous readable text, while speaker transitions remain untouched',()=>{
 for(const layout of ['overview','cards','flow','demo','spotlight'])for(const fps of [24,30,60]){
  for(let frame=0;frame<=fps;frame++){
   const t=closingTextTransition(layout,'outro',frame/fps);assert.equal(t.separate,true);assert.ok(t.incoming*t.outgoing<1e-10);
  }
 }
 for(const [from,to] of [['speaker','outro'],['headline','speaker'],['overview','cards']])assert.deepEqual(closingTextTransition(from,to,.5),{separate:false,outgoing:1,incoming:1});
});
test('lecture pages keep old and new text temporally separate at rendered frame rates',()=>{
 for(const fps of [24,30,60])for(const duration of [200,400,1000]){
  let previousOld=1,previousNew=0;
  for(let frame=0;frame<=Math.ceil(duration*fps/1000);frame++){
   const p=lectureTransition(frame/fps*1000/duration);
   assert(p.outgoing>=0&&p.outgoing<=previousOld);
   assert(p.incoming>=previousNew&&p.incoming<=1);
   assert.equal(p.incoming*p.outgoing,0,'no superimposed readable contents');
   previousOld=p.outgoing;previousNew=p.incoming;
  }
 }
 assert.equal(lectureTransition(0).outgoing,1);
 assert.equal(lectureTransition(1).incoming,1);
});
test('one page pose preserves both edited endpoints and stays continuous between them',()=>{
 const from={rotateY:-12,rotateZ:6,perspective:1200},to={rotateY:10,rotateZ:-4,perspective:4500};
 assert.deepEqual(lectureTransition(-1,from,to).pose,from);
 assert.deepEqual(lectureTransition(2,from,to).pose,to);
 assert.deepEqual(lectureTransition(.5,from,to).pose,{rotateY:-1,rotateZ:1,perspective:2850});
 assert(Math.abs(lectureTransition(.501,from,to).pose.rotateY-lectureTransition(.499,from,to).pose.rotateY)<.1);
 assert.deepEqual(lectureTransition(0).pose,{rotateY:-1.5,rotateZ:-.3,perspective:2400});
});
test('automatic page timing preserves authored cuts, gaps, sources and input data',()=>{
 const scene=(id,layout,startMs,endMs,extra={})=>({id,clipId:'raw',src:'clips/raw.mp4',layout,startMs,endMs,...extra});
 const scenes=[scene('a','stack',0,1000),scene('b','flow',1000,2000),scene('c','cards',2000,3000,{transitionMs:0}),scene('d','overview',3500,4000),scene('e','flow',4000,5000,{src:'clips/other.mp4'}),scene('f','speaker',5000,6000),scene('g','overview',6000,7000)];
 const snapshot=structuredClone(scenes),out=withLecturePageTransitions(scenes);
 assert.equal(out[1].transitionMs,400);assert.equal(out[2].transitionMs,0);
 for(const i of [0,3,4,5,6])assert.equal(out[i].transitionMs,undefined);
 assert.deepEqual(scenes,snapshot);
 assert.deepEqual(out.map(({transitionMs,...s})=>s),scenes.map(({transitionMs,...s})=>s));
});
