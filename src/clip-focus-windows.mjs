// Focus windows are source-anchored. They never alter the base clip or its audio.
export function validFocusRect(rect) {
  return Boolean(rect && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(rect[k])) &&
    rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0 &&
    rect.x + rect.w <= 1 + 1e-9 && rect.y + rect.h <= 1 + 1e-9);
}

export function retainedFocusWindows(clip) {
  const start = Math.max(0, clip.inSec), end = Math.min(clip.outSec, clip.sourceDurationSec ?? Infinity);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const seen = new Set(), windows = [];
  for (const window of clip.focusWindows ?? []) {
    if (!window || typeof window.id !== 'string' || !window.id || seen.has(window.id) ||
      !Number.isFinite(window.startSec) || !Number.isFinite(window.endSec) || window.endSec <= window.startSec ||
      !validFocusRect(window.sourceRect) || !validFocusRect(window.targetRect)) continue;
    const a = Math.max(start, window.startSec), b = Math.min(end, window.endSec);
    if (b <= a) continue;
    seen.add(window.id);
    windows.push({...window, startSec: a, endSec: b});
  }
  return windows;
}

export function focusWindowSample(clip, window, frame, fps, width, height) {
  const speed = clip.speed ?? 1, sw = clip.sourceWidth, sh = clip.sourceHeight;
  if (![frame, fps, width, height, sw, sh, speed].every(Number.isFinite) || frame < 0 ||
    fps <= 0 || width <= 0 || height <= 0 || sw <= 0 || sh <= 0 || speed <= 0) return null;
  const retained = retainedFocusWindows({...clip, focusWindows: [window]})[0];
  if (!retained) return null;
  const sourceSec = clip.inSec + frame / fps * speed;
  const durationFrames = Math.max(1, Math.round((clip.outSec - clip.inSec) / speed * fps));
  if (frame >= durationFrames || sourceSec < retained.startSec || sourceSec >= retained.endSec) return null;
  const source = retained.sourceRect, target = retained.targetRect;
  const roiWidth = sw * source.w, roiHeight = sh * source.h;
  const factor = Math.min(width * target.w / roiWidth, height * target.h / roiHeight);
  const boxWidth = roiWidth * factor, boxHeight = roiHeight * factor;
  const duration = (retained.endSec - retained.startSec) / speed;
  const elapsed = (sourceSec - retained.startSec) / speed;
  const ease = t => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
  const opacity = ease(elapsed / Math.min(.25, duration * .4)) *
    ease((duration - elapsed) / Math.min(.18, duration * .4));
  const trimBefore = Math.round(clip.inSec * fps);
  return {
    sourceSec, opacity,
    box: {left: width * target.x + (width * target.w - boxWidth) / 2,
      top: height * target.y + (height * target.h - boxHeight) / 2, width: boxWidth, height: boxHeight},
    // The full source is positioned inside a strictly clipped ROI-sized box.
    // Matching this aspect ratio before fitting prevents neighboring pixels entering.
    crop: {left: -source.x * sw * factor, top: -source.y * sh * factor,
      width: sw * factor, height: sh * factor},
    playback: {trimBefore, trimAfter: trimBefore + Math.round(durationFrames * speed),
      playbackRate: speed, muted: true, volume: 0},
  };
}

export function captionsForVisibleClips(captions, clips) {
  const hidden = new Set(clips.filter(c => c.showCaptions === false).map(c => c.id));
  return hidden.size ? captions.filter(c => !hidden.has(c.clipId)) : captions;
}
