import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadAssetLibrary} from '../src/asset-library.mjs';
import {
  addShot,
  captionsToDraftInput,
  draftScriptStoryboard,
  mergeShots,
  missingAssetShots,
  rematchAssets,
  removeShot,
  splitSentences,
  splitShot,
  updateShot,
  validateScriptStoryboard,
} from '../src/script-storyboard.mjs';

const assets = loadAssetLibrary(path.join(import.meta.dirname, 'fixtures', 'script-assets')).items;
const script = [
  '今天想聊一件小事。',
  '真正的麻烦是，重复的表格还是得自己填。',
  '办法是把这些动作收成三个步骤。',
  '打开聊天窗口，把要求打进去。',
  '中间这句没有对应的画面。',
  '最后合上电脑，到这里就结束。',
].join('');

test('sentences split on full stops, questions, exclamations and line breaks, not commas', () => {
  const parts = splitSentences('你好，世界。下一步呢？就这样！\n另一行');
  assert.deepEqual(parts.map((part) => part.text), ['你好，世界。', '下一步呢？', '就这样！', '另一行']);
  assert.equal('你好，世界。下一步呢？就这样！\n另一行'.slice(parts[0].start, parts[0].end), parts[0].text);
});

test('a draft matches the placeholder library, leaves a gap, and ignores deprecated assets', () => {
  const doc = draftScriptStoryboard({sourceText: script, assets, source: 'script'});
  assert.equal(validateScriptStoryboard(doc).ok, true);
  assert.deepEqual(doc.shots.map((shot) => shot.role), ['开场', '痛点', '方案', '方案', '方案', '结尾']);
  assert.deepEqual(doc.shots.map((shot) => shot.assetId), ['ph-open', 'ph-pain', 'ph-plan', 'ph-ui', 'null', 'ph-end'].map((id) => (id === 'null' ? null : id)));
  assert.equal(doc.shots[0].motions.includes('大字回弹'), true);
  assert.equal(doc.shots[1].motions.includes('印章'), true);
  assert.equal(doc.shots[1].emphasis.some((item) => item.text === '麻烦' && item.style === '标红'), true);
  assert.equal(doc.shots[3].motions.includes('打字界面'), true);
  assert.equal(doc.shots[3].motions.includes('章节转场'), false);
  assert.equal(doc.shots[5].motions.includes('章节转场'), true);
  assert.ok(doc.shots.every((shot) => shot.timeRange === null));
  assert.equal(doc.shots[4].charRange && script.trim().slice(doc.shots[4].charRange.start, doc.shots[4].charRange.end), doc.shots[4].text);
  const missing = missingAssetShots(doc);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].index, 4);
  const stuck = draftScriptStoryboard({sourceText: '这里有点卡顿。', assets, source: 'script'});
  assert.equal(stuck.shots[0].assetId, null);
});

test('transcript words fill wordRange and leave timeRange empty', () => {
  const text = '今天想聊一件很小的事。';
  const tokens = ['今天', '想聊', '一件', '很小', '的事。'];
  let clock = 0;
  const words = tokens.map((token) => {
    const startMs = clock;
    clock += token.length * 200;
    return {text: token, startMs, endMs: clock};
  });
  const doc = draftScriptStoryboard({sourceText: text, words, source: 'transcript'});
  assert.equal(doc.source, 'transcript');
  assert.deepEqual(doc.shots[0].wordRange, {start: 0, end: tokens.length});
  assert.equal(doc.shots[0].timeRange, null);
  assert.equal(validateScriptStoryboard(doc).ok, true);
  const fromCaptions = captionsToDraftInput([{startMs: 10, words}, {startMs: 0, words: [{text: '先说。', startMs: 0, endMs: 100}]}]);
  assert.equal(fromCaptions.sourceText.startsWith('先说。'), true);
});

test('editing, splitting and merging keep ranges and a chosen picture', () => {
  const text = '今天想聊一件很小的事。';
  const words = ['今天', '想聊', '一件很小的事。'].map((token, index) => ({text: token, startMs: index * 100, endMs: index * 100 + 80}));
  let doc = draftScriptStoryboard({sourceText: text, words, assets, source: 'transcript'});
  const chosen = updateShot(doc, 's1', {assetId: 'ph-plan', note: '改成这张'});
  assert.equal(chosen.ok, true);
  doc = chosen.storyboard;
  assert.equal(doc.shots[0].assetId, 'ph-plan');
  assert.equal(doc.shots[0].match, null);
  const kept = rematchAssets(doc, assets, {onlyMissing: true});
  assert.equal(kept.shots[0].assetId, 'ph-plan');
  const splitAt = '今天想聊'.length;
  const split = splitShot(doc, 's1', splitAt);
  assert.equal(split.ok, true);
  doc = split.storyboard;
  assert.equal(doc.shots[0].text, '今天想聊');
  assert.equal(doc.shots[1].text, '一件很小的事。');
  assert.equal(doc.shots[0].assetId, 'ph-plan');
  assert.equal(doc.shots[1].assetId, null);
  assert.deepEqual(doc.shots[0].wordRange, {start: 0, end: 2});
  assert.deepEqual(doc.shots[1].wordRange, {start: 2, end: 3});
  assert.equal(missingAssetShots(doc).length, 1);
  const merged = mergeShots(doc, doc.shots[0].id);
  assert.equal(merged.ok, true);
  doc = merged.storyboard;
  assert.equal(doc.shots.length, 1);
  assert.equal(doc.shots[0].text, text.replace(/。$/, '') === doc.shots[0].text ? doc.shots[0].text : '今天想聊一件很小的事。');
  assert.equal(doc.shots[0].text, '今天想聊一件很小的事。');
  assert.deepEqual(doc.shots[0].wordRange, {start: 0, end: 3});
  assert.equal(doc.shots[0].note, '改成这张');
  const drifted = updateShot(doc, doc.shots[0].id, {text: '改过的句子。'});
  assert.equal(drifted.storyboard.shots[0].charRange, null);
  assert.equal(drifted.storyboard.shots[0].wordRange, null);
  const added = addShot(drifted.storyboard, drifted.storyboard.shots[0].id);
  assert.equal(added.storyboard.shots[1].text, '');
  assert.equal(added.storyboard.shots[1].timeRange, null);
  const removed = removeShot(added.storyboard, added.storyboard.shots[1].id);
  assert.equal(removed.storyboard.shots.length, 1);
  assert.equal(splitShot(doc, doc.shots[0].id, 0).ok, false);
  assert.equal(mergeShots(removed.storyboard, removed.storyboard.shots[0].id).ok, false);
  assert.equal(updateShot(doc, 's1', {role: '旁白'}).ok, false);
});

test('validation rejects a duplicate id and accepts the documented shape', () => {
  const doc = draftScriptStoryboard({sourceText: '只有一句。', assets});
  assert.equal(validateScriptStoryboard(doc).ok, true);
  assert.equal(validateScriptStoryboard({...doc, shots: [doc.shots[0], {...doc.shots[0]}]}).ok, false);
  const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'schema', 'script-storyboard.schema.json'), 'utf8'));
  for (const key of schema.required) assert.ok(Object.hasOwn(doc, key));
  for (const key of schema.$defs.shot.required) assert.ok(Object.hasOwn(doc.shots[0], key));
  const librarySchema = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'schema', 'asset-library.schema.json'), 'utf8'));
  assert.ok(librarySchema.$defs.asset.properties['文件路径']);
  assert.ok(librarySchema.$defs.asset.properties.deprecated);
});
