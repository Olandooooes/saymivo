import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeChineseCaptionTails} from '../src/caption-pages.mjs';
const page=(id,text,startMs,endMs,extra={})=>({id,clipId:'raw',startMs,endMs,topPct:84,scale:.65,words:[{text,startMs,endMs,accent:false}],...extra});
test('short Chinese sentence tail joins its own sentence with exact words and times intact',()=>{
 const pages=[page('a','这也是Agent最值得关注的',0,2800),page('b','地方。',2800,3040)];
 const before=structuredClone(pages),result=mergeChineseCaptionTails(pages);
 assert.equal(result.length,1);assert.equal(result[0].endMs,3040);assert.deepEqual(result.flatMap(p=>p.words),pages.flatMap(p=>p.words));assert.deepEqual(pages,before);
});
test('tail repair cannot cross clips, sentences, pauses, styles, motion or a wide line',()=>{
 const variants=[{clipId:'other'},{startMs:3300},{topPct:80},{scale:1},{motion:{kind:'emphasis'}}];
 for(const variant of variants)assert.equal(mergeChineseCaptionTails([page('a','这也是最值得关注的',0,2800),page('b','地方。',2800,3500,variant)]).length,2);
 assert.equal(mergeChineseCaptionTails([page('a','上一句。',0,2800),page('b','第一，',2800,3040)]).length,2);
 assert.equal(mergeChineseCaptionTails([page('a','长'.repeat(24),0,2800),page('b','地方。',2800,3040)]).length,2);
});
test('whole English term can join a Chinese clause, without changing any spelling',()=>{
 const result=mergeChineseCaptionTails([page('a','最近经常提到一个词叫',0,2800),page('b','Agent,',2800,3320)]);
 assert.equal(result.length,1);assert.equal(result[0].words[1].text,'Agent,');
});

test('word-aware pages keep a Chinese lexical word and explicit topic turn together without retiming',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=[...'再整理成一份你能检查的结果关键的变化就是从回答一个问题走向执行一项任务但这里有个误区'].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}));
 const before=structuredClone(words),groups=readableCaptionWordGroups(words);
 assert.deepEqual(groups.flat(),words);assert.deepEqual(words,before);
 assert.ok(groups.some(g=>g.map(w=>w.text).join('').startsWith('关键的变化')));
 assert.ok(!groups.some(g=>g.map(w=>w.text).join('').endsWith('关键的变')));
 assert.ok(groups.some(g=>g.map(w=>w.text).join('').startsWith('但这里')));
});
test('readable grouping respects punctuation and pauses and does not invent splits inside ASR words',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=[{text:'第一句。',startMs:0,endMs:1000},{text:'下一句',startMs:1000,endMs:2000},{text:'停顿后',startMs:2500,endMs:3000}];
 assert.equal(readableCaptionWordGroups(words).length,3);
 const long={text:'完整识别词不能均分时间'.repeat(3),startMs:0,endMs:1000};
 assert.deepEqual(readableCaptionWordGroups([long]),[[long]]);
});

 test('connective 不代表 cannot be split or stranded at a page end',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=[...'但这里有个误区能自己执行不代表每一步都可靠'].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}));
 const groups=readableCaptionWordGroups(words).map(g=>g.map(w=>w.text).join(''));
 assert.ok(!groups.some(s=>/不$|不代表$/.test(s)));assert.ok(groups.some(s=>s.includes('不代表')));
});

