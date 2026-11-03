// Fine-cut plan: real word clocks, reviewable removals, one output clock.
// Retake discovery is the existing local sequence comparer. This module does
// not approve a retake; every candidate stays proposed until a person accepts it.
import {discoverRetakes} from '../server/retake-analyzer.mjs';
import {pauseSegments, PAUSE_BREATH_SEC, PAUSE_MIN_SEC} from '../scripts/pause-plan.mjs';
import {parseGlossary} from '../server/proofread.mjs';

const TERMS = [
  {term: '齐民要术', aliases: ['亲民要素', '齐民要素', '齐民要数']},
  {term: 'HowToLiveBetter', aliases: ['how to live better', 'howtolivebetter']},
  {term: 'AI Agent', aliases: ['AIagent', 'AIAgent', 'aiagent', 'AI agent', 'ai agent']},
  ...['Agent', 'Notion', 'FDE', 'ChatGPT', 'OpenAI', 'GitHub', 'Remotion', 'Whisper'].map(term => ({term, aliases: [term.toLowerCase(), term.toUpperCase()].filter(alias => alias !== term)})),
];

export function buildWordsDocument({words, sourceSha256, audioClock, model = 'faster-whisper', language = 'zh', glossary = ''}) {
  const stored = words.map((word, index) => ({
    id: word.id || `w${index + 1}`,
    text: String(word.text ?? word.word ?? ''),
    startMs: word.startMs,
    endMs: word.endMs,
    ...(Number.isFinite(word.probability) ? {probability: word.probability} : {}),
  })).filter(word => word.text && Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.endMs > word.startMs);
  return {
    sourceSha256: sourceSha256 ?? null,
    audioClock: audioClock ?? null,
    model,
    language,
    wordTimestamps: 'model',
    spreadEvenly: false,
    words: stored,
    corrections: proposeTermCorrections(stored, glossary),
  };
}

function charIndex(words) {
  const marks = [];
  let cursor = 0;
  words.forEach((word, index) => {
    const text = word.text ?? '';
    marks.push({index, start: cursor, end: cursor + text.length});
    cursor += text.length;
  });
  return {text: words.map(word => word.text).join(''), marks};
}

export function proposeTermCorrections(words, glossary = '') {
  const {text, marks} = charIndex(words);
  const terms = [...TERMS, ...parseGlossary(glossary).map(row => ({term: row.term, aliases: row.aliases}))];
  const corrections = [];
  const occupied = [];
  const covers = (start, end) => marks.filter(mark => mark.end > start && mark.start < end).map(mark => words[mark.index].id);
  for (const word of words) {
    const token = word.text.trim();
    const hit = terms.find(term => term.term !== token && (term.aliases ?? []).some(alias => alias.toLowerCase() === token.toLowerCase()));
    if (!hit) continue;
    corrections.push({id: `c${corrections.length + 1}`, wordIds: [word.id], before: token, after: hit.term, reason: '术语词库候选，不改词时间', status: 'proposed'});
    occupied.push({start: marks.find(mark => mark.index === words.indexOf(word))?.start ?? 0, end: marks.find(mark => mark.index === words.indexOf(word))?.end ?? 0});
  }
  const needles = terms.flatMap(term => (term.aliases ?? []).filter(alias => alias && alias !== term.term && /[^\u0000-\u007f]/.test(alias)).map(alias => ({alias, term: term.term})));
  needles.sort((a, b) => b.alias.length - a.alias.length);
  for (const {alias, term} of needles) {
    let from = 0;
    const folded = text.toLowerCase();
    const probe = alias.toLowerCase();
    while (from <= text.length) {
      const at = folded.indexOf(probe, from);
      if (at < 0) break;
      const end = at + alias.length;
      const before = text[at - 1] ?? '';
      const after = text[end] ?? '';
      const latin = /[A-Za-z0-9]/.test(alias);
      if (latin && (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after))) { from = at + 1; continue; }
      const wordIds = covers(at, end);
      const clash = occupied.some(span => at < span.end && end > span.start);
      if (wordIds.length && !clash) {
        occupied.push({start: at, end});
        corrections.push({
          id: `c${corrections.length + 1}`,
          wordIds,
          before: text.slice(at, end),
          after: term,
          reason: '术语词库候选，不改词时间',
          status: 'proposed',
        });
      }
      from = at + Math.max(1, alias.length);
    }
  }
  return corrections;
}

