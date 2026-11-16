// Short whiteboard proof: a few stills and at most 10 seconds of audio.
// The spoken lines are made up for this check. No private transcript is read.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {loadAssetLibrary} from '../src/asset-library.mjs';
import {draftScriptStoryboard} from '../src/script-storyboard.mjs';
import {alignStoryboard, projectKeepMs} from '../src/whiteboard-align.mjs';
import {sfxAmplitude, sfxEvents, voiceLoudnormFilter} from '../src/whiteboard-audio.mjs';
import {renderWhiteboardFrame} from '../src/whiteboard-frame.mjs';
import {readWhiteboardStyle} from '../src/whiteboard-style.mjs';
import {writePlaceholderSfx} from './placeholder-sfx.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixture = path.join(root, 'tests', 'fixtures', 'script-assets');
const outDir = path.resolve(process.argv[2] || path.join(root, 'test-output', 'whiteboard-sample'));
const style = readWhiteboardStyle().style;
if (!style) throw new Error('风格规范读不出来');
writePlaceholderSfx(path.join(fixture, style.audio.sfx.dir));

const text = '今天想聊一件小事。真正的麻烦是表格还得自己填。打开聊天窗口，把要求打进去。';
const parts = text.split('');
let clock = 0;
const words = parts.map((token, index) => {
  if (index > 0 && parts[index - 1] === '。') clock += 480;
  const startMs = clock;
  clock += 160;
  return {text: token, startMs, endMs: startMs + 150};
});
const gapStart = words.find((word, index) => index > 0 && parts[index - 1] === '。').startMs;
const secondSentence = words.findIndex((word, index) => index > 0 && parts[index - 1] === '。');
const thirdSentence = words.findIndex((word, index) => index > secondSentence && parts[index - 1] === '。');
const keeps = [
  [0, words[secondSentence - 1].endMs / 1000],
  [words[secondSentence].startMs / 1000, words[thirdSentence - 1].endMs / 1000],
  [words[thirdSentence].startMs / 1000, words.at(-1).endMs / 1000],
];
const library = loadAssetLibrary(fixture);
const drafted = draftScriptStoryboard({sourceText: text, words, assets: library.items, source: 'transcript'});
const aligned = alignStoryboard(drafted, {keeps, style});
const shots = aligned.storyboard.shots.filter((shot) => shot.timeRange);
const durationMs = Math.max(...shots.map((shot) => shot.timeRange.endMs)) + 400;
if (durationMs > 10000) throw new Error(`试听超过 10 秒：${durationMs}ms`);

function assetSvg(shot) {
  const asset = library.items.find((item) => item.id === shot.assetId);
  if (!asset?.path) return '';
  return fs.readFileSync(path.join(fixture, asset.path), 'utf8');
}

