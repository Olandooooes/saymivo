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
export function talentScale(shot, style = DEFAULT_STYLE) {
  const resolved = resolveStyle(style);
  if (resolved.talentFraming === 'fullscreen') {
    if (shot === 'punch') return resolved.fullscreenPunchScale;
    if (shot === 'shift-right') return resolved.fullscreenShiftScale;
    return 1;
  }
  const window = shot === 'shift-right' ? resolved.shiftWindowScale : resolved.windowScale;
  const inner = shot === 'punch' ? resolved.punchScale : 1;
  const cap = shot === 'punch' ? resolved.maxPunchSourceScale : resolved.maxSourceScale;
  return Math.min(cap, window * inner);
}

export function windowRect(shot, style = DEFAULT_STYLE) {
  const resolved = resolveStyle(style);
  if (resolved.talentFraming === 'fullscreen') return {x: 0, y: 0, w: 1, h: 1};
  if (shot === 'shift-right') {
    const w = resolved.shiftWindowScale;
    const h = Math.min(0.7, w * 1.2);
    return {x: 1 - w - 0.05, y: 0.1, w, h};
  }
  const w = resolved.windowScale;
  const h = Math.min(0.62, w * 0.92);
  return {x: (1 - w) / 2, y: 0.06, w, h};
}

export function faceInFrame(face, shot, style = DEFAULT_STYLE) {
  if (!face) return null;
  const resolved = resolveStyle(style);
  const rect = windowRect(shot, resolved);
  const scale = talentScale(shot, resolved);
  const base = resolved.talentFraming === 'fullscreen'
    ? (shot === 'punch' ? resolved.fullscreenPunchScale : shot === 'shift-right' ? resolved.fullscreenShiftScale : 1)
    : (shot === 'shift-right' ? resolved.shiftWindowScale : resolved.windowScale);
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

function inventedFacts(text, source) {
  const digits = String(text ?? '').match(/\d+(?:\.\d+)?/g) ?? [];
  if (digits.some(digit => !source.includes(digit))) return true;
  return [...String(text ?? '')].some(char => '不没非别莫勿'.includes(char) && !source.includes(char));
}

function wordById(words, id) {
  return (words ?? []).find(word => word.id === id) ?? null;
}

function wordIsCut(word, removes) {
  if (!word) return false;
  const mid = (word.startMs + word.endMs) / 2;
  return (removes ?? []).some(row => row.status === 'accepted' && mid >= row.startMs && mid < row.endMs);
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
    if (next.punch?.text) {
      if (!String(next.text ?? '').includes(next.punch.text) || inventedFacts(next.punch.text, source)) {
        next.status = 'rejected-hallucination';
        issues.push({sentenceId: next.id, code: 'rejected-hallucination', message: '大字不在原话里'});
        next.punch = null;
      } else {
        const word = wordById(words, next.punch.atWordId);
        const at = word?.startMs ?? next.punch.atMs;
        if (wordIsCut(word, removes) || (Number.isFinite(at) && (removes ?? []).some(row => row.status === 'accepted' && at >= row.startMs && at < row.endMs))) {
          next.punch = null;
          issues.push({sentenceId: next.id, code: 'cut-word', message: '大字落在已剪掉的词上，已去掉'});
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
          if (item.title && (!spoken.includes(item.title) || inventedFacts(item.title, spoken))) {
            next.status = 'rejected-hallucination';
            issues.push({sentenceId: next.id, code: 'rejected-hallucination', message: '全屏页文字不在原话里'});
            return {...item, status: 'rejected-hallucination'};
          }
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
    return chapter;
  });
  return {ok: !issues.some(issue => issue.code === 'schema'), plan: {...plan, chapters, sentences, style: resolveStyle(plan?.style)}, issues};
}

export function applyFaceSafe(plan, faceBox, style = DEFAULT_STYLE) {
  const resolved = resolveStyle({...style, ...plan?.style});
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
    const punchClash = next.punch && placed && intersects(placed, next.shot === 'shift-right' ? LEFT_TEXT : {x: 0.15, y: 0.68, w: 0.7, h: 0.16}, GAP);
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
  return {...plan, chapters, sentences, timebase: 'output'};
}

export function presentation({plan, words = [], removes = [], faceBox = null, clip = {inSec: 0, outSec: 1e9}, style} = {}) {
  const checked = validatePlan(plan, {words, removes});
  const safe = applyFaceSafe(checked.plan, faceBox, style ?? plan?.style);
  const keeps = keepRanges(clip, removes ?? []);
  const projected = projectPlan(safe.plan, keeps, words);
  return {plan: projected, keeps, style: safe.plan.style, issues: [...checked.issues, ...safe.issues]};
}

export function highlightAtMs(item) {
  return item?.status === 'aligned' && Number.isFinite(item.atMs) ? item.atMs : null;
}

function chunkWords(words, gapMs, punctuation) {
  const groups = [];
  let current = [];
  for (const word of words) {
    const previous = current.at(-1);
    if (previous && word.startMs - previous.endMs >= gapMs) {
      groups.push(current);
      current = [];
    }
    current.push(word);
    if (punctuation.test(word.text)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function phraseOf(words) {
  const text = words.map(word => word.text).join('');
  const slice = [...text].slice(0, Math.min(6, text.length)).join('');
  return slice.length >= 2 ? slice : null;
}

export function draftPlan({words = [], style} = {}) {
  const sorted = [...words].filter(word => word.text && word.endMs > word.startMs).sort((a, b) => a.startMs - b.startMs);
  const groups = chunkWords(sorted, 450, /[。！？!?]$/);
  const sentences = groups.map((group, index) => {
    const text = group.map(word => word.text).join('');
    const rhythm = index % 5;
    const shot = rhythm === 2 ? 'punch' : rhythm === 4 ? 'shift-right' : 'medium';
    const punchText = shot === 'medium' ? null : phraseOf(group);
    const host = group[0];
    return {
      id: `s${index + 1}`,
      startMs: group[0].startMs,
      endMs: group.at(-1).endMs,
      text,
      shot,
      punch: punchText ? {text: punchText, atMs: host.startMs, atWordId: host.id} : null,
      labels: [],
      slide: null,
      pip: false,
      cta: false,
    };
  });
  const chapters = [];
  sentences.forEach((sentence, index) => {
    const previous = sentences[index - 1];
    if (!previous || sentence.startMs - previous.endMs >= 1200) {
      chapters.push({id: `ch${chapters.length + 1}`, title: [...sentence.text].slice(0, 8).join(''), startMs: sentence.startMs});
    }
    sentence.chapterId = chapters.at(-1)?.id ?? null;
  });
  return {style: resolveStyle(style), chapters, sentences};
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
