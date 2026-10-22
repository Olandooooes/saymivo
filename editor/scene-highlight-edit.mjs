// These coordinates belong to the original media, before crop, camera or pose.
export function sceneHighlightBoxPatch(scene, id, box) {
  if (!scene.highlights?.some(region => region.id === id)) return null;
  const {x, y, w, h} = box;
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 ||
    x + w > 1 + 1e-9 || y + h > 1 + 1e-9) return null;
  const coordinates = {x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y)};
  return {highlights: scene.highlights.map(region => region.id === id ? {...region, ...coordinates} : region)};
}

export function sceneHighlightColorPatch(scene, id, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !scene.highlights?.some(region => region.id === id)) return null;
  return {highlights: scene.highlights.map(region => region.id === id ? {...region, color} : region)};
}

export function sceneHighlightPreviewSecond(scene, id) {
  const media = scene.media;
  if (!media) return 0;
  if (Number.isFinite(media.freezeAtSec)) return Math.max(0, media.freezeAtSec);
  const region = scene.highlights?.find(highlight => highlight.id === id);
  return Math.max(0, media.startSec ?? 0) + Math.max(0, region?.atMs ?? 0) / 1000 * (media.rate ?? 1);
}
