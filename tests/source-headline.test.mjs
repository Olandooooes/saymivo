import test from 'node:test';import assert from 'node:assert/strict';
import {shortSourceHeadline} from '../src/source-headline.mjs';
import {automaticStoryboard} from '../src/auto-storyboard.mjs';
test('explicit introduction names shorten without inventing summaries or cutting names',()=>{
 assert.equal(shortSourceHeadline('大家好今天跟大家介绍一下一个新的岗位叫FDE。'),'FDE');
 assert.equal(shortSourceHeadline('今天介绍一个工具叫做NotebookLM。'),'NotebookLM');
 assert.equal(shortSourceHeadline('我们聊聊一个方法称为检索增强生成。'),'检索增强生成');
 for(const text of ['大家好今天介绍一下。','不要介绍一个岗位叫FDE。','这个岗位叫FDE但也有其他叫法。','介绍一个岗位叫FDE。介绍一个工具叫RAG。','AI Agent这么火它到底能帮你干什么？'])assert.equal(shortSourceHeadline(text),undefined);
});
test('automatic opening shortens only the title; original words and source citations survive',()=>{
 const text='大家好今天跟大家介绍一下一个新的岗位叫FDE。',words=[...text].map((text,i)=>({text,startMs:i*150,endMs:(i+1)*150}));
 const captions=[{id:'cap',clipId:'raw',startMs:0,endMs:text.length*150,words}],before=structuredClone(captions);
 const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:8}],scene=automaticStoryboard(captions,clips).scenes[0];
 assert.equal(scene.title,'F D E');assert.equal(scene.sourceText,text.replace('FDE','F D E'));assert.deepEqual(scene.sourceCaptionIds,['cap']);assert.deepEqual(captions,before);
});
