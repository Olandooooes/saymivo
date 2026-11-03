import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildCutlist, buildWordsDocument, keepRanges, projectSourceMs, audioRangeForVideo, snapTimeMs} from '../src/fine-cut.mjs';
import {planFromClock, renderFineCut} from '../scripts/render-fine-cut.mjs';

const words = [
  {text: '我们今天讲剪辑', startMs: 200, endMs: 1400},
  {text: '我们今天讲剪辑', startMs: 3200, endMs: 4400},
  {text: '先把口误拿掉', startMs: 5000, endMs: 6200},
];

test('term corrections stay proposed and do not invent word clocks', () => {
  const document = buildWordsDocument({words: [{text: '亲民要素', startMs: 0, endMs: 800}], glossary: ''});
  assert.equal(document.spreadEvenly, false);
  assert.equal(document.words[0].startMs, 0);
  assert.equal(document.words[0].endMs, 800);
  assert.equal(document.corrections[0].status, 'proposed');
  assert.equal(document.corrections[0].before, '亲民要素');
  assert.equal(document.corrections[0].after, '齐民要术');
});

test('repeated sentence is a proposed retake and a long pause shrinks to about 180ms', () => {
  const clip = {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 8};
  const cutlist = buildCutlist({words, clip, silences: [[1.4, 3.2], [4.4, 5.0]], fps: 30, audioOffsetMs: 40});
  const retake = cutlist.removes.find(row => row.kind === 'retake');
  const pause = cutlist.removes.find(row => row.kind === 'pause');
  assert.equal(retake.status, 'proposed');
  assert.match(retake.evidence[0], /我们今天讲剪辑/);
  assert.equal(pause.status, 'proposed');
  assert.equal(pause.keepMs, 180);
  assert.ok(pause.endMs - pause.startMs > 1000, 'the long interior is what gets removed');
  const accepted = {...cutlist, removes: cutlist.removes.map(row => row.kind === 'pause' ? {...row, status: 'accepted'} : row)};
  const keeps = keepRanges(clip, accepted.removes);
  const kept = keeps.reduce((sum, [start, end]) => sum + end - start, 0);
  assert.ok(kept < 7 && kept > 5, kept);
  assert.equal(projectSourceMs(5000, keeps) != null, true);
  assert.equal(audioRangeForVideo(1, 2, 0.04).startSec, 0.96);
});

test('snap chooses the quietest sample and then a frame boundary', () => {
  const samples = Int16Array.from({length: 3200}, (_, index) => index === 800 ? 0 : 8000);
  const snapped = snapTimeMs(50, {samples, sampleRate: 16000, fps: 30, guards: []});
  const frame = Math.round(snapped / 1000 * 30) / 30 * 1000;
  assert.equal(snapped, Math.round(frame));
  assert.ok(Math.abs(snapped - 50) < 40, snapped);
});

test('ffmpeg fine cut uses one clock, loudnorm and frame-close joins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-cut-'));
  const source = path.join(dir, 'src.mov');
  const filter = [
    'aevalsrc=0.2*sin(2*PI*220*t):d=1.2[a0]',
    'aevalsrc=0:d=2.4[a1]',
    'aevalsrc=0.2*sin(2*PI*330*t):d=1.2[a2]',
    'aevalsrc=0:d=1.6[a3]',
    'aevalsrc=0.2*sin(2*PI*440*t):d=1.2[a4]',
    '[a0][a1][a2][a3][a4]concat=n=5:v=0:a=1[a]',
    'color=c=black:s=320x180:r=30:d=7.6[v]',
  ].join(';');
  const made = spawnSync('ffmpeg', ['-y', '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-t', '7.6', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', source], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-400));
  const wav = path.join(dir, 'clock.wav');
  const extracted = spawnSync('python3', ['scripts/source_audio.py', source, wav], {cwd: process.cwd(), encoding: 'utf8'});
  assert.equal(extracted.status, 0, extracted.stderr?.slice(-400));
  const receipt = JSON.parse(fs.readFileSync(wav + '.clock.json', 'utf8'));
  const spoken = [
    {text: '先说一遍', startMs: 200, endMs: 1000},
    {text: '再说清楚', startMs: 3800, endMs: 4600},
    {text: '最后收住', startMs: 6600, endMs: 7400},
  ];
  const planned = planFromClock({wav, receipt, words: spoken, clip: {id: 'src', src: 'clips/src.mp4', inSec: 0, outSec: receipt.durationSec}});
  const pauses = planned.cutlist.removes.filter(row => row.kind === 'pause');
  assert.ok(pauses.length >= 2, JSON.stringify(pauses));
  assert.ok(pauses.every(row => row.status === 'proposed'));
  const accepted = {...planned.cutlist, removes: planned.cutlist.removes.map(row => row.kind === 'pause' ? {...row, status: 'accepted'} : row)};
  const output = path.join(dir, 'fine.mp4');
  const rendered = renderFineCut({source, cutlist: accepted, clip: {inSec: 0, outSec: receipt.durationSec}, output, fps: 30});
  assert.ok(Math.abs(rendered.durationSec - rendered.expectedSec) < 0.08, `${rendered.durationSec} vs ${rendered.expectedSec}`);
  assert.ok(rendered.durationSec < receipt.durationSec - 1.5);
  assert.equal(rendered.sync.withinOneFrame, true, JSON.stringify(rendered.sync));
  const integrated = Number(rendered.loudness.output_i ?? rendered.loudness.input_i);
  assert.ok(Math.abs(integrated + 16) < 1.5, JSON.stringify(rendered.loudness));
});
