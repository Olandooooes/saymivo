// Rough cut from the hand-edit rules: fillers, failed starts, last-take retakes,
// tiered pauses, word-ending margins, equal-power joins, -16 LUFS.
// The Python package in tools/koubo-port is the implementation that was checked
// against a manual edit. This file only runs it and maps the table into the review UI.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildWordsDocument} from '../src/fine-cut.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const portRoot = path.join(root, 'tools/koubo-port');

export function portPython() {
  const candidates = [process.env.PORT_PYTHON, path.join(portRoot, '.venv/bin/python'), path.join(root, '.venv/bin/python')].filter(Boolean);
  return candidates.find(file => fs.existsSync(file)) || 'python3';
}

function run(args, cwd = root) {
  const result = spawnSync(portPython(), args, {cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) {
    throw Error((result.stderr || result.stdout || result.error?.message || '粗剪脚本失败').slice(-1500));
  }
  return result.stdout || '';
}

function script(name) {
  return path.join(portRoot, 'pipeline', name);
}

const KIND = {'语气词': 'filler', '起句失败': 'false-start', '重说': 'retake'};

function kindOf(type) {
  if (type.includes('起句')) return 'false-start';
  if (type.includes('重说')) return 'retake';
  if (type.includes('语气')) return 'filler';
  return KIND[type] || 'retake';
}

export function toReviewCutlist(portCut, {sourceSha256 = null, portKey = null} = {}) {
  const removes = [];
  for (const row of portCut.removed ?? []) {
    removes.push({
      id: `cut-${row.id}`,
      portId: row.id,
      kind: kindOf(String(row.type || '')),
      startMs: Math.round(row.s * 1000),
      endMs: Math.round(row.e * 1000),
      reason: row.reason || row.type || '',
      evidence: row.text ? [row.text] : [],
      confidence: row.confidence || 'medium',
      status: row.confidence === 'review' ? 'pending' : 'proposed',
    });
  }
  for (const gap of portCut.gaps ?? []) {
    removes.push({
      id: `pause-${gap.id}`,
      gapIndex: gap.id,
      kind: 'pause',
      startMs: Math.round(gap.s * 1000),
      endMs: Math.round(gap.e * 1000),
      keepMs: Math.round(gap.target * 1000),
      reason: `原停顿 ${Number(gap.orig).toFixed(2)} 秒，压到 ${Number(gap.target).toFixed(2)} 秒`,
      evidence: [],
      status: 'proposed',
    });
  }
  return {
    engine: 'koubo-port',
    sourceSha256,
    portKey,
    fps: portCut.fps ?? 30,
    audioOffsetMs: 0,
    removes,
    keep: portCut.keep ?? [],
  };
}

export function wordsFromChars(chars, sourceSha256) {
  return buildWordsDocument({
    words: chars.map(([text, start, end]) => ({text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000)})),
    sourceSha256,
    model: 'paraformer-zh',
  });
}

export function planMedia(media, workdir) {
  fs.mkdirSync(workdir, {recursive: true});
  const log = [];
  log.push(run([script('00_prepare_audio.py'), media, workdir]));
  log.push(run([script('01_transcribe_paraformer.py'), workdir]));
  log.push(run([script('02_speech_regions.py'), workdir]));
  log.push(run([script('03_autocut.py'), workdir]));
  const portCut = JSON.parse(fs.readFileSync(path.join(workdir, 'cutlist.json'), 'utf8'));
  const chars = JSON.parse(fs.readFileSync(path.join(workdir, 'chars.json'), 'utf8'));
  return {portCut, chars, log: log.join('\n')};
}

export function refreshRegions(workdir) {
  return run([script('02_speech_regions.py'), workdir]);
}

export function rerunCut(workdir, cutlist) {
  const reject = (cutlist.removes ?? []).filter(row => row.kind !== 'pause' && row.status !== 'accepted' && row.portId != null).map(row => row.portId);
  const rejectGaps = (cutlist.removes ?? []).filter(row => row.kind === 'pause' && row.status !== 'accepted' && row.gapIndex != null).map(row => row.gapIndex);
  const overrides = path.join(workdir, 'overrides.json');
  fs.writeFileSync(overrides, JSON.stringify({reject, reject_gaps: rejectGaps}));
  run([script('03_autocut.py'), workdir, '--overrides', overrides]);
  return JSON.parse(fs.readFileSync(path.join(workdir, 'cutlist.json'), 'utf8'));
}

export function renderAudio(workdir) {
  return run([script('04_render_audio.py'), workdir]);
}

export function cutVideo(media, workdir) {
  return run([script('05_cut_video.py'), media, workdir]);
}

export function draftPhrases(workdir) {
  run([script('06_phrases.py'), workdir]);
  run([script('07_draft_scenes.py'), workdir]);
  return {
    phrases: JSON.parse(fs.readFileSync(path.join(workdir, 'phrases.json'), 'utf8')),
    scenes: JSON.parse(fs.readFileSync(path.join(workdir, 'scenes.json'), 'utf8')),
    beats: JSON.parse(fs.readFileSync(path.join(workdir, 'preview_beats.json'), 'utf8')),
  };
}

export function prefixKeep(keep, seconds) {
  const out = [];
  let acc = 0;
  for (const [start, end] of keep) {
    const dur = end - start;
    if (acc + dur >= seconds - 1e-4) {
      out.push([start, start + Math.max(1 / 30, seconds - acc)]);
      break;
    }
    out.push([start, end]);
    acc += dur;
  }
  return out;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'plan') {
    const [media, workdir] = rest;
    const planned = planMedia(media, workdir);
    const review = toReviewCutlist(planned.portCut);
    fs.writeFileSync(path.join(workdir, 'review-cutlist.json'), JSON.stringify(review, null, 2));
    const out = sumKeep(planned.portCut.keep);
    console.log(JSON.stringify({
      removals: planned.portCut.removed.length,
      gaps: planned.portCut.gaps.length,
      outSec: +out.toFixed(3),
      kinds: countKinds(planned.portCut.removed),
    }));
  } else if (command === 'audio') {
    console.log(renderAudio(rest[0]));
  } else {
    console.error('用法: node scripts/rough-cut.mjs plan <video> <workdir> | audio <workdir>');
    process.exit(1);
  }
}

function sumKeep(keep) {
  return (keep ?? []).reduce((sum, [a, b]) => sum + (b - a), 0);
}

function countKinds(removed) {
  const counts = {};
  for (const row of removed ?? []) counts[row.type] = (counts[row.type] ?? 0) + 1;
  return counts;
}
