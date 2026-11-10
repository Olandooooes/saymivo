import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assetTypeOf, filterAssets, loadAssetLibrary, normalizeAsset, normalizeLibrary, resolveAssetsDir, safeAssetFile, writeAssetsDir} from '../src/asset-library.mjs';

const fixture = path.join(import.meta.dirname, 'fixtures', 'script-assets');

test('chinese library.json fields normalize, extras are included, and deprecated stays flagged', () => {
  const library = loadAssetLibrary(fixture);
  assert.equal(library.ok, true);
  assert.equal(library.style.name, '占位米白');
  const open = library.items.find((item) => item.id === 'ph-open');
  assert.equal(open.title, '向观众开口');
  assert.equal(open.path, 'illustrations/open.svg');
  assert.equal(open.thumb, 'illustrations/open.svg');
  assert.deepEqual(open.keywords, ['小事', '提问', '开场']);
  assert.deepEqual(open.usages, ['开场']);
  assert.equal(open.source, '占位绘制');
  assert.match(open.prompt, /占位/);
  assert.equal(open.type, '插画');
  assert.equal(open.width, 320);
  assert.equal(open.deprecated, false);
  assert.equal(library.items.find((item) => item.id === 'ph-ui').type, '界面');
  assert.equal(library.items.find((item) => item.id === 'ph-stamp').type, '贴纸印章');
  assert.equal(library.items.find((item) => item.id === 'ph-chapter').type, '章节卡');
  assert.equal(library.items.find((item) => item.id === 'ph-extra').title, '备选植物');
  assert.equal(library.items.find((item) => item.id === 'ph-old').deprecated, true);
});

test('english aliases and a nested extra field do not break the reader', () => {
  const {item} = normalizeAsset({
    id: 'en-1',
    path: 'a.png',
    thumb: 'a-thumb.png',
    category: '界面外壳',
    title: 'Chat',
    keywords: ['chat'],
    usages: ['方案'],
    source: 'drawn',
    prompt: 'placeholder',
    type: 'ui',
    deprecated: false,
    width: 10,
    height: 20,
    口播P1: {原话摘录: 'should be ignored'},
  });
  assert.equal(item.type, '界面');
  assert.equal(item.title, 'Chat');
  assert.equal(item.deprecated, false);
  assert.equal(normalizeLibrary({items: [{id: 'a'}, {id: 'a'}, 'nope']}).warnings.length, 2);
});

test('type falls back from 类别 when type is omitted', () => {
  assert.equal(assetTypeOf(undefined, '界面外壳'), '界面');
  assert.equal(assetTypeOf(undefined, '贴纸印章'), '贴纸印章');
  assert.equal(assetTypeOf(undefined, '章节底板'), '章节卡');
  assert.equal(assetTypeOf(undefined, '职场'), '插画');
  assert.equal(assetTypeOf('chapter', '职场'), '章节卡');
});

test('filters by keyword, category, usage and type, and hides deprecated unless asked', () => {
  const {items} = loadAssetLibrary(fixture);
  assert.equal(filterAssets(items, {q: '聊天'}).some((item) => item.id === 'ph-ui'), true);
  assert.equal(filterAssets(items, {q: '聊天'}).some((item) => item.id === 'ph-open'), false);
  assert.deepEqual(filterAssets(items, {usage: '开场'}).map((item) => item.id), ['ph-open']);
  assert.deepEqual(filterAssets(items, {type: '章节卡'}).map((item) => item.id), ['ph-chapter']);
  assert.equal(filterAssets(items, {category: '备选'}).length, 1);
  assert.equal(filterAssets(items, {q: '卡顿'}).length, 0);
  assert.equal(filterAssets(items, {q: '卡顿', deprecated: '1'}).map((item) => item.id).join(), 'ph-old');
});

test('a missing directory or broken index returns a message instead of throwing', () => {
  const missing = loadAssetLibrary(path.join(os.tmpdir(), 'saymivo-assets-does-not-exist'));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing');
  assert.match(missing.message, /library\.json/);
  assert.deepEqual(missing.items, []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saymivo-lib-'));
  const noIndex = loadAssetLibrary(dir);
  assert.equal(noIndex.code, 'no-index');
  fs.writeFileSync(path.join(dir, 'library.json'), '{');
  const bad = loadAssetLibrary(dir);
  assert.equal(bad.code, 'invalid');
  assert.match(bad.message, /无法解析/);
});

test('media paths cannot escape the library directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saymivo-safe-'));
  fs.writeFileSync(path.join(dir, 'inside.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, '..', 'outside.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(path.basename(safeAssetFile(dir, 'inside.svg')), 'inside.svg');
  assert.equal(safeAssetFile(dir, '../outside.svg'), null);
  assert.equal(safeAssetFile(dir, '/etc/passwd'), null);
  assert.equal(safeAssetFile(dir, 'inside.svg\0.png'), null);
  const link = path.join(dir, 'escape.svg');
  fs.symlinkSync(path.join(dir, '..', 'outside.svg'), link);
  assert.equal(safeAssetFile(dir, 'escape.svg'), null);
});

test('asset directory config resolves env, then file, then the home default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saymivo-cfg-'));
  const home = path.join(root, 'home');
  assert.equal(resolveAssetsDir({root, env: {}, home}).dir, path.join(home, 'saymivo-assets'));
  assert.equal(resolveAssetsDir({root, env: {}, home}).source, 'default');
  writeAssetsDir(root, '~/illustrations');
  assert.equal(resolveAssetsDir({root, env: {}, home}).dir, path.join(home, 'illustrations'));
  assert.equal(resolveAssetsDir({root, env: {SAYMIVO_ASSETS_DIR: '/tmp/from-env'}, home}).source, 'env');
  assert.throws(() => writeAssetsDir(root, 'bad\npath'), /无效/);
  writeAssetsDir(root, '');
  assert.equal(fs.existsSync(path.join(root, '.saymivo.json')), false);
});
