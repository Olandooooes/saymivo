// Fine-cut plan: real word clocks, reviewable removals, one output clock.
// Retake discovery is the existing local sequence comparer. This module does
// not approve a retake; every candidate stays proposed until a person accepts it.
import {discoverRetakes} from '../server/retake-analyzer.mjs';
import {pausePolicyFor, pauseSegments, PAUSE_BREATH_SEC, PAUSE_DETECT_SEC, PAUSE_MIN_SEC, PAUSE_SENTENCE_BREATH_SEC, PAUSE_SENTENCE_MIN_SEC} from '../scripts/pause-plan.mjs';
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
    if (start - cursor >= PAUSE_DETECT_SEC) gaps.push([cursor, start]);
    cursor = Math.max(cursor, Math.min(clip.outSec, word.endMs / 1000));
  }
  if (clip.outSec - cursor >= PAUSE_DETECT_SEC) gaps.push([cursor, clip.outSec]);
  return gaps;
}

function rmsWindows(samples, sampleRate) {
  const win = Math.round(0.02 * sampleRate);
  if (!samples || win < 1 || samples.length < win) return [];
  const levels = [];
  for (let index = 0; index + win <= samples.length; index += win) {
    let energy = 0;
    for (let offset = 0; offset < win; offset++) {
      const value = samples[index + offset] / 32768;
      energy += value * value;
    }
    levels.push({startSec: index / sampleRate, endSec: (index + win) / sampleRate, rms: Math.sqrt(energy / win)});
  }
  return levels;
}

// One speech reference for the whole clip. A word that is mostly silence
// cannot supply this: its own percentile is the room tone.
export function clipSpeechReference(samples, sampleRate) {
  const levels = rmsWindows(samples, sampleRate);
  const all = levels.map(level => level.rms).sort((a, b) => a - b);
  if (all.length < 8) return null;
  const noise = all[Math.floor(all.length * 0.2)];
  const speech = all[Math.floor(all.length * 0.9)];
  if (!(speech > Math.max(noise * 3, 0.01))) return null;
  const threshold = Math.max(noise * 1.6, speech * 10 ** (-18 / 20));
  // P80 of windows that already clear the silence gate. A breath can sit above
  // that gate and still be far quieter than real speech.
  const spoken = all.filter(value => value >= threshold);
  const speechP80 = spoken.length ? spoken[Math.min(spoken.length - 1, Math.floor(spoken.length * 0.8))] : speech;
  const voiced = speechP80 * 10 ** (-12 / 20);
  return {speech, noise, threshold, speechP80, voiced};
}

// Room tone often sits just above a fixed -42 dB gate. Threshold follows the
// measured speech level so a -41 dB pause still opens.
export function adaptiveSilenceRanges(samples, sampleRate) {
  const reference = clipSpeechReference(samples, sampleRate);
  const levels = rmsWindows(samples, sampleRate);
  if (!reference || !levels.length) return [];
  const gaps = [];
  let start = null;
  for (const level of levels) {
    if (level.rms < reference.threshold) { if (start == null) start = level.startSec; }
    else if (start != null) { if (level.startSec - start >= PAUSE_DETECT_SEC) gaps.push([start, level.startSec]); start = null; }
  }
  const end = levels.at(-1).endSec;
  if (start != null && end - start >= PAUSE_DETECT_SEC) gaps.push([start, end]);
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

const plain = text => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function shortFalseStarts(words) {
  const sorted = words.filter(word => word.text && word.endMs > word.startMs).sort((a, b) => a.startMs - b.startMs);
  const found = [];
  for (let index = 0; index < sorted.length - 1; index++) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const head = plain(current.text);
    const body = plain(next.text);
    const gap = next.startMs - current.endMs;
    if (head.length >= 2 && head.length <= 8 && body.startsWith(head) && gap < 900 && gap > -200) {
      const endMs = Math.min(current.endMs, next.startMs);
      if (endMs - current.startMs >= 80) found.push({startMs: current.startMs, endMs, earlier: current.text, later: next.text, insideWord: false});
    }
  }
  return found;
}

function loudDuration(levels, threshold, fromSec, toSec) {
  let total = 0;
  for (const level of levels) {
    if (level.endSec <= fromSec || level.startSec >= toSec || level.rms < threshold) continue;
    total += Math.min(level.endSec, toSec) - Math.max(level.startSec, fromSec);
  }
  return total;
}

