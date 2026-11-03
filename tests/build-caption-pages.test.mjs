import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCaptionPages} from '../src/build-caption-pages.mjs';
const input=texts=>texts.map((word,i)=>({word,clipId:'source',srcStartMs:i*100,srcEndMs:(i+1)*100}));
test('production caption builder preserves fragmented names, timing and accents',()=>{
 const words=input([...('前面的中文足够长需要字幕分句然后给'),'AG','ENT','继续解释']);
 const pages=buildCaptionPages(words,[words.length-2]);
 assert.ok(pages.some(p=>p.words.map(w=>w.text).join('').includes('AGENT')));
 assert.deepEqual(pages.flatMap(p=>p.words).map(w=>[w.text,w.startMs,w.endMs]),words.map(w=>[w.word,w.srcStartMs,w.srcEndMs]));
 assert.equal(pages.flatMap(p=>p.words).find(w=>w.text==='ENT').accent,true);
});
test('real clip edits and long pauses remain hard boundaries',()=>{
 const words=input(['AG','ENT']);words[1].clipId='other';
 assert.equal(buildCaptionPages(words).length,2);
 words[1].clipId='source';words[1].srcStartMs=2000;words[1].srcEndMs=2200;
 assert.equal(buildCaptionPages(words).length,2);
});
test('recognizer word boundaries preserve English spaces but subwords stay joined',()=>{
 const words=input(['给','re','verse','engineer','anything','解释']);
 words[3].spaceBefore=true;words[4].spaceBefore=true;
 const result=buildCaptionPages(words).flatMap(p=>p.words);
 assert.equal(result.map(w=>w.text).join(''),'给reverse engineer anything解释');
 assert.deepEqual(result.map(w=>[w.startMs,w.endMs]),words.map(w=>[w.srcStartMs,w.srcEndMs]));
});
