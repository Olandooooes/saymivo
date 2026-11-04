import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildWordsDocument, lexiconFromReview, projectCaptions} from '../src/fine-cut.mjs';
import {planFromClock, renderFineCut} from '../scripts/render-fine-cut.mjs';
import {transcriptCacheFile, transcribeClip} from '../scripts/lib-transcribe.mjs';
import {planMedia, portRoot, refreshRegions, renderAudio, rerunCut, toReviewCutlist, wordsFromChars, cutVideo} from '../scripts/rough-cut.mjs';
import {parseGlossary, readProofreadSettings} from './proofread.mjs';
import {suggestTermMistakes} from '../src/term-suggest.mjs';

const python = root => (fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python3');

function mediaFile(PUBLIC, src) {
  if (typeof src !== 'string' || !/^clips\/[\w.-]+\.(mp4|mov|webm)$/i.test(src)) throw Error('原片地址无效');
  const root = fs.realpathSync(path.join(PUBLIC, 'clips'));
  const media = fs.realpathSync(path.join(PUBLIC, src));
  if (!media.startsWith(root + path.sep)) throw Error('原片不在素材库中');
  return media;
}

function streamDuration(file, selector) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', selector, '-show_entries', 'stream=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  const value = Number(String(probe.stdout || '').trim().split('\n')[0]);
  return Number.isFinite(value) ? value : null;
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
  const routes = ['/api/fine-cut/plan', '/api/fine-cut/render', '/api/fine-cut/corrections', '/api/fine-cut/suggest'];
  if (!routes.includes(url.pathname)) return false;
  if (req.method !== 'POST') { json(res, 405, {error: '请使用 POST'}); return true; }
  let clock;
  try {
    const input = JSON.parse(await body(req));
    if (url.pathname.endsWith('/suggest')) {
      json(res, 200, await suggestTermMistakes({text: input.text ?? ''}));
      return true;
    }
    if (url.pathname.endsWith('/corrections')) {
      const glossary = input.glossary ?? readProofreadSettings(ROOT).glossary ?? '';
      parseGlossary(glossary);
      if (!Array.isArray(input.words)) throw Error('转写无效');
      const document = buildWordsDocument({words: input.words, glossary, sourceSha256: input.sourceSha256, model: input.model || 'paraformer-zh'});
      json(res, 200, {glossary, corrections: document.corrections});
      return true;
    }
    const glossary = input.glossary ?? readProofreadSettings(ROOT).glossary ?? '';
    parseGlossary(glossary);
    const clip = input.clip;
    if (!clip?.id || !Number.isFinite(clip.inSec) || !Number.isFinite(clip.outSec) || clip.outSec <= clip.inSec) throw Error('片段范围无效');
    clock = clockFor(ROOT, PUBLIC, clip.src);
    const span = Math.min(clip.outSec, clock.receipt.durationSec) - clip.inSec;
    if (!(span > 0.5)) throw Error('片段范围无效');
    if (clip.inSec > 0.05) throw Error('粗剪按整段原片的视频时间计算，请从片头开始');
    const portKey = clock.receipt.sourceSha256 || clip.id;
    const workdir = path.join(ROOT, '.captions-tmp', 'koubo-port', String(portKey).slice(0, 16));
    fs.mkdirSync(workdir, {recursive: true});
    const plannedPort = fs.existsSync(path.join(workdir, 'chars.json')) && fs.existsSync(path.join(workdir, 'energy_db.npy'))
      ? null
      : planMedia(clock.media, workdir);
    const chars = plannedPort?.chars ?? JSON.parse(fs.readFileSync(path.join(workdir, 'chars.json'), 'utf8'));
    if (!plannedPort) {
      // Regions follow cut_rules.json and are cheap. A cached transcript must not keep an older VAD.
      refreshRegions(workdir);
      rerunCut(workdir, {removes: []});
    }
    const portCut = JSON.parse(fs.readFileSync(path.join(workdir, 'cutlist.json'), 'utf8'));
    const words = wordsFromChars(chars, clock.receipt.sourceSha256, glossary);
    const cutlist = toReviewCutlist(portCut, {sourceSha256: clock.receipt.sourceSha256, portKey});
    if (url.pathname.endsWith('/plan')) {
      json(res, 200, {words, cutlist, durationSec: clock.receipt.durationSec, engine: 'koubo-port', portRoot, glossary});
      return true;
    }
    const reviewed = input.cutlist ?? cutlist;
    if (!Array.isArray(reviewed.removes)) throw Error('剪辑单无效');
    if (reviewed.engine === 'koubo-port') {
      const lexicon = lexiconFromReview({glossary, corrections: input.corrections ?? words.corrections});
      fs.writeFileSync(path.join(workdir, 'lexicon.json'), JSON.stringify(lexicon, null, 2));
      rerunCut(workdir, reviewed);
      renderAudio(workdir);
      cutVideo(clock.media, workdir);
    }
    const id = `${clip.id}-fine`.replace(/[^\w.-]/g, '').slice(0, 48);
    const filename = `${id}.mp4`;
    const output = path.join(PUBLIC, 'clips', filename);
    if (fs.existsSync(output)) throw Error('精剪文件已存在，请换一段素材或先移走旧文件');
    let rendered;
    if (reviewed.engine === 'koubo-port') {
      const video = path.join(workdir, 'cut_video.mp4');
      const audio = path.join(workdir, 'cut_audio.wav');
      const mux = spawnSync('ffmpeg', ['-y', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', output], {encoding: 'utf8'});
      if (mux.status !== 0) throw Error((mux.stderr || '粗剪合成失败').slice(-400));
      const probed = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], {encoding: 'utf8'}).stdout || '{}');
      const videoDurationSec = streamDuration(output, 'v:0');
      const audioDurationSec = streamDuration(output, 'a:0');
      const durationDeltaSec = videoDurationSec != null && audioDurationSec != null ? audioDurationSec - videoDurationSec : null;
      rendered = {
        durationSec: Number(probed.format?.duration) || 0,
        expectedSec: Number(probed.format?.duration) || 0,
        loudness: null,
        sync: {
          withinOneFrame: durationDeltaSec != null && Math.abs(durationDeltaSec) <= 1 / 30 + 1e-3,
          videoDurationSec,
          audioDurationSec,
          durationDeltaSec,
        },
        keeps: JSON.parse(fs.readFileSync(path.join(workdir, 'cutlist.json'), 'utf8')).keep,
      };
    } else {
      const legacyWords = sourceWords(clip, input.words);
      const planned = planFromClock({
        wav: clock.wav, receipt: clock.receipt, words: legacyWords,
        clip: {id: clip.id, src: clip.src, inSec: clip.inSec, outSec: Math.min(clip.outSec, clock.receipt.durationSec)},
        glossary: input.glossary ?? '',
      });
      rendered = renderFineCut({
        source: clock.media, cutlist: reviewed, clip: {id: clip.id, src: clip.src, inSec: clip.inSec, outSec: Math.min(clip.outSec, clock.receipt.durationSec)},
        output, fps: reviewed.fps ?? 30,
      });
      fs.writeFileSync(path.join(PUBLIC, 'clips', `${id}.words.json`), JSON.stringify(planned.words, null, 2));
    }
    fs.writeFileSync(path.join(PUBLIC, 'clips', `${id}.words.json`), JSON.stringify(words, null, 2));
    fs.writeFileSync(path.join(PUBLIC, 'clips', `${id}.cutlist.json`), JSON.stringify(reviewed, null, 2));
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
