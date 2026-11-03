import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {adaptiveSilenceRanges, buildCutlist, buildWordsDocument, keepRanges, projectSourceMs, audioRangeForVideo, snapTimeMs} from '../src/fine-cut.mjs';
import {filterGraph, planFromClock, readPcm16, renderFineCut} from '../scripts/render-fine-cut.mjs';

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
  assert.ok(kept < 7 && kept > 3.5, kept);
  assert.equal(projectSourceMs(5000, keeps) != null, true);
  assert.equal(audioRangeForVideo(1, 2, 0.213).startSec, 1);
  assert.match(filterGraph([[1, 2]], 30), /\[0:a\]atrim=start=1\.0000:end=2\.0000/);
  assert.doesNotMatch(filterGraph([[1, 2]], 30), /atrim=start=0\.7870/);
});

test('a 12s word gap and a sub-0.65s gap shrink even when silencedetect is blind', () => {
  const clip = {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 110};
  const spoken = [
    {text: '前面这句说完', startMs: 80000, endMs: 82000},
    {text: '半秒后接上', startMs: 82550, endMs: 83500},
    {text: '停了十二秒才继续', startMs: 100200, endMs: 103000},
  ];
  const cutlist = buildCutlist({words: spoken, clip, silences: []});
  const pauses = cutlist.removes.filter(row => row.kind === 'pause');
  assert.ok(pauses.some(row => row.endMs - row.startMs > 11000), JSON.stringify(pauses));
  assert.ok(pauses.some(row => row.startMs >= 82000 && row.startMs < 83000 && row.endMs - row.startMs < 700), JSON.stringify(pauses));
});

test('room tone at -41 dB is still a pause relative to speech', () => {
  const rate = 16000;
  const speech = Math.round(32768 * 10 ** (-16 / 20));
  const room = Math.round(32768 * 10 ** (-41 / 20));
  const samples = new Int16Array(rate * 6);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const amp = time < 1 || time > 5 ? speech : room;
    samples[index] = Math.round(amp * Math.sin(2 * Math.PI * 220 * index / rate));
  }
  const gaps = adaptiveSilenceRanges(samples, rate);
  assert.ok(gaps.some(([start, end]) => start < 1.3 && end > 4.7 && end - start > 3), JSON.stringify(gaps));
});

test('a retake cut stops before 只 and never ends inside that kept word', () => {
  const clip = {id: 'take', src: 'clips/take.mp4', inSec: 23, outSec: 30};
  const zhi = {text: '只', startMs: 25550, endMs: 25850};
  const spoken = [
    {text: '如果AI', startMs: 23000, endMs: 24000},
    {text: '给你一个', startMs: 24400, endMs: 25550},
    zhi,
    {text: '给你一个分析框架', startMs: 25850, endMs: 28000},
  ];
  const cutlist = buildCutlist({words: spoken, clip, silences: [], fps: 30});
  const retake = cutlist.removes.find(row => row.kind === 'retake' || row.kind === 'false-start');
  assert.ok(retake, JSON.stringify(cutlist.removes));
  assert.ok(retake.endMs <= zhi.startMs, JSON.stringify(retake));
  assert.ok(retake.endMs > zhi.startMs - 40, JSON.stringify(retake));
  assert.equal(retake.status, 'proposed');
  const accepted = {...cutlist, removes: cutlist.removes.map(row => row.id === retake.id ? {...row, status: 'accepted'} : row)};
  const keeps = keepRanges(clip, accepted.removes);
  assert.ok(projectSourceMs(zhi.startMs, keeps) != null);
  assert.ok(projectSourceMs(zhi.endMs - 1, keeps) != null);
});

test('a long word with an internal dip is a reviewable false start, without a script-specific phrase', () => {
  assert.equal(fs.readFileSync(new URL('../src/fine-cut.mjs', import.meta.url), 'utf8').includes('从一个['), false);
  const rate = 16000;
  const samples = new Int16Array(rate * 2);
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const amp = time < 0.25 || time > 0.7 ? loud : loud / 20;
    samples[index] = Math.round(amp * Math.sin(2 * Math.PI * 220 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '回', startMs: 0, endMs: 1100}],
    clip: {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 2},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const hit = cutlist.removes.find(row => row.kind === 'false-start');
  assert.ok(hit, JSON.stringify(cutlist.removes));
  assert.equal(hit.status, 'proposed');
  assert.equal(hit.evidence[0], '回');
  assert.ok(hit.endMs < 1100);
  assert.match(hit.reason, /同一个词/);
});

