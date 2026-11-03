import {test} from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import fs from 'node:fs';
import {captionText,planMotions,suggestMotion} from '../src/motion-rules.mjs';
import {readableSubtitle} from '../src/reference-motion.mjs';
const js=ts.transpileModule(fs.readFileSync(new URL('../src/motion-plan.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/export \{[^}]+\} from ['"][^'"]+['"];?/g,'');
const {parseSrt}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const clips=[{id:'a',src:'a.mp4',inSec:2,outSec:6,sourceDurationSec:10,speed:2},{id:'b',src:'b.mp4',inSec:1,outSec:5,sourceDurationSec:5}];
test('SRT spanning sped-up and trimmed clips stays anchored to source time',()=>{const caps=parseSrt('1\n00:00:01,500 --> 00:00:03,000\n第一步，理解内容。',clips);assert.equal(caps.length,2);assert.equal(caps[0].clipId,'a');assert.equal(caps[0].startMs,5000);assert.equal(caps[0].endMs,6000);assert.equal(caps[1].clipId,'b');assert.equal(caps[1].startMs,1000);assert.equal(caps[1].endMs,2000);});
test('invalid subtitle ranges and content beyond video are ignored',()=>{assert.equal(parseSrt('1\n00:00:30,000 --> 00:00:31,000\n无效\n\n2\n00:00:02,000 --> 00:00:01,000\n倒序',clips).length,0);});
test('SRT millisecond rounding at a frame boundary does not copy a cue into the next clip',()=>{
 const frameClips=[{id:'first',inSec:0,outSec:80/30},{id:'next',inSec:10,outSec:12}];
 const caps=parseSrt('1\n00:00:02,000 --> 00:00:02,667\n已经完成。',frameClips,30);
 assert.equal(caps.length,1);assert.equal(caps[0].clipId,'first');
 assert.ok(Math.abs(caps[0].endMs-80000/30)<1e-9);
});
test('a genuine one-frame cue and a short word crossing the cut retain their visible frames',()=>{
 const frameClips=[{id:'first',inSec:0,outSec:80/30},{id:'next',inSec:10,outSec:12}];
 const one=parseSrt('1\n00:00:02,633 --> 00:00:02,667\n不',frameClips,30);
 assert.equal(one.length,1);assert.equal(captionText(one[0]),'不');
 const crossing=parseSrt('1\n00:00:02,633 --> 00:00:02,700\n不',frameClips,30);
 assert.equal(crossing.length,2);assert.deepEqual(crossing.map(c=>[c.clipId,captionText(c)]),[['first','不'],['next','不']]);
 assert.ok(crossing.every(c=>c.words[0].endMs>c.words[0].startMs));
});
test('SRT preserves English spaces without adding timed whitespace tokens',()=>{
 const text='全称是 Reverse Engineer Anything，AI Agent 调查软件。';
 const [cap]=parseSrt('1\n00:00:00,000 --> 00:00:01,000\n'+text,clips);
 assert.equal(captionText(cap),text);assert.equal(readableSubtitle(cap.words),text);
 assert.equal(cap.words.length,text.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+|[^\s]/g).length);
 assert.ok(cap.words.every(w=>w.text.trim()&&w.endMs>w.startMs));
});
test('semantic categories recognise Chinese steps, contrast, numbers and emphasis',()=>{assert.equal(suggestMotion('第一步，检查素材'),'steps');assert.equal(suggestMotion('以前慢，现在快'),'compare');assert.equal(suggestMotion('节省 50% 的时间'),'number');assert.equal(suggestMotion('最关键的是内容'),'emphasis');assert.equal(suggestMotion('今天我们来聊聊'),'none');});
test('semantic zoom preserves existing manual keyframes',()=>{const clip={...clips[0],transform:[{t:2,scale:1.1,x:2,y:0}]};const c={id:'c',clipId:'a',startMs:2500,endMs:3500,words:[{text:'关键',startMs:2500,endMs:3500,accent:false}],topPct:80};const p=planMotions([c],[clip],60);assert.equal(p.captions[0].motion.kind,'emphasis');assert.equal(p.captions[0].motion.zoom,1.09);assert.deepEqual(p.clips[0].transform,clip.transform);});
test('AI none overrides keyword rules and cooldown limits repeated events',()=>{const c={id:'c',clipId:'a',startMs:1000,endMs:2000,words:[{text:'核心观点'}],topPct:80};assert.equal(planMotions([c],clips,60,{c:'none'}).captions[0].motion,undefined);const p=planMotions([c,{...c,id:'d',startMs:2000,endMs:3000}],clips,60);assert.equal(p.captions.filter(c=>c.motion).length,1);});
