import test from 'node:test';
import assert from 'node:assert/strict';
import {preExportAudit} from '../src/pre-export-audit.mjs';

const clip = (extra = {}) => ({id: 'a', src: 'clips/a.mp4', inSec: 0, outSec: 30, ...extra});
const caption = (id, text, startMs, endMs, extra = {}) => ({id, clipId: 'a', startMs, endMs,
  words: [{text, startMs, endMs}], ...extra});
const scene = (extra = {}) => ({id: 's', clipId: 'a', startMs: 0, endMs: 30000, layout: 'slide', title: '讲义', ...extra});
const ofKind = (p, kind, options) => preExportAudit(p, options).filter(a => a.kind === kind);
const ranges = items => items.map(a => [a.startSec, a.endSec]);

test('cue gaps use retained source spans and speed, not raw source gaps or visual holds', () => {
  const p = {clips: [clip({inSec: 10, outSec: 22, speed: 2})], captions: [
    caption('removed', '删掉的句子', 0, 9000), caption('first', '第一句话', 10000, 12000, {holdMs: 1000}),
    caption('last', '最后一句话', 18000, 22000),
  ]};
  assert.deepEqual(ranges(ofKind(p, 'caption-gap')), [[1, 4]]);
  assert.match(ofKind(p, 'caption-gap')[0].message, /字幕时间空窗，可能含停顿，需试听/);
  assert.equal(ofKind({...p, clips: [clip({inSec: 12, outSec: 18, speed: 4})]}, 'caption-gap').length, 0);
});

test('overlapping cues cover one interval; intentional hidden captions and removed clips produce no gap warnings', () => {
  const p = {clips: [clip({outSec: 7}), clip({id: 'hidden', outSec: 30, showCaptions: false})], captions: [
    caption('one', '第一句话', 0, 3000), caption('two', '第二句话', 2000, 5000),
    caption('gone', '未保留的片段', 0, 30000, {clipId: 'deleted'}),
  ]};
  assert.deepEqual(ranges(ofKind(p, 'caption-gap')), [[5, 7]]);
  assert.deepEqual(ranges(ofKind({clips: [clip({outSec: 5})], captions: [caption('legacy', '绝对时间字幕', 0, 5000, {clipId: undefined})]}, 'caption-gap')), []);
});

test('retake candidates require exact normalized nearby phrases, exclude short words and trimmed text, and never mutate', () => {
  const p = {clips: [clip({outSec: 50})], captions: [
    caption('a1', '这是 REA 项目。', 0, 2000), caption('a2', '这是rea项目！', 3000, 5000),
    caption('short1', '好', 6000, 6500), caption('short2', '好', 7000, 7500),
    caption('similar', '这是另一个项目', 8000, 10000), caption('distant', '这是 REA 项目', 40000, 42000),
    caption('trimmed', '这是 REA 项目', 51000, 53000),
  ]};
  const before = structuredClone(p), result = ofKind(p, 'retake-candidate');
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].captionIds, ['a1', 'a2']);
  assert.deepEqual(ranges(result), [[0, 5]]);
  assert.match(result[0].message, /重录候选.*需试听/);
  assert.deepEqual(p, before);
});

test('a partially retained cue does not establish an exact repeated spoken phrase', () => {
  const p = {clips: [clip({inSec: 2, outSec: 10, speed: 2})], captions: [
    caption('half', '这是同一句话', 0, 4000), caption('whole', '这是同一句话', 5000, 7000),
  ]};
  assert.deepEqual(ofKind(p, 'retake-candidate'), []);
});

test('authored node, tag context, text, and highlight events split visual pacing spans', () => {
  const p = {clips: [clip()], presentation: {scenes: [scene({
    tags: [{id: 'tag', atMs: 0, endMs: 30000, contextAtMs: 6000, lineAtMs: [0, 3000]}],
    nodes: [{id: 'node', atMs: 10000, focusMs: 16000, textCues: [{text: '重点', atMs: 20000}]}],
    highlights: [{id: 'h', atMs: 24000, endMs: 28000}],
  })]}};
  assert.deepEqual(ofKind(p, 'visual-rhythm'), []);
  assert.deepEqual(ranges(ofKind({clips: [clip()], presentation: {scenes: [scene()]}}, 'visual-rhythm')), [[0, 30]]);
});

test('sparse changed camera keys mean continuous motion; identical keys do not conceal a long held layout', () => {
  const camera = [{atMs: 0, x: 0, y: 0, scale: 1}, {atMs: 20000, x: .2, y: 0, scale: 1.2}];
  const p = {clips: [clip()], presentation: {scenes: [scene({media: {src: 'broll-assets/a.png', kind: 'image', camera}})]}};
  assert.deepEqual(ofKind(p, 'visual-rhythm'), []);
  p.presentation.scenes[0].media.camera[1] = {atMs: 20000, x: 0, y: 0, scale: 1};
  assert.deepEqual(ranges(ofKind(p, 'visual-rhythm')), [[0, 30]]);
});

test('removed visual events stay removed; slow playback expands the retained event gap', () => {
  const p = {clips: [clip({inSec: 10, outSec: 20, speed: .5})], presentation: {scenes: [scene({
    tags: [{id: 'removed', atMs: 0, endMs: 8000}, {id: 'also-removed', atMs: 22000, endMs: 29000}],
  })]}};
  assert.deepEqual(ranges(ofKind(p, 'visual-rhythm')), [[0, 20]]);
  p.clips[0].speed = 2;
  assert.deepEqual(ofKind(p, 'visual-rhythm'), []);
});

test('motion crossing a trim stays active, including source transforms and speaker window interpolation', () => {
  const transform = [{t: 0, x: 0, y: 0, scale: 1}, {t: 40, x: 10, y: 0, scale: 2}];
  assert.deepEqual(ofKind({clips: [clip({inSec: 10, outSec: 30, transform})]}, 'visual-rhythm'), []);
  const p = {clips: [clip()], presentation: {scenes: [scene({window: {x: 0, y: 0, size: .2,
    keyframes: [{atMs: 25000, x: .6, y: .4, size: .3}]}})]}};
  assert.deepEqual(ofKind(p, 'visual-rhythm'), []);
});

test('timeline placement matches frame rounding and a rhythm note does not claim pixel-static output', () => {
  const p = {clips: [clip({outSec: 1.01}), clip({id: 'b', outSec: 12})]};
  const notes = ofKind(p, 'visual-rhythm');
  assert.deepEqual(ranges(notes), [[1, 13]]);
  assert.match(notes[0].message, /待看节奏.*实际视频运动与动画效果需预览确认/);
  assert.deepEqual(preExportAudit({clips: []}), []);
});
