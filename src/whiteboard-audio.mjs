export function voiceLoudnormFilter(style, measured) {
  const voice = style.audio.voice;
  const base = `loudnorm=I=${voice.integratedLufs}:TP=${voice.truePeakDbtp}:LRA=${voice.lra}`;
  if (!measured) return `${base}:print_format=json`;
  return `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
}

export function sfxAmplitude(style) {
  return 10 ** (style.audio.sfx.gainDbMax / 20);
}

export function musicGainDb(style, timeMs, voiceSpans = []) {
  const music = style.audio.music;
  if (!music.enabled) return null;
  let duck = 0;
  for (const span of voiceSpans) {
    if (timeMs >= span.startMs && timeMs <= span.endMs) duck = 1;
    else if (timeMs < span.startMs && timeMs >= span.startMs - music.duckAttackMs && music.duckAttackMs > 0) {
      duck = Math.max(duck, (timeMs - (span.startMs - music.duckAttackMs)) / music.duckAttackMs);
    } else if (timeMs > span.endMs && timeMs <= span.endMs + music.duckReleaseMs && music.duckReleaseMs > 0) {
      duck = Math.max(duck, 1 - (timeMs - span.endMs) / music.duckReleaseMs);
    }
  }
  return music.gainDb + duck * music.duckDb;
}

export function sfxEvents(doc, style) {
  const slots = style.audio.sfx.slots;
  const events = [];
  for (const shot of doc.shots ?? []) {
    for (const cue of shot.cues ?? []) {
      const file = slots[cue.motion];
      if (!file || !Number.isFinite(cue.atMs)) continue;
      events.push({motion: cue.motion, atMs: cue.atMs, file, gainDb: style.audio.sfx.gainDbMax, shotId: shot.id});
    }
  }
  return events.sort((a, b) => a.atMs - b.atMs || a.motion.localeCompare(b.motion, 'zh'));
}

export function voiceSpans(doc) {
  return (doc.shots ?? []).filter((shot) => shot.timeRange).map((shot) => ({startMs: shot.timeRange.startMs, endMs: shot.timeRange.endMs, shotId: shot.id}));
}
