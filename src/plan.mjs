// Sentence plan: source times in, projected times out. Copy only comes from the words.
// Projection is local so the editor bundle does not pull the Node retake analyzer.

function keepRanges(clip, removes) {
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
  if (keeps.length > 1 && keeps.at(-1)[1] - keeps.at(-1)[0] < 0.1) keeps.pop();
  return keeps.length ? keeps : [[clip.inSec, clip.outSec]];
}

function projectSourceMs(ms, keeps) {
  const sec = ms / 1000;
  let output = 0;
  for (const [start, end] of keeps) {
    if (sec < start) return null;
    if (sec <= end) return Math.round((output + (sec - start)) * 1000);
    output += end - start;
  }
  return null;
}

export const SHOTS = ['medium', 'shift-right', 'punch'];
export const SLIDE_KINDS = ['comparison', 'checklist', 'workflow'];
export const PUNCH_SPRING_MS = 130;

export const DEFAULT_STYLE = {
  talentFraming: 'framed',
  windowScale: 0.66,
  shiftWindowScale: 0.42,
  punchScale: 1.1,
  fullscreenPunchScale: 1.36,
  fullscreenShiftScale: 1.25,
  maxSourceScale: 1.0,
  maxPunchSourceScale: 1.1,
};

export function resolveStyle(style = {}) {
  return {...DEFAULT_STYLE, ...style, talentFraming: style.talentFraming === 'fullscreen' ? 'fullscreen' : 'framed'};
}

// How many source pixels land on one composition pixel. Framed mode shrinks
// the portrait into a window; punch may zoom inside that window, never past the cap.
const FULL_HD = {width: 1920, height: 1080};

function desiredRect(shot, resolved) {
  if (resolved.talentFraming === 'fullscreen') return {x: 0, y: 0, w: 1, h: 1};
  if (shot === 'shift-right') {
    const w = resolved.shiftWindowScale;
    const h = Math.min(0.62, w * 1.15);
    return {x: 1 - w - 0.05, y: 0.24, w, h};
  }
  const w = resolved.windowScale;
  const h = Math.min(0.52, w * 0.82);
  return {x: (1 - w) / 2, y: (1 - h) / 2, w, h};
}

export function windowRect(shot, style = DEFAULT_STYLE, source = FULL_HD, composition = FULL_HD) {
  const resolved = resolveStyle(style);
  const rect = desiredRect(shot, resolved);
  if (resolved.talentFraming === 'fullscreen') return rect;
  const inner = shot === 'punch' ? resolved.punchScale : 1;
  const cap = shot === 'punch' ? resolved.maxPunchSourceScale : resolved.maxSourceScale;
  const maxW = source.width > 0 && composition.width > 0 ? (cap * source.width) / (composition.width * inner) : rect.w;
  if (rect.w <= maxW) return rect;
  const w = maxW;
  const h = rect.h * (w / rect.w);
  const x = shot === 'shift-right' ? Math.max(0.04, 1 - w - 0.05) : (1 - w) / 2;
  return {x, y: rect.y, w, h};
}

export function talentScale(shot, style = DEFAULT_STYLE, source = FULL_HD, composition = FULL_HD) {
  const resolved = resolveStyle(style);
  if (resolved.talentFraming === 'fullscreen') {
    if (shot === 'punch') return resolved.fullscreenPunchScale;
    if (shot === 'shift-right') return resolved.fullscreenShiftScale;
    return 1;
  }
  const rect = windowRect(shot, resolved, source, composition);
  const inner = shot === 'punch' ? resolved.punchScale : 1;
  if (!(source.width > 0) || !(composition.width > 0)) return 0;
  return (rect.w * composition.width / source.width) * inner;
}

