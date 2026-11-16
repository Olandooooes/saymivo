import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftScriptStoryboard,
  shotCopyIssues,
  storyboardCopyIssues,
  updateShot,
  upgradeScriptStoryboard,
  validateScriptStoryboard,
} from '../src/script-storyboard.mjs';
import {alignStoryboard, projectKeepMs, typedTextAt} from '../src/whiteboard-align.mjs';
import {musicGainDb, sfxAmplitude, sfxEvents, voiceLoudnormFilter} from '../src/whiteboard-audio.mjs';
import {easingProgress, renderWhiteboardFrame} from '../src/whiteboard-frame.mjs';
import {readWhiteboardStyle} from '../src/whiteboard-style.mjs';

const loaded = readWhiteboardStyle();
const style = loaded.style;

test('the style file is the only source for canvas, lead, loudness and ducking', () => {
  assert.equal(loaded.ok, true, loaded.issues.join('；'));
  assert.equal(style.canvas.background, '#F7F2EA');
  assert.equal(style.canvas.grid.opacity >= 0.18, true);
  assert.equal(style.pip.matte, false);
  assert.equal(style.pip.keepVideoBackground, true);
  assert.equal(style.pip.diameter <= 360, true);
  assert.equal(style.audio.music.enabled, false);
  const filter = voiceLoudnormFilter(style);
  assert.match(filter, new RegExp(`I=${style.audio.voice.integratedLufs}`));
  assert.match(filter, new RegExp(`TP=${style.audio.voice.truePeakDbtp}`));
  const quieter = voiceLoudnormFilter({...style, audio: {...style.audio, voice: {...style.audio.voice, integratedLufs: -14, truePeakDbtp: -2}}});
  assert.match(quieter, /I=-14/);
  assert.equal(sfxAmplitude(style), 10 ** (style.audio.sfx.gainDbMax / 20));
  const music = {...style, audio: {...style.audio, music: {...style.audio.music, enabled: true}}};
  const spans = [{startMs: 1000, endMs: 1600}];
  const open = musicGainDb(music, 100, spans);
  const under = musicGainDb(music, 1200, spans);
  const after = musicGainDb(music, 1600 + style.audio.music.duckReleaseMs, spans);
  assert.equal(open, style.audio.music.gainDb);
  assert.equal(under, style.audio.music.gainDb + style.audio.music.duckDb);
  assert.ok(under < open);
  assert.equal(after, style.audio.music.gainDb);
  assert.equal(musicGainDb(style, 1200, spans), null);
  const broken = validateStyleClone(style);
  assert.equal(broken.length > 0, true);
});

function validateStyleClone(style) {
  return readWhiteboardStyle(JSON.stringify({...style, align: {...style.align, leadMs: -400}})).issues;
}

test('fine-cut keeps move word time, and a later cut can be aligned again', () => {
  assert.equal(projectKeepMs(0, [[0, 0.4], [1.0, 1.8]]), 0);
  assert.equal(projectKeepMs(400, [[0, 0.4], [1.0, 1.8]]), 400);
  assert.equal(projectKeepMs(700, [[0, 0.4], [1.0, 1.8]]), null);
  assert.equal(projectKeepMs(1000, [[0, 0.4], [1.0, 1.8]]), 400);
  assert.equal(projectKeepMs(1800, [[0, 0.4], [1.0, 1.8]]), 1200);
  assert.equal(projectKeepMs(250, null), 250);
  const text = '今天小事。打开表格。';
  const words = [
    {text: '今天', startMs: 200, endMs: 500},
    {text: '小事', startMs: 500, endMs: 900},
    {text: '。', startMs: 900, endMs: 980},
    {text: '打开', startMs: 1600, endMs: 2000},
    {text: '表格', startMs: 2000, endMs: 2400},
    {text: '。', startMs: 2400, endMs: 2480},
  ];
  const keeps = [[0, 0.98], [1.6, 2.48]];
  let doc = draftScriptStoryboard({sourceText: text, words, assets: [], source: 'transcript'});
  doc = updateShot(doc, 's1', {motions: ['大字回弹', '标红'], emphasis: [{text: '小事', style: '标红'}]}).storyboard;
  doc = updateShot(doc, 's2', {motions: ['打字界面', '荧光笔'], emphasis: [{text: '表格', style: '荧光笔'}]}).storyboard;
  const first = alignStoryboard(doc, {keeps, style});
  const again = alignStoryboard(doc, {keeps: null, style});
  const shot = first.storyboard.shots[0];
  const red = shot.cues.find((item) => item.motion === '标红');
  const bounce = shot.cues.find((item) => item.motion === '大字回弹');
  assert.equal(red.atMs, 500);
  assert.equal(red.leadMs, 0);
  assert.equal(bounce.atMs, 160);
  assert.equal(bounce.leadMs, style.align.leadMs);
  assert.equal(first.storyboard.shots[1].timeRange.startMs, 980);
  assert.equal(again.storyboard.shots[1].timeRange.startMs, 1600);
  const typing = first.storyboard.shots[1].typing;
  assert.ok(typing.filter((step) => step.text === '表' || step.text === '格').every((step) => step.atMs <= 1380 && step.atMs === 1380 + style.align.leadMs));
  assert.equal(typedTextAt(typing, 1380).includes('表格'), true);
  assert.equal(typedTextAt(typing, 1380 + style.align.leadMs - 1).includes('表格'), false);
  const events = sfxEvents(first.storyboard, style);
  assert.equal(events.some((event) => event.motion === '标红' && event.atMs === 500 && event.file === style.audio.sfx.slots['标红']), true);
});

