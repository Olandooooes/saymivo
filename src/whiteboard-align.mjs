import {MOTIONS} from './script-storyboard.mjs';

// keeps are fine-cut keep ranges in seconds, the same shape as keepRanges().
// null means the word clock is already the output timeline.
export function projectKeepMs(ms, keeps) {
  if (!Number.isFinite(ms)) return null;
  if (keeps == null) return Math.round(ms);
  const sec = ms / 1000;
  let output = 0;
  for (const [start, end] of keeps) {
    if (sec < start) return null;
    if (sec <= end) return Math.round((output + (sec - start)) * 1000);
    output += end - start;
  }
  return null;
}

export function keepsKey(keeps) {
  if (keeps == null) return 'timeline';
  return JSON.stringify(keeps.map(([start, end]) => [Math.round(start * 1000), Math.round(end * 1000)]));
}

export function clampLead(style, leadMs = style?.align?.leadMs) {
  const min = style.align.leadMinMs;
  const max = style.align.leadMaxMs;
  const value = Number.isFinite(leadMs) ? leadMs : style.align.leadMs;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function wordsForShot(doc, shot) {
  const words = doc.words ?? [];
  if (shot.wordRange && Number.isInteger(shot.wordRange.start) && Number.isInteger(shot.wordRange.end)) {
    return words.slice(shot.wordRange.start, shot.wordRange.end).map((word, offset) => ({...word, index: shot.wordRange.start + offset}));
  }
  if (!shot.charRange || words.map((word) => word.text).join('') !== doc.sourceText) return [];
  let cursor = 0;
  const found = [];
  words.forEach((word, index) => {
    const start = cursor;
    cursor += word.text.length;
    if (cursor > shot.charRange.start && start < shot.charRange.end) found.push({...word, index});
  });
  return found;
}

function mapWord(word, keeps) {
  const mappedStart = projectKeepMs(word.startMs, keeps);
  const mappedEnd = projectKeepMs(word.endMs, keeps);
  if (mappedStart == null || mappedEnd == null || mappedEnd <= mappedStart) return null;
  return {...word, mappedStart, mappedEnd};
}

function overlaps(word, phrase) {
  if (!phrase || !word?.text) return false;
  return word.text.includes(phrase) || phrase.includes(word.text);
}

function cue(motion, word, leadMs) {
  return {motion, atMs: Math.max(0, word.mappedStart + leadMs), leadMs, word: word.text, wordIndex: word.index};
}

function typingSteps(words, leadMs) {
  const steps = [];
  for (const word of words) {
    const atMs = Math.max(0, word.mappedStart + leadMs);
    for (const text of [...word.text]) steps.push({text, atMs, wordIndex: word.index});
  }
  return steps;
}

export function typedTextAt(steps, timeMs) {
  return (steps ?? []).filter((step) => step.atMs <= timeMs).map((step) => step.text).join('');
}

export function alignmentStale(doc, keeps) {
  if (!doc?.align?.keepsKey) return true;
  return doc.align.keepsKey !== keepsKey(keeps);
}

export function captionsDrifted(doc, captions) {
  const words = [];
  for (const caption of [...(captions ?? [])].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))) {
    for (const word of caption.words ?? []) if (word?.text) words.push(word);
  }
  if (!words.length || words.map((word) => word.text).join('') !== doc?.sourceText) return false;
  return words.some((word, index) => word.startMs !== doc.words?.[index]?.startMs || word.endMs !== doc.words?.[index]?.endMs);
}

export function alignStoryboard(doc, {keeps = null, style, leadMs} = {}) {
  const checked = style?.align;
  if (!checked) return {storyboard: doc, issues: [{shotId: null, message: '缺少风格规范里的提前量'}]};
  const lead = clampLead(style, leadMs);
  const onset = new Set(style.align.onsetMotions ?? []);
  const issues = [];
  const shots = (doc.shots ?? []).map((shot) => {
    const mapped = wordsForShot(doc, shot).map((word) => mapWord(word, keeps)).filter(Boolean);
    if (!mapped.length) {
      if ((shot.motions ?? []).length) issues.push({shotId: shot.id, message: '这一镜没有落到精剪保留段上的字时间'});
      return {...shot, timeRange: null, cues: [], typing: null};
    }
    const cues = [];
    const first = mapped[0];
    for (const motion of MOTIONS) {
      if (!(shot.motions ?? []).includes(motion)) continue;
      const motionLead = onset.has(motion) ? 0 : lead;
      if (motion === '标红' || motion === '荧光笔') {
        const marks = (shot.emphasis ?? []).filter((item) => item.style === motion && item.text);
        const anchors = (marks.length ? marks : [{text: first.text}]).map((item) => mapped.find((word) => overlaps(word, item.text)) ?? first);
        for (const word of anchors) cues.push(cue(motion, word, motionLead));
        continue;
      }
      if (motion === '打字界面') {
        const steps = typingSteps(mapped, motionLead);
        cues.push({...cue(motion, first, motionLead), atMs: steps[0]?.atMs ?? cue(motion, first, motionLead).atMs});
        continue;
      }
      if (motion === '印章') {
        const marked = (shot.emphasis ?? []).map((item) => mapped.find((word) => overlaps(word, item.text))).find(Boolean) ?? first;
        cues.push(cue(motion, marked, motionLead));
        continue;
      }
      cues.push(cue(motion, first, motionLead));
    }
    const typing = (shot.motions ?? []).includes('打字界面') ? typingSteps(mapped, onset.has('打字界面') ? 0 : lead) : null;
    return {
      ...shot,
      timeRange: {startMs: first.mappedStart, endMs: mapped.at(-1).mappedEnd},
      cues,
      typing,
    };
  });
  return {
    storyboard: {...doc, shots, align: {leadMs: lead, keepsKey: keepsKey(keeps), clock: keeps == null ? 'timeline' : 'source'}},
    issues,
  };
}