export function applyAcceptedCorrections(document) {
  const words = document.words.map(word => ({...word}));
  const unaligned = [];
  for (const correction of document.corrections ?? []) {
    if (correction.status !== 'accepted') continue;
    const chosen = words.filter(word => correction.wordIds.includes(word.id));
    if (!chosen.length) continue;
    const before = chosen.map(word => word.text).join('');
    if (before !== correction.before) continue;
    // Keep every original start/end. A different length is one span, not new clocks.
    if ([...correction.after].length === [...correction.before].length && chosen.length === [...correction.after].length) {
      [...correction.after].forEach((char, index) => { chosen[index].text = char; });
    } else {
      chosen[0].text = correction.after;
      for (const extra of chosen.slice(1)) extra.text = '';
      unaligned.push(correction.id);
    }
  }
  return {words: words.filter(word => word.text), unaligned};
}

export function snapTimeMs(ms, {samples, sampleRate, fps = 30, guards = []} = {}) {
  let sec = ms / 1000;
  if (samples && sampleRate) {
    const center = Math.round(sec * sampleRate);
    const radius = Math.round(0.02 * sampleRate);
    let best = Math.max(0, Math.min(samples.length - 1, center));
    let bestAbs = Math.abs(samples[best] ?? 0);
    const lo = Math.max(0, center - radius);
    const hi = Math.min(samples.length - 1, center + radius);
    for (let index = lo; index <= hi; index++) {
      const level = Math.abs(samples[index]);
      if (level < bestAbs) { bestAbs = level; best = index; }
    }
    sec = best / sampleRate;
  }
  sec = Math.round(sec * fps) / fps;
  for (const [start, end] of guards) {
    if (sec > start && sec < end) {
      const left = Math.floor(start * fps) / fps;
      const right = Math.ceil(end * fps) / fps;
      sec = Math.abs(sec - left) <= Math.abs(right - sec) ? left : right;
    }
  }
  return Math.round(sec * 1000);
}

export function wordGaps(words, clip) {
  const sorted = words.filter(word => word.endMs > clip.inSec * 1000 && word.startMs < clip.outSec * 1000).sort((a, b) => a.startMs - b.startMs);
  const gaps = [];
  let cursor = clip.inSec;
  for (const word of sorted) {
    const start = Math.max(clip.inSec, word.startMs / 1000);
    if (start - cursor >= PAUSE_MIN_SEC) gaps.push([cursor, start]);
    cursor = Math.max(cursor, Math.min(clip.outSec, word.endMs / 1000));
  }
  if (clip.outSec - cursor >= PAUSE_MIN_SEC) gaps.push([cursor, clip.outSec]);
  return gaps;
}

// Room tone often sits just above a fixed -42 dB gate. Threshold follows the
// measured speech level so a -41 dB pause still opens.
export function adaptiveSilenceRanges(samples, sampleRate) {
  const win = Math.round(0.02 * sampleRate);
  if (!samples || win < 1 || samples.length < win * 10) return [];
  const rms = [];
  for (let index = 0; index + win <= samples.length; index += win) {
    let energy = 0;
    for (let offset = 0; offset < win; offset++) {
      const value = samples[index + offset] / 32768;
      energy += value * value;
    }
    rms.push(Math.sqrt(energy / win));
  }
  const audible = rms.filter(value => value > 1e-4).sort((a, b) => a - b);
  if (audible.length < 8) return [];
  const noise = audible[Math.floor(audible.length * 0.12)];
  const speech = audible[Math.floor(audible.length * 0.8)];
  if (!(speech > noise * 1.5)) return [];
  const threshold = Math.max(noise * 1.6, speech * 10 ** (-18 / 20));
  const gaps = [];
  let start = null;
  rms.forEach((level, index) => {
    const time = index * win / sampleRate;
    if (level < threshold) { if (start == null) start = time; }
    else if (start != null) { if (time - start >= PAUSE_MIN_SEC) gaps.push([start, time]); start = null; }
  });
  const end = rms.length * win / sampleRate;
  if (start != null && end - start >= PAUSE_MIN_SEC) gaps.push([start, end]);
  return gaps;
}