test('domain phrases stay whole even when ASR uses individual characters and narrow page widths',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 for(const phrase of ['竞品分析','整理表格'])for(const maxWidth of [3,4,8,15]){
  const words=[...('你来准备一份'+phrase+'然后继续')].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}));
  const before=structuredClone(words),groups=readableCaptionWordGroups(words,{maxWidth});
  assert.deepEqual(groups.flat(),words);assert.deepEqual(words,before);
  assert.ok(groups.some(g=>g.map(w=>w.text).join('').includes(phrase)),`${phrase} width ${maxWidth}`);
 }
});
test('an ordinal at the end of a clause starts a new page and cannot be merged back as a short tail',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=['他','能不能','把任务','真正','做完','第二'].map((text,i)=>({text,startMs:i*300,endMs:(i+1)*300}));
 const groups=readableCaptionWordGroups(words);
 assert.equal(groups.at(-1).map(w=>w.text).join(''),'第二');
 const pages=groups.map((words,i)=>({...page(String(i),'',words[0].startMs,words.at(-1).endMs),words}));
 assert.equal(mergeChineseCaptionTails(pages).at(-1).words[0].text,'第二');
 assert.deepEqual(mergeChineseCaptionTails(pages).flatMap(p=>p.words),words);
});
test('ordinary second-day wording stays intact and a protected phrase does not bridge a real pause',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=['第二天','我们','整理表格'].map((text,i)=>({text,startMs:i*300,endMs:(i+1)*300}));
 assert.equal(readableCaptionWordGroups(words)[0][0].text,'第二天');
 const paused=[{text:'竞品',startMs:0,endMs:500},{text:'分析',startMs:1500,endMs:2000}];
 assert.equal(readableCaptionWordGroups(paused).length,2);
});
test('a quoted example and following condition use separate semantic pages without splitting the noun',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=[...'举个例子你说帮我准备一份竞品分析如果AI给你一个框架'].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}));
 const groups=readableCaptionWordGroups(words);const strings=groups.map(g=>g.map(w=>w.text).join(''));
 assert.ok(strings.some(s=>s.startsWith('你说')&&s.includes('竞品分析')));assert.ok(strings.some(s=>s.startsWith('如果')));
 assert.deepEqual(groups.flat(),words);
});
test('a source-timed ordinal retains its own cue after its pause shrinks below the general gap threshold',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 const words=[{text:'第一',startMs:74440,endMs:75000},{text:'他能不能把任务真正做完',startMs:75170,endMs:77670}];
 assert.deepEqual(readableCaptionWordGroups(words),words.map(w=>[w]));assert.deepEqual(readableCaptionWordGroups([{text:'第二',startMs:0,endMs:200},{text:'天',startMs:200,endMs:400}]).flat(),[{text:'第二',startMs:0,endMs:200},{text:'天',startMs:200,endMs:400}]);
});

test('Latin names cannot be cut at terminal fallback or narrow widths',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 for(const term of ['Agent','REA','ChatGPT','OpenAI','Notion','UnknownProduct42'])for(const maxWidth of [1,3,5,15]){
  const words=[...('介绍'+term+'的功能')].map((text,i)=>({text,startMs:i*80,endMs:(i+1)*80}));
  const groups=readableCaptionWordGroups(words,{maxWidth});
  assert.deepEqual(groups.flat(),words);
  assert.ok(groups.some(g=>g.map(w=>w.text).join('').includes(term)),term+' '+maxWidth);
 }
});
test('confirmed names with recognizer-inserted spaces stay on the same page',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 for(const name of ['Chat GPT','A g e n t','Open AI']){
  const words=[...'介绍'+name+'的功能'].map((text,i)=>({text,startMs:i*50,endMs:(i+1)*50}));
  assert.ok(readableCaptionWordGroups(words,{maxWidth:3}).some(g=>g.map(w=>w.text).join('').includes(name)));
 }
});
test('common verbs stay whole, conjunctions introduce a clause and short complements do not become orphan pages',async()=>{
 const {readableCaptionWordGroups}=await import('../src/caption-pages.mjs');
 for(const text of ['上一段讲了AI Agent可以调用工具一步步完成任务而它还有其他能力','它把Agent接到专门的分析工具上,','先说它是怎么工作的平时我们让AI做一个类似的软件']){
  const words=[...text].map((text,i)=>({text,startMs:i*100,endMs:i*100+100}));
  const groups=readableCaptionWordGroups(words),strings=groups.map(g=>g.map(w=>w.text).join(''));
  assert.deepEqual(groups.flat(),words);assert.ok(!strings.some(s=>/调$|但$|而$|平时$/.test(s)));assert.ok(!strings.some(s=>/^上[,，]?$/.test(s)));
 }
 const words=[...'但它到底能做到哪一步我看完项目介绍觉得值得聊'].map((text,i)=>({text,startMs:i*100,endMs:i*100+100}));
 assert.ok(!readableCaptionWordGroups(words).some(g=>g.map(w=>w.text).join('')==='但'));
});
