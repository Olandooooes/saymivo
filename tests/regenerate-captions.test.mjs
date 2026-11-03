import test from 'node:test';import assert from 'node:assert/strict';import {regenerateCaptions} from '../src/regenerate-captions.mjs';
const c=(id,clipId,text)=>({id,clipId,startMs:0,endMs:1000,words:[{text,startMs:0,endMs:1000}]});
test('regeneration replaces already-covered old subtitles while preserving a failed source',()=>{
 const existing=[c('old','a','旧错字'),c('b','b','另一个来源')],before=structuredClone(existing);
 const fresh=[c('new','a','新校对')];
 const output=regenerateCaptions(existing,fresh,[{id:'a'},{id:'b'}]);
 assert.deepEqual(output.map(c=>c.words[0].text),['另一个来源','新校对']);assert.deepEqual(existing,before);
});
test('empty or foreign generation cannot erase the current subtitles',()=>{
 assert.throws(()=>regenerateCaptions([c('old','a','原字幕')],[c('foreign','z','错误来源')],[{id:'a'}]));
});