export function mergeIntervals(groups) {
  const merged = [];
  for (const gap of groups.flat().filter(row => Array.isArray(row) && row[1] > row[0]).sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && gap[0] <= last[1] + 0.03) last[1] = Math.max(last[1], gap[1]);
    else merged.push([gap[0], gap[1]]);
  }
  return merged;
}

function shortFalseStarts(words) {
  const sorted = words.filter(word => word.text && word.endMs > word.startMs).sort((a, b) => a.startMs - b.startMs);
  const found = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const head = current.text.replace(/[，,。！？、\s]/g, '');
    const body = next.text.replace(/[，,。！？、\s]/g, '');
    const gap = next.startMs - current.endMs;
    if (head.length >= 2 && head.length <= 8 && body.startsWith(head) && gap < 900 && gap > -200) {
      const endMs = Math.min(current.endMs, next.startMs);
      if (endMs - current.startMs >= 80) found.push({startMs: current.startMs, endMs, earlier: current.text, later: next.text, merged: false});
    }
  }
  for (const word of sorted) {
    const match = word.text.match(/^(从一个[，,])(.+)$/);
    if (!match || word.endMs - word.startMs < 400) continue;
    found.push({startMs: word.startMs, endMs: word.endMs, earlier: match[1], later: match[2], merged: true});
  }
  return found;
}

function removalFromSegments(clip, segments) {
  const rows = [];
  let cursor = clip.inSec;
  const points = [...segments, {inSec: clip.outSec, outSec: clip.outSec}];
  for (const segment of points) {
    if (segment.inSec > cursor + 0.02) rows.push({startSec: cursor, endSec: segment.inSec});
    cursor = Math.max(cursor, segment.outSec);
  }
  return rows;
}

const ROLL_SEC = 0.08;

function snapRemoval(startSec, endSec, {samples, sampleRate, fps, guards, limitSec}) {
  let start = snapTimeMs(startSec * 1000, {samples, sampleRate, fps, guards}) / 1000;
  let end = snapTimeMs(endSec * 1000, {samples, sampleRate, fps, guards}) / 1000;
  if (limitSec != null && end > limitSec) end = Math.floor(limitSec * fps) / fps;
  start = Math.round(start * fps) / fps;
  end = Math.round(end * fps) / fps;
  return [start, end];
}

