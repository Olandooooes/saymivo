import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {draftPlan} from '../src/plan.mjs';
import {draftWithLlm} from '../src/plan-llm.mjs';

const words = [
  {id: 'a', text: '如果', startMs: 0, endMs: 400},
  {id: 'b', text: '给你', startMs: 400, endMs: 800},
  {id: 'c', text: '一个', startMs: 2000, endMs: 2600},
  {id: 'd', text: '框架', startMs: 2600, endMs: 4200},
];
const removes = [{status: 'accepted', kind: 'false-start', startMs: 400, endMs: 900}];

function reply(body) {
  return async () => ({choices: [{message: {content: JSON.stringify(body)}}]});
}

test('the prompt file does not contain a sample script', () => {
  const prompt = fs.readFileSync(new URL('../prompts/plan-draft.txt', import.meta.url), 'utf8');
  for (const phrase of ['竞品分析', '搜索资料', '口播工作台', 'AIagent']) assert.equal(prompt.includes(phrase), false, phrase);
});

test('a valid model draft keeps word times and a punch from kept words', async () => {
  const base = draftPlan({words, removes});
  const result = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'test'},
    fetchImpl: reply({
      chapters: [{title: '先看框架'}],
      sentences: base.sentences.map(sentence => sentence.text.includes('框架')
        ? {id: sentence.id, shot: 'punch', startMs: 5, punch: {text: '一个框架', atWordId: 'wrong'}}
        : {id: sentence.id, shot: 'medium'}),
    }),
  });
  assert.equal(result.source, 'llm');
  const punchSentence = result.plan.sentences.find(sentence => sentence.text.includes('框架'));
  assert.equal(punchSentence.startMs, base.sentences.find(sentence => sentence.text.includes('框架')).startMs);
  assert.equal(punchSentence.punch.text, '一个框架');
  assert.equal(punchSentence.punch.atWordId, 'c');
  assert.equal(result.plan.chapters[0].title, '先看框架');
  assert.ok(result.warnings.some(item => item.code === 'time-locked'));
});

test('a punch that uses a cut word is dropped and the sentence stays', async () => {
  const base = draftPlan({words, removes});
  const result = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'test'},
    fetchImpl: reply({
      chapters: [{title: '框架'}],
      sentences: base.sentences.map(sentence => ({id: sentence.id, shot: 'medium', punch: {text: '给你', atWordId: 'b'}})),
    }),
  });
  assert.equal(result.source, 'llm');
  assert.ok(result.plan.sentences.every(sentence => !sentence.punch));
  assert.equal(result.plan.sentences.length, base.sentences.length);
  assert.ok(result.warnings.some(item => item.message.includes('大字')));
});

test('an invented number is removed from the chapter title', async () => {
  const base = draftPlan({words, removes});
  const result = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'test'},
    fetchImpl: reply({
      chapters: [{title: '共3步'}],
      sentences: base.sentences.map(sentence => ({id: sentence.id, shot: sentence.shot})),
    }),
  });
  assert.equal(result.plan.chapters[0].title, '');
  assert.ok(result.warnings.some(item => item.message.includes('章节')));
  assert.equal(result.plan.sentences.length, base.sentences.length);
});

test('non JSON falls back to the rule draft', async () => {
  const base = draftPlan({words, removes});
  const result = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'test'},
    fetchImpl: async () => ({choices: [{message: {content: '不是 JSON'}}]}),
  });
  assert.equal(result.source, 'rules');
  assert.deepEqual(result.plan.sentences.map(sentence => sentence.startMs), base.sentences.map(sentence => sentence.startMs));
  assert.ok(result.warnings.some(item => item.code === 'llm-fallback'));
});

test('a timeout falls back to the rule draft', async () => {
  const result = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'test'}, timeoutMs: 15,
    fetchImpl: ({signal}) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))),
  });
  assert.equal(result.source, 'rules');
  assert.ok(result.warnings.some(item => item.message.includes('超时')));
});

test('the CLI without a key stays on the rule draft', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-llm-'));
  const wordsFile = path.join(dir, 'words.json');
  const cutFile = path.join(dir, 'cut.json');
  const outFile = path.join(dir, 'plan.json');
  fs.writeFileSync(wordsFile, JSON.stringify({words}));
  fs.writeFileSync(cutFile, JSON.stringify({removes}));
  const env = {...process.env};
  delete env.OPENAI_API_KEY;
  const run = spawnSync(process.execPath, ['scripts/plan-draft.mjs', '--llm', wordsFile, cutFile, outFile], {cwd: process.cwd(), env, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /未配置 OPENAI_API_KEY/);
  const saved = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(saved.draftSource, 'rules');
  assert.equal(saved.source.sentences.some(sentence => sentence.text.includes('给你')), false);
});