function portrait() {
  const bg = style.canvas.background;
  const ink = style.color.ink;
  const shirt = style.color.support;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="${bg}"/><rect y="140" width="220" height="80" fill="${shirt}" opacity="0.28"/><circle cx="110" cy="78" r="28" fill="${bg}" stroke="${ink}" stroke-width="4"/><path d="M68 176 Q110 118 152 176" fill="${shirt}" stroke="${ink}" stroke-width="4"/></svg>`;
}

function cueAt(shot, motion) {
  return shot.cues.find((item) => item.motion === motion)?.atMs ?? shot.timeRange.startMs;
}

const frames = [
  {name: 'keyframe-bounce', shot: shots[0], timeMs: cueAt(shots[0], '大字回弹') + style.motion['大字回弹'].durationMs * 0.45, chapter: '01'},
  {name: 'keyframe-stamp', shot: shots[1], timeMs: cueAt(shots[1], '印章') + style.motion['印章落下'].durationMs * 0.85, chapter: ''},
  {name: 'keyframe-type', shot: shots[2], timeMs: shots[2].timeRange.startMs + (shots[2].timeRange.endMs - shots[2].timeRange.startMs) * 0.62, chapter: '02'},
];
fs.mkdirSync(outDir, {recursive: true});
const portraitSvg = portrait();
for (const frame of frames) {
  const svg = renderWhiteboardFrame({style, shot: frame.shot, timeMs: frame.timeMs, assetSvg: assetSvg(frame.shot), portraitSvg, chapter: frame.chapter});
  const svgPath = path.join(outDir, `${frame.name}.svg`);
  const pngPath = path.join(outDir, `${frame.name}.png`);
  fs.writeFileSync(svgPath, svg);
  const rendered = spawnSync('ffmpeg', ['-y', '-i', svgPath, pngPath], {encoding: 'utf8'});
  if (rendered.status !== 0) throw new Error(rendered.stderr?.slice(-500) || '关键帧导出失败');
}

const rate = 22050;
const count = Math.ceil(durationMs / 1000 * rate);
const mix = new Float64Array(count);
for (const word of words) {
  const start = projectKeepMs(word.startMs, keeps);
  const end = projectKeepMs(word.endMs, keeps);
  if (start == null || end == null) continue;
  for (let i = Math.floor(start / 1000 * rate); i < Math.min(count, Math.ceil(end / 1000 * rate)); i += 1) {
    const t = i / rate;
    mix[i] += 0.12 * Math.sin(2 * Math.PI * 190 * t) + 0.05 * Math.sin(2 * Math.PI * 380 * t);
  }
}
const cap = sfxAmplitude(style);
for (const event of sfxEvents(aligned.storyboard, style)) {
  const file = path.join(fixture, style.audio.sfx.dir, event.file);
  const buf = fs.readFileSync(file);
  const samples = [];
  for (let i = 44; i + 1 < buf.length; i += 2) samples.push(buf.readInt16LE(i) / 32768);
  const peak = Math.max(...samples.map((sample) => Math.abs(sample)), 1e-6);
  const gain = cap / peak;
  const at = Math.round(event.atMs / 1000 * rate);
  samples.forEach((sample, index) => {
    if (at + index < count) mix[at + index] += sample * gain;
  });
}
const voice = Buffer.alloc(44 + count * 2);
voice.write('RIFF', 0);
voice.writeUInt32LE(36 + count * 2, 4);
voice.write('WAVE', 8);
voice.write('fmt ', 12);
voice.writeUInt32LE(16, 16);
voice.writeUInt16LE(1, 20);
voice.writeUInt16LE(1, 22);
voice.writeUInt32LE(rate, 24);
voice.writeUInt32LE(rate * 2, 28);
voice.writeUInt16LE(2, 32);
voice.writeUInt16LE(16, 34);
voice.write('data', 36);
voice.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i += 1) voice.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix[i] * 32767))), 44 + i * 2);
const rawPath = path.join(outDir, 'sample-raw.wav');
const samplePath = path.join(outDir, 'sample.wav');
fs.writeFileSync(rawPath, voice);
const measured = spawnSync('ffmpeg', ['-hide_banner', '-i', rawPath, '-af', voiceLoudnormFilter(style), '-f', 'null', '-'], {encoding: 'utf8'});
const stats = measured.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
if (!stats) throw new Error(measured.stderr.slice(-400));
const analysis = JSON.parse(stats[0]);
const normalized = spawnSync('ffmpeg', ['-y', '-i', rawPath, '-af', voiceLoudnormFilter(style, analysis), '-ar', '48000', samplePath], {encoding: 'utf8'});
if (normalized.status !== 0) throw new Error(normalized.stderr.slice(-400));
fs.rmSync(rawPath, {force: true});
const summary = {
  durationMs,
  gapStart,
  keeps,
  shots: shots.map((shot) => ({id: shot.id, role: shot.role, text: shot.text, timeRange: shot.timeRange, cues: shot.cues, screenKeeps: shot.screenKeeps})),
  frames: frames.map((frame) => ({name: frame.name, timeMs: Math.round(frame.timeMs)})),
  sfx: sfxEvents(aligned.storyboard, style).map((event) => ({motion: event.motion, atMs: event.atMs, file: event.file})),
  loudness: {target: style.audio.voice.integratedLufs, measured: analysis.input_i},
};
fs.writeFileSync(path.join(outDir, 'sample.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({outDir, durationMs, frames: summary.frames, sfx: summary.sfx.length}, null, 2));
