import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {sceneMediaBindingPatch} from '../src/scene-media-binding.mjs';

const scene = {
 id: 'demo', clipId: 'voice', src: 'clips/voice.mp4', startMs: 1000, endMs: 8000,
 layout: 'demo', title: '讲解', sourceText: '原声依据', sourceCaptionIds: ['caption'],
 label: '旧素材', sourceNote: '旧素材来源', illustrative: true, missing: '待补素材',
 containerPose: {rotateY: -5}, speaker: {scale: .8}, tags: [{id: 'tag', text: '重点'}],
 media: {src: 'broll-assets/old.mp4', kind: 'video', width: 1920, height: 1080,
  durationSec: 20, startSec: 3, rate: .5, freezeAtSec: 6, fit: 'cover', scale: 1.3, x: 5,
  camera: [{atMs: 100, scale: 1.8, x: -4, y: 8}],
  cursor: [{atMs: 200, x: .3, y: .4, click: true}]},
 highlights: [{id: 'line', x: .1, y: .2, w: .5, h: .08, atMs: 500, endMs: 2000}],
};
const asset = {src: 'broll-assets/new.png', kind: 'image', width: 800, height: 600,
 label: '新图片', sourceNote: '用户提供的新图片'};

test('a different source clears old content coordinates, playback mapping and provenance only', () => {
 const before = structuredClone(scene), assetBefore = structuredClone(asset);
 const edited = {...scene, ...sceneMediaBindingPatch(scene, asset)};
 assert.deepEqual(edited.media, {src: asset.src, kind: 'image', width: 800, height: 600, fit: 'contain'});
 assert.deepEqual(edited.highlights, []);
 for (const key of ['cursor', 'camera', 'freezeAtSec', 'rate', 'startSec', 'scale', 'x']) {
  assert.equal(edited.media[key], undefined, key + ' belonged to the previous source');
 }
 assert.equal(edited.sourceNote, asset.sourceNote);
 assert.equal(edited.label, asset.label);
 assert.equal(edited.illustrative, undefined);
 assert.equal(edited.missing, undefined);
 for (const key of ['id', 'clipId', 'src', 'startMs', 'endMs', 'layout', 'title', 'sourceText',
  'sourceCaptionIds', 'containerPose', 'speaker', 'tags']) assert.equal(edited[key], scene[key]);
 assert.deepEqual(scene, before);
 assert.deepEqual(asset, assetBefore);
});

test('selecting the same source retains the exact annotations, cursor and media mapping', () => {
 const patch = sceneMediaBindingPatch(scene, {...asset, src: scene.media.src, kind: 'video',
  width: 1920, height: 1080, durationSec: 20});
 const edited = {...scene, ...patch};
 assert.equal(edited.media, scene.media);
 assert.equal(edited.highlights, scene.highlights);
 assert.equal(edited.media.cursor, scene.media.cursor);
 assert.equal(edited.media.camera, scene.media.camera);
 assert.equal(edited.media.startSec, 3);
 assert.equal(edited.media.rate, .5);
 assert.equal(edited.media.freezeAtSec, 6);
 assert.equal(edited.illustrative, true);
 assert.equal(edited.sourceNote, asset.sourceNote);
});

test('a new video starts at its own zero and an absent source description falls back to its real path', () => {
 const video = {src: 'broll-assets/new.mp4', kind: 'video', width: 1280, height: 720,
  durationSec: 12, label: '本地视频', sourceNote: '  '};
 const patch = sceneMediaBindingPatch(scene, video);
 assert.deepEqual(patch.media, {src: video.src, kind: 'video', width: 1280, height: 720,
  durationSec: 12, startSec: 0, fit: 'contain'});
 assert.equal(patch.sourceNote, video.src, 'does not invent an origin or an execution claim');
 assert.equal(patch.media.cursor, undefined);
 assert.equal(patch.media.camera, undefined);
});

test('binding a first asset removes any dangling old highlights without altering speech references', () => {
 const unbound = {...scene, media: undefined};
 const edited = {...unbound, ...sceneMediaBindingPatch(unbound, asset)};
 assert.deepEqual(edited.highlights, []);
 assert.equal(edited.sourceText, scene.sourceText);
 assert.equal(edited.sourceCaptionIds, scene.sourceCaptionIds);
});

// Exercise the same real Zustand setPresentation history used by both handlers.
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
 compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText).toString('base64');
const timelineUrl = moduleUrl(fs.readFileSync(new URL('../src/timeline.ts', import.meta.url), 'utf8'));
let storeSource = fs.readFileSync(new URL('../editor/store.ts', import.meta.url), 'utf8');
for (const [specifier, url] of [
 ['../src/apply-autocut-project.mjs', new URL('../src/apply-autocut-project.mjs', import.meta.url).href],
 ['../src/edit-caption-words.mjs', new URL('../src/edit-caption-words.mjs', import.meta.url).href],
 ['../src/split-clip-captions.mjs', new URL('../src/split-clip-captions.mjs', import.meta.url).href],
 ['../src/presentation.mjs', new URL('../src/presentation.mjs', import.meta.url).href],
 ['../src/timeline', timelineUrl], ['zustand', import.meta.resolve('zustand')],
]) storeSource = storeSource.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`);
const {useEditor} = await import(moduleUrl(storeSource));

test('replacing one scene media is one undoable edit; redo preserves every other scene and source time', () => {
 const clips = [{id: 'voice', src: 'clips/voice.mp4', inSec: 1, outSec: 10}];
 const captions = [{id: 'caption', clipId: 'voice', startMs: 1200, endMs: 2200, topPct: 88,
  words: [{text: '原声依据', startMs: 1200, endMs: 2200}]}];
 const other = {...scene, id: 'other', startMs: 8000, endMs: 10000};
 const presentation = {theme: 'knowledge', style: 'reference', format: 'landscape', chapters: [],
  scenes: [scene, other]};
 const meta = {durationInFrames: 270, fps: 30, width: 1920, height: 1080};
 useEditor.getState().init(meta, captions, '#3156b9', clips, null, [], [asset], presentation);
 const editedScene = {...scene, ...sceneMediaBindingPatch(scene, asset)};
 useEditor.getState().setPresentation({...presentation, scenes: [editedScene, other]});
 let state = useEditor.getState();
 assert.equal(state.past.length, 1);
 assert.equal(state.presentation.scenes[1], other);
 assert.equal(state.captions, captions);
 assert.equal(state.clips, clips);
 assert.deepEqual(state.meta, meta);
 state.undo();
 assert.deepEqual(useEditor.getState().presentation, presentation);
 useEditor.getState().redo();
 state = useEditor.getState();
 assert.deepEqual(state.presentation.scenes[0], editedScene);
 assert.deepEqual(state.presentation.scenes[1], other);
 assert.deepEqual(state.captions, captions);
 assert.deepEqual(state.clips, clips);
 assert.deepEqual(state.meta, meta);
});
