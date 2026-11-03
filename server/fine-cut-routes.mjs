import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectCaptions} from '../src/fine-cut.mjs';
import {planFromClock, renderFineCut} from '../scripts/render-fine-cut.mjs';
import {transcriptCacheFile, transcribeClip} from '../scripts/lib-transcribe.mjs';

const python = root => (fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python3');

function mediaFile(PUBLIC, src) {
  if (typeof src !== 'string' || !/^clips\/[\w.-]+\.(mp4|mov|webm)$/i.test(src)) throw Error('原片地址无效');
  const root = fs.realpathSync(path.join(PUBLIC, 'clips'));
  const media = fs.realpathSync(path.join(PUBLIC, src));
  if (!media.startsWith(root + path.sep)) throw Error('原片不在素材库中');
  return media;
}

function clockFor(ROOT, PUBLIC, src) {
  const media = mediaFile(PUBLIC, src);
  const dir = fs.mkdtempSync(path.join(ROOT, '.captions-tmp', 'fine-cut-'));
  fs.mkdirSync(path.join(ROOT, '.captions-tmp'), {recursive: true});
  const wav = path.join(dir, 'clock.wav');
  const extracted = spawnSync(python(ROOT), [path.join(ROOT, 'scripts/source_audio.py'), media, wav], {cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  if (extracted.status !== 0) throw Error((extracted.stderr || '音频时钟提取失败').slice(-400));
  return {dir, wav, media, receipt: JSON.parse(fs.readFileSync(wav + '.clock.json', 'utf8'))};
}

function sourceWords(clip, fallback) {
  try {
    if (fs.existsSync(transcriptCacheFile(clip))) {
      return transcribeClip(clip).map((word, index) => ({id: `w${index + 1}`, text: word.word, startMs: word.startMs, endMs: word.endMs}));
    }
  } catch { /* cache is optional; caption words remain the fallback */ }
  return (fallback ?? []).map((word, index) => ({id: word.id || `w${index + 1}`, text: word.text ?? word.word, startMs: word.startMs, endMs: word.endMs}));
}

export async function fineCutRoute({req, res, url, ROOT, PUBLIC, json, body}) {
  if (url.pathname !== '/api/fine-cut/plan' && url.pathname !== '/api/fine-cut/render') return false;
  if (req.method !== 'POST') { json(res, 405, {error: '请使用 POST'}); return true; }
  let clock;
  try {
    const input = JSON.parse(await body(req));
    const clip = input.clip;
    if (!clip?.id || !Number.isFinite(clip.inSec) || !Number.isFinite(clip.outSec) || clip.outSec <= clip.inSec) throw Error('片段范围无效');
    clock = clockFor(ROOT, PUBLIC, clip.src);
    const words = sourceWords(clip, input.words);
    if (!words.length) throw Error('还没有词时间。请先识别字幕，或传入模型给出的 words。');
    const planned = planFromClock({
      wav: clock.wav, receipt: clock.receipt, words,
      clip: {id: clip.id, src: clip.src, inSec: clip.inSec, outSec: Math.min(clip.outSec, clock.receipt.durationSec)},
      glossary: input.glossary ?? '',
    });
    if (url.pathname.endsWith('/plan')) {
      json(res, 200, {words: planned.words, cutlist: planned.cutlist, durationSec: planned.durationSec});
      return true;
    }
    const cutlist = input.cutlist ?? planned.cutlist;
    if (!Array.isArray(cutlist.removes)) throw Error('剪辑单无效');
    const id = `${clip.id}-fine`.replace(/[^\w.-]/g, '').slice(0, 48);
    const filename = `${id}.mp4`;
    const output = path.join(PUBLIC, 'clips', filename);
    if (fs.existsSync(output)) throw Error('精剪文件已存在，请换一段素材或先移走旧文件');
    const rendered = renderFineCut({
      source: clock.media, cutlist, clip: {id: clip.id, src: clip.src, inSec: clip.inSec, outSec: Math.min(clip.outSec, clock.receipt.durationSec)},
      output, fps: cutlist.fps ?? 30,
    });
    fs.writeFileSync(path.join(PUBLIC, 'clips', `${id}.words.json`), JSON.stringify(planned.words, null, 2));
    fs.writeFileSync(path.join(PUBLIC, 'clips', `${id}.cutlist.json`), JSON.stringify(cutlist, null, 2));
    const keeps = rendered.keeps;
    const captions = projectCaptions((input.captions ?? []).filter(caption => caption.clipId === clip.id), keeps)
      .map(caption => ({...caption, clipId: id}));
    json(res, 200, {
      clip: {...clip, id, src: `clips/${filename}`, inSec: 0, outSec: rendered.durationSec, sourceDurationSec: rendered.durationSec, fineCut: true, label: `${clip.label || clip.id} · 精剪`},
      replaceId: clip.id, captions, durationSec: rendered.durationSec, expectedSec: rendered.expectedSec,
      loudness: rendered.loudness, sync: rendered.sync, keeps,
    });
  } catch (error) {
    json(res, 400, {error: error instanceof Error ? error.message : '精剪失败'});
  } finally {
    if (clock?.dir) fs.rmSync(clock.dir, {recursive: true, force: true});
  }
  return true;
}
