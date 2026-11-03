import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWordEvidence} from '../scripts/retake-word-evidence.mjs';
const w=(id,word,startMs,endMs)=>({id,word,startMs,endMs});
test('a local overlap remains unresolved context while disjoint measured speech survives',()=>{
 const raw=[w(0,'开始',100,400),w(1,'待定一',700,1100),w(2,'待定二',1000,1200),w(3,'结束',1600,1900)];
 const r=prepareWordEvidence(raw);assert.deepEqual(r.words.map(w=>w.word),['开始','结束']);assert.equal(r.unresolved.length,1);assert.equal(r.unresolved[0].startMs,700);assert.equal(r.unresolved[0].endMs,1200);assert.equal(r.unresolved[0].contextOnly,true);
 assert.deepEqual(raw[1],w(1,'待定一',700,1100));
});
test('an isolated zero duration stays zero and is never assigned a fabricated sound interval',()=>{
 const r=prepareWordEvidence([w(0,'开始',100,400),w(1,'未定',700,700),w(2,'结束',1000,1400)]);
 assert.equal(r.unresolved[0].startMs,700);assert.equal(r.unresolved[0].endMs,700);assert.equal(r.words.length,2);
});
test('valid equal-time groups and ordinary word boundaries remain unchanged',()=>{
 const r=prepareWordEvidence([w(0,'平',100,100),w(1,'时',100,250),w(2,'完整',250,600)]);
 assert.equal(r.words[0].word,'平时');assert.deepEqual(r.unresolved,[]);assert.equal(r.words[0].startMs,100);assert.equal(r.words[0].endMs,250);
});
