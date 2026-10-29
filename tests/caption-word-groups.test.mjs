import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captionWordGroups,joinsLatinWord} from '../src/caption-word-groups.mjs';
test('ASR fragments of a Latin name stay in one layout group without changing timing tokens',()=>{
 const words=['给','A','gent','接上','RE','A'].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100,accent:i===2}));
 const groups=captionWordGroups(words);
 assert.deepEqual(groups.map(g=>g.map(w=>w.text).join('')),['给','Agent','接上','REA']);
 assert.deepEqual(groups.flat(),words);
 assert.equal(groups[1][1],words[2]);
});
test('explicit spaces and punctuation remain word boundaries',()=>{
 assert.equal(joinsLatinWord('AI ','Agent'),false);
 assert.equal(joinsLatinWord('AI',' Agent'),false);
 assert.equal(joinsLatinWord('Agent,','next'),false);
 assert.equal(joinsLatinWord('AG','ENT'),true);
});
test('hyphenated, dotted and accented identifiers stay together',()=>{
 for(const tokens of [['GPT','-4','o'],['Node','.js'],['Caf','é']]){
  assert.equal(captionWordGroups(tokens.map(text=>({text}))).length,1);
 }
});
test('confirmed names also protect model-inserted internal spaces without joining ordinary English',()=>{
 assert.equal(captionWordGroups(['Chat',' GPT'].map(text=>({text}))).length,1);
 assert.equal(captionWordGroups(['AI',' agents'].map(text=>({text}))).length,2);
});
test('display wraps at Chinese lexical and custom-name boundaries without changing highlight tokens',()=>{
 const words=[...'调用星河研究院，继续'].map((text,i)=>({text,startMs:i*100,endMs:i*100+100}));
 const result=captionWordGroups(words,['星河研究院']);
 assert.deepEqual(result.flat(),words);assert.ok(result.some(g=>g.map(w=>w.text).join('')==='调用'));assert.ok(result.some(g=>g.map(w=>w.text).join('')==='星河研究院，'));
});

test('layout keeps person suffixes and grammatical particles with their heads',()=>{
 const words=[...'开发者写的代码长得一样'].map(text=>({text}));
 const groups=captionWordGroups(words).map(g=>g.map(w=>w.text).join(''));
 assert.ok(groups.includes('开发者'));
 assert.ok(groups.includes('长得'));
 assert.deepEqual(captionWordGroups(words).flat(),words);
});
