import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {adaptiveSilenceRanges, buildCutlist, buildWordsDocument, keepRanges, projectSourceMs, audioRangeForVideo, snapTimeMs} from '../src/fine-cut.mjs';
import {decodedAudioDuration, filterGraph, frameSegments, planFromClock, probeFrameRate, readPcm16, renderFineCut, syncAtCuts} from '../scripts/render-fine-cut.mjs';

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
  assert.match(filterGraph([[1, 2]], 30), /trim=start_frame=30:end_frame=60/);
  assert.match(filterGraph([[1, 2]], 30), /\[0:a\]atrim=start=1\.000000:end=2\.000000/);
  assert.match(filterGraph([[122.067, 122.233]], 30), /trim=start_frame=3662:end_frame=3667/);
  assert.match(filterGraph([[122.067, 122.233]], 30), /atrim=start=122\.066667:end=122\.233333/);
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
  assert.equal(retake.status, retake.kind === 'false-start' ? 'pending' : 'proposed');
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
  assert.equal(hit.status, 'pending');
  assert.equal(hit.evidence[0], '回');
  assert.ok(hit.endMs < 1100);
  assert.ok(Math.abs(hit.endMs - Math.round(hit.endMs / 1000 * 30) / 30 * 1000) <= 1, hit.endMs);
  assert.match(hit.reason, /两边都还有人声/);
});

function onFrame(ms) {
  return Math.abs(ms - Math.round(ms / 1000 * 30) / 30 * 1000) <= 1;
}

function tone(length, rate, loud, from, to) {
  const samples = new Int16Array(length);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const amp = time >= from && time < to ? loud : loud / 40;
    samples[index] = Math.round(amp * Math.sin(2 * Math.PI * 220 * time));
  }
  return samples;
}

test('a word that is mostly silence still yields a pause against the clip speech level', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 8);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 6 || (time >= 6 && time < 6.15);
    samples[index] = Math.round((speaking ? loud : loud / 40) * Math.sin(2 * Math.PI * 200 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '大家', startMs: 6000, endMs: 7440}],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 8},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const pause = cutlist.removes.find(row => row.kind === 'pause' && row.endMs - row.startMs > 800);
  assert.ok(pause, JSON.stringify(cutlist.removes));
  assert.equal(cutlist.removes.some(row => row.kind === 'false-start'), false);
});

test('a trailing pause inside a word is a pause and does not clip the syllable', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 4);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 2 || (time >= 2.2 && time < 2.4);
    samples[index] = Math.round((speaking ? loud : loud / 40) * Math.sin(2 * Math.PI * 180 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '什么', startMs: 2200, endMs: 3100}],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 4},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  assert.equal(cutlist.removes.some(row => row.kind === 'false-start'), false, JSON.stringify(cutlist.removes));
  const pause = cutlist.removes.find(row => row.kind === 'pause' && row.startMs >= 2350);
  assert.ok(pause, JSON.stringify(cutlist.removes));
});

test('speech immediately before a dip is not a false start when nothing follows inside the word', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 4);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 2 || (time >= 2.5 && time < 2.7);
    samples[index] = Math.round((speaking ? loud : loud / 40) * Math.sin(2 * Math.PI * 190 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '求', startMs: 2500, endMs: 3300}],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 4},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  assert.equal(cutlist.removes.some(row => row.kind === 'false-start'), false, JSON.stringify(cutlist.removes));
  const pause = cutlist.removes.find(row => row.kind === 'pause' && row.startMs >= 2650);
  assert.ok(pause, JSON.stringify(cutlist.removes));
  assert.equal(cutlist.removes.some(row => row.startMs < 2650 && row.endMs > 2520), false, JSON.stringify(cutlist.removes));
});

test('a fully quiet word is a pause shrink, not a false start', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 5);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 2 || time >= 4;
    samples[index] = Math.round((speaking ? loud : loud / 40) * Math.sin(2 * Math.PI * 210 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '走', startMs: 2200, endMs: 3400}],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 5},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  assert.equal(cutlist.removes.some(row => row.kind === 'false-start'), false, JSON.stringify(cutlist.removes));
  const pause = cutlist.removes.find(row => row.kind === 'pause' && row.startMs >= 2100 && row.endMs <= 3600);
  assert.ok(pause, JSON.stringify(cutlist.removes));
});

