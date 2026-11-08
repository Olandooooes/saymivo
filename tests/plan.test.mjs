import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_STYLE, PUNCH_SPRING_MS, draftPlan, frameTalentScales, highlightAtMs, layoutRects, presentation, prepareWords, punchProgress, punchScaleFactor, readFaceBox, redraftSentence, subtitlePhrases, talentScale, validatePlan, windowRect} from '../src/plan.mjs';
import {filterGraph, PORTRAIT_ENHANCE} from '../scripts/render-fine-cut.mjs';
import {publicVideoPath, remuxOriginalAudio} from '../scripts/plan-files.mjs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const spoken = (text, start) => text.split('').map((char, index) => ({id: `w${start + index}`, text: char, startMs: start * 400 + index * 180, endMs: start * 400 + index * 180 + 160}));

test('the editor preview is full bleed instead of the wallpaper window', () => {
  const video = fs.readFileSync(new URL('../src/plan-kit/PlanVideo.tsx', import.meta.url), 'utf8');
  const talking = fs.readFileSync(new URL('../src/plan-kit/Talking.tsx', import.meta.url), 'utf8');
  assert.equal(video.includes('#2c2d4e'), false);
  assert.equal(video.includes('radial-gradient(ellipse at 78%'), false);
  assert.equal(talking.includes('borderRadius'), false);
  assert.equal(talking.includes('data-framing="fullbleed"'), true);
  assert.equal(talking.includes('1.08'), true);
  assert.match(talking, /0\.8/);
});

test('a chopped clause and an invented chapter title are dropped', () => {
  const words = spoken('这件事和以前的做法相比到底差在哪里', 0);
  const sentence = words.map(word => word.text).join('');
  const plan = {chapters: [{id: 'c1', title: '先看框架'}], sentences: [{
    id: 's1', startMs: 0, endMs: 4000, text: sentence, shot: 'medium',
    punch: {text: sentence.slice(0, -3), atMs: 0},
    labels: [{text: sentence.slice(-3), atMs: 200}],
  }]};
  const checked = validatePlan(plan, {words});
  assert.equal(checked.plan.chapters[0].title, '');
  assert.equal(checked.plan.sentences[0].punch, null);
  const whole = validatePlan({sentences: [{id: 's1', startMs: 0, endMs: 4000, text: sentence, shot: 'punch', punch: {text: sentence, atMs: 0}, labels: []}]}, {words});
  assert.equal(whole.plan.sentences[0].punch.text, sentence.replace(/[，,。！？!?、；;：:\s]/g, ''));
});

test('slide points stay in speech order and a one-line card is dropped', () => {
  const words = spoken('先看第一件再看第二件', 0);
  const sentence = words.map(word => word.text).join('');
  const plan = {sentences: [{
    id: 's1', startMs: 0, endMs: 4000, text: sentence, shot: 'medium',
    slide: {kind: 'checklist', items: [
      {id: 'b', title: '再看第二件', atWordId: words[5].id},
      {id: 'a', title: '先看第一件', atWordId: words[0].id},
    ]},
  }]};
  const checked = validatePlan(plan, {words});
  assert.deepEqual(checked.plan.sentences[0].slide.items.map(item => item.title), ['先看第一件', '再看第二件']);
  const thin = validatePlan({sentences: [{
    id: 's1', startMs: 0, endMs: 4000, text: sentence, shot: 'medium',
    slide: {kind: 'checklist', items: [{id: 'a', title: '先看第一件', atWordId: words[0].id}]},
  }]}, {words});
  assert.equal(thin.plan.sentences[0].slide, null);
});

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
  const checked = validatePlan(plan, {words, removes: [{status: 'accepted', kind: 'false-start', startMs: 2800, endMs: 3900}]});
  assert.equal(checked.plan.sentences[0].punch, null);
  assert.equal(checked.plan.sentences[0].slide.items[1].status, 'proposed');
  assert.equal(highlightAtMs(checked.plan.sentences[0].slide.items[1]), null);
  const shown = presentation({plan, words, removes: [{status: 'accepted', kind: 'false-start', startMs: 2800, endMs: 3900}], faceBox: {x: 0.62, y: 0.2, w: 0.2, h: 0.3}, clip: {inSec: 0, outSec: 10}});
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
  const line = (text, startMs) => [...text].map((char, index) => ({id: `${startMs}-${index}`, text: char, startMs: startMs + index * 300, endMs: startMs + index * 300 + 260}));
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
  for (const chapter of plan.chapters) assert.equal(chapter.title, '');
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

