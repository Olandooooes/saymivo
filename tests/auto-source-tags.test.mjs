import test from 'node:test';import assert from 'node:assert/strict';import {sourceContrastTags} from '../src/auto-source-tags.mjs';
const sentence='关键的变化就是从回答一个问题走向执行一项任务但这里有个误区';
const words=[...sentence].map((text,i)=>({text,startMs:1000+i*100,endMs:1100+i*100}));
const scene={id:'contrast',startMs:1000,endMs:6000};
test('contrast labels preserve source wording and exact anchor times, exit before next topic',()=>{
 const tags=sourceContrastTags(scene,words);assert.deepEqual(tags.map(t=>t.text),['回答一个问题','执行一项任务']);
 assert.equal(tags[0].atMs,sentence.indexOf('回答')*100);assert.equal(tags[1].atMs,sentence.indexOf('执行')*100);
 assert.equal(tags[0].endMs,sentence.indexOf('但')*100+450);assert.equal(tags[0].endMs,tags[1].endMs);
});
test('no labels for absent or ambiguous contrasts, or out-of-scene source words',()=>{
 assert.deepEqual(sourceContrastTags(scene,words.filter(w=>!['走','向'].includes(w.text))),[]);
 assert.deepEqual(sourceContrastTags({...scene,endMs:2000},words),[]);
 assert.deepEqual(sourceContrastTags({...scene,endMs:12000},[...words,...words.map(w=>({...w,startMs:w.startMs+5000,endMs:w.endMs+5000}))]),[]);
});

test('three manual action labels use distinct source onsets and retain the human-work context',async()=>{
 const {sourceManualTaskTags}=await import('../src/auto-source-tags.mjs');const sentence='接下来找资料核对信息整理表格还是得你自己做';
 const words=[...sentence].map((text,i)=>({text,startMs:1000+i*100,endMs:1100+i*100}));const scene={id:'manual',startMs:1000,endMs:4000};
 const before=structuredClone(words),tags=sourceManualTaskTags(scene,words);assert.deepEqual(tags.map(t=>t.text),['找资料','核对信息','整理表格']);assert.deepEqual(tags.map(t=>t.atMs),[300,600,1000]);assert.ok(tags.every(t=>t.endMs===3000));assert.deepEqual(words,before);
 assert.deepEqual(sourceManualTaskTags(scene,words.slice(0,-7)),[]);assert.deepEqual(sourceManualTaskTags(scene,[{text:sentence,startMs:1000,endMs:3000}]),[]);
});

test('emphasis copies source phrases and exact word onsets; foreign and clipped phrases stay absent',async()=>{
 const {sourceEmphasisTags}=await import('../src/auto-source-tags.mjs');
 const scene={id:'s',startMs:1000,endMs:7000};
 const words=[{text:'竞品分析',startMs:1500,endMs:2300},{text:'分析框架',startMs:4000,endMs:4900},{text:'理解错要求',startMs:6900,endMs:7500}];
 const before=structuredClone(words),tags=sourceEmphasisTags(scene,words);
 assert.deepEqual(tags.map(t=>[t.text,t.atMs,t.endMs]),[['竞品分析',500,3000],['分析框架',3000,6000]]);
 assert.deepEqual(words,before);assert.deepEqual(sourceEmphasisTags(scene,[{text:'完全不同的内容',startMs:1500,endMs:4000}]),[]);
});

test('explicit naming supports other topics without inventing phrases or emphasis for negated names',async()=>{
 const {sourceEmphasisTags}=await import('../src/auto-source-tags.mjs');
 const scene={id:'new-topic',startMs:1000,endMs:12000};
 const timed=text=>[...text].map((text,i)=>({text,startMs:1100+i*120,endMs:1220+i*120}));
 const words=timed('这个方法叫做检索增强生成。另一个称为向量检索。');
 const before=structuredClone(words),tags=sourceEmphasisTags(scene,words);
 assert.deepEqual(tags.map(t=>t.text),['检索增强生成','向量检索']);
 assert.equal(tags[0].atMs,words.find(w=>w.text==='检').startMs-scene.startMs);
 assert.ok(tags.every(t=>t.atMs>=0&&t.endMs<=11000&&t.endMs>t.atMs));assert.deepEqual(words,before);
 for(const text of ['这不叫做检索增强生成。','这不能称为检索增强生成。','这不是叫做检索增强生成。','它没有特别的名字。','这个称为一种更好的方法。','它叫做一段很长很长很长很长很长的无法当作关键词的解释。'])assert.deepEqual(sourceEmphasisTags(scene,timed(text)),[]);
});
test('UTF16 regex offsets preserve source word anchors after emoji',async()=>{
 const {sourceEmphasisTags}=await import('../src/auto-source-tags.mjs');
 const tags=sourceEmphasisTags({id:'emoji',startMs:1000,endMs:6000},[{text:'😀',startMs:1000,endMs:1500},{text:'竞品分析',startMs:2000,endMs:3000}]);
 assert.equal(tags[0].atMs,1000);assert.equal(tags[0].text,'竞品分析');
});
test('distinctive mixed-case source identifiers receive emphasis without repairing uncertain ASR',async()=>{
 const {sourceEmphasisTags}=await import('../src/auto-source-tags.mjs');
 const scene={id:'unknown',startMs:6000,endMs:13000};
 const words=[{text:'一个Skyo非常火爆做',startMs:6500,endMs:10580},{text:'HowToLiveBetter',startMs:10580,endMs:12048},{text:'。',startMs:12048,endMs:12080}];const before=structuredClone(words);
 const tags=sourceEmphasisTags(scene,words);assert.deepEqual(tags.map(t=>t.text),['HowToLiveBetter']);assert.equal(tags[0].atMs,4580);assert.deepEqual(words,before);
 for(const text of ['Skyo','Agent','PLEASE','ordinary','howtolivebetter'])assert.deepEqual(sourceEmphasisTags(scene,[{text,startMs:6500,endMs:8000}]),[]);
});
test('explicit comparison and closing question copy literal source spans without repairing wording',async()=>{
 const {sourceEmphasisTags}=await import('../src/auto-source-tags.mjs');const text='它被译为当代的齐民要术那么他们究竟是什么呢？';
 const words=[...text].map((text,i)=>({text,startMs:1000+i*130,endMs:1130+i*130})),before=structuredClone(words),scene={id:'comparison',startMs:1000,endMs:5000};
 const tags=sourceEmphasisTags(scene,words);assert.deepEqual(tags.map(t=>t.text),['当代的齐民要术','究竟是什么呢']);assert.equal(tags[0].atMs,text.indexOf('当')*130);assert.equal(tags[0].endMs,tags[1].atMs);assert.deepEqual(words,before);
 const neg='它没有被称为当代的齐民要术。';assert.deepEqual(sourceEmphasisTags(scene,[...neg].map((text,i)=>({text,startMs:1000+i*100,endMs:1100+i*100}))),[]);
});
