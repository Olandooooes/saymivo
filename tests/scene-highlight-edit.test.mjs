import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneHighlightBoxPatch, sceneHighlightColorPatch, sceneHighlightPreviewSecond} from '../editor/scene-highlight-edit.mjs';

const scene = {
  id: 'document', startMs: 10000, endMs: 16000, layout: 'spotlight',
  containerPose: {rotateY: -12, rotateZ: 4, perspective: 1800},
  media: {src: 'broll-assets/document.mp4', kind: 'video', startSec: 3, rate: .5, fit: 'cover',
    camera: [{atMs: 0, scale: 1.8, x: -7, y: 4}]},
  highlights: [
    {id: 'first', x: .1, y: .2, w: .5, h: .1, atMs: 700, endMs: 2400, color: '#123456', mode: 'underline'},
    {id: 'second', x: .3, y: .5, w: .4, h: .08, atMs: 2500, mode: 'spotlight'},
  ],
};

test('redrawing a media-space box preserves highlight timing/style, camera and all other scene data', () => {
  const before = structuredClone(scene);
  const patch = sceneHighlightBoxPatch(scene, 'first', {x: .25, y: .4, w: .45, h: .12, atMs: 0, color: '#ffffff'});
  const edited = {...scene, ...patch};
  assert.deepEqual(edited.highlights[0], {...scene.highlights[0], x: .25, y: .4, w: .45, h: .12});
  assert.equal(edited.highlights[1], scene.highlights[1]);
  assert.equal(edited.media, scene.media);
  assert.equal(edited.containerPose, scene.containerPose);
  assert.equal(edited.startMs, scene.startMs);
  assert.equal(edited.endMs, scene.endMs);
  assert.deepEqual(scene, before);
  assert.equal(sceneHighlightBoxPatch(scene, 'missing', {x: .1, y: .1, w: .1, h: .1}), null);
  assert.equal(sceneHighlightBoxPatch(scene, 'first', {x: .9, y: .1, w: .3, h: .1}), null);
  assert.equal(sceneHighlightBoxPatch(scene, 'first', {x: .1, y: .1, w: 0, h: .1}), null);
  assert.equal(sceneHighlightBoxPatch(scene, 'first', {x: NaN, y: .1, w: .1, h: .1}), null);
});

test('a highlight color edit leaves coordinates, modes, source times and other regions intact', () => {
  const patch = sceneHighlightColorPatch(scene, 'first', '#3156b9');
  assert.deepEqual(patch.highlights[0], {...scene.highlights[0], color: '#3156b9'});
  assert.equal(patch.highlights[1], scene.highlights[1]);
  assert.equal(sceneHighlightColorPatch(scene, 'first', 'invalid'), null);
});

test('video frame preview follows source media offset/rate or an explicit frozen frame', () => {
  assert.equal(sceneHighlightPreviewSecond(scene, 'first'), 3.35);
  assert.equal(sceneHighlightPreviewSecond({...scene, media: {...scene.media, freezeAtSec: 8}}, 'first'), 8);
  assert.equal(sceneHighlightPreviewSecond(scene, 'missing'), 3);
});
