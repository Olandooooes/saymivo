import test from 'node:test';import assert from 'node:assert/strict';import {editCaptionWords} from '../src/edit-caption-words.mjs';
const words=[{text:'AI Agent',startMs:3250,endMs:4450,accent:true},{text:'这么',startMs:4510,endMs:4690,accent:false},{text:'火',startMs:4690,endMs:4970,accent:false},{text:'它',startMs:5090,endMs:5190,accent:false},{text:'能帮你干什么?',startMs:5190,endMs:6310,accent:false}];
test('punctuation and English spacing edits keep every original word interval',()=>{
 const copy=structuredClone(words),result=editCaptionWords(words,'AI Agent这么火，它能帮你干什么？',3250,6310);
 assert.deepEqual(result.map(w=>[w.startMs,w.endMs]),words.map(w=>[w.startMs,w.endMs]));assert.equal(result[0].text,'AI Agent');assert.equal(result[2].text,'火，');assert.equal(result.at(-1).text,'能帮你干什么？');assert.deepEqual(words,copy);
});
test('a one-character correction does not retime neighboring words',()=>{
 const input=[{text:'他',startMs:1000,endMs:1200,accent:false},{text:'完成任务',startMs:1300,endMs:2400,accent:true}];
 const result=editCaptionWords(input,'它完成任务',1000,2400);assert.equal(result[0].text,'它');assert.deepEqual(result.map(w=>[w.startMs,w.endMs]),input.map(w=>[w.startMs,w.endMs]));assert.equal(result[1].accent,true);
});