export function layoutRects(shot, style = DEFAULT_STYLE, source = FULL_HD, composition = FULL_HD) {
  const window = windowRect(shot, style, source, composition);
  const punch = shot === 'shift-right'
    ? {x: 0.04, y: 0.22, w: 0.4, h: 0.42}
    : {x: window.x, y: Math.max(0.02, window.y - 0.12), w: window.w, h: 0.09};
  return {
    window,
    chapter: {x: window.x, y: Math.max(0.02, window.y - 0.1), w: window.w, h: 0.07},
    punch,
    subtitle: {x: window.x, y: Math.min(0.9, window.y + window.h + 0.012), w: window.w, h: 0.07},
  };
}

export function faceInFrame(face, shot, style = DEFAULT_STYLE, source = FULL_HD, composition = FULL_HD) {
  if (!face) return null;
  const resolved = resolveStyle(style);
  const rect = windowRect(shot, resolved, source, composition);
  const scale = talentScale(shot, resolved, source, composition);
  const base = rect.w * composition.width / source.width;
  const inner = base > 0 ? scale / base : 1;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const map = (nx, ny) => ({
    x: cx + (nx - 0.5) * rect.w * inner,
    y: cy + (ny - 0.5) * rect.h * inner,
  });
  const points = [map(face.x, face.y), map(face.x + face.w, face.y), map(face.x, face.y + face.h), map(face.x + face.w, face.y + face.h)];
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
}

const LEFT_TEXT = {x: 0.04, y: 0.12, w: 0.36, h: 0.46};
const GAP = 0.04;

