import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTrimPlan,automaticMotionPlan} from '../server/auto-plan.mjs';
const clip={id:'a',src:'clips/a.mp4',inSec:1,outSec:9,sourceDurationSec:9};
const cap={id:'c',clipId:'a',startMs:1000,endMs:8000,words:[{text:'第一步',startMs:1200,endMs:2600},{text:'核心',startMs:6000,endMs:7600}]};
test('trimmed segments remap captions while preserving source timestamps',()=>{const p=applyTrimPlan([clip],[cap],[{id:'a',segments:[{inSec:1,outSec:3},{inSec:5.8,outSec:8}]}]);assert.deepEqual(p.clips.map(c=>c.id),['a','a-cut1']);assert.deepEqual(p.captions.map(c=>c.clipId),['a','a-cut1']);assert.equal(p.captions[1].words[0].startMs,6000);assert.equal(p.captions[1].words[0].text,'核心');});
test('motion cooldown uses edited playback time across cuts',()=>{const p=applyTrimPlan([clip],[cap],[{id:'a',segments:[{inSec:1,outSec:3},{inSec:5.8,outSec:8}]}]);const planned=automaticMotionPlan(p.captions,p.clips);assert.equal(planned.captions.filter(c=>c.motion).length,1);assert.equal(planned.captions[0].motion.kind,'steps');assert.equal(planned.clips[1].inSec,5.8);});
test('no eligible words creates no fabricated subtitles or motion',()=>{assert.deepEqual(automaticMotionPlan([], [clip]).captions,[]);});
test('a concept split across subtitle pages receives its actual term as title',()=>{const caps=[{id:'x',clipId:'a',startMs:1000,endMs:3000,words:[{text:'介绍一个新的岗位叫',startMs:1000,endMs:3000}]},{id:'y',clipId:'a',startMs:3000,endMs:3900,words:[{text:'FDE。',startMs:3000,endMs:3900}]}];const p=automaticMotionPlan(caps,[clip]);assert.equal(p.captions[0].motion.kind,'card');assert.equal(p.captions[0].motion.title,'FDE');});
