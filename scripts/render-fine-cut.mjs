// One FFmpeg clock for the accepted cut list: video frames and audio samples
// are trimmed together, then loudnorm runs on that file. Remotion trimBefore
// is not the cut.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {speechPauseGaps} from './speech-pause-gaps.mjs';
import {adaptiveSilenceRanges, buildCutlist, buildWordsDocument, keepRanges, mergeIntervals} from '../src/fine-cut.mjs';

const ffmpeg = () => (fs.existsSync('.tools/bin/ffmpeg') ? '.tools/bin/ffmpeg' : 'ffmpeg');
const python = () => (fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');

function run(cmd, args) {
  const result = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (result.status !== 0) throw Error((result.stderr || result.stdout || result.error?.message || 'ffmpeg failed').slice(-800));
  return result;
}

export function readPcm16(file) {
  const buf = fs.readFileSync(file);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const aligned = Buffer.from(buf.subarray(offset + 8, offset + 8 + size - (size % 2)));
      return new Int16Array(aligned.buffer, aligned.byteOffset, aligned.length / 2);
    }
    offset += 8 + size + (size % 2);
  }
  throw Error('时钟 WAV 没有 data 块');
}

export function silenceRanges(wav, durationSec, noiseDb = -42) {
  const log = run(ffmpeg(), ['-hide_banner', '-i', wav, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=0.40`, '-f', 'null', '-']).stderr;
  const gaps = [];
  let start = null;
  for (const line of log.split('\n')) {
    const open = line.match(/silence_start: ([\d.]+)/);
    const close = line.match(/silence_end: ([\d.]+)/);
    if (open) start = +open[1];
    if (close && start !== null) { gaps.push([start, +close[1]]); start = null; }
  }
  if (start !== null) gaps.push([start, durationSec]);
  return gaps;
}

export function planFromClock({wav, receipt, words, clip, fps = 30, glossary = ''}) {
  const samples = readPcm16(wav);
  const durationSec = samples.length / 16000;
  const bounded = {...clip, inSec: clip.inSec ?? 0, outSec: clip.outSec ?? durationSec, sourceDurationSec: clip.sourceDurationSec ?? durationSec};
  let fromVad = [];
  const vad = spawnSync(python(), ['scripts/detect-speech-pauses.py', '--clocked-wav', wav, '--min-silence-ms', '400'], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  if (vad.status === 0) { try { fromVad = speechPauseGaps(JSON.parse(vad.stdout)); } catch { /* VAD is optional */ } }
  const silences = mergeIntervals([adaptiveSilenceRanges(samples, 16000), fromVad, silenceRanges(wav, durationSec)]);
  const document = buildWordsDocument({
    words, sourceSha256: receipt.sourceSha256, audioClock: receipt, model: 'faster-whisper', glossary,
  });
  const cutlist = buildCutlist({
    words: document.words, clip: bounded, silences, samples, sampleRate: 16000, fps,
    audioOffsetMs: receipt.audioOffsetFromVideoMs ?? 0, sourceSha256: receipt.sourceSha256,
  });
  return {words: document, cutlist, silences, durationSec};
}

export function filterGraph(keeps, fps) {
  // Audio PTS already include the container delay. Subtracting audioOffsetMs
  // here trims that delay a second time and the soundtrack lands ~offset late.
  const parts = keeps.map(([start, end], index) => {
    const duration = Math.max(1 / fps, end - start);
    const fade = duration > 0.05 ? `,afade=t=in:st=0:d=0.012,afade=t=out:st=${Math.max(0, duration - 0.012).toFixed(4)}:d=0.012` : '';
    const span = duration.toFixed(4);
    const open = start.toFixed(4);
    const close = end.toFixed(4);
    return `[0:v]trim=start=${open}:end=${close},setpts=PTS-STARTPTS,fps=${fps}[v${index}];` +
      `[0:a]atrim=start=${open}:end=${close},asetpts=PTS-STARTPTS${fade},apad=whole_dur=${span},atrim=0:${span}[a${index}]`;
  });
  const concat = keeps.map((_, index) => `[v${index}][a${index}]`).join('') + `concat=n=${keeps.length}:v=1:a=1[v][a]`;
  return parts.join(';') + ';' + concat;
}

export function renderFineCut({source, cutlist, clip, output, fps = 30}) {
  const keeps = keepRanges(clip, cutlist.removes);
  const temporary = output.replace(/\.mp4$/i, '') + '.encoded.mp4';
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.rmSync(temporary, {force: true});
  fs.rmSync(output, {force: true});
  run(ffmpeg(), [
    '-y', '-i', source, '-filter_complex', filterGraph(keeps, fps),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', temporary,
  ]);
  const reportFile = output.replace(/\.mp4$/i, '') + '.loudness.json';
  run(process.execPath, ['scripts/normalize-voice.mjs', temporary, output, reportFile]);
  fs.rmSync(temporary, {force: true});
  const measured = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const duration = probeDuration(output);
  const expected = keeps.reduce((sum, [start, end]) => sum + (end - start), 0);
  return {output, keeps, durationSec: duration, expectedSec: expected, loudness: measured.applied ?? measured.analysis, sync: syncAtCuts(output, keeps, fps)};
}

function probeDuration(file) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], {encoding: 'utf8'});
  return Number(JSON.parse(probe.stdout).format.duration);
}

export function syncAtCuts(file, keeps, fps) {
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration', '-of', 'json', file], {encoding: 'utf8'}).stdout);
  const video = probed.streams.find(stream => stream.codec_type === 'video');
  const audio = probed.streams.find(stream => stream.codec_type === 'audio');
  const startDelta = Number(video?.start_time) - Number(audio?.start_time);
  const durationDelta = Number(video?.duration) - Number(audio?.duration);
  const joins = [];
  let cursor = 0;
  keeps.forEach((range, index) => {
    cursor += range[1] - range[0];
    if (index < keeps.length - 1) joins.push(cursor);
  });
  const rows = joins.slice(0, 5).map(time => {
    const audioPts = packetTime(file, 'a', time);
    return {outputSec: +time.toFixed(3), audioPts, audioDeltaSec: audioPts == null ? null : audioPts - time};
  });
  const frame = 1 / fps;
  return {
    startDeltaSec: startDelta, durationDeltaSec: durationDelta, joins: rows,
    withinOneFrame: Math.abs(startDelta) <= frame && Math.abs(durationDelta) <= 0.08 && rows.every(row => row.audioDeltaSec != null && Math.abs(row.audioDeltaSec) <= frame),
  };
}

function packetTime(file, stream, time) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', stream, '-show_entries', 'packet=pts_time', '-of', 'csv=p=0',
    '-read_intervals', `${Math.max(0, time - 0.04)}%+0.12`, file,
  ], {encoding: 'utf8'});
  const times = result.stdout.split('\n').map(Number).filter(Number.isFinite);
  if (!times.length) return null;
  return times.reduce((best, value) => Math.abs(value - time) < Math.abs(best - time) ? value : best);
}

function extractClock(source, wav) {
  fs.rmSync(wav, {force: true});
  fs.rmSync(wav + '.clock.json', {force: true});
  const extracted = spawnSync(python(), ['scripts/source_audio.py', source, wav], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
  if (extracted.status !== 0) throw Error(extracted.stderr?.slice(-400) || '音频时钟提取失败');
  return JSON.parse(fs.readFileSync(wav + '.clock.json', 'utf8'));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const [command, source, wordsFile, outputDir] = process.argv.slice(2);
  if (command === 'plan') {
    const wav = path.join(outputDir, 'clock.wav');
    fs.mkdirSync(outputDir, {recursive: true});
    const receipt = extractClock(path.resolve(source), wav);
    const words = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
    const duration = receipt.durationSec;
    const planned = planFromClock({wav, receipt, words: words.words ?? words, clip: {id: 'source', src: source, inSec: 0, outSec: duration}});
    fs.writeFileSync(path.join(outputDir, 'words.json'), JSON.stringify(planned.words, null, 2));
    fs.writeFileSync(path.join(outputDir, 'cutlist.json'), JSON.stringify(planned.cutlist, null, 2));
    console.log(JSON.stringify({durationSec: planned.durationSec, removes: planned.cutlist.removes.map(row => ({id: row.id, kind: row.kind, startMs: row.startMs, endMs: row.endMs, status: row.status, reason: row.reason}))}));
  } else if (command === 'render') {
    const cutlist = JSON.parse(fs.readFileSync(wordsFile, 'utf8'));
    const duration = probeDuration(source);
    const rendered = renderFineCut({source, cutlist, clip: {inSec: 0, outSec: duration}, output: outputDir, fps: cutlist.fps ?? 30});
    console.log(JSON.stringify(rendered));
  }
}