test('an in-word false start is pending and its edges sit on frames', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 3);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time >= 1.3 || (time >= 0.12 && time < 0.28) || (time >= 0.72 && time < 1.05);
    samples[index] = Math.round((speaking ? loud : 0) * Math.sin(2 * Math.PI * 240 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '回', startMs: 40, endMs: 1100}],
    clip: {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 2},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const hit = cutlist.removes.find(row => row.kind === 'false-start');
  assert.ok(hit, JSON.stringify(cutlist.removes));
  assert.equal(hit.status, 'pending');
  assert.ok(onFrame(hit.startMs), hit.startMs);
  assert.ok(onFrame(hit.endMs), hit.endMs);
  assert.ok(hit.startMs <= 140, hit.startMs);
  assert.ok(hit.endMs <= 720, hit.endMs);
  assert.ok(windowRms(samples, rate, hit.startMs / 1000) < windowRms(samples, rate, 0.16) * 0.25);
  const clip = {inSec: 0, outSec: 2};
  assert.deepEqual(keepRanges(clip, cutlist.removes), [[0, 2]]);
  const accepted = keepRanges(clip, cutlist.removes.map(row => row.id === hit.id ? {...row, status: 'accepted'} : row));
  assert.equal(projectSourceMs(180, accepted), null);
  assert.ok(projectSourceMs(800, accepted) != null);
});

function windowRms(samples, rate, sec) {
  const win = Math.round(0.02 * rate);
  const origin = Math.max(0, Math.round(sec * rate));
  let energy = 0;
  let count = 0;
  for (let index = 0; index < win && origin + index < samples.length; index++) {
    const value = samples[origin + index] / 32768;
    energy += value * value;
    count += 1;
  }
  return Math.sqrt(energy / Math.max(1, count));
}

test('a breath after a dip is not counted as the speech on the far side', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const breath = Math.round(loud * 10 ** (-15 / 20));
  const samples = new Int16Array(rate * 4);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const full = time < 1.5 || time >= 2.8 || (time >= 1.5 && time < 1.72);
    const air = time >= 2.35 && time < 2.7;
    const amp = full ? loud : air ? breath : Math.round(loud / 40);
    samples[index] = Math.round(amp * Math.sin(2 * Math.PI * 210 * time));
  }
  const cutlist = buildCutlist({
    words: [{text: '架。', startMs: 1500, endMs: 2700}],
    clip: {id: 'talk', src: 'clips/talk.mp4', inSec: 0, outSec: 4},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  assert.equal(cutlist.removes.some(row => row.kind === 'false-start'), false, JSON.stringify(cutlist.removes));
  assert.ok(cutlist.removes.some(row => row.kind === 'pause'), JSON.stringify(cutlist.removes));
});

test('an in-word false start starts after the previous word on a quiet sample', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 4);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const speaking = time < 0.4 || (time >= 0.48 && time < 0.7) || (time >= 1.2 && time < 1.55) || time >= 2.6;
    samples[index] = Math.round((speaking ? loud : 0) * Math.sin(2 * Math.PI * 240 * time));
  }
  const cutlist = buildCutlist({
    words: [
      {text: '从', startMs: 0, endMs: 400},
      {text: '回', startMs: 360, endMs: 1550},
    ],
    clip: {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 4},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const hit = cutlist.removes.find(row => row.kind === 'false-start');
  assert.ok(hit, JSON.stringify(cutlist.removes));
  assert.equal(hit.status, 'pending');
  assert.ok(hit.startMs >= 400, hit.startMs);
  assert.ok(hit.startMs < 480, hit.startMs);
  assert.ok(onFrame(hit.startMs), hit.startMs);
  assert.ok(onFrame(hit.endMs), hit.endMs);
  assert.ok(hit.endMs <= 1200, hit.endMs);
  const speechRms = windowRms(samples, rate, 0.1);
  assert.ok(windowRms(samples, rate, hit.startMs / 1000) < speechRms * 0.25, windowRms(samples, rate, hit.startMs / 1000));
  const clip = {inSec: 0, outSec: 4};
  const accepted = keepRanges(clip, cutlist.removes.map(row => row.id === hit.id ? {...row, status: 'accepted'} : row));
  assert.ok(projectSourceMs(200, accepted) != null);
  assert.equal(projectSourceMs(550, accepted), null);
  assert.ok(projectSourceMs(1300, accepted) != null);
});

