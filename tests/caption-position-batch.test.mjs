import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';

const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const compile = (file, resolve) => moduleUrl(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
}).outputText.replace(/from (["'])([^"']+)\1/g, (_, _q, specifier) => `from ${JSON.stringify(resolve(specifier))}`));
const timelineUrl = compile(new URL('../src/timeline.ts', import.meta.url), specifier => import.meta.resolve(specifier));
const storeFile = new URL('../editor/store.ts', import.meta.url);
const storeUrl = compile(storeFile, specifier => specifier.endsWith('/timeline') ? timelineUrl : specifier.startsWith('.') ? new URL(specifier, storeFile).href : import.meta.resolve(specifier));
const {useEditor} = await import(storeUrl);

function fixture(count = 127) {
  const clips = [{id: 'voice-a', src: 'clips/synthetic-a.mp4', inSec: 0, outSec: 100, sourceDurationSec: 100, volume: .8},
    {id: 'voice-b', src: 'clips/synthetic-b.mp4', inSec: 0, outSec: 100, sourceDurationSec: 100, speed: 1.5}];
  const captions = Array.from({length: count}, (_, i) => ({id: `cue-${i}`, clipId: clips[i < 100 ? 0 : 1].id,
    startMs: i % 100 * 1000, endMs: i % 100 * 1000 + 800, topPct: 80, scale: 1.1, holdMs: 300,
    timingScope: 'cue', reviewOriginalTiming: {startMs: i % 100 * 1000, endMs: i % 100 * 1000 + 800, text: '合成条件'},
    words: [{text: '合成条件', startMs: i % 100 * 1000, endMs: i % 100 * 1000 + 800, accent: i % 2 === 0}],
    audioClock: {version: 'source-zero', sourceSha256: 'a'.repeat(64)}}));
  const presentation = {theme: 'knowledge', format: 'landscape', chapters: [], scenes: [{id: 'scene', clipId: 'voice-a', src: clips[0].src,
    startMs: 0, endMs: 100000, layout: 'speaker', title: '合成标题', nodes: [{id: 'condition', text: '仍需验证'}],
    dynamicMotion: {version: 1, draftKey: 'existing-opaque-selection'}}]};
  const music = {src: 'music/synthetic.wav', volume: .2, fadeOutSec: 1};
  const brolls = [{id: 'evidence', clipId: 'voice-a', src: 'broll-assets/synthetic.png', kind: 'image', mode: 'inset', startMs: 0, endMs: 2000}];
  const assets = [{id: 'asset', src: brolls[0].src, kind: 'image', label: '合成资料'}];
  useEditor.getState().init({durationInFrames: 5000, fps: 30, width: 1920, height: 1080}, captions, '#3156b9', clips, music, brolls, assets, presentation);
  useEditor.getState().setProjectInfo('synthetic-project', '合成项目');
  useEditor.getState().setCurrentFrame(17);
  return useEditor.getState();
}
const untouchedKeys = ['clips', 'music', 'brolls', 'brollAssets', 'presentation', 'meta', 'accentColor', 'projectId', 'projectName', 'currentFrame', 'selectedId', 'selectedClipId', 'dupSuggestion'];
const withoutPosition = caption => {const {topPct, ...rest} = caption; return rest;};

test('all 127 caption positions change in one real-store transaction, undo and redo preserve every other field', () => {
  const before = fixture(), original = structuredClone(before.captions);
  before.setAllCaptionTopPct(90);
  let current = useEditor.getState();
  assert.equal(current.past.length, 1);
  assert.equal(current.future.length, 0);
  assert.equal(current.captions.length, 127);
  assert.ok(current.captions.every(caption => caption.topPct === 90));
  assert.deepEqual(current.captions.map(withoutPosition), before.captions.map(withoutPosition));
  for (const key of untouchedKeys) assert.equal(current[key], before[key], key);
  assert.deepEqual(before.captions, original, 'never mutates the original caption snapshots');
  current.undo();
  current = useEditor.getState();
  assert.deepEqual(current.captions, original);
  assert.equal(current.past.length, 0);
  assert.equal(current.future.length, 1);
  current.redo();
  current = useEditor.getState();
  assert.ok(current.captions.every(caption => caption.topPct === 90));
  assert.deepEqual(current.captions.map(withoutPosition), original.map(withoutPosition));
  for (const key of untouchedKeys.filter(key => key !== 'meta')) assert.equal(current[key], before[key], key);
  assert.deepEqual(current.meta, before.meta);
});

test('invalid, empty and unchanged batches are exact no-ops, including existing redo history; bounds are valid', () => {
  fixture(2).setAllCaptionTopPct(90);
  useEditor.getState().undo();
  for (const value of [NaN, Infinity, -Infinity, 4.99, 92.01, '90', null]) {
    const before = useEditor.getState();
    before.setAllCaptionTopPct(value);
    assert.equal(useEditor.getState(), before, `must reject ${String(value)} without a transaction`);
  }
  let before = useEditor.getState();
  before.setAllCaptionTopPct(80);
  assert.equal(useEditor.getState(), before, 'unchanged batch retains redo');
  assert.equal(before.future.length, 1);
  before.setAllCaptionTopPct(5);
  assert.ok(useEditor.getState().captions.every(c => c.topPct === 5));
  useEditor.getState().setAllCaptionTopPct(92);
  assert.ok(useEditor.getState().captions.every(c => c.topPct === 92));
  before = useEditor.getState();
  before.setAllCaptionTopPct(92);
  assert.equal(useEditor.getState(), before);
  before = fixture(0);
  before.setAllCaptionTopPct(90);
  assert.equal(useEditor.getState(), before);
});

// Execute the actual Inspector tree and event closures; unrelated media/child
// panels are stubbed. This is a form-state test, not pixel/browser verification.
const hooks = {values: [], index: 0};
globalThis.__captionPositionTestHooks = hooks;
globalThis.__captionPositionTestStore = useEditor;
const reactUrl = moduleUrl(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default React;
export const useRef = value => ({current:value});
export const useState = initial => {const h=globalThis.__captionPositionTestHooks,i=h.index++;if(!(i in h.values))h.values[i]=initial;return[h.values[i],v=>h.values[i]=v];};`);
const uiStoreUrl = moduleUrl('export const useEditor=()=>globalThis.__captionPositionTestStore.getState();');
const childUrl = moduleUrl('export const ImageWindowPanel=()=>null,TalkingMotionPanel=()=>null,CaptionStylePanel=()=>null,CaptionReviewSave=()=>null,CaptionTimingEditor=()=>null,ClipFocusTools=()=>null,SourceAudition=()=>null,IconButton=()=>null;');
const brollUrl = moduleUrl('export const projectBrolls=items=>items;');
const captionsFile = new URL('../src/captions.ts', import.meta.url);
const captionsUrl = compile(captionsFile, specifier => specifier === './timeline' ? timelineUrl : import.meta.resolve(specifier));
const inspectorFile = new URL('../editor/Inspector.tsx', import.meta.url);
const inspectorUrl = compile(inspectorFile, specifier => specifier === 'react' ? reactUrl : specifier === './store' ? uiStoreUrl
  : specifier === '../src/timeline' ? timelineUrl : specifier === '../src/captions' ? captionsUrl
  : specifier === '../src/Broll' ? brollUrl : specifier.endsWith('.mjs') ? new URL(specifier, inspectorFile).href : childUrl);
const {Inspector} = await import(inspectorUrl);
const all = (node, predicate) => node == null ? [] : Array.isArray(node) ? node.flatMap(child => all(child, predicate)) : React.isValidElement(node)
  ? [...(predicate(node) ? [node] : []), ...all(node.props.children, predicate)] : [];
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : String(node);
const render = () => {hooks.index = 0; return Inspector({playerRef: {current: null}, onGenerate() {}, onGenerateBroll() {}});};
const input = tree => all(tree, element => element.props.id === 'all-caption-top')[0];
const button = tree => all(tree, element => element.type === 'button' && text(element) === '应用到全部字幕 · 一次撤销')[0];

test('actual Inspector keeps numeric edits local until explicit apply and never enables invalid or unchanged values', () => {
  fixture(2); hooks.values = [];
  let tree = render(), before = useEditor.getState();
  assert.equal(input(tree).props.value, '');
  assert.equal(button(tree).props.disabled, true);
  assert.equal(all(tree, e => e.type === 'label' && e.props.htmlFor === 'all-caption-top').map(text)[0], '全部字幕垂直位置（%）');
  input(tree).props.onChange({target: {value: '90'}});
  assert.equal(useEditor.getState(), before, 'typing is not a project edit');
  tree = render(); assert.equal(button(tree).props.disabled, false);
  button(tree).props.onClick();
  assert.ok(useEditor.getState().captions.every(c => c.topPct === 90));
  assert.equal(useEditor.getState().past.length, 1);
  tree = render(); assert.equal(button(tree).props.disabled, true);
  for (const value of ['', '93', '4', 'NaN']) {
    input(tree).props.onChange({target: {value}}); tree = render();
    assert.equal(button(tree).props.disabled, true);
    before = useEditor.getState(); button(tree).props.onClick();
    assert.equal(useEditor.getState(), before);
  }
});
test('global style roundtrip and per-caption position exception preserve audio, words, timing and one-step undo',()=>{
 const before=fixture(3),original=structuredClone(before.captions),style={font:'song',fontSize:56,topPct:89,color:'#ffffff'};
 before.setPresentation({...before.presentation,captionStyle:style});
 assert.deepEqual(useEditor.getState().captions,original);
 const serialized=JSON.parse(JSON.stringify(useEditor.getState().presentation));assert.deepEqual(serialized.captionStyle,style);
 useEditor.getState().pushHistory();useEditor.getState().setTopPct('cue-0',72);
 assert.equal(useEditor.getState().captions[0].styleOverride.topPct,72);assert.equal(useEditor.getState().captions[0].topPct,original[0].topPct);assert.equal(useEditor.getState().captions[1].styleOverride,undefined);
 assert.deepEqual(useEditor.getState().clips,before.clips);assert.deepEqual(useEditor.getState().captions.map(c=>c.words),original.map(c=>c.words));
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().captions,original);
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation,before.presentation);
});
