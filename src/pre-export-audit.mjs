import {projectStoryboard} from './storyboard.mjs';

const finite = Number.isFinite;
const textOf = caption => (caption.words ?? []).map(word => word.text ?? '').join('');
const normalized = text => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
const positive = (value, fallback) => finite(value) && value > 0 ? value : fallback;

// Advisory only: inspect the retained edit structure, without reading audio or
// pixels. Times are assembled timeline seconds; cue gaps are not proof of silence.
export function preExportAudit(project = {}, options = {}) {
  const fps = positive(options.fps, 30);
  const gapMs = positive(options.minCaptionGapSec, 2) * 1000;
  const rhythmMs = positive(options.minVisualGapSec, 12) * 1000;
  const nearbyMs = positive(options.duplicateWindowSec, 20) * 1000;
  const advisories = [], placed = [];
  let frames = 0;
  for (const clip of project.clips ?? []) {
    if (!finite(clip.inSec) || !finite(clip.outSec) || clip.outSec <= clip.inSec) continue;
    const speed = positive(clip.speed, 1);
    const duration = Math.max(1, Math.round((clip.outSec - clip.inSec) / speed * fps));
    placed.push({clip, speed, startMs: frames / fps * 1000, endMs: (frames + duration) / fps * 1000});
    frames += duration;
  }
  const toTimeline = (part, sourceMs) => part.startMs + (sourceMs - part.clip.inSec * 1000) / part.speed;
  const cues = [];
  for (const part of placed) {
    const visible = part.clip.showCaptions !== false;
    for (const caption of project.captions ?? []) {
      if (caption.clipId && caption.clipId !== part.clip.id) continue;
      const a = caption.clipId ? toTimeline(part, caption.startMs) : caption.startMs;
      const b = caption.clipId ? toTimeline(part, caption.endMs) : caption.endMs;
      const startMs = Math.max(part.startMs, a), endMs = Math.min(part.endMs, b);
      if (!finite(startMs) || !finite(endMs) || endMs <= startMs || !textOf(caption).trim()) continue;
      cues.push({caption, clipId: part.clip.id, startMs, endMs,
        complete: a >= part.startMs - 1e-6 && b <= part.endMs + 1e-6});
    }
    if (!visible) continue;
    let cursor = part.startMs;
    const gap = endMs => {
      if (endMs - cursor >= gapMs - 1e-6) advisories.push({kind: 'caption-gap', clipId: part.clip.id,
        startSec: cursor / 1000, endSec: endMs / 1000, message: '字幕时间空窗，可能含停顿，需试听'});
    };
    for (const cue of cues.filter(c => c.clipId === part.clip.id).sort((a, b) => a.startMs - b.startMs)) {
      gap(cue.startMs);
      cursor = Math.max(cursor, cue.endMs);
    }
    gap(part.endMs);
  }

  // Compare exact normalized phrases, not semantic similarity. A short repeated
  // word is common in speech, so only phrases of at least four characters qualify.
  const previous = new Map();
  for (const cue of cues.sort((a, b) => a.startMs - b.startMs)) {
    if (!cue.complete) continue; // A retained half-cue does not establish a repeated phrase.
    const text = normalized(textOf(cue.caption));
    if ([...text].length < 4) continue;
    const earlier = previous.get(text);
    if (earlier && earlier.caption !== cue.caption && cue.startMs - earlier.endMs <= nearbyMs) {
      advisories.push({kind: 'retake-candidate', startSec: earlier.startMs / 1000, endSec: Math.max(earlier.endMs, cue.endMs) / 1000,
        captionIds: [earlier.caption.id, cue.caption.id], text: textOf(cue.caption),
        message: '重录候选：附近有相同字幕，需试听确认，保留哪次由你决定'});
    }
    previous.set(text, cue);
  }

  const endMs = frames / fps * 1000, changes = new Set([0, endMs]), motion = [];
  const point = ms => { if (finite(ms) && ms >= 0 && ms <= endMs) changes.add(ms); };
  const span = (a, b, lower, upper) => {
    a = Math.max(lower, a); b = Math.min(upper, b);
    if (finite(a) && finite(b) && b > a) { motion.push([a, b]); point(a); point(b); }
  };
  // Interpolated motion occupies the whole interval between changed keyframes.
  // Identical keyframes do not manufacture a pacing change.
  const movement = (points, fields, map, lower, upper) => {
    const sorted = points.filter(p => finite(p.atMs)).slice().sort((a, b) => a.atMs - b.atMs);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (fields.some(key => a[key] !== b[key])) span(map(a.atMs), map(b.atMs), lower, upper);
    }
  };
  for (const part of placed) {
    point(part.startMs); point(part.endMs);
    movement((part.clip.transform ?? []).map(k => ({...k, atMs: k.t * 1000})), ['scale', 'x', 'y'],
      ms => toTimeline(part, ms), part.startMs, part.endMs);
    for (const window of part.clip.focusWindows ?? []) {
      for (const sec of [window.startSec, window.endSec]) {
        const ms = toTimeline(part, sec * 1000);
        if (ms >= part.startMs && ms <= part.endMs) point(ms);
      }
    }
  }
  for (const scene of projectStoryboard(project.presentation?.scenes ?? [], placed.map(p => p.clip), fps)) {
    const map = ms => scene.phaseStartMs + ms / scene.speed;
    const event = ms => { const at = map(ms); if (at >= scene.startMs && at <= scene.endMs) point(at); };
    point(scene.startMs); point(scene.endMs);
    for (const tag of scene.tags ?? []) {
      for (const ms of [tag.atMs, tag.endMs, tag.contextAtMs, ...(tag.lineAtMs ?? [])]) event(ms);
      span(map(tag.atMs), map(tag.atMs + (tag.animation?.inMs ?? 0)), scene.startMs, scene.endMs);
      span(map(tag.endMs - (tag.animation?.outMs ?? 0)), map(tag.endMs), scene.startMs, scene.endMs);
    }
    for (const node of scene.nodes ?? []) {
      for (const ms of [node.atMs ?? 0, node.focusMs, ...(node.textCues ?? []).map(c => c.atMs)]) event(ms);
    }
    for (const link of scene.links ?? []) event(link.atMs ?? 0);
    for (const highlight of scene.highlights ?? []) { event(highlight.atMs); event(highlight.endMs); }
    for (const item of [scene.overviewComparison?.before, scene.overviewComparison?.after, ...(scene.overviewComparison?.steps ?? [])]) {
      if (item) event(item.atMs ?? 0);
    }
    event(scene.folderCloseMs);
    const windowPoints = scene.window?.keyframes ?? [];
    const windowBase = scene.window && windowPoints.length && windowPoints[0].atMs > 0 ? [{atMs: 0, ...scene.window}] : [];
    movement([...windowBase, ...windowPoints], ['x', 'y', 'size'], map, scene.startMs, scene.endMs);
    movement(scene.media?.camera ?? [], ['x', 'y', 'scale'], map, scene.startMs, scene.endMs);
    const cursor = scene.media?.cursor ?? [];
    if (cursor.length) event(Math.min(...cursor.map(p => p.atMs)));
    for (const p of cursor) if (p.click) event(p.atMs);
    movement(cursor, ['x', 'y'], map, scene.startMs, scene.endMs);
  }
  // Legacy authored caption motion remains visible even without standalone scenes.
  for (const cue of cues) if (cue.caption.motion) {
    point(cue.startMs); point(cue.endMs);
  }
  const events = [...changes].sort((a, b) => a - b);
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i];
    if (b - a >= rhythmMs - 1e-6 && !motion.some(([x, y]) => x < b && y > a)) {
      advisories.push({kind: 'visual-rhythm', startSec: a / 1000, endSec: b / 1000,
        message: '待看节奏：此段未见新的已编排画面变化；实际视频运动与动画效果需预览确认'});
    }
  }
  return advisories.sort((a, b) => a.startSec - b.startSec || a.kind.localeCompare(b.kind));
}
