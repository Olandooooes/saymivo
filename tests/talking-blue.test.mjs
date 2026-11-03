import {test} from 'node:test';import assert from 'node:assert/strict';
import {bluePhraseLines,blueTalkingTags} from '../src/talking-blue.mjs';
import {matchTalkingMotion,projectTalkingMotion} from '../src/talking-motion.mjs';
test('line wrapping keeps names, negation and question phrases complete without changing content',()=>{
 for(const text of ['这不代表里面所有信息都消失了','第二结果有没有依据方便我检查','先确认Agent和ChatGPT的不同']){const lines=bluePhraseLines(text);assert.equal(lines.join(''),text);assert.ok(!lines.some(l=>l.endsWith('有')&&lines[lines.indexOf(l)+1]?.startsWith('没有')));}
});
test('blue tags preserve original token onsets, alternate sides and retire prior arguments into outline',()=>{
 const signature=JSON.stringify([['第一',1000,1400],['检查原料',1500,4000],['第二',5000,5400],['保持密封',5500,8000]]),cue={id:'cue',kind:'steps',startMs:1000,endMs:8000,signature,items:[{text:'第一检查原料',atMs:1000},{text:'第二保持密封',atMs:5000}],scale:1,entryMs:220};
 const tags=blueTalkingTags(cue);assert.equal(tags[0].x,.04);assert.equal(tags[1].x,.68);assert.equal(tags[0].contextAtMs,4000);assert.equal(tags[1].atMs,4000);assert.ok(tags.flatMap(t=>t.lineAtMs).every(t=>[0,500,4000,4500].includes(t)));
});
test('line onsets and entry duration follow clip speed rather than source milliseconds',()=>{
 const clip={id:'voice',src:'synthetic.mp4',inSec:0,outSec:10,speed:2},words=[['核心是',1000,2000],['保持原文',2000,3000],['不改逻辑。',3000,5000]].map(([text,startMs,endMs])=>({text,startMs,endMs,accent:false})),captions=[{id:'c',clipId:'voice',startMs:1000,endMs:5000,words,topPct:88}];
 const cue=matchTalkingMotion(captions,[clip])[0];assert.ok(cue);const projected=projectTalkingMotion([cue],captions,[clip])[0],tags=blueTalkingTags(projected);assert.equal(projected.entryMs,110);assert.ok(tags[0].lineAtMs.every(t=>[0,500,1000].includes(t)));assert.equal(tags[0].endMs,2000);
});
