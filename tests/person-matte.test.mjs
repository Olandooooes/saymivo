import test from 'node:test';
import assert from 'node:assert/strict';
import {personMatteFrame} from '../src/person-matte.mjs';
test('person layer follows original source frames across retained cuts rather than restarting on scene entry',()=>{
 const matte={prefix:'broll-assets/person/frame-',sourceStartMs:377/30*1000,fps:30,count:99};
 assert.equal(personMatteFrame(matte,12570).index,0);
 assert.equal(personMatteFrame(matte,12570+2/30*1000).index,2);
 assert.equal(personMatteFrame(matte,12610).index,1);
 assert.equal(personMatteFrame(matte,matte.sourceStartMs+98/30*1000).index,98);
 assert.equal(personMatteFrame(matte,matte.sourceStartMs-100),null);
 assert.equal(personMatteFrame(matte,matte.sourceStartMs+99/30*1000),null);
 assert.equal(personMatteFrame(undefined,0),null);
 assert.equal(personMatteFrame({...matte,count:0},13000),null);
});
test('native source timestamps avoid one-frame drift after decoder boundary samples',()=>{
 const matte={prefix:'person/frame-',sourceStartMs:12566.667,fps:30,count:3,timesMs:[12566.667,12568.06,12601.4]};
 assert.equal(personMatteFrame(matte,12570).index,1);
 assert.equal(personMatteFrame(matte,12603.333).index,2);
 assert.equal(personMatteFrame(matte,12700),null);
});