export function buildCutlist({words, clip, silences = [], samples, sampleRate, fps = 30, audioOffsetMs = 0, sourceSha256 = null}) {
  const speech = words.map(word => ({...word, text: word.text ?? word.word}));
  const gaps = mergeIntervals([silences, wordGaps(speech, clip)]);
  const segments = pauseSegments(clip, gaps, speech, 0.04);
  const guards = speech.map(word => [word.startMs / 1000, word.endMs / 1000]);
  const snap = sec => snapTimeMs(sec * 1000, {samples, sampleRate, fps, guards}) / 1000;
  const removes = [];
  for (const pause of removalFromSegments(clip, segments)) {
    let start = snap(pause.startSec);
    let end = snap(pause.endSec);
    if (end < start) [start, end] = [end, start];
    if (end - start < 0.02) continue;
    const before = speech.filter(word => word.endMs / 1000 <= pause.startSec + 0.05).at(-1);
    const after = speech.find(word => word.startMs / 1000 >= pause.endSec - 0.05);
    removes.push({
      id: `pause-${removes.length + 1}`,
      kind: 'pause',
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      keepMs: Math.round(PAUSE_BREATH_SEC * 1000),
      reason: `长于 ${Math.round(PAUSE_MIN_SEC * 1000)}ms 的气口收到约 ${Math.round(PAUSE_BREATH_SEC * 1000)}ms`,
      evidence: [before?.text, after?.text].filter(Boolean),
      status: 'proposed',
    });
  }
  const discovered = discoverRetakes(speech.map(word => ({word: word.text, startMs: word.startMs, endMs: word.endMs})), clip);
  for (const candidate of discovered) {
    const falseStart = candidate.prefix && !candidate.exact && !candidate.earlierComplete;
    const limit = candidate.retain?.startSec != null ? candidate.retain.startSec - ROLL_SEC : null;
    const [start, end] = snapRemoval(candidate.remove.startSec, Math.min(candidate.remove.endSec, limit ?? candidate.remove.endSec), {samples, sampleRate, fps, guards, limitSec: limit});
    if (end - start < 0.05) continue;
    removes.push({
      id: candidate.id,
      kind: falseStart ? 'false-start' : 'retake',
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      reason: candidate.reason,
      evidence: [candidate.earlier?.text, candidate.retain?.text].filter(Boolean),
      status: 'proposed',
    });
  }
  for (const candidate of shortFalseStarts(speech)) {
    const limit = (candidate.endMs / 1000) - (candidate.merged ? 0 : ROLL_SEC);
    const [start, end] = snapRemoval(candidate.startMs / 1000, candidate.endMs / 1000, {samples, sampleRate, fps, guards, limitSec: candidate.merged ? null : limit});
    if (end <= start) continue;
    const id = `false-${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
    if (removes.some(row => row.kind !== 'pause' && Math.abs(row.startMs - start * 1000) < 200)) continue;
    removes.push({
      id,
      kind: 'false-start',
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      reason: candidate.merged ? '起句失败被并进同一个词，只能整词待复核，不能在词内造时间' : '短起句失败，后句接着同一开头',
      evidence: [candidate.earlier, candidate.later],
      status: 'proposed',
    });
  }
  return {
    sourceSha256,
    fps,
    audioOffsetMs,
    breathMs: Math.round(PAUSE_BREATH_SEC * 1000),
    minPauseMs: Math.round(PAUSE_MIN_SEC * 1000),
    removes,
  };
}

export function keepRanges(clip, removes) {
  const cuts = (removes ?? [])
    .filter(row => row.status === 'accepted' && row.endMs > row.startMs)
    .map(row => [Math.max(clip.inSec, row.startMs / 1000), Math.min(clip.outSec, row.endMs / 1000)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const cut of cuts) {
    const last = merged.at(-1);
    if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
    else merged.push([...cut]);
  }
  const keeps = [];
  let cursor = clip.inSec;
  for (const [start, end] of merged) {
    if (start > cursor + 1 / 120) keeps.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < clip.outSec - 1 / 120) keeps.push([cursor, clip.outSec]);
  // A few dozen milliseconds after the last real cut becomes a tail sliver.
  // AAC then pads that fragment and the audio runs long.
  if (keeps.length > 1 && keeps.at(-1)[1] - keeps.at(-1)[0] < 0.1) keeps.pop();
  return keeps.length ? keeps : [[clip.inSec, clip.outSec]];
}

// The file's audio PTS already begin after the video (the measured offset).
// Trimming audio at videoTime-offset applies that delay a second time.
export function audioRangeForVideo(startSec, endSec, offsetSec = 0) {
  return {startSec, endSec, offsetSec, padSec: 0};
}

export function projectSourceMs(ms, keeps) {
  const sec = ms / 1000;
  let output = 0;
  for (const [start, end] of keeps) {
    if (sec < start) return null;
    if (sec <= end) return Math.round((output + (sec - start)) * 1000);
    output += end - start;
  }
  return null;
}

export function projectCaptions(captions, keeps) {
  return captions.flatMap(caption => {
    const words = (caption.words ?? []).flatMap(word => {
      const startMs = projectSourceMs(word.startMs, keeps);
      const endMs = projectSourceMs(word.endMs, keeps);
      return startMs == null || endMs == null || endMs <= startMs ? [] : [{...word, startMs, endMs}];
    });
    if (!words.length) return [];
    return [{...caption, startMs: words[0].startMs, endMs: words.at(-1).endMs, words}];
  });
}
