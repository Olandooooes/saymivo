import test from 'node:test';import assert from 'node:assert/strict';import {chapterSweep} from '../src/chapter-entry.mjs';
test('sweep waits for person, enters with horizontal blur, overshoots and settles deterministically',()=>{
 assert.equal(chapterSweep(99).opacity,0);assert.ok(chapterSweep(180).blurX>chapterSweep(180).blurY);assert.equal(chapterSweep(300).x,30);assert.deepEqual(chapterSweep(700),{x:0,opacity:1,blurX:0,blurY:0});
 for(let ms=0;ms<1000;ms++){const s=chapterSweep(ms);assert.ok(Object.values(s).every(Number.isFinite));assert.ok(s.x<=30&&s.opacity>=0&&s.opacity<=1);}
});
