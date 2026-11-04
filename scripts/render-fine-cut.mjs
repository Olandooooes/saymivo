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
  const log = run(ffmpeg(), ['-hide_banner', '-i', wav, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=0.85`, '-f', 'null', '-']).stderr;
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
  const vad = spawnSync(python(), ['scripts/detect-speech-pauses.py', '--clocked-wav', wav, '--min-silence-ms', '850'], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
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

export function parseFrameRate(value, fallbackFps = 30) {
  const [num, den] = String(value ?? '').split('/').map(Number);
  if (num > 0 && den > 0 && num / den < 1000) return {num, den};
  return {num: fallbackFps, den: 1};
}

export function probeFrameRate(file, fallbackFps = 30) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'json', file], {encoding: 'utf8'});
  const stream = JSON.parse(probe.stdout || '{}').streams?.[0] ?? {};
  const raw = stream.avg_frame_rate && stream.avg_frame_rate !== '0/0' ? stream.avg_frame_rate : stream.r_frame_rate;
  return parseFrameRate(raw, fallbackFps);
}

// Integer frame window. Nominal 30fps drifts on a source whose real interval
// is 33.34ms; the index follows the source rational rate.
export function frameSegments(keeps, fps = 30, rate = null) {
  const scale = rate?.num > 0 && rate?.den > 0 ? rate : {num: fps, den: 1};
  const segments = [];
  for (const [start, end] of keeps) {
    const fs = Math.round(start * scale.num / scale.den);
    const fe = Math.round(end * scale.num / scale.den);
    if (!(fe > fs)) continue;
    const frames = fe - fs;
    const startSec = fs * scale.den / scale.num;
    const endSec = fe * scale.den / scale.num;
    segments.push({fs, fe, frames, startSec, endSec, durationSec: endSec - startSec});
  }
  return segments;
}

export const PORTRAIT_ENHANCE = 'hqdn3d=1.5:1.5:6:6,unsharp=5:5:0.6';
// Equal-power join. The overlap is borrowed from the removed gap, so the
// kept word tail is not faded and the soundtrack stays the same length as the picture.
export const JOIN_CROSSFADE_SEC = 0.032;

function audioJoinFade(segments, index) {
  if (index <= 0 || index >= segments.length) return 0;
  const left = segments[index - 1];
  const right = segments[index];
  const gap = right.startSec - left.endSec;
  if (gap + 1e-4 < JOIN_CROSSFADE_SEC) return 0;
  if (left.durationSec < JOIN_CROSSFADE_SEC * 2 || right.durationSec < JOIN_CROSSFADE_SEC * 2) return 0;
  return JOIN_CROSSFADE_SEC;
}

export function filterGraph(keeps, fps, rate = null, {enhance = false} = {}) {
  // Audio PTS already include the container delay. Subtracting audioOffsetMs
  // here trims that delay a second time and the soundtrack lands ~offset late.
  // Video and audio of one piece share the same integer frame span.
  // Optional denoise/sharpen stays on the video chain so the audio clock is unchanged.
  const segments = frameSegments(keeps, fps, rate);
  if (!segments.length) return '[0:v]null[v];[0:a]anull[a]';
  const look = enhance ? `,${PORTRAIT_ENHANCE}` : '';
  const parts = segments.map((segment, index) => {
    const prev = audioJoinFade(segments, index);
    const next = audioJoinFade(segments, index + 1);
    const audioStart = segment.startSec - prev / 2;
    const audioEnd = segment.endSec + next / 2;
    const audioDur = Math.max(0, audioEnd - audioStart);
    // A few milliseconds only at the file edges. Joins crossfade instead of fading each side to silence.
    let edge = '';
    if (index === 0 && segment.durationSec > 0.05) edge += ',afade=t=in:st=0:d=0.006';
    if (index === segments.length - 1 && audioDur > 0.05) edge += `,afade=t=out:st=${Math.max(0, audioDur - 0.006).toFixed(6)}:d=0.006`;
    return `[0:v]trim=start_frame=${segment.fs}:end_frame=${segment.fe},setpts=PTS-STARTPTS,fps=${fps}${look}[v${index}];` +
      `[0:a]atrim=start=${audioStart.toFixed(6)}:end=${audioEnd.toFixed(6)},asetpts=PTS-STARTPTS${edge},apad=whole_dur=${audioDur.toFixed(6)},atrim=0:${audioDur.toFixed(6)}[a${index}]`;
  });
  const video = `${segments.map((_, index) => `[v${index}]`).join('')}concat=n=${segments.length}:v=1:a=0[v]`;
  const audio = [];
  if (segments.length === 1) audio.push('[a0]anull[a]');
  else {
    let current = 'a0';
    for (let index = 1; index < segments.length; index++) {
      const out = index === segments.length - 1 ? 'a' : `ax${index}`;
      const fade = audioJoinFade(segments, index);
      audio.push(fade
        ? `[${current}][a${index}]acrossfade=d=${fade.toFixed(3)}:c1=qsin:c2=qsin:o=1[${out}]`
        : `[${current}][a${index}]concat=n=2:v=0:a=1[${out}]`);
      current = out;
    }
  }
  return `${parts.join(';')};${video};${audio.join(';')}`;
}

export function renderFineCut({source, cutlist, clip, output, fps = 30, enhance = false}) {
  const keeps = keepRanges(clip, cutlist.removes);
  const temporary = output.replace(/\.mp4$/i, '') + '.encoded.mp4';
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.rmSync(temporary, {force: true});
  fs.rmSync(output, {force: true});
  const rate = probeFrameRate(source, fps);
  run(ffmpeg(), [
    '-y', '-i', source, '-filter_complex', filterGraph(keeps, fps, rate, {enhance}),
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', temporary,
  ]);
  const reportFile = output.replace(/\.mp4$/i, '') + '.loudness.json';
  run(process.execPath, ['scripts/normalize-voice.mjs', temporary, output, reportFile]);
  fs.rmSync(temporary, {force: true});
  const measured = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const duration = probeDuration(output);
  const expected = frameSegments(keeps, fps, rate).reduce((sum, segment) => sum + segment.durationSec, 0);
  return {output, keeps, durationSec: duration, expectedSec: expected, loudness: measured.applied ?? measured.analysis, sync: syncAtCuts(output, keeps, fps, rate)};
}

function probeDuration(file) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], {encoding: 'utf8'});
  return Number(JSON.parse(probe.stdout).format.duration);
}

function videoFrameTimes(file) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', file,
  ], {encoding: 'utf8'});
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => Number(line.replace(/,/g, ''))).filter(Number.isFinite);
}

function nearestTime(times, target) {
  if (!times.length) return null;
  return times.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best);
}

export function decodedAudioDuration(file) {
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,duration', '-of', 'json', file], {encoding: 'utf8'}).stdout || '{}');
  const audio = probed.streams?.[0];
  const rate = Number(audio?.sample_rate) || 48000;
  const decoded = spawnSync(ffmpeg(), ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-f', 's16le', 'pipe:1'], {maxBuffer: 64 * 1024 * 1024});
  if (decoded.status !== 0 || !decoded.stdout?.length) return Number(audio?.duration);
  return (decoded.stdout.length / 2) / rate;
}

export function syncAtCuts(file, keeps, fps, rate = null) {
  const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration,nb_frames', '-of', 'json', file], {encoding: 'utf8'}).stdout);
  const video = probed.streams?.find(stream => stream.codec_type === 'video');
  const audio = probed.streams?.find(stream => stream.codec_type === 'audio');
  const startDelta = Number(video?.start_time) - Number(audio?.start_time);
  const frames = videoFrameTimes(file);
  const videoDuration = frames.length > 1 ? frames.at(-1) + (frames.at(-1) - frames.at(-2)) : Number(video?.duration);
  const audioDuration = decodedAudioDuration(file);
  const durationDelta = videoDuration - audioDuration;
  const segments = frameSegments(keeps, fps, rate);
  const joins = [];
  let cursor = 0;
  segments.forEach((segment, index) => {
    cursor += segment.durationSec;
    if (index < segments.length - 1) joins.push(cursor);
  });
  const rows = joins.map(time => {
    const audioPts = packetTime(file, 'a', time);
    const videoPts = nearestTime(frames, time);
    return {
      outputSec: +time.toFixed(6),
      audioPts, audioDeltaSec: audioPts == null ? null : audioPts - time,
      videoPts, videoDeltaSec: videoPts == null ? null : videoPts - time,
    };
  });
  const frame = 1 / fps;
  const close = delta => delta != null && Math.abs(delta) <= frame + 1e-4;
  return {
    startDeltaSec: startDelta, durationDeltaSec: durationDelta, videoDurationSec: videoDuration, audioDurationSec: audioDuration, joins: rows,
    videoFrames: frames.length || Number(video?.nb_frames) || 0,
    withinOneFrame: Math.abs(startDelta) <= frame + 1e-4 && Math.abs(durationDelta) <= frame + 1e-4 && rows.every(row => close(row.audioDeltaSec) && close(row.videoDeltaSec)),
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
  const enhance = process.argv.includes('--enhance');
  const [command, source, wordsFile, outputDir] = process.argv.slice(2).filter(arg => arg !== '--enhance');
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
    const rendered = renderFineCut({source, cutlist, clip: {inSec: 0, outSec: duration}, output: outputDir, fps: cutlist.fps ?? 30, enhance});
    console.log(JSON.stringify(rendered));
  }
}
