// Fine-cut plan: real word clocks, reviewable removals, one output clock.
// Retake discovery is the existing local sequence comparer. This module does
// not approve a retake; every candidate stays proposed until a person accepts it.
import {discoverRetakes} from '../server/retake-analyzer.mjs';
import {pauseSegments, PAUSE_BREATH_SEC, PAUSE_MIN_SEC} from '../scripts/pause-plan.mjs';
import {parseGlossary} from '../server/proofread.mjs';

const TERMS = [
  {term: '齐民要术', aliases: ['亲民要素', '齐民要素', '齐民要数']},
  {term: 'HowToLiveBetter', aliases: ['how to live better']},
  ...['Agent', 'Notion', 'FDE', 'ChatGPT', 'OpenAI', 'GitHub', 'Remotion', 'Whisper'].map(term => ({term, aliases: []})),
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
  for (const term of terms) {
    const needles = term.aliases?.length ? term.aliases : [];
    for (const needle of needles) {
      if (!needle || needle === term.term) continue;
      let from = 0;
      while (from <= text.length) {
        const at = text.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        const wordIds = covers(at, end);
        const clash = occupied.some(span => at < span.end && end > span.start);
        if (wordIds.length && !clash) {
          occupied.push({start: at, end});
          corrections.push({
            id: `c${corrections.length + 1}`,
            wordIds,
            before: needle,
            after: term.term,
            reason: '术语词库候选，不改词时间',
            status: 'proposed',
          });
        }
        from = at + Math.max(1, needle.length);
      }
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

export function buildCutlist({words, clip, silences = [], samples, sampleRate, fps = 30, audioOffsetMs = 0, sourceSha256 = null}) {
  const speech = words.map(word => ({...word, text: word.text ?? word.word}));
  const segments = pauseSegments(clip, silences, speech);
  const guards = speech.map(word => [word.startMs / 1000 - 0.08, word.endMs / 1000 + 0.08]);
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
    removes.push({
      id: candidate.id,
      kind: falseStart ? 'false-start' : 'retake',
      startMs: Math.round(candidate.remove.startSec * 1000),
      endMs: Math.round(candidate.remove.endSec * 1000),
      reason: candidate.reason,
      evidence: [candidate.earlier?.text, candidate.retain?.text].filter(Boolean),
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
  return keeps.length ? keeps : [[clip.inSec, clip.outSec]];
}

// Video time T maps to the audio elementary stream at T - offset,
// because source-zero defines T from the first video frame.
export function audioRangeForVideo(startSec, endSec, offsetSec = 0) {
  return {startSec: startSec - offsetSec, endSec: endSec - offsetSec, padSec: Math.max(0, offsetSec - startSec)};
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
