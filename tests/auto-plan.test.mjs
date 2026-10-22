import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTrimPlan,automaticMotionPlan} from '../server/auto-plan.mjs';
const clip={id:'a',src:'clips/a.mp4',inSec:1,outSec:9,sourceDurationSec:9};
const cap={id:'c',clipId:'a',startMs:1000,endMs:8000,words:[{text:'第一步',startMs:1200,endMs:2600},{text:'核心',startMs:6000,endMs:7600}]};
test('editing display bounds never erases retained recognition words during a later trim',()=>{
 const words=[{text:'都',startMs:2000,endMs:2200},{text:'可能跑偏。',startMs:2200,endMs:3500}],cue={id:'cue',clipId:'a',startMs:2300,endMs:3600,timingScope:'cue',words};
 const out=applyTrimPlan([clip],[cue],[]);assert.deepEqual(out.captions[0].words,words);assert.equal(out.captions[0].startMs,2300);assert.deepEqual(cue.words,words);
});
test('rearranging a reviewed project keeps cue-only boundaries after readable subtitle reflow',()=>{
 const words=[{text:'所以',startMs:3000,endMs:3500},{text:'我会检查。',startMs:3500,endMs:5000}],cue={id:'cue',clipId:'a',startMs:3400,endMs:5200,holdMs:0,timingScope:'cue',reviewOriginalTiming:{startMs:3000,endMs:5000,text:'所以我会检查。'},words};
 const out=automaticMotionPlan([cue],[clip]);assert.equal(out.captions[0].startMs,3400);assert.equal(out.captions[0].endMs,5200);assert.equal(out.captions[0].timingScope,'cue');assert.deepEqual(out.captions[0].words.map(({accent,...w})=>w),words);
});
test('trimmed segments remap captions while preserving source timestamps',()=>{const p=applyTrimPlan([clip],[cap],[{id:'a',segments:[{inSec:1,outSec:3},{inSec:5.8,outSec:8}]}]);assert.deepEqual(p.clips.map(c=>c.id),['a','a-cut1']);assert.deepEqual(p.captions.map(c=>c.clipId),['a','a-cut1']);assert.equal(p.captions[1].words[0].startMs,6000);assert.equal(p.captions[1].words[0].text,'核心');});
test('motion cooldown uses edited playback time across cuts',()=>{const p=applyTrimPlan([clip],[cap],[{id:'a',segments:[{inSec:1,outSec:3},{inSec:5.8,outSec:8}]}]);const planned=automaticMotionPlan(p.captions,p.clips);assert.equal(planned.captions.filter(c=>c.motion).length,1);assert.equal(planned.captions[0].motion.kind,'steps');assert.equal(planned.clips[1].inSec,5.8);});
test('no eligible words creates no fabricated subtitles or motion',()=>{assert.deepEqual(automaticMotionPlan([], [clip]).captions,[]);});
test('a concept split across subtitle pages receives its actual term as title',()=>{const caps=[{id:'x',clipId:'a',startMs:1000,endMs:3000,words:[{text:'介绍一个新的岗位叫',startMs:1000,endMs:3000}]},{id:'y',clipId:'a',startMs:3000,endMs:3900,words:[{text:'FDE。',startMs:3000,endMs:3900}]}];const p=automaticMotionPlan(caps,[clip]);assert.equal(p.captions[0].motion.kind,'card');assert.equal(p.captions[0].motion.title,'FDE');});
test('automatic reflow preserves a complete Chinese question and readable English word boundaries',async()=>{
 const {styleCaptions}=await import('../server/auto-plan.mjs');
 const texts=['AI','agent','这么火','他到底能帮你干','什么？'];
 const words=texts.map((text,i)=>({text,startMs:1000+i*500,endMs:1500+i*500}));
 const result=styleCaptions([{id:'q',clipId:'a',startMs:1000,endMs:3500,words}],[clip]);
 assert.equal(result.length,1);assert.equal(result[0].words[0].text,'AI Agent');assert.equal(result[0].words.at(-1).text,'什么？');
 assert.equal(result[0].endMs,3500);assert.equal(words[0].endMs,1500);
});
test('trimming an already split source cannot collide with another retained descendant',()=>{
 const clips=[{...clip,id:'a',inSec:0,outSec:10},{...clip,id:'a-cut1',inSec:12,outSec:20}];
 const captions=[{id:'first',clipId:'a',startMs:1000,endMs:9000,words:[{text:'开头',startMs:1000,endMs:2000},{text:'中间',startMs:7000,endMs:8000}]},{id:'later',clipId:'a-cut1',startMs:14000,endMs:16000,words:[{text:'后文',startMs:14000,endMs:16000}]}];
 const result=applyTrimPlan(clips,captions,[{id:'a',segments:[{inSec:0,outSec:4},{inSec:6,outSec:10}]}]);
 assert.equal(new Set(result.clips.map(c=>c.id)).size,result.clips.length);assert.equal(result.clips[1].id,'a-cut2');assert.equal(result.clips[2].id,'a-cut1');assert.deepEqual(result.captions.flatMap(c=>c.words.map(w=>w.text)),['开头','中间','后文']);
});
test('a tiny timestamp tail from a deleted preceding word cannot create a phantom subtitle',()=>{
 const source={...clip,id:'raw',inSec:0,outSec:20};const captions=[{id:'definition',clipId:'raw',startMs:12150,endMs:14610,words:[{text:'叫',startMs:12150,endMs:12610},{text:'Agent',startMs:12610,endMs:13210},{text:'也就是智能体',startMs:13610,endMs:14610}]}];
 const result=applyTrimPlan([source],captions,[{id:'raw',segments:[{inSec:12.57,outSec:15}]}]);assert.deepEqual(result.captions[0].words.map(w=>w.text),['Agent','也就是智能体']);assert.equal(result.captions[0].words[0].startMs,12610);
});