test('a kept phrase is not built from a cut word, and accepted corrections replace the token', () => {
  const words = [
    {id: 'a', text: '如果', startMs: 0, endMs: 300},
    {id: 'b', text: 'AIagent', startMs: 300, endMs: 700},
    {id: 'c', text: '给你', startMs: 700, endMs: 1100},
    {id: 'd', text: '一个框架', startMs: 2500, endMs: 4200},
  ];
  const corrections = [{status: 'accepted', wordIds: ['b'], after: 'AI Agent'}];
  const removes = [{status: 'accepted', kind: 'false-start', startMs: 680, endMs: 1200}];
  const kept = prepareWords(words, {removes, corrections});
  assert.equal(kept.some(word => word.text === '给你'), false);
  assert.ok(kept.some(word => word.text === 'AI Agent'));
  const plan = draftPlan({words, removes, corrections});
  const blob = JSON.stringify(plan.sentences);
  assert.equal(blob.includes('给你'), false);
  assert.equal(blob.includes('AIagent'), false);
  const edited = {sentences: [{id: 's', startMs: 0, endMs: 4200, text: '如果AI Agent给你一个框架', shot: 'punch', punch: {text: '如果AI Agent给你', atWordId: 'a', atMs: 0}}]};
  const checked = validatePlan(edited, {words: prepareWords(words, {corrections}), removes});
  assert.equal(checked.plan.sentences[0].punch, null);
  assert.ok(checked.issues.some(issue => issue.code === 'cut-word'));
});

test('short fragments inherit the previous shot and punch text stays on word boundaries', () => {
  const words = [
    {id: 'w1', text: '如果', startMs: 0, endMs: 400},
    {id: 'w2', text: 'AI', startMs: 400, endMs: 700},
    {id: 'w3', text: '给你', startMs: 700, endMs: 3200},
    {id: 'w4', text: '第一，', startMs: 4000, endMs: 4300},
    {id: 'w5', text: '然后', startMs: 5200, endMs: 5800},
    {id: 'w6', text: '收住', startMs: 5800, endMs: 7600},
  ];
  const plan = draftPlan({words});
  assert.equal(plan.chapters[0].title, '');
  const fragment = plan.sentences.find(sentence => sentence.text.includes('第一'));
  const host = plan.sentences.find(sentence => sentence.text.includes('如果'));
  const later = plan.sentences.find(sentence => sentence.text.includes('然后'));
  assert.equal(fragment.shot, host.shot);
  assert.equal(later.shot, 'punch');
  let rest = later.punch.text;
  while (rest) {
    const word = ['然后', '收住'].find(part => rest.startsWith(part));
    assert.ok(word, rest);
    rest = rest.slice(word.length);
  }
});

test('punch motion stays visible across about four frames and uses the shared text box', () => {
  const at = 30;
  assert.ok(punchProgress(at, 30, 1000) === 0);
  assert.ok(punchProgress(at + 1, 30, 1000) > 0.2 && punchProgress(at + 1, 30, 1000) < 0.6);
  assert.ok(punchProgress(at + 2, 30, 1000) < 0.9);
  assert.equal(punchProgress(at + 4, 30, 1000), 1);
  assert.ok(Math.abs(punchScaleFactor(0.62) - 1.08) < 0.001);
  assert.equal(punchScaleFactor(1), 1);
  assert.equal(fs.readFileSync(new URL('../src/plan-kit/PunchText.tsx', import.meta.url), 'utf8').includes('punchScaleFactor'), true);
  const box = layoutRects('punch').punch;
  assert.ok(box.y < 0.5, box.y);
  assert.equal(fs.readFileSync(new URL('../src/plan-kit/PunchText.tsx', import.meta.url), 'utf8').includes('layoutRects'), true);
  assert.equal(fs.readFileSync(new URL('../src/plan-kit/Slides.tsx', import.meta.url), 'utf8').includes('>{kind}<'), false);
});

test('a narrower source cannot be enlarged past one source pixel', () => {
  const source = {width: 960, height: 540};
  const composition = {width: 1920, height: 1080};
  for (const shot of ['medium', 'shift-right']) assert.ok(talentScale(shot, DEFAULT_STYLE, source, composition) <= 1, shot);
  assert.ok(talentScale('punch', DEFAULT_STYLE, source, composition) <= DEFAULT_STYLE.maxPunchSourceScale);
});

