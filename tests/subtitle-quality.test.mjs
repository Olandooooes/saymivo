import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {styleCaptions} from '../server/auto-plan.mjs';
import {mergeChineseCaptionTails,readableCaptionWordGroups} from '../src/caption-pages.mjs';
import {normalizeSubtitleTerms} from '../src/subtitle-terms.mjs';

const joined=words=>words.map(w=>w.text).join('');
const timed=text=>[...text].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100}));
const pages=words=>readableCaptionWordGroups(words).map((words,i)=>({id:String(i),clipId:'raw',startMs:words[0].startMs,endMs:words.at(-1).endMs,words}));

test('confirmed technical terms normalize inside a token while ordinary English spaces survive',()=>{
 assert.equal(normalizeSubtitleTerms('AI ag ent, Chat GPT and Open AI'),'AI Agent, ChatGPT and OpenAI');
 assert.equal(normalizeSubtitleTerms('AI agents can help me'),'AI agents can help me');
 const words=[{text:'所以我判断一个',startMs:100,endMs:500},{text:'ag ent',startMs:500,endMs:780},{text:'好不好用',startMs:780,endMs:1100}];
 const result=styleCaptions([{id:'c',clipId:'raw',startMs:100,endMs:1100,words}],[{id:'raw',inSec:0,outSec:2}]);
 assert.deepEqual(result.flatMap(c=>c.words),words.map(w=>({...w,text:normalizeSubtitleTerms(w.text)})));
 assert.equal(words[1].text,'ag ent');
});

test('reliability conclusion ends before the error list without adding punctuation or retiming',()=>{
 const words=timed('不代表每一步都可靠找错资料、理解错要求');
 const result=mergeChineseCaptionTails(pages(words));
 assert.deepEqual(result.map(c=>joined(c.words)),['不代表每一步都可靠','找错资料、理解错要求']);
 assert.deepEqual(result.flatMap(c=>c.words),words);
 // A short new error clause is a turn, rather than a tail of the conclusion.
 assert.equal(mergeChineseCaptionTails([{id:'a',clipId:'raw',startMs:0,endMs:900,words:timed('这个结果可靠')},{id:'b',clipId:'raw',startMs:900,endMs:1200,words:[{text:'找错',startMs:900,endMs:1200}]}]).length,2);
});

test('personal turns and paired comparisons stay complete without splitting a relative clause',()=>{
 const words=timed('整理成一份你能检查的结果我更在意的是从下载到安装它到底需要多少时间');
 const result=mergeChineseCaptionTails(pages(words)),strings=result.map(c=>joined(c.words));
 assert.ok(strings.includes('整理成一份你能检查的结果'));
 assert.ok(strings.includes('我更在意的是从下载到安装'));
 assert.ok(strings.some(s=>s.startsWith('它到底')));
 assert.deepEqual(result.flatMap(c=>c.words),words);
 for(const maxWidth of [3,4,8]){
  const sample=timed('请帮我再让我从下载到安装');
  const groups=readableCaptionWordGroups(sample,{maxWidth});
  for(const phrase of ['帮我','再让我','从下载到安装'])assert.ok(groups.some(g=>joined(g).includes(phrase)),phrase+' width '+maxWidth);
 }
});

test('synthetic project preserves timed words and reviewed cue boundaries without mutating input',()=>{
 const project=JSON.parse(fs.readFileSync(new URL('./fixtures/subtitle-quality.json',import.meta.url),'utf8'));
 const before=structuredClone(project),result=styleCaptions(project.captions,project.clips);
 assert.deepEqual(project,before);
 assert.deepEqual(result.flatMap(c=>c.words),project.captions.flatMap(c=>c.words));
 for(const old of project.captions){
  const current=result.find(c=>c.startMs===old.startMs&&c.endMs===old.endMs&&joined(c.words)===joined(old.words));
  assert.ok(current,old.id+' cue timing');assert.equal(current.timingScope,'cue');
 }
});
