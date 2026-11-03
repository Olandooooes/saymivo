import test from 'node:test';import assert from 'node:assert/strict';import {captionDisplayWords} from '../src/caption-display.mjs';
const make=texts=>texts.map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100,accent:false}));
test('display hides trailing punctuation even across tokens while preserving interior punctuation and all source data',()=>{
 const words=make(['先看，','再说','。','！？']),before=structuredClone(words);const result=captionDisplayWords(words);
 assert.equal(result.map(w=>w.text).join(''),'先看，再说');assert.deepEqual(words,before);assert.equal(result[1].startMs,100);assert.equal(result[1].endMs,200);
});
test('paired closing quotes survive and English names, decimals and symbols stay readable',()=>{
 for(const [input,expected]of [['他说：“继续。”','他说：“继续”'],['Node.js，版本3.14。','Node.js，版本3.14'],['C++!','C++'],['Agent,','Agent'],['继续……','继续']])assert.equal(captionDisplayWords(make([input])).map(w=>w.text).join(''),expected);
 const words=make(['正常','3.14']);assert.equal(captionDisplayWords(words),words);
});
test('punctuation-only page has no visible words without deleting the timed source',()=>{
 const words=make(['……']);assert.deepEqual(captionDisplayWords(words),[]);assert.equal(words[0].text,'……');
});