test('the rendered plan points at a public-relative file and keeps the fine-cut audio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-files-'));
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir);
  const outside = path.join(dir, 'fine.mp4');
  fs.writeFileSync(outside, 'video');
  assert.equal(fs.readFileSync(new URL('../scripts/plan-files.mjs', import.meta.url), 'utf8').includes('-shortest'), false);
  assert.equal(publicVideoPath(outside, publicDir), 'plan-src/fine.mp4');
  assert.equal(fs.readFileSync(path.join(publicDir, 'plan-src/fine.mp4'), 'utf8'), 'video');
  const make = (file, audioSeconds) => spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-t', '1', '-i', 'color=c=black:s=160x90:r=30', '-f', 'lavfi', '-t', String(audioSeconds), '-i', 'sine=frequency=440:sample_rate=48000', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', file], {encoding: 'utf8'});
  const fine = path.join(dir, 'clock.mp4');
  const late = path.join(dir, 'late.mp4');
  assert.equal(make(fine, 1).status, 0);
  assert.equal(make(late, 1.08).status, 0);
  const mixed = path.join(dir, 'mixed.mp4');
  remuxOriginalAudio(late, fine, mixed);
  const audio = file => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'json', file], {encoding: 'utf8'}).stdout).streams[0].duration;
  assert.ok(Math.abs(Number(audio(mixed)) - Number(audio(fine))) < 0.03, audio(mixed));
  const detected = spawnSync('python3', ['scripts/face-detect.py', fine, path.join(dir, 'face.json')], {encoding: 'utf8'});
  assert.equal(detected.status, 0, detected.stderr);
  const face = JSON.parse(fs.readFileSync(path.join(dir, 'face.json'), 'utf8'));
  assert.equal(Object.hasOwn(face, 'face'), true);
});

test('a pause shrink does not drop an audible word, and phrases stay on kept word boundaries', () => {
  const words = [
    {id: 'a', text: '找错', startMs: 0, endMs: 400},
    {id: 'b', text: '资料', startMs: 400, endMs: 1600},
    {id: 'c', text: 'Agent最值得关注', startMs: 1800, endMs: 2600},
  ];
  const pause = [{status: 'accepted', kind: 'pause', startMs: 500, endMs: 1400}];
  assert.ok(prepareWords(words, {removes: pause}).some(word => word.id === 'b'));
  const phrases = subtitlePhrases(prepareWords(words, {removes: pause}));
  assert.equal(phrases.some(phrase => phrase.text.includes('资料')), true);
  assert.ok(phrases.some(phrase => phrase.text.includes('Agent最值得关注')));
  assert.equal(phrases.some(phrase => phrase.text.includes('Agent最值') && !phrase.text.includes('Agent最值得关注')), false);
  const removed = [{status: 'accepted', kind: 'retake', startMs: 0, endMs: 500}];
  const afterCut = presentation({
    plan: draftPlan({words, removes: removed}),
    words, removes: removed, faceBox: null, clip: {inSec: 0, outSec: 4},
  });
  assert.equal(JSON.stringify(afterCut.plan.phrases).includes('找错'), false);
});

test('sentences follow the cut timeline and a null face does not keep a side title', () => {
  const words = [
    {id: 'a', text: '如果', startMs: 0, endMs: 300},
    {id: 'b', text: 'AI', startMs: 300, endMs: 600},
    {id: 'c', text: '给你', startMs: 600, endMs: 900},
    {id: 'd', text: '分析', startMs: 4000, endMs: 12000},
  ];
  const removes = [{status: 'accepted', kind: 'false-start', startMs: 500, endMs: 3900}];
  const plan = draftPlan({words, removes, clip: {inSec: 0, outSec: 13}});
  assert.equal(plan.sentences.filter(sentence => sentence.text.includes('如果')).length, 1);
  assert.equal(plan.sentences.some(sentence => sentence.text === '如果'), false);
  assert.ok(plan.chapters.length <= 6);
  assert.equal(plan.sentences.some(sentence => sentence.punch?.text?.includes(',')), false);
  const shown = presentation({plan, words, removes, faceBox: {face: null}, clip: {inSec: 0, outSec: 13}});
  assert.ok(shown.plan.sentences.every(sentence => sentence.shot === 'medium' && !sentence.punch));
  assert.equal(readFaceBox({face: null}), null);
  const window = windowRect('medium');
  assert.ok(Math.abs(window.y + window.h / 2 - 0.5) < 0.04, window.y);
});

test('portrait enhancement is optional and does not move the audio trim', () => {
  const plain = filterGraph([[1, 2], [3.067, 3.233]], 30);
  const enhanced = filterGraph([[1, 2], [3.067, 3.233]], 30, null, {enhance: true});
  assert.equal(plain.includes('hqdn3d'), false);
  assert.match(enhanced, new RegExp(PORTRAIT_ENHANCE.replace(/[.]/g, '\\.')));
  assert.equal(plain.match(/atrim=start=[^;]+/g).join('|'), enhanced.match(/atrim=start=[^;]+/g).join('|'));
});
