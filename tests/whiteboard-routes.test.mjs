import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {isProjectDocument, removeScriptStoryboard, whiteboardRoute} from '../server/whiteboard-routes.mjs';
import {validateScriptStoryboard} from '../src/script-storyboard.mjs';

const fixture = path.join(import.meta.dirname, 'fixtures', 'script-assets');
const json = (res, code, obj) => {
  res.statusCode = code;
  res.body = obj;
};
const call = (root, method, pathname, payload) => {
  const res = {writeHead(code, headers) { this.statusCode = code; this.headers = headers; }, end(data) { this.raw = data; }};
  const url = new URL(pathname, 'http://127.0.0.1');
  return whiteboardRoute({
    req: {method},
    res,
    url,
    ROOT: root,
    PROJECTS_DIR: path.join(root, 'projects'),
    json,
    body: async () => (payload === undefined ? '' : JSON.stringify(payload)),
  }).then((handled) => ({handled, res}));
};

test('asset library route serves the fixture and a thumbnail, and explains a missing folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saymivo-route-'));
  const previous = process.env.SAYMIVO_ASSETS_DIR;
  process.env.SAYMIVO_ASSETS_DIR = fixture;
  try {
    const listed = await call(root, 'GET', '/api/asset-library?q=聊天&usage=方案');
    assert.equal(listed.handled, true);
    assert.equal(listed.res.statusCode, 200);
    assert.equal(listed.res.body.ok, true);
    assert.deepEqual(listed.res.body.items.map((item) => item.id), ['ph-ui']);
    assert.equal(listed.res.body.items.some((item) => item.deprecated), false);
    const hidden = await call(root, 'GET', '/api/asset-library?q=卡顿');
    assert.equal(hidden.res.body.shown, 0);
    const shown = await call(root, 'GET', '/api/asset-library?q=卡顿&deprecated=1');
    assert.equal(shown.res.body.items[0].id, 'ph-old');
    const media = await call(root, 'GET', '/api/asset-library/media?id=ph-open&variant=thumb');
    assert.equal(media.res.statusCode, 200);
    assert.equal(media.res.headers['Content-Type'], 'image/svg+xml');
    assert.match(String(media.res.raw), /<svg/);
    const escaped = await call(root, 'GET', '/api/asset-library/media?id=../secret');
    assert.equal(escaped.res.statusCode, 404);
    process.env.SAYMIVO_ASSETS_DIR = path.join(os.tmpdir(), 'saymivo-assets-missing');
    const missing = await call(root, 'GET', '/api/asset-library');
    assert.equal(missing.res.body.ok, false);
    assert.equal(missing.res.body.code, 'missing');
    assert.match(missing.res.body.message, /library\.json/);
  } finally {
    if (previous === undefined) delete process.env.SAYMIVO_ASSETS_DIR;
    else process.env.SAYMIVO_ASSETS_DIR = previous;
  }
});

test('storyboard draft, save, reload and delete stay beside the project', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saymivo-board-'));
  fs.mkdirSync(path.join(root, 'projects'), {recursive: true});
  const previous = process.env.SAYMIVO_ASSETS_DIR;
  process.env.SAYMIVO_ASSETS_DIR = fixture;
  try {
    const captions = [{id: 'c1', startMs: 0, words: [...'打开聊天窗口。'].map((text, index) => ({text, startMs: index * 100, endMs: index * 100 + 80}))}];
    fs.writeFileSync(path.join(root, 'projects', 'demo.json'), JSON.stringify({captions}));
    const drafted = await call(root, 'POST', '/api/projects/demo/storyboard/draft', {});
    assert.equal(drafted.res.statusCode, 200);
    assert.equal(validateScriptStoryboard(drafted.res.body.storyboard).ok, true);
    assert.equal(drafted.res.body.storyboard.shots[0].assetId, 'ph-ui');
    assert.equal(drafted.res.body.storyboard.shots[0].timeRange, null);
    const saved = await call(root, 'PUT', '/api/projects/demo/storyboard', {...drafted.res.body.storyboard, shots: drafted.res.body.storyboard.shots.map((shot) => ({...shot, note: '已改'}))});
    assert.equal(saved.res.statusCode, 200);
    const loaded = await call(root, 'GET', '/api/projects/demo/storyboard');
    assert.equal(loaded.res.body.storyboard.shots[0].note, '已改');
    const rejected = await call(root, 'PUT', '/api/projects/demo/storyboard', {...drafted.res.body.storyboard, shots: [] , source: 'nope'});
    assert.equal(rejected.res.statusCode, 400);
    const still = await call(root, 'GET', '/api/projects/demo/storyboard');
    assert.equal(still.res.body.storyboard.shots[0].note, '已改');
    removeScriptStoryboard(path.join(root, 'projects'), 'demo');
    const gone = await call(root, 'GET', '/api/projects/demo/storyboard');
    assert.equal(gone.res.body.storyboard, null);
    assert.equal(isProjectDocument('demo.json'), true);
    assert.equal(isProjectDocument('demo.storyboard.json'), false);
  } finally {
    if (previous === undefined) delete process.env.SAYMIVO_ASSETS_DIR;
    else process.env.SAYMIVO_ASSETS_DIR = previous;
  }
});