test('a false start walks back across the word Whisper merged the retake into', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const samples = new Int16Array(rate * 4);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    const hole = time >= 0.9 && time < 0.92;
    const speaking = !hole && (time < 0.5 || (time >= 0.62 && time < 1.2) || (time >= 1.75 && time < 2.2) || time >= 3.1);
    samples[index] = Math.round((speaking ? loud : 0) * Math.sin(2 * Math.PI * 220 * time));
  }
  const cutlist = buildCutlist({
    words: [
      {text: '就是', startMs: 0, endMs: 500},
      {text: '从', startMs: 620, endMs: 1050},
      {text: '回', startMs: 1050, endMs: 2200},
    ],
    clip: {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 4},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const hit = cutlist.removes.find(row => row.kind === 'false-start');
  assert.ok(hit, JSON.stringify(cutlist.removes));
  assert.equal(hit.status, 'pending');
  assert.ok(hit.startMs >= 500 && hit.startMs <= 650, hit.startMs);
  assert.ok(onFrame(hit.startMs) && onFrame(hit.endMs), JSON.stringify(hit));
  assert.ok(hit.endMs <= 1750 && hit.endMs > 1200, hit.endMs);
  assert.ok(windowRms(samples, rate, hit.startMs / 1000) < windowRms(samples, rate, 0.2) * 0.25);
  const clip = {inSec: 0, outSec: 4};
  const accepted = keepRanges(clip, cutlist.removes.map(row => row.id === hit.id ? {...row, status: 'accepted'} : row));
  assert.ok(projectSourceMs(300, accepted) != null, 'kept speech before the 40ms silence stays');
  assert.equal(projectSourceMs(800, accepted), null, 'the abandoned word before the merged token is removed');
  assert.ok(projectSourceMs(1900, accepted) != null, 'speech after the dip stays');
});

test('a 15dB dip in front of the false start is the cut, and the word before it stays', () => {
  const rate = 16000;
  const loud = Math.round(32768 * 10 ** (-16 / 20));
  const shallow = Math.round(loud * 10 ** (-15 / 20));
  const deeper = Math.round(loud * 10 ** (-26 / 20));
  const samples = new Int16Array(rate * 5);
  for (let index = 0; index < samples.length; index++) {
    const time = index / rate;
    let amp = 0;
    if (time < 0.2 || (time >= 0.4 && time < 0.85) || (time >= 0.95 && time < 1.6) || (time >= 2.15 && time < 2.7) || time >= 3.5) amp = loud;
    else if (time >= 0.2 && time < 0.4) amp = deeper;
    else if (time >= 0.85 && time < 0.95) amp = shallow;
    samples[index] = Math.round(amp * Math.sin(2 * Math.PI * 200 * time));
  }
  const cutlist = buildCutlist({
    words: [
      {text: '就是', startMs: 0, endMs: 850},
      {text: '从', startMs: 950, endMs: 1450},
      {text: '回', startMs: 1450, endMs: 2700},
    ],
    clip: {id: 'take', src: 'clips/take.mp4', inSec: 0, outSec: 5},
    silences: [], samples, sampleRate: rate, fps: 30,
  });
  const hit = cutlist.removes.find(row => row.kind === 'false-start');
  assert.ok(hit, JSON.stringify(cutlist.removes));
  assert.equal(hit.status, 'pending');
  assert.ok(hit.startMs >= 820 && hit.startMs <= 980, hit.startMs);
  assert.ok(onFrame(hit.startMs) && onFrame(hit.endMs), JSON.stringify(hit));
  const clip = {inSec: 0, outSec: 5};
  const accepted = keepRanges(clip, cutlist.removes.map(row => row.id === hit.id ? {...row, status: 'accepted'} : row));
  assert.ok(projectSourceMs(500, accepted) != null);
  assert.equal(projectSourceMs(1100, accepted), null);
  assert.ok(projectSourceMs(2300, accepted) != null);
  assert.ok(cutlist.removes.filter(row => row.kind === 'false-start').every(row => row.startMs > 800), JSON.stringify(cutlist.removes));
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

test('off-frame pieces stay the same length in audio and video, including the last piece', () => {
  const fps = 30;
  const frame = 1 / fps;
  const keeps = [
    [0.067, 0.401],
    [0.567, 0.833],
    [1.067, 1.501],
    [1.733, 2.067],
    [2.233, 2.567],
    [2.801, 3.233],
    [3.401, 3.567],
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-frames-'));
  const source = path.join(dir, 'src.mp4');
  const made = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '4', '-i', 'color=c=black:s=160x90:r=30',
    '-f', 'lavfi', '-t', '4', '-i', 'sine=frequency=440:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', source,
  ], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-400));
  const removes = [];
  for (let index = 0; index < keeps.length - 1; index++) {
    removes.push({status: 'accepted', kind: 'pause', startMs: Math.round(keeps[index][1] * 1000), endMs: Math.round(keeps[index + 1][0] * 1000)});
  }
  const output = path.join(dir, 'fine.mp4');
  const rendered = renderFineCut({
    source, output, fps,
    clip: {inSec: keeps[0][0], outSec: keeps.at(-1)[1]},
    cutlist: {removes},
  });
  const segments = frameSegments(rendered.keeps, fps);
  assert.equal(segments.length, keeps.length);
  const expectedFrames = segments.reduce((sum, segment) => sum + segment.frames, 0);
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration,nb_frames', '-of', 'json', output], {encoding: 'utf8'}).stdout);
  const video = probed.streams.find(stream => stream.codec_type === 'video');
  const audio = probed.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(Number(video.nb_frames), expectedFrames);
  assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) <= frame, `${video.duration} vs ${audio.duration}`);
  assert.ok(Math.abs(Number(video.duration) - rendered.expectedSec) <= frame, `${video.duration} vs ${rendered.expectedSec}`);
  const pts = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', output], {encoding: 'utf8'})
    .stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => Number(line.replace(/,/g, ''))).filter(Number.isFinite);
  let cursor = 0;
  for (const segment of segments) {
    const count = pts.filter(time => time >= cursor - 1e-4 && time < cursor + segment.durationSec - 1e-4).length;
    assert.equal(count, segment.frames, `segment at ${cursor} has ${count} frames, expected ${segment.frames}`);
    cursor += segment.durationSec;
  }
  assert.equal(rendered.sync.joins.length, keeps.length - 1);
  assert.equal(rendered.sync.withinOneFrame, true, JSON.stringify(rendered.sync));
  const tail = segments.at(-1).durationSec;
  assert.ok(Math.abs((Number(audio.duration) - (rendered.expectedSec - tail)) - tail) <= frame);
});