test('silence folded into a word duration is still proposed as a pause', () => {
  const rate = 16000;
  const samples = new Int16Array(rate * 2);
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 0.25 || (time > 0.95 && time < 1.4);
    samples[index] = Math.round((speaking ? loud : loud / 30) * Math.sin(2 * Math.PI * 180 * time));
  }
  const cutlist = buildCutlist({
    words: [
      {text: '这句被拉长了', startMs: 0, endMs: 1400},
      {text: '下一句', startMs: 1400, endMs: 1800},
    ],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 2},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const pause = cutlist.removes.find(row => row.kind === 'pause' && row.startMs > 200 && row.endMs < 1100);
  assert.ok(pause, JSON.stringify(cutlist.removes));
  assert.equal(pause.status, 'proposed');
  assert.ok(pause.endMs - pause.startMs > 300);
});

test('lowercase agent and AIagent become term candidates without new clocks', () => {
  const document = buildWordsDocument({words: [
    {text: 'agent', startMs: 0, endMs: 400},
    {text: 'AIagent', startMs: 500, endMs: 900},
  ]});
  assert.ok(document.corrections.some(row => row.before === 'agent' && row.after === 'Agent' && row.status === 'proposed'));
  assert.ok(document.corrections.some(row => row.before === 'AIagent' && row.after === 'AI Agent'));
  assert.deepEqual(document.words.map(word => [word.startMs, word.endMs]), [[0, 400], [500, 900]]);
});

test('a 67ms tail sliver is not kept', () => {
  const keeps = keepRanges({inSec: 0, outSec: 127.934}, [{status: 'accepted', kind: 'pause', startMs: 100000, endMs: 127867}]);
  assert.equal(keeps.length, 1);
  assert.ok(keeps[0][1] <= 100.05);
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
  assert.ok(Number(rendered.loudness.output_tp) <= -1.5, JSON.stringify(rendered.loudness));
});

function writeWav(file, samples, rate = 16000) {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index++) data.writeInt16LE(samples[index], index * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

function bestLagSec(haystack, needle, rate) {
  let best = -Infinity;
  let lag = 0;
  const step = Math.round(rate / 200);
  const limit = haystack.length - needle.length;
  for (let offset = 0; offset <= limit; offset += step) {
    let dot = 0;
    for (let index = 0; index < needle.length; index += step) dot += haystack[offset + index] * needle[index];
    if (dot > best) { best = dot; lag = offset; }
  }
  return lag / rate;
}

test('audio that already starts 0.213s after video stays aligned with the source clock', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-offset-'));
  const rate = 48000;
  const clock = new Int16Array(rate * 4);
  const burstAt = Math.round(1.5 * rate);
  for (let index = 0; index < Math.round(0.08 * rate); index++) clock[burstAt + index] = Math.round(12000 * Math.sin(2 * Math.PI * 880 * index / rate));
  const elementary = clock.subarray(Math.round(0.213 * rate));
  writeWav(path.join(dir, 'elementary.wav'), elementary, rate);
  const source = path.join(dir, 'late.mov');
  const made = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '4', '-i', 'color=c=black:s=160x90:r=30',
    '-i', path.join(dir, 'elementary.wav'),
    '-filter_complex', '[1:a]asetpts=PTS+0.213/TB[a]', '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', source,
  ], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-500));
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time', '-of', 'json', source], {encoding: 'utf8'}).stdout);
  const audioStart = Number(probed.streams.find(stream => stream.codec_type === 'audio').start_time);
  assert.ok(Math.abs(audioStart - 0.213) < 0.04, audioStart);
  const wav = path.join(dir, 'clock.wav');
  assert.equal(spawnSync('python3', ['scripts/source_audio.py', source, wav], {cwd: process.cwd(), encoding: 'utf8'}).status, 0);
  const cutlist = {fps: 30, audioOffsetMs: Math.round(audioStart * 1000), removes: [
    {status: 'accepted', kind: 'pause', startMs: 0, endMs: 1200},
    {status: 'accepted', kind: 'pause', startMs: 1800, endMs: 4000},
  ]};
  const output = path.join(dir, 'fine.mp4');
  renderFineCut({source, cutlist, clip: {inSec: 0, outSec: 4}, output, fps: 30});
  const decoded = path.join(dir, 'out.wav');
  assert.equal(spawnSync('ffmpeg', ['-y', '-i', output, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', decoded], {encoding: 'utf8'}).status, 0);
  const lag = bestLagSec(readPcm16(wav), readPcm16(decoded), 16000);
  assert.ok(Math.abs(lag - 1.2) < 0.05, `burst matches source at ${lag.toFixed(3)}s, expected 1.200s`);
});