test('planning columns warn when a sentence is copied or split, and old files still load', () => {
  const doc = draftScriptStoryboard({sourceText: '今天想聊一件小事。真正的麻烦是表格还得自己填。', source: 'script'});
  assert.equal(validateScriptStoryboard(doc).ok, true);
  assert.equal(doc.version, 2);
  assert.equal(storyboardCopyIssues(doc).length, 0);
  const repeated = {...doc.shots[0], screenKeeps: doc.shots[0].text};
  assert.equal(shotCopyIssues(repeated).some((issue) => issue.code === 'screen-repeats-speech'), true);
  const split = {...doc.shots[0], screenKeeps: '今天想聊', pictureAdds: '一件小事'};
  assert.equal(shotCopyIssues(split).some((issue) => issue.code === 'sentence-split'), true);
  const legacy = {version: 1, kind: 'script-storyboard', source: 'script', sourceText: '只有一句。', words: [], shots: [{id: 's1', text: '只有一句。', role: '开场', emphasis: [], assetId: null, match: null, motions: [], note: '', charRange: null, wordRange: null, timeRange: null}]};
  assert.equal(validateScriptStoryboard(legacy).ok, true);
  const upgraded = upgradeScriptStoryboard(legacy);
  assert.equal(upgraded.version, 2);
  assert.equal(validateScriptStoryboard(upgraded).ok, true);
  assert.equal(typeof upgraded.shots[0].voiceSaid, 'string');
});

test('a frame reads color, grid and timing from the style instead of a private palette', () => {
  const doc = draftScriptStoryboard({sourceText: '打开聊天窗口。', source: 'script'});
  const shot = {...doc.shots[0], screenKeeps: '聊天窗口', motions: ['大字回弹', '印章'], cues: [{motion: '大字回弹', atMs: 0, leadMs: -40, word: '打', wordIndex: 0}, {motion: '印章', atMs: 0, leadMs: -40, word: '打', wordIndex: 0}], timeRange: {startMs: 0, endMs: 800}};
  const svg = renderWhiteboardFrame({style, shot, timeMs: 200, chapter: '01'});
  assert.match(svg, new RegExp(`fill="${style.canvas.background}"`));
  assert.match(svg, new RegExp(`opacity="${style.canvas.grid.opacity}"`));
  assert.match(svg, /聊天窗口/);
  assert.match(svg, new RegExp(style.stamp.label));
  const shifted = renderWhiteboardFrame({style: {...style, canvas: {...style.canvas, background: '#111111'}}, shot, timeMs: 200});
  assert.match(shifted, /#111111/);
  assert.equal(shifted.includes(style.canvas.background), false);
  const early = easingProgress(style.motion['大字回弹'].easing, 0, style.motion['大字回弹'].durationMs);
  const later = easingProgress(style.motion['大字回弹'].easing, 180, style.motion['大字回弹'].durationMs);
  const stiffer = easingProgress({...style.motion['大字回弹'].easing, stiffness: style.motion['大字回弹'].easing.stiffness * 4}, 180, style.motion['大字回弹'].durationMs);
  assert.equal(early, 0);
  assert.notEqual(later, stiffer);
});
