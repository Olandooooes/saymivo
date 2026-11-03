import test from 'node:test';
import assert from 'node:assert/strict';
import {splitClipCaptions} from '../src/split-clip-captions.mjs';
import fs from 'node:fs';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText).toString('base64');
const timelineUrl = moduleUrl(fs.readFileSync(new URL('../src/timeline.ts', import.meta.url), 'utf8'));
const compiledModule = file => {
  const url = new URL(file, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
  }).outputText.replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
    const resolved = specifier.endsWith('/timeline') ? timelineUrl
      : specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier);
    return `from ${JSON.stringify(resolved)}`;
  });
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};
const {useEditor} = await compiledModule('../editor/store.ts');
const {projectCaptions} = await compiledModule('../src/captions.ts');

const cue = (words, extra = {}) => ({id:'sentence',clipId:'voice',startMs:1000,endMs:5000,topPct:88,
  scale:.7,holdMs:0,timingScope:'cue',audioClock:{version:'source-zero-v1'},words,...extra});
const word = (text,startMs,endMs,accent=false) => ({text,startMs,endMs,accent});

test('a sentence crossing a cut remains visible on both retained clips without moving its source words', () => {
  const input=[cue([word('先调查',1000,1900),word('再验证',2200,4000,true)])],before=structuredClone(input);
  const out=splitClipCaptions(input,'voice','voice-right',2000);
  assert.equal(out.length,2);
  assert.deepEqual(out.map(c=>[c.clipId,c.startMs,c.endMs,c.words.map(w=>w.text).join('')]),
    [['voice',1000,2000,'先调查'],['voice-right',2000,5000,'再验证']]);
  assert.equal(out[1].words[0].accent,true);
  assert.equal(out[1].audioClock,input[0].audioClock);
  assert.equal(out[1].topPct,88);
  assert.deepEqual(out.flatMap(c=>c.words),input[0].words);
  assert.deepEqual(input,before);
});

test('a cut inside an English or Chinese token keeps the token on both sides with its original source clock', () => {
  const token=word('AI Agent',1500,3200,true),input=[cue([token,word('调查',3500,4100)])];
  const out=splitClipCaptions(input,'voice','voice-right',2500);
  assert.deepEqual(out.map(c=>c.words.map(w=>w.text)),[['AI Agent'],['AI Agent','调查']]);
  assert.equal(out[0].endMs,2500);assert.equal(out[1].startMs,2500);
  assert.deepEqual(out[0].words[0],token);assert.deepEqual(out[1].words[0],token);
});

test('two cuts and deleting the middle cannot orphan surviving tail words', () => {
  const input=[cue([word('第一句',1000,1800),word('口误',2200,2800),word('保留结尾',3500,4500)])];
  const first=splitClipCaptions(input,'voice','middle',2000);
  const second=splitClipCaptions(first,'middle','tail',3000);
  const kept=second.filter(c=>c.clipId!=='middle');
  assert.deepEqual(kept.map(c=>[c.clipId,c.words.map(w=>w.text).join('')]),[['voice','第一句'],['tail','保留结尾']]);
  assert.equal(new Set(second.map(c=>c.id)).size,second.length);
});

test('cue boundaries, unrelated clips and word-review anchors remain safe', () => {
  const original=[word('原词',1200,1800),word('后词',3000,3600)];
  const c=cue(original,{reviewOriginalWords:original,reviewOriginalTiming:{startMs:900,endMs:5100,text:'原词后词'}});
  const other={...c,id:'unrelated',clipId:'other'};
  const out=splitClipCaptions([c,other],'voice','right',2000);
  assert.equal(out.at(-1),other);
  assert.equal(out[0].reviewOriginalTiming,undefined);assert.equal(out[1].reviewOriginalTiming,undefined);
  assert.deepEqual(out[1].reviewOriginalWords,[original[1]]);
  assert.deepEqual(splitClipCaptions([c],'voice','right',1000).map(v=>v.clipId),['right']);
  assert.equal(splitClipCaptions([c],'voice','right',5000)[0],c);
});

test('the real editor split/delete/undo path keeps the audible tail caption at non-unit speed', () => {
  const clips=[{id:'voice',src:'clips/synthetic.mp4',inSec:0,outSec:8,sourceDurationSec:8,speed:1.25}];
  const captions=[cue([word('切点前',1000,1800),word('切点后仍有原声',2200,4500,true)])];
  useEditor.getState().init({durationInFrames:192,fps:30,width:1920,height:1080},captions,'#3156b9',clips);
  useEditor.getState().splitClipAtFrame(48); // source 2s at 1.25x
  let state=useEditor.getState();
  assert.equal(state.clips.length,2);assert.equal(state.captions.length,2);
  const right=state.clips[1];
  assert.equal(right.inSec,2);
  assert.equal(projectCaptions(state.captions,state.clips,30).find(c=>c.clipId===right.id)?.words[0].text,'切点后仍有原声');
  state.deleteClip('voice');state=useEditor.getState();
  const projected=projectCaptions(state.captions,state.clips,30);
  assert.equal(projected.length,1);assert.equal(projected[0].words[0].text,'切点后仍有原声');
  assert.equal(projected[0].words[0].startMs,160);
  state.undo();useEditor.getState().undo();state=useEditor.getState();
  assert.deepEqual(state.clips,clips);assert.deepEqual(state.captions,captions);
});

test('real pause application projects both sides of a cross-cut sentence and one undo restores everything',()=>{
 const clips=[{id:'pause-source',src:'clips/synthetic.mp4',inSec:0,outSec:8,sourceDurationSec:8,speed:1.25}];
 const captions=[cue([word('前半句',1000,1800),word('后半句',5000,6500)],{clipId:'pause-source',startMs:1000,endMs:6500})];
 useEditor.getState().init({durationInFrames:192,fps:30,width:1920,height:1080},captions,'#3156b9',clips);
 const baseline=useEditor.getState();
 baseline.applyAutocut([{id:'pause-source',segments:[{inSec:0,outSec:2},{inSec:4,outSec:8}]}]);
 let state=useEditor.getState();assert.equal(state.past.length,1);
 assert.deepEqual(projectCaptions(state.captions,state.clips,30).map(c=>c.words.map(w=>w.text).join('')),['前半句','后半句']);
 state.undo();state=useEditor.getState();assert.deepEqual(state.clips,clips);assert.deepEqual(state.captions,captions);
 state.redo();assert.equal(useEditor.getState().captions.length,2);
});