test('the sync check flags a late join and a duration gap the old 80ms gate ignored', () => {
  const fps = 30;
  const frame = 1 / fps;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-drift-'));
  const short = path.join(dir, 'short.mp4');
  const made = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '1.333333', '-i', 'color=c=black:s=160x90:r=30',
    '-f', 'lavfi', '-t', '1.333333', '-i', 'sine=frequency=440:sample_rate=48000',
    '-frames:v', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', short,
  ], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-400));
  const keeps = Array.from({length: 7}, (_, index) => [index * 8 * frame, (index + 1) * 8 * frame]);
  const late = syncAtCuts(short, keeps, fps);
  assert.equal(late.joins.length, 6);
  assert.ok(Math.abs(late.joins[5].videoDeltaSec) > frame, JSON.stringify(late.joins[5]));
  assert.equal(late.withinOneFrame, false, JSON.stringify(late));
  const padded = path.join(dir, 'padded.mp4');
  const pad = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '1', '-i', 'color=c=black:s=160x90:r=30',
    '-f', 'lavfi', '-t', '1.05', '-i', 'sine=frequency=440:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-t', '1.05', padded,
  ], {encoding: 'utf8'});
  assert.equal(pad.status, 0, pad.stderr?.slice(-400));
  const drift = syncAtCuts(padded, [[0, 1]], fps);
  assert.ok(Math.abs(drift.durationDeltaSec) > frame, drift.durationDeltaSec);
  assert.ok(Math.abs(drift.durationDeltaSec) < 0.08, drift.durationDeltaSec);
  assert.equal(drift.withinOneFrame, false, JSON.stringify(drift));
});

test('frame indexes follow the source rational rate once nominal 30fps has drifted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-rate-'));
  const source = path.join(dir, 'slow.mp4');
  const made = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '2', '-i', 'color=c=black:s=160x90:r=100000/3334',
    '-f', 'lavfi', '-t', '2', '-i', 'sine=frequency=440:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', source,
  ], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-400));
  const rate = probeFrameRate(source, 30);
  const at = 96;
  const nominal = Math.round(at * 30);
  const mapped = Math.round(at * rate.num / rate.den);
  assert.notEqual(mapped, nominal);
  const graph = filterGraph([[at, at + 1]], 30, rate);
  assert.match(graph, new RegExp(`trim=start_frame=${mapped}:`));
  assert.doesNotMatch(graph, new RegExp(`trim=start_frame=${nominal}:`));
  const segments = frameSegments([[at, at + 1]], 30, rate);
  assert.equal(segments[0].fs, mapped);
  assert.ok(Math.abs(segments[0].startSec - nominal / 30) > 0.01, segments[0].startSec);
});

test('withinOneFrame uses decoded audio length, not the AAC container duration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fine-aac-'));
  const file = path.join(dir, 'edit.mp4');
  const made = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-t', '2', '-i', 'color=c=black:s=160x90:r=30',
    '-f', 'lavfi', '-t', '2', '-i', 'sine=frequency=440:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-use_editlist', '0', file,
  ], {encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr?.slice(-400));
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', file], {encoding: 'utf8'}).stdout);
  const container = Number(probed.streams.find(stream => stream.codec_type === 'audio').duration);
  const decoded = decodedAudioDuration(file);
  assert.ok(Math.abs(decoded - container) > 0.004, `decoded ${decoded} container ${container}`);
  const sync = syncAtCuts(file, [[0, 2]], 30);
  assert.ok(Math.abs(sync.audioDurationSec - decoded) < 0.002, JSON.stringify(sync));
  assert.ok(Math.abs(sync.audioDurationSec - container) > 0.003, JSON.stringify(sync));
  assert.equal(sync.withinOneFrame, true, JSON.stringify(sync));
});
