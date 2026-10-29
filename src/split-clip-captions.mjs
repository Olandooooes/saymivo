// Split cue ownership at a source-time cut. A token crossing the cut belongs to
// both visible fragments; keep its original interval rather than inventing new
// character onsets. The cue bounds limit what each retained clip can display.
export function splitClipCaptions(captions, clipId, rightClipId, splitMs) {
  if (!Number.isFinite(splitMs)) return captions;
  return captions.flatMap(caption => {
    if (caption.clipId !== clipId || caption.endMs <= splitMs) return [caption];
    if (caption.startMs >= splitMs) return [{...caption, clipId: rightClipId}];
    const wordsFor = right => caption.words.filter(word => right ? word.endMs > splitMs : word.startMs < splitMs);
    const fragment = right => {
      const words = wordsFor(right);
      if (caption.words.length && !words.length) return null;
      const result = {...caption, id: right ? `${caption.id}-split-${rightClipId}` : caption.id,
        clipId: right ? rightClipId : clipId, words,
        startMs: right ? splitMs : caption.startMs, endMs: right ? caption.endMs : splitMs};
      // A reviewed whole-cue anchor no longer describes either fragment. Word
      // corrections retain only the relevant original source tokens.
      if (caption.reviewOriginalTiming) delete result.reviewOriginalTiming;
      if (caption.reviewOriginalWords) result.reviewOriginalWords = caption.reviewOriginalWords.filter(word => right ? word.endMs > splitMs : word.startMs < splitMs);
      return result;
    };
    return [fragment(false), fragment(true)].filter(Boolean);
  });
}