function intersects(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function sentenceSource(sentence, words) {
  const own = (words ?? []).filter(word => word.endMs > sentence.startMs && word.startMs < sentence.endMs).map(word => word.text).join('');
  return `${sentence.text ?? ''}${own}`;
}

const fold = text => String(text ?? '').replace(/[，,。！？!?、；;：:\s]/g, '');

function inventedFacts(text, source) {
  const digits = String(text ?? '').match(/\d+(?:\.\d+)?/g) ?? [];
  if (digits.some(digit => !source.includes(digit))) return true;
  return [...String(text ?? '')].some(char => '不没非别莫勿'.includes(char) && !source.includes(char));
}

function wordById(words, id) {
  return (words ?? []).find(word => word.id === id) ?? null;
}

const SPEECH_CUTS = new Set(['retake', 'false-start']);

function wordIsCut(word, removes) {
  const span = (word?.endMs ?? 0) - (word?.startMs ?? 0);
  if (!(span > 0)) return false;
  let covered = 0;
  for (const row of removes ?? []) {
    if (row.status !== 'accepted' || !SPEECH_CUTS.has(row.kind)) continue;
    covered += Math.max(0, Math.min(word.endMs, row.endMs) - Math.max(word.startMs, row.startMs));
  }
  return covered / span >= 0.5;
}

export function readFaceBox(value) {
  const face = value && typeof value === 'object' && Object.hasOwn(value, 'face') ? value.face : value;
  if (!face || typeof face !== 'object') return null;
  const {x, y, w, h} = face;
  if (![x, y, w, h].every(number => typeof number === 'number' && Number.isFinite(number))) return null;
  return {x, y, w, h};
}

function textUsesCutWord(text, words, removes) {
  if (!text) return false;
  const sorted = [...(words ?? [])].filter(word => word.text).sort((a, b) => a.startMs - b.startMs);
  let matched = false;
  for (let start = 0; start < sorted.length; start++) {
    let joined = '';
    for (let end = start; end < sorted.length; end++) {
      joined += sorted[end].text;
      if (!joined.includes(text)) {
        if ([...joined].length > [...text].length + 8) break;
        continue;
      }
      matched = true;
      if (!sorted.slice(start, end + 1).some(word => wordIsCut(word, removes))) return false;
      break;
    }
  }
  if (matched) return true;
  return sorted.some(word => wordIsCut(word, removes) && text.includes(word.text));
}

export function prepareWords(words = [], {removes = [], corrections = []} = {}) {
  const next = words.map(word => ({...word}));
  for (const correction of corrections) {
    if (correction.status !== 'accepted') continue;
    const targets = next.filter(word => (correction.wordIds ?? []).includes(word.id));
    if (!targets.length) continue;
    targets[0].text = correction.after;
    for (const extra of targets.slice(1)) extra.text = '';
  }
  return next.filter(word => word.text && !wordIsCut(word, removes));
}

export function validatePlan(plan, {words = [], removes = []} = {}) {
  const issues = [];
  const transcript = (words ?? []).map(word => word.text).join('');
  const sentences = (plan?.sentences ?? []).map(sentence => {
    const next = {...sentence, punch: sentence.punch ? {...sentence.punch} : null, slide: sentence.slide ? {...sentence.slide, items: (sentence.slide.items ?? []).map(item => ({...item}))} : null};
    if (!SHOTS.includes(next.shot)) {
      issues.push({sentenceId: next.id, code: 'schema', message: '景别只能是 medium、shift-right、punch'});
      next.shot = 'medium';
    }
    const source = `${transcript}${sentenceSource(next, words)}`;
    next.labels = (next.labels ?? []).filter(label => {
      if (!textUsesCutWord(label.text, words, removes)) return true;
      issues.push({sentenceId: next.id, code: 'cut-word', message: '标签用了已剪掉的词，已去掉'});
      return false;
    });
    if (next.punch?.text) {
      if (!fold(next.text).includes(fold(next.punch.text)) || inventedFacts(next.punch.text, source)) {
        next.status = 'rejected-hallucination';
        issues.push({sentenceId: next.id, code: 'rejected-hallucination', message: '大字不在原话里'});
        next.punch = null;
      } else {
        const word = wordById(words, next.punch.atWordId);
        const at = word?.startMs ?? next.punch.atMs;
        if (wordIsCut(word, removes) || textUsesCutWord(next.punch.text, words, removes) || (Number.isFinite(at) && (removes ?? []).some(row => row.status === 'accepted' && at >= row.startMs && at < row.endMs))) {
          next.punch = null;
          issues.push({sentenceId: next.id, code: 'cut-word', message: '大字用了已剪掉的词，已去掉'});
        }
      }
    }
    if (next.slide) {
      if (!SLIDE_KINDS.includes(next.slide.kind)) {
        issues.push({sentenceId: next.id, code: 'schema', message: '全屏页种类不受支持'});
        next.slide = null;
      } else {
        next.slide.items = (next.slide.items ?? []).map(item => {
          const spoken = transcript + (next.text ?? '');
          if (item.title && (!fold(spoken).includes(fold(item.title)) || inventedFacts(item.title, spoken))) {
            next.status = 'rejected-hallucination';
            issues.push({sentenceId: next.id, code: 'rejected-hallucination', message: '全屏页文字不在原话里'});
            return {...item, status: 'rejected-hallucination'};
          }
          if (item.title && textUsesCutWord(item.title, words, removes)) return {...item, status: 'proposed', atMs: null};
          const word = wordById(words, item.atWordId);
          if (!word || wordIsCut(word, removes)) return {...item, status: 'proposed', atMs: null};
          return {...item, status: item.status === 'rejected-hallucination' ? item.status : 'aligned', atMs: word.startMs};
        });
      }
    }
    return next;
  });
  const chapters = (plan?.chapters ?? []).map(chapter => {
    if (chapter.title && inventedFacts(chapter.title, transcript)) {
      issues.push({sentenceId: chapter.id, code: 'rejected-hallucination', message: '章节标题不在原话里'});
      return {...chapter, status: 'rejected-hallucination', title: ''};
    }
    if (chapter.title && textUsesCutWord(chapter.title, words, removes)) return {...chapter, title: ''};
    return chapter;
  });
  return {ok: !issues.some(issue => issue.code === 'schema'), plan: {...plan, chapters, sentences, style: resolveStyle(plan?.style)}, issues};
}

export function applyFaceSafe(plan, faceBox, style = DEFAULT_STYLE) {
  const resolved = resolveStyle({...style, ...plan?.style});
  faceBox = readFaceBox(faceBox);
  const issues = [];
  const sentences = (plan?.sentences ?? []).map(sentence => {
    const next = {...sentence, punch: sentence.punch ? {...sentence.punch} : null};
    if (!faceBox) {
      if (next.shot !== 'medium' || next.punch) {
        next.shot = 'medium';
        next.punch = null;
        next.faceConflict = '没有脸盒，已改回中景，不放左侧大字';
        issues.push({sentenceId: next.id, code: 'face', message: next.faceConflict});
      }
      return next;
    }
    const placed = faceInFrame(faceBox, next.shot, resolved);
    const leftClash = next.shot === 'shift-right' && placed && (placed.x < 0.5 || intersects(placed, LEFT_TEXT, GAP));
    const punchRect = layoutRects(next.shot, resolved).punch;
    const punchClash = next.punch && placed && intersects(placed, punchRect, GAP);
    if (leftClash) {
      next.shot = 'medium';
      next.punch = null;
      next.faceConflict = '大字压住脸，已改回中景';
      issues.push({sentenceId: next.id, code: 'face', message: next.faceConflict});
    } else if (punchClash) {
      next.punch = null;
      next.faceConflict = '大字压住脸，已去掉大字';
      issues.push({sentenceId: next.id, code: 'face', message: next.faceConflict});
    }
    return next;
  });
  return {plan: {...plan, style: resolved, sentences}, issues};
}

function projectSpan(startMs, endMs, keeps) {
  const start = projectSourceMs(startMs, keeps);
  if (start == null) return null;
  let end = null;
  for (let cursor = endMs; cursor > startMs; cursor -= 20) {
    const projected = projectSourceMs(cursor, keeps);
    if (projected != null && projected > start) { end = projected; break; }
  }
  if (end == null) {
    const edge = projectSourceMs(Math.max(startMs, endMs - 1), keeps);
    end = edge != null && edge > start ? edge : start + 1;
  }
  return {startMs: start, endMs: end};
}

export function projectPlan(plan, keeps, words = []) {
  const sentences = [];
  for (const sentence of plan?.sentences ?? []) {
    if (sentence.status === 'rejected-hallucination') continue;
    const span = projectSpan(sentence.startMs, sentence.endMs, keeps);
    if (!span) continue;
    const punch = sentence.punch?.atMs == null && !sentence.punch?.atWordId
      ? sentence.punch
      : sentence.punch;
    let nextPunch = punch ? {...punch} : null;
    if (nextPunch) {
      const word = wordById(words, nextPunch.atWordId);
      const at = projectSourceMs(word?.startMs ?? nextPunch.atMs, keeps);
      if (at == null) nextPunch = null;
      else nextPunch = {...nextPunch, atMs: at};
    }
    const slide = sentence.slide ? {
      ...sentence.slide,
      items: (sentence.slide.items ?? []).map(item => {
        if (item.status === 'proposed' || item.status === 'rejected-hallucination' || item.atMs == null) return {...item, atMs: null};
        const at = projectSourceMs(item.atMs, keeps);
        return at == null ? {...item, status: 'proposed', atMs: null} : {...item, atMs: at};
      }),
    } : null;
    sentences.push({...sentence, sourceStartMs: sentence.startMs, sourceEndMs: sentence.endMs, ...span, punch: nextPunch, slide, timebase: 'output'});
  }
  const chapters = (plan?.chapters ?? []).filter(chapter => chapter.status !== 'rejected-hallucination').map(chapter => {
    const start = projectSourceMs(chapter.startMs, keeps);
    return {...chapter, sourceStartMs: chapter.startMs, startMs: start ?? chapter.startMs};
  });
  const phrases = subtitlePhrases(words).flatMap(phrase => {
    const span = projectSpan(phrase.startMs, phrase.endMs, keeps);
    return span ? [{...phrase, ...span}] : [];
  });
  return {...plan, chapters, sentences, phrases, timebase: 'output'};
}

export function presentation({plan, words = [], removes = [], faceBox = null, clip = {inSec: 0, outSec: 1e9}, style} = {}) {
  const face = readFaceBox(faceBox);
  const checked = validatePlan(plan, {words, removes});
  const safe = applyFaceSafe(checked.plan, face, style ?? plan?.style);
  const keeps = keepRanges(clip, removes ?? []);
  const projected = projectPlan(safe.plan, keeps, prepareWords(words, {removes}));
  return {plan: projected, keeps, style: safe.plan.style, issues: [...checked.issues, ...safe.issues]};
}

export function highlightAtMs(item) {
  return item?.status === 'aligned' && Number.isFinite(item.atMs) ? item.atMs : null;
}

function chunkWords(words, gapMs, punctuation, maxChars = Infinity) {
  const groups = [];
  let current = [];
  const length = group => group.reduce((sum, word) => sum + [...word.text].length, 0);
  for (const word of words) {
    const previous = current.at(-1);
    if (previous && (word.startMs - previous.endMs >= gapMs || length(current) >= maxChars)) {
      groups.push(current);
      current = [];
    }
    current.push(word);
    if (punctuation.test(word.text) || length(current) >= maxChars) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function punchFromWords(group) {
  const picked = [];
  for (const word of group) {
    const next = fold([...picked, word].map(item => item.text).join(''));
    if (picked.length && [...next].length > 8) break;
    picked.push(word);
    if ([...next].length >= 4) break;
  }
  const text = fold(picked.map(word => word.text).join(''));
  if ([...text].length < 2) return null;
  return {text, atMs: picked[0].startMs, atWordId: picked[0].id};
}

function lastKeptMs(word, keeps) {
  for (let time = word.endMs - 1; time >= word.startMs; time -= 20) {
    const projected = projectSourceMs(time, keeps);
    if (projected != null) return projected;
  }
  return projectSourceMs(word.startMs, keeps);
}

function outputGapMs(previous, word, keeps) {
  const left = lastKeptMs(previous, keeps);
  const right = projectSourceMs(word.startMs, keeps);
  if (left == null || right == null) return word.startMs - previous.endMs;
  return right - left;
}

function chunkByOutput(words, gapMs, punctuation, keeps) {
  const groups = [];
  let current = [];
  for (const word of words) {
    const previous = current.at(-1);
    if (previous && outputGapMs(previous, word, keeps) >= gapMs) {
      groups.push(current);
      current = [];
    }
    current.push(word);
    if (punctuation.test(fold(word.text)) || /[。！？!?]$/.test(word.text)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function outputSpanMs(group, keeps) {
  const start = projectSourceMs(group[0].startMs, keeps);
  const end = projectSourceMs(Math.max(group[0].startMs, group.at(-1).endMs - 1), keeps);
  if (start == null || end == null) return group.at(-1).endMs - group[0].startMs;
  return Math.max(1, end - start);
}

function sentencesFromGroups(groups, keeps) {
  const sentences = [];
  let previousShot = 'medium';
  let rhythm = 0;
  for (const group of groups) {
    const pieces = outputSpanMs(group, keeps) > 8000 ? chunkByOutput(group, 280, /[。！？!?，,、；;]$/, keeps) : [group];
    for (const piece of pieces) {
      const span = outputSpanMs(piece, keeps);
      let shot = previousShot;
      if (!(span < 1500 && sentences.length)) {
        rhythm += 1;
        shot = rhythm % 5 === 2 ? 'punch' : rhythm % 5 === 4 ? 'shift-right' : 'medium';
      }
      previousShot = shot;
      const punch = shot === 'medium' ? null : punchFromWords(piece);
      sentences.push({
        id: `s${sentences.length + 1}`,
        startMs: piece[0].startMs,
        endMs: piece.at(-1).endMs,
        text: piece.map(word => word.text).join(''),
        shot,
        punch,
        labels: [],
        slide: null,
        pip: false,
        cta: false,
      });
    }
  }
  return sentences;
}

export function draftPlan({words = [], removes = [], corrections = [], style, clip} = {}) {
  const sorted = prepareWords(words, {removes, corrections}).filter(word => word.endMs > word.startMs).sort((a, b) => a.startMs - b.startMs);
  const clipEnd = clip?.outSec ?? ((sorted.at(-1)?.endMs ?? 1000) / 1000 + 1);
  const keeps = keepRanges({inSec: clip?.inSec ?? 0, outSec: clipEnd}, removes);
  const sentences = sentencesFromGroups(chunkByOutput(sorted, 450, /[。！？!?]$/, keeps), keeps);
  const distance = (fromMs, toMs) => {
    const left = projectSourceMs(fromMs, keeps);
    const right = projectSourceMs(toMs, keeps);
    return left == null || right == null ? toMs - fromMs : right - left;
  };
  const chapters = [];
  let previousSentence = null;
  for (const sentence of sentences) {
    const gap = previousSentence ? distance(Math.max(previousSentence.startMs, previousSentence.endMs - 1), sentence.startMs) : Infinity;
    const lasted = chapters.at(-1) ? distance(chapters.at(-1).startMs, sentence.startMs) : Infinity;
    if (!chapters.length || (gap >= 1200 && lasted >= 8000 && chapters.length < 6)) chapters.push({id: `ch${chapters.length + 1}`, title: '', startMs: sentence.startMs});
    sentence.chapterId = chapters.at(-1).id;
    previousSentence = sentence;
  }
  return {style: resolveStyle(style), chapters, sentences};
}

export function punchProgress(frame, fps, atMs) {
  const age = frame - Math.round(atMs / 1000 * fps);
  if (age < 0) return 0;
  const span = Math.max(4, Math.round(PUNCH_SPRING_MS / 1000 * fps));
  const t = Math.min(1, age / span);
  return 1 - (1 - t) ** 2;
}

// 0.82 → about 1.08 → 1.0 inside the same short spring. The peak is the pop; it settles at 1.
export function punchScaleFactor(progress) {
  if (!(progress > 0)) return 0.82;
  const peak = 1.08;
  const rise = 0.62;
  if (progress < rise) return 0.82 + (peak - 0.82) * (progress / rise);
  return peak + (1 - peak) * Math.min(1, (progress - rise) / (1 - rise));
}

export function redraftSentence(plan, words, sentenceId) {
  const current = (plan?.sentences ?? []).find(sentence => sentence.id === sentenceId);
  if (!current) return plan;
  const local = (words ?? []).filter(word => word.endMs > current.startMs && word.startMs < current.endMs);
  const fresh = draftPlan({words: local.length ? local : words, style: plan.style}).sentences[0];
  return {
    ...plan,
    sentences: plan.sentences.map(sentence => sentence.id === sentenceId ? {
      ...sentence,
      shot: fresh?.shot ?? 'medium',
      punch: fresh?.punch ? {...fresh.punch, atMs: current.startMs, atWordId: sentence.punch?.atWordId ?? fresh.punch.atWordId} : null,
    } : sentence),
  };
}

export function rhythmHints(sentences = []) {
  const hints = [];
  let slides = 0;
  let mediumFrom = null;
  for (const sentence of sentences) {
    if (sentence.slide && sentence.shot !== 'punch') slides += 1;
    else slides = 0;
    if (slides >= 3) hints.push({sentenceId: sentence.id, message: '板式太密'});
    if (sentence.shot === 'medium' && !sentence.slide) {
      if (mediumFrom == null) mediumFrom = sentence.startMs;
      if (sentence.endMs - mediumFrom >= 20000) hints.push({sentenceId: sentence.id, message: '可以加一句大字'});
    } else mediumFrom = null;
  }
  return hints;
}

export function subtitlePhrases(words = []) {
  return chunkWords([...words].sort((a, b) => a.startMs - b.startMs), 280, /[。！？!?，,、；;]$/).map(group => ({
    text: group.map(word => word.text).join(''),
    startMs: group[0].startMs,
    endMs: group.at(-1).endMs,
  }));
}

export function frameTalentScales(plan, style = DEFAULT_STYLE) {
  const resolved = resolveStyle(style ?? plan?.style);
  return (plan?.sentences ?? []).filter(sentence => !sentence.slide).map(sentence => ({
    id: sentence.id,
    shot: sentence.shot,
    scale: talentScale(sentence.shot, resolved),
  }));
}
