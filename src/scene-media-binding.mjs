// Content coordinates and playback offsets belong to one media source. A new
// source must not inherit annotations or simulated actions from the old one.
export function sceneMediaBindingPatch(scene, asset) {
 const sameSource = scene.media?.src === asset.src;
 const sourceNote = typeof asset.sourceNote === 'string' && asset.sourceNote.trim()
  ? asset.sourceNote.trim() : asset.src;
 return {
  media: sameSource ? scene.media : {
   src: asset.src, kind: asset.kind,
   width: asset.width, height: asset.height,
   ...(asset.kind === 'video' ? {durationSec: asset.durationSec, startSec: 0} : {}),
   fit: 'contain',
  },
  ...(sameSource ? {} : {highlights: [], illustrative: undefined}),
  sourceNote,
  label: asset.label,
  missing: undefined,
 };
}
