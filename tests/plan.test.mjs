import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_STYLE, PUNCH_SPRING_MS, draftPlan, frameTalentScales, highlightAtMs, presentation, redraftSentence, talentScale, validatePlan} from '../src/plan.mjs';
import {filterGraph, PORTRAIT_ENHANCE} from '../scripts/render-fine-cut.mjs';

const spoken = (text, start) => text.split('').map((char, index) => ({id: `w${start + index}`, text: char, startMs: start * 400 + index * 180, endMs: start * 400 + index * 180 + 160}));

test('framed portraits stay within the configured source-pixel cap on every shot', () => {
  assert.equal(DEFAULT_STYLE.talentFraming, 'framed');
  assert.ok(DEFAULT_STYLE.windowScale >= 0.6 && DEFAULT_STYLE.windowScale <= 0.7);
  for (const shot of ['medium', 'shift-right', 'punch']) {
    const scale = talentScale(shot, DEFAULT_STYLE);
    const cap = shot === 'punch' ? DEFAULT_STYLE.maxPunchSourceScale : DEFAULT_STYLE.maxSourceScale;
    assert.ok(scale <= cap + 1e-9, `${shot} ${scale}`);
    assert.ok(scale < 1.36, shot);
  }
  assert.equal(talentScale('punch', {...DEFAULT_STYLE, talentFraming: 'fullscreen'}), 1.36);
  const plan = draftPlan({words: spoken('先把土翻松再浇水', 0)});
  assert.ok(frameTalentScales(plan, DEFAULT_STYLE).every(row => row.scale <= (row.shot === 'punch' ? 1.1 : 1)));
});

test('a punch or slide cue on a removed word is dropped instead of highlighted', () => {
  const words = [
    {id: 'w1', text: '留着重说', startMs: 1000, endMs: 1800},
    {id: 'w2', text: '只留完整', startMs: 3000, endMs: 3800},
  ];
  const plan = {sentences: [{
    id: 's1', startMs: 1000, endMs: 4000, text: '留着重说只留完整', shot: 'medium',
    punch: {text: '只留完整', atWordId: 'w2', atMs: 3000},
    slide: {kind: 'comparison', items: [{id: 'a', title: '留着重说', atWordId: 'w1'}, {id: 'b', title: '只留完整', atWordId: 'w2'}]},
  }]};
  const checked = validatePlan(plan, {words, removes: [{status: 'accepted', startMs: 2800, endMs: 3900}]});
  assert.equal(checked.plan.sentences[0].punch, null);
  assert.equal(checked.plan.sentences[0].slide.items[1].status, 'proposed');
  assert.equal(highlightAtMs(checked.plan.sentences[0].slide.items[1]), null);
  const shown = presentation({plan, words, removes: [{status: 'accepted', startMs: 2800, endMs: 3900}], faceBox: {x: 0.62, y: 0.2, w: 0.2, h: 0.3}, clip: {inSec: 0, outSec: 10}});
  const item = shown.plan.sentences[0].slide.items[0];
  assert.ok(Math.abs(item.atMs - 1000) <= 150, item.atMs);
});

test('source times project through the accepted cutlist and preview matches export', () => {
  const words = spoken('今天讲剪口', 1);
  const plan = draftPlan({words});
  const args = {plan, words, removes: [{status: 'accepted', startMs: 900, endMs: 1400}], faceBox: {x: 0.62, y: 0.2, w: 0.22, h: 0.34}, clip: {inSec: 0, outSec: 8}};
  const preview = presentation(args);
  const exported = presentation(args);
  assert.deepEqual(preview, exported);
  assert.equal(preview.plan.timebase, 'output');
  assert.ok(preview.plan.sentences[0].startMs < words[0].startMs + 400);
});

test('without a face box every shot falls back to medium and drops the side title', () => {
  const line = (text, startMs) => [...text].map((char, index) => ({id: `${startMs}-${index}`, text: char, startMs: startMs + index * 160, endMs: startMs + index * 160 + 140}));
  const words = [...line('先把土翻松。', 0), ...line('再浇一遍水。', 3000), ...line('然后看根系。', 6000), ...line('最后盖上草。', 9000), ...line('明天继续。', 12000)];
  const plan = draftPlan({words});
  assert.ok(plan.sentences.some(sentence => sentence.shot !== 'medium'));
  const shown = presentation({plan, words, faceBox: null, clip: {inSec: 0, outSec: 20}});
  assert.ok(shown.plan.sentences.every(sentence => sentence.shot === 'medium' && !sentence.punch));
  assert.ok(shown.issues.some(issue => issue.code === 'face'));
});

test('a second topic only reuses words that were actually spoken', () => {
  const words = spoken('菜畦先浇透再覆一层草', 2);
  const plan = draftPlan({words});
  const blob = JSON.stringify(plan);
  for (const phrase of ['竞品分析', '搜索资料', '口播工作台', 'Agent']) assert.equal(blob.includes(phrase), false, phrase);
  const source = fs.readFileSync(new URL('../src/plan.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('竞品分析'), false);
  const spokenText = words.map(word => word.text).join('');
  for (const sentence of plan.sentences) {
    assert.equal(spokenText.includes(sentence.text), true);
    if (sentence.punch) assert.equal(sentence.text.includes(sentence.punch.text), true);
  }
  for (const chapter of plan.chapters) assert.equal(spokenText.includes(chapter.title), true);
  const before = words.map(word => word.startMs);
  const again = redraftSentence(plan, words, plan.sentences[0].id);
  assert.deepEqual(words.map(word => word.startMs), before);
  assert.equal(again.sentences[0].startMs, plan.sentences[0].startMs);
});

test('invented numbers are rejected and the punch spring is about 130ms', () => {
  const words = spoken('明天去浇水', 0);
  const plan = {sentences: [{id: 's1', startMs: 0, endMs: 2000, text: '明天去浇水', shot: 'medium', punch: {text: '浇水3次', atMs: 0}}]};
  const checked = validatePlan(plan, {words});
  assert.equal(checked.plan.sentences[0].status, 'rejected-hallucination');
  assert.equal(checked.plan.sentences[0].punch, null);
  assert.ok(Math.abs(PUNCH_SPRING_MS - 130) <= 20);
  assert.ok(Math.round(PUNCH_SPRING_MS / 1000 * 30) <= Math.round(0.15 * 30));
});

test('portrait enhancement is optional and does not move the audio trim', () => {
  const plain = filterGraph([[1, 2], [3.067, 3.233]], 30);
  const enhanced = filterGraph([[1, 2], [3.067, 3.233]], 30, null, {enhance: true});
  assert.equal(plain.includes('hqdn3d'), false);
  assert.match(enhanced, new RegExp(PORTRAIT_ENHANCE.replace(/[.]/g, '\\.')));
  assert.equal(plain.match(/atrim=start=[^;]+/g).join('|'), enhanced.match(/atrim=start=[^;]+/g).join('|'));
});
