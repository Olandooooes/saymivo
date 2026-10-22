import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {sceneHighlightBoxPatch} from '../editor/scene-highlight-edit.mjs';
import {createOverviewComparison} from '../src/overview-comparison.mjs';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText).toString('base64');
const timelineUrl = moduleUrl(fs.readFileSync(new URL('../src/timeline.ts', import.meta.url), 'utf8'));
let source = fs.readFileSync(new URL('../editor/store.ts', import.meta.url), 'utf8');
for (const [specifier, url] of [
  ['../src/edit-caption-words.mjs', new URL('../src/edit-caption-words.mjs', import.meta.url).href],
  ['../src/presentation.mjs', new URL('../src/presentation.mjs', import.meta.url).href],
  ['../src/timeline', timelineUrl],
  ['zustand', import.meta.resolve('zustand')],
]) source = source.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`);
const {useEditor} = await import(moduleUrl(source));

test('overview image and entry edits undo independently while preserving navigation and all source timing', () => {
 const clips=[{id:'voice',src:'clips/voice.mp4',inSec:0,outSec:12}],captions=[{id:'voice-cue',clipId:'voice',startMs:1000,endMs:2000,topPct:88,words:[{text:'从原片到成片',startMs:1000,endMs:2000}]}];
 const scene={id:'return',clipId:'voice',src:clips[0].src,layout:'overview',startMs:1000,endMs:9000,title:'从原片到成片',activeNodeId:'task',overviewSourceSceneId:'prior',nodes:[{id:'task',text:'任务',atMs:0},{id:'result',text:'结果',atMs:0},{id:'error',text:'出错',atMs:0}],overviewComparison:createOverviewComparison('broll-assets/before.png','broll-assets/after.png')};
 const other={id:'other',clipId:'voice',startMs:9000,endMs:12000,layout:'speaker',title:'结尾'},presentation={theme:'knowledge',style:'reference',format:'landscape',chapters:[],scenes:[scene,other]};
 useEditor.getState().init({durationInFrames:360,fps:30,width:1920,height:1080},captions,'#3156b9',clips,null,[],[],presentation);
 const changed={...scene,overviewComparison:{...scene.overviewComparison,after:{...scene.overviewComparison.after,src:'broll-assets/other-accepted.png',atMs:2600}}};
 useEditor.getState().setPresentation({...presentation,scenes:[changed,other]});let current=useEditor.getState();assert.equal(current.past.length,1);assert.deepEqual(current.presentation.scenes[0],changed);assert.equal(current.presentation.scenes[0].nodes,scene.nodes);assert.equal(current.presentation.scenes[1],other);assert.equal(current.clips,clips);assert.equal(current.captions,captions);
 current.undo();assert.deepEqual(useEditor.getState().presentation,presentation);useEditor.getState().redo();current=useEditor.getState();assert.deepEqual(current.presentation.scenes[0],changed);assert.deepEqual(current.clips,clips);assert.deepEqual(current.captions,captions);
});

test('accent changes undo and redo independently without changing project timing', () => {
  const clips = [{id: 'voice', src: 'clips/voice.mp4', inSec: 1, outSec: 8, sourceDurationSec: 10}];
  const captions = [{id: 'caption', clipId: 'voice', startMs: 1500, endMs: 2500, topPct: 88,
    words: [{text: '重点', startMs: 1500, endMs: 2500, accent: true}]}];
  const presentation = {theme: 'knowledge', style: 'reference', format: 'landscape', chapters: [],
    scenes: [{id: 'scene', clipId: 'voice', startMs: 1000, endMs: 8000, layout: 'speaker', title: '重点'}]};
  useEditor.getState().init({durationInFrames: 210, fps: 30, width: 1920, height: 1080},
    captions, '#3156b9', clips, null, [], [], presentation);
  const before = Object.fromEntries(['clips', 'captions', 'presentation', 'meta'].map(key =>
    [key, structuredClone(useEditor.getState()[key])]));
  useEditor.getState().setAccentColor('#abc1ff');
  let current = useEditor.getState();
  assert.equal(current.past.length, 1, 'one color change adds one undo step');
  assert.equal(current.accentColor, '#abc1ff');
  for (const key of ['clips', 'captions', 'presentation', 'meta']) assert.deepEqual(current[key], before[key]);
  current.setAccentColor('#abc1ff');
  assert.equal(useEditor.getState().past.length, 1, 'same color does not consume history');
  useEditor.getState().undo();
  current = useEditor.getState();
  assert.equal(current.accentColor, '#3156b9');
  for (const key of ['clips', 'captions', 'presentation', 'meta']) assert.deepEqual(current[key], before[key]);
  current.redo();
  assert.equal(useEditor.getState().accentColor, '#abc1ff');
  useEditor.getState().setAccentColor('#8276ae');
  assert.equal(useEditor.getState().future.length, 0, 'a new color clears redo history');
  useEditor.getState().undo();
  assert.equal(useEditor.getState().accentColor, '#abc1ff');
});

test('a current-scene highlight redraw is one undoable edit without moving another scene or subtitle', () => {
  const clips = [{id: 'voice', src: 'clips/voice.mp4', inSec: 1, outSec: 8, sourceDurationSec: 10}];
  const captions = [{id: 'caption', clipId: 'voice', startMs: 1500, endMs: 2500, topPct: 88,
    words: [{text: '重点', startMs: 1500, endMs: 2500}]}];
  const scene = {id: 'scene', clipId: 'voice', startMs: 1000, endMs: 4000, layout: 'spotlight', title: '重点',
    media: {src: 'broll-assets/document.svg', kind: 'image', fit: 'cover', camera: [{atMs: 0, scale: 1.8, x: -4, y: 6}]},
    highlights: [{id: 'line', x: .1, y: .2, w: .6, h: .08, atMs: 600, endMs: 2000, mode: 'highlight', color: '#3156b9'}]};
  const other = {id: 'other', clipId: 'voice', startMs: 4000, endMs: 8000, layout: 'speaker', title: '下一段'};
  const presentation = {theme: 'knowledge', style: 'reference', format: 'landscape', chapters: [], scenes: [scene, other]};
  useEditor.getState().init({durationInFrames: 210, fps: 30, width: 1920, height: 1080},
    captions, '#3156b9', clips, null, [], [], presentation);
  const patch = sceneHighlightBoxPatch(scene, 'line', {x: .2, y: .3, w: .5, h: .06});
  useEditor.getState().setPresentation({...presentation, scenes: [{...scene, ...patch}, other]});
  let current = useEditor.getState();
  assert.equal(current.past.length, 1);
  assert.equal(current.presentation.scenes[1], other);
  assert.equal(current.presentation.scenes[0].media, scene.media);
  assert.deepEqual(current.captions, captions);
  assert.deepEqual(current.clips, clips);
  assert.equal(current.meta.durationInFrames, 210);
  current.undo();
  assert.deepEqual(useEditor.getState().presentation, presentation);
  useEditor.getState().redo();
  current = useEditor.getState();
  assert.deepEqual(current.presentation.scenes[0].highlights[0], {...scene.highlights[0], x: .2, y: .3, w: .5, h: .06});
  assert.deepEqual(current.presentation.scenes[1], other);
  assert.deepEqual(current.captions, captions);
  assert.deepEqual(current.clips, clips);
});

test('cue timing edits preserve uncertain internal words, undo/redo and reject overlap without history pollution', () => {
  const clips = [{id: 'voice', src: 'clips/voice.mp4', inSec: 1, outSec: 8, sourceDurationSec: 10}];
  const captions = [
    {id: 'first', clipId: 'voice', startMs: 1000, endMs: 3000, topPct: 88, holdMs: 700,
      words: [{text: '内部', startMs: 1000, endMs: 1000}, {text: '时间未知', startMs: 1800, endMs: 2600}]},
    {id: 'next', clipId: 'voice', startMs: 3500, endMs: 5000, topPct: 88,
      words: [{text: '下一句', startMs: 3500, endMs: 5000}]},
  ];
  const presentation = {theme: 'knowledge', style: 'reference', format: 'landscape', chapters: []};
  useEditor.getState().init({durationInFrames: 210, fps: 30, width: 1920, height: 1080},
    captions, '#3156b9', clips, null, [], [], presentation);
  const before = structuredClone(captions);
  useEditor.getState().setCaptionTiming('first', 1200, 2800);
  let current = useEditor.getState();
  assert.equal(current.past.length, 1);
  assert.equal(current.captions[0].words, captions[0].words, 'does not infer zero-length word timings');
  assert.equal(current.captions[0].holdMs, 0);
  assert.equal(current.captions[0].timingScope, 'cue');
  assert.deepEqual(current.captions[0].reviewOriginalTiming, {startMs: 1000, endMs: 3000, text: '内部时间未知'});
  assert.equal(current.captions[1], captions[1]);
  current.setCaptionTiming('first', 1200, 2800);
  current.setCaptionTiming('first', 900, 2800);
  current.setCaptionTiming('first', 1200, 4000);
  assert.equal(useEditor.getState().past.length, 1, 'no-op, out-of-clip and overlap consume no history');
  current.undo();
  assert.deepEqual(useEditor.getState().captions, before);
  useEditor.getState().redo();
  current = useEditor.getState();
  assert.deepEqual([current.captions[0].startMs, current.captions[0].endMs], [1200, 2800]);
  assert.deepEqual(current.captions[0].words, before[0].words);
  assert.deepEqual(current.captions[0].reviewOriginalTiming, {startMs: 1000, endMs: 3000, text: '内部时间未知'});
  assert.deepEqual(current.clips, clips);
  assert.deepEqual(current.presentation, presentation);
});

test('one tag animation edit and reset are undoable without moving cue times or other objects', () => {
  const clips = [{id: 'voice', src: 'clips/voice.mp4', inSec: 1, outSec: 8, sourceDurationSec: 10}];
  const captions = [{id: 'caption', clipId: 'voice', startMs: 1500, endMs: 2500, topPct: 88,
    words: [{text: '重点', startMs: 1500, endMs: 2500}]}];
  const tags = [{id: 'first', text: '重点\n说明', x: .04, y: .12, atMs: 500, endMs: 2000},
    {id: 'second', text: '其他重点', x: .69, y: .12, atMs: 2000, endMs: 2800}];
  const scene = {id: 'scene', clipId: 'voice', startMs: 1000, endMs: 4000, layout: 'speaker', title: '重点', tags};
  const other = {id: 'other', clipId: 'voice', startMs: 4000, endMs: 8000, layout: 'speaker', title: '下一段'};
  const presentation = {theme: 'knowledge', style: 'reference', format: 'landscape', chapters: [], scenes: [scene, other]};
  useEditor.getState().init({durationInFrames: 210, fps: 30, width: 1920, height: 1080},
    captions, '#3156b9', clips, null, [], [], presentation);
  const animation = {inMs: 150, outMs: 400, lineDelayMs: 0};
  const lineAtMs = [500, 1100];
  useEditor.getState().setPresentation({...presentation, scenes: [{...scene, tags: [{...tags[0], animation, lineAtMs}, tags[1]]}, other]});
  let current = useEditor.getState();
  assert.equal(current.past.length, 1);
  assert.deepEqual(current.presentation.scenes[0].tags[0], {...tags[0], animation, lineAtMs});
  assert.equal(current.presentation.scenes[0].tags[1], tags[1]);
  assert.equal(current.presentation.scenes[1], other);
  assert.equal(current.captions, captions);
  assert.equal(current.clips, clips);
  current.undo();assert.deepEqual(useEditor.getState().presentation, presentation);
  useEditor.getState().redo();current=useEditor.getState();
  const modified = current.presentation;
  current.setPresentation({...modified, scenes: [{...modified.scenes[0], tags: [{...modified.scenes[0].tags[0], animation: undefined}, tags[1]]}, other]});
  assert.equal(useEditor.getState().presentation.scenes[0].tags[0].animation, undefined);
  assert.deepEqual(useEditor.getState().presentation.scenes[0].tags[0].lineAtMs, lineAtMs, 'animation reset preserves spoken line anchors');
  useEditor.getState().undo();
  assert.deepEqual(useEditor.getState().presentation.scenes[0].tags[0].animation, animation);
  current = useEditor.getState();
  const anchored = current.presentation;
  current.setPresentation({...anchored, scenes: [{...anchored.scenes[0], tags: [{...anchored.scenes[0].tags[0], lineAtMs: undefined}, tags[1]]}, other]});
  assert.equal(useEditor.getState().presentation.scenes[0].tags[0].lineAtMs, undefined);
  assert.deepEqual(useEditor.getState().presentation.scenes[0].tags[0].animation, animation, 'clearing line anchors preserves animation durations');
  useEditor.getState().undo();
  assert.deepEqual(useEditor.getState().presentation.scenes[0].tags[0].lineAtMs, lineAtMs);
  assert.equal(useEditor.getState().presentation.scenes[0].tags[0].atMs, tags[0].atMs);
  assert.equal(useEditor.getState().presentation.scenes[0].tags[0].endMs, tags[0].endMs);
});