// Whisper often stretches one token across a breath. The gate is the clip's
// speech level. A word-local percentile treats a mostly silent token as loud.
export function energyGapsInsideWords(words, samples, sampleRate) {
  const reference = clipSpeechReference(samples, sampleRate);
  if (!reference) return [];
  const levels = rmsWindows(samples, sampleRate);
  const found = [];
  for (const word of words) {
    const chars = Math.max(1, plain(word.text).length);
    const spanSec = (word.endMs - word.startMs) / 1000;
    const inside = levels.filter(level => level.endSec > word.startMs / 1000 && level.startSec < word.endMs / 1000);
    let run = null;
    const runs = [];
    for (const level of inside) {
      if (level.rms < reference.threshold) {
        if (!run) run = {startSec: Math.max(level.startSec, word.startMs / 1000), endSec: level.endSec};
        else run.endSec = level.endSec;
      } else if (run) { runs.push(run); run = null; }
    }
    if (run) runs.push(run);
    for (const region of runs) {
      region.endSec = Math.min(region.endSec, word.endMs / 1000);
      const duration = region.endSec - region.startSec;
      if (duration < 0.12) continue;
      const speechBefore = loudDuration(inside, reference.voiced, word.startMs / 1000, region.startSec);
      const speechAfter = loudDuration(inside, reference.voiced, region.endSec, word.endMs / 1000);
      found.push({...region, duration, word, speechBefore, speechAfter, msPerChar: spanSec / chars * 1000, threshold: reference.threshold});
    }
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

function firstKeptWord(candidate, speech) {
  const matched = candidate.matchedCharacters ?? plain(candidate.earlier?.text).length;
  let seen = 0;
  for (const id of candidate.earlier?.wordIds ?? []) {
    const word = speech[id];
    if (!word) continue;
    if (seen >= matched && plain(word.text).length) return word;
    seen += plain(word.text).length;
  }
  const retain = candidate.retain?.startSec;
  if (retain == null) return null;
  return speech.find(word => word.startMs / 1000 >= retain - 0.001) ?? null;
}

function windowRmsAt(samples, index, win) {
  const count = Math.min(win, samples.length - index);
  if (count <= 0) return 0;
  let energy = 0;
  for (let offset = 0; offset < count; offset++) {
    const value = samples[index + offset] / 32768;
    energy += value * value;
  }
  return Math.sqrt(energy / count);
}

function neighborBefore(word, speech) {
  const ordered = [...speech].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const place = ordered.findIndex(item => item === word);
  return place > 0 ? ordered[place - 1] : null;
}

// Do not walk earlier than the previous word's onset. A shallow dip in front of
// that word is still the false-start boundary even when it never reaches silence.
function falseStartFloor(word, speech) {
  const previous = neighborBefore(word, speech);
  const origin = previous ? previous.startMs : word.startMs;
  return Math.max(0, origin / 1000 - 0.06);
}

function relativeDipStart(floorSec, dipStartSec, samples, sampleRate) {
  if (!samples?.length || !(dipStartSec > floorSec + 0.02)) return floorSec;
  const win = Math.max(1, Math.round(0.01 * sampleRate));
  const lo = Math.max(0, Math.floor(floorSec * sampleRate));
  const hi = Math.min(samples.length - win, Math.floor(dipStartSec * sampleRate));
  const levels = [];
  for (let index = lo; index <= hi; index += win) levels.push({sec: index / sampleRate, rms: windowRmsAt(samples, index, win)});
  const peak = levels.reduce((best, level) => Math.max(best, level.rms), 0);
  const gate = peak * 10 ** (-10 / 20);
  if (!(peak > gate)) return floorSec;
  let best = null;
  let run = null;
  const finish = () => {
    if (!run || run.endSec - run.startSec < 0.03) return;
    if (!best || run.min < best.min - 1e-9 || (Math.abs(run.min - best.min) <= 1e-9 && run.startSec > best.startSec)) best = run;
  };
  for (const level of levels) {
    if (level.rms <= gate) {
      if (!run) run = {startSec: level.sec, endSec: level.sec + win / sampleRate, min: level.rms};
      else { run.endSec = level.sec + win / sampleRate; run.min = Math.min(run.min, level.rms); }
    } else if (run) { finish(); run = null; }
  }
  finish();
  return best ? best.startSec : floorSec;
}

function snapRunStart(speechStartSec, samples, sampleRate, fps, floorSec = 0) {
  const from = Math.max(0, floorSec, speechStartSec);
  const to = from + 0.03;
  const lo = Math.min(samples.length - 1, Math.floor(from * sampleRate));
  const hi = Math.min(samples.length - 1, Math.max(lo, Math.floor(to * sampleRate)));
  let best = lo;
  let bestAbs = Infinity;
  for (let index = lo; index <= hi; index++) {
    const level = Math.abs(samples[index] ?? 0);
    if (level < bestAbs) { bestAbs = level; best = index; }
  }
  let sec = Math.round((best / sampleRate) * fps) / fps;
  if (sec > to + 1e-4) sec = Math.floor((to + 1e-4) * fps) / fps;
  if (sec < from - 1e-4) sec = Math.ceil((from - 1e-6) * fps) / fps;
  return Math.max(0, sec);
}

function keepWholeWords(startSec, endSec, marked, previous, speech) {
  let start = startSec;
  for (const word of speech) {
    if (word === marked || word === previous) continue;
    const open = word.startMs / 1000;
    const close = word.endMs / 1000;
    if (close - open < 0.02) continue;
    if (start <= open + 0.005 && endSec >= close - 0.005) start = Math.max(start, close);
  }
  return start;
}

const TAIL_LOOK_SEC = 0.4;
const TAIL_DECAY_SEC = 0.09;
const ONSET_LOOK_SEC = 0.12;

// ASR often ends before an unvoiced release. Walk the waveform, then keep a
// short decay. Never cross into the next word, and never shrink the ASR span.
export function protectWordEdges(words, samples, sampleRate) {
  const sorted = words.map(word => ({...word})).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const reference = samples?.length && sampleRate ? clipSpeechReference(samples, sampleRate) : null;
  const levels = reference ? rmsWindows(samples, sampleRate) : [];
  const gate = reference ? Math.max(reference.noise * 2.5, reference.speech * 10 ** (-28 / 20)) : 0;
  const limit = samples?.length && sampleRate ? samples.length / sampleRate : Infinity;
  for (let index = 0; index < sorted.length; index++) {
    const word = sorted[index];
    if (!(word.endMs > word.startMs)) continue;
    const prevEnd = index > 0 ? sorted[index - 1].endMs / 1000 : 0;
    const nextStart = index + 1 < sorted.length ? sorted[index + 1].startMs / 1000 : limit;
    const asrStart = word.startMs / 1000;
    const asrEnd = word.endMs / 1000;
    let start = asrStart;
    let end = asrEnd;
    if (levels.length) {
      const onsetFloor = Math.max(prevEnd + 0.02, start - ONSET_LOOK_SEC);
      for (const level of levels) {
        if (level.endSec <= onsetFloor || level.startSec >= asrStart) continue;
        if (level.rms >= gate) { start = Math.max(onsetFloor, level.startSec); break; }
      }
      const tailCeil = Math.min(nextStart - 0.02, asrEnd + TAIL_LOOK_SEC);
      let acoustic = asrEnd;
      if (tailCeil > asrEnd + 0.005) {
        for (const level of levels) {
          if (level.endSec <= asrEnd || level.startSec >= tailCeil) continue;
          if (level.rms >= gate) acoustic = Math.max(acoustic, Math.min(tailCeil, level.endSec));
        }
      }
      end = Math.min(nextStart - 0.02, acoustic + TAIL_DECAY_SEC);
    } else {
      const before = Math.max(0, asrStart - prevEnd - 0.02);
      const after = Number.isFinite(nextStart) ? Math.max(0, nextStart - asrEnd - 0.02) : 0.1;
      start -= Math.min(0.04, before / 2);
      end += Math.min(0.1, after / 2);
    }
    if (Number.isFinite(nextStart)) end = Math.min(end, Math.max(asrEnd, nextStart - 0.02));
    word.startMs = Math.round(Math.max(0, Math.min(asrStart, start)) * 1000);
    word.endMs = Math.max(word.startMs + 1, Math.round(Math.max(asrEnd, end) * 1000));
  }
  return sorted;
}

// A transcript hole can hide real speech. Keep any stretch that is still
// speech-loud, including a filler that never became a word, and only return
// the quiet pieces around it.
export function dropLoudGaps(gaps, samples, sampleRate) {
  const reference = samples?.length && sampleRate ? clipSpeechReference(samples, sampleRate) : null;
  const levels = reference ? rmsWindows(samples, sampleRate) : [];
  if (!reference || !levels.length) return gaps ?? [];
  const pieces = [];
  for (const [start, end] of gaps ?? []) {
    if (!(end > start)) continue;
    const runs = [];
    let run = null;
    for (const level of levels) {
      if (level.endSec <= start || level.startSec >= end) continue;
      if (level.rms < reference.voiced) continue;
      const open = Math.max(start, level.startSec);
      const close = Math.min(end, level.endSec);
      if (!run || open > run[1] + 0.12) {
        if (run) runs.push(run);
        run = [open, close];
      } else run[1] = Math.max(run[1], close);
    }
    if (run) runs.push(run);
    let cursor = start;
    for (const [open, close] of runs) {
      const left = Math.max(start, open - 0.08);
      const right = Math.min(end, close + 0.08);
      if (left > cursor + 0.02) pieces.push([cursor, left]);
      cursor = Math.max(cursor, right);
    }
    if (end > cursor + 0.02) pieces.push([cursor, end]);
  }
  return pieces;
}

function dipPolicy(dip) {
  const trailing = dip.speechAfter < 0.08;
  const text = String(dip.word?.text ?? '').trim();
  if (trailing && /[。！？!?；;]$/u.test(text)) return {minSec: PAUSE_SENTENCE_MIN_SEC, breathSec: PAUSE_SENTENCE_BREATH_SEC};
  return {minSec: PAUSE_MIN_SEC, breathSec: PAUSE_BREATH_SEC};
}

function snapRemoval(startSec, endSec, {samples, sampleRate, fps, hardEndSec}) {
  const limit = hardEndSec == null ? endSec : Math.min(endSec, hardEndSec);
  let start = snapTimeMs(startSec * 1000, {samples, sampleRate, fps, guards: []}) / 1000;
  let end = snapTimeMs(limit * 1000, {samples, sampleRate, fps, guards: []}) / 1000;
  start = Math.round(start * fps) / fps;
  end = Math.round(end * fps) / fps;
  if (hardEndSec != null && end > hardEndSec - 1e-4) end = Math.floor((hardEndSec - 1e-4) * fps) / fps;
  return [Math.max(0, start), end];
}

export function buildCutlist({words, clip, silences = [], samples, sampleRate, fps = 30, audioOffsetMs = 0, sourceSha256 = null}) {
  const speech = words.map(word => ({...word, text: word.text ?? word.word}));
  const protectedSpeech = protectWordEdges(speech, samples, sampleRate);
  const gaps = mergeIntervals([silences, dropLoudGaps(wordGaps(speech, clip), samples, sampleRate)]);
  const segments = pauseSegments(clip, gaps, protectedSpeech, 0.04);
  const guards = protectedSpeech.map(word => [word.startMs / 1000, word.endMs / 1000]);
  const snap = sec => snapTimeMs(sec * 1000, {samples, sampleRate, fps, guards}) / 1000;
  const removes = [];
  for (const pause of removalFromSegments(clip, segments)) {
    let start = snap(pause.startSec);
    let end = snap(pause.endSec);
    if (end < start) [start, end] = [end, start];
    if (end - start < 0.02) continue;
    const before = speech.filter(word => word.endMs / 1000 <= pause.startSec + 0.05).at(-1);
    const after = speech.find(word => word.startMs / 1000 >= pause.endSec - 0.05);
    const policy = pausePolicyFor(speech, pause.startSec);
    removes.push({
      id: `pause-${removes.length + 1}`,
      kind: 'pause',
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      keepMs: Math.round(policy.breathSec * 1000),
      reason: `长于 ${Math.round(policy.minSec * 1000)}ms 的气口收到约 ${Math.round(policy.breathSec * 1000)}ms`,
      evidence: [before?.text, after?.text].filter(Boolean),
      status: 'proposed',
    });
  }
  const discovered = discoverRetakes(speech.map(word => ({word: word.text, startMs: word.startMs, endMs: word.endMs})), clip);
  for (const candidate of discovered) {
    const falseStart = candidate.prefix && !candidate.exact && !candidate.earlierComplete;
    const kept = firstKeptWord(candidate, speech);
    const hardEndSec = kept ? kept.startMs / 1000 : candidate.retain?.startSec;
    const [start, end] = snapRemoval(candidate.remove.startSec, candidate.remove.endSec, {samples, sampleRate, fps, hardEndSec});
    if (!(end - start > 0.05) || (kept && end > kept.startMs / 1000 + 0.0005)) continue;
    removes.push({
      id: candidate.id,
      kind: falseStart ? 'false-start' : 'retake',
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      reason: candidate.reason,
      evidence: [candidate.earlier?.text, candidate.retain?.text].filter(Boolean),
      status: falseStart ? 'pending' : 'proposed',
    });
  }
  for (const candidate of shortFalseStarts(speech)) {
    const [start, end] = snapRemoval(candidate.startMs / 1000, candidate.endMs / 1000, {samples, sampleRate, fps, hardEndSec: candidate.endMs / 1000});
    if (end <= start) continue;
    const id = `false-${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
    if (removes.some(row => row.kind !== 'pause' && Math.abs(row.startMs - start * 1000) < 200)) continue;
    removes.push({
      id, kind: 'false-start', startMs: Math.round(start * 1000), endMs: Math.round(end * 1000),
      reason: '短起句失败，后句接着同一开头', evidence: [candidate.earlier, candidate.later], status: 'pending',
    });
  }
  for (const dip of energyGapsInsideWords(speech, samples, sampleRate)) {
    const bothSides = dip.speechBefore >= 0.08 && dip.speechAfter >= 0.08;
    const dipKeep = dipPolicy(dip);
    if (dip.duration >= dipKeep.minSec) {
      const [start, end] = snapRemoval(dip.startSec + dipKeep.breathSec / 2, dip.endSec - dipKeep.breathSec / 2, {samples, sampleRate, fps, hardEndSec: dip.endSec - 0.02});
      if (end - start > 0.05 && !removes.some(row => row.kind === 'pause' && start * 1000 < row.endMs && end * 1000 > row.startMs)) {
        removes.push({
          id: `pause-in-${Math.round(dip.startSec * 1000)}`, kind: 'pause',
          startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), keepMs: Math.round(dipKeep.breathSec * 1000),
          reason: `词时间盖住了中间的气口，按整段人声电平把这段收成约 ${Math.round(dipKeep.breathSec * 1000)}ms`,
          evidence: [dip.word.text], status: 'proposed',
        });
      }
    }
    // Only real speech–dip–speech inside one token is a possible restart.
    // Breath clears the silence gate, and a trailing or fully quiet token is a pause.
    if (!(bothSides && dip.msPerChar >= 450 && dip.word.endMs - dip.word.startMs >= 600 && dip.duration >= 0.12)) continue;
    const resume = dip.endSec;
    const previous = neighborBefore(dip.word, speech);
    const floorSec = falseStartFloor(dip.word, speech);
    const anchor = relativeDipStart(floorSec, dip.startSec, samples, sampleRate);
    let start = snapRunStart(anchor, samples, sampleRate, fps, floorSec);
    const [, end] = snapRemoval(start, dip.endSec, {samples, sampleRate, fps, hardEndSec: resume});
    const guarded = keepWholeWords(start, end, dip.word, previous, speech);
    if (guarded > start + 1e-3) start = snapRunStart(guarded, samples, sampleRate, fps, guarded);
    if (!(end - start > 0.05) || end * 1000 > dip.word.endMs) continue;
    if (removes.some(row => row.kind === 'false-start' && Math.abs(row.startMs - start * 1000) < 200)) continue;
    removes.push({
      id: `false-in-${dip.word.startMs}`, kind: 'false-start',
      startMs: Math.round(start * 1000), endMs: Math.round(end * 1000),
      reason: '这个词相对字数偏长，轻声两边都还有人声，可能是起句失败并进了同一个词',
      evidence: [dip.word.text], status: 'pending',
    });
  }
  return {
    sourceSha256,
    fps,
    audioOffsetMs,
    breathMs: Math.round(PAUSE_BREATH_SEC * 1000),
    minPauseMs: Math.round(PAUSE_MIN_SEC * 1000),
    sentenceBreathMs: Math.round(PAUSE_SENTENCE_BREATH_SEC * 1000),
    sentenceMinPauseMs: Math.round(PAUSE_SENTENCE_MIN_SEC * 1000),
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
