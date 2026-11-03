import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {draftPlan} from '../src/plan.mjs';
import {DEFAULT_LOCAL_MODEL, LLM_TEMPERATURE, draftWithLlm} from '../src/plan-llm.mjs';
import {planDraftRoute} from '../server/plan-draft-routes.mjs';

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
  const env = {...process.env, OLLAMA_BASE_URL: 'http://127.0.0.1:9'};
  delete env.OPENAI_API_KEY;
  delete env.PLAN_LLM_PROVIDER;
  delete env.PLAN_LLM_MODEL;
  const run = spawnSync(process.execPath, ['scripts/plan-draft.mjs', '--llm', wordsFile, cutFile, outFile], {cwd: process.cwd(), env, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /未配置 OPENAI_API_KEY/);
  assert.match(run.stderr, /setup-local-llm\.sh/);
  const saved = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(saved.draftSource, 'rules');
  assert.equal(saved.source.sentences.some(sentence => sentence.text.includes('给你')), false);
});

const ollamaUp = async () => ({ok: true, models: [DEFAULT_LOCAL_MODEL]});

function longWords() {
  return ['甲。', '乙。', '丙。'].flatMap((text, index) => {
    const start = index * 10000;
    return [
      {id: `a${index}`, text: '先看', startMs: start, endMs: start + 300},
      {id: `b${index}`, text, startMs: start + 300, endMs: start + 800},
    ];
  });
}

function modelReply(input, {fail} = {}) {
  if (fail?.(input)) throw new Error('batch failed');
  const text = input.sentences[0].text.replace(/[。.]/g, '');
  return {choices: [{message: {content: JSON.stringify({
    chapters: [{title: text.slice(-1)}],
    sentences: input.sentences.map(sentence => ({id: sentence.id, shot: 'medium', labels: [{text: '先看'}]})),
  })}}]};
}

test('ollama is used when no API key and the local server has the default model', async () => {
  const calls = [];
  const result = await draftWithLlm({
    words, removes, env: {}, probeImpl: ollamaUp,
    fetchImpl: async ({url, body, key}) => {
      calls.push({url, model: body.model, temperature: body.temperature, format: body.response_format, key});
      const input = JSON.parse(body.messages[1].content);
      return modelReply(input);
    },
  });
  assert.equal(result.source, 'llm');
  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, DEFAULT_LOCAL_MODEL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(calls[0].model, DEFAULT_LOCAL_MODEL);
  assert.equal(calls[0].temperature, LLM_TEMPERATURE);
  assert.deepEqual(calls[0].format, {type: 'json_object'});
  assert.equal(calls[0].key, '');
});

test('an unreachable ollama falls back to the rule draft and tells the user how to install', async () => {
  const result = await draftWithLlm({
    words, removes, env: {},
    probeImpl: async () => ({ok: false, reason: '没有探测到本机 Ollama'}),
    fetchImpl: async () => { throw new Error('should not chat'); },
  });
  assert.equal(result.source, 'rules');
  assert.equal(result.provider, null);
  assert.match(result.warnings[0].message, /未配置 OPENAI_API_KEY/);
  assert.match(result.warnings[0].message, /setup-local-llm\.sh/);
});

test('PLAN_LLM_PROVIDER chooses openai or ollama and PLAN_LLM_MODEL overrides the name', async () => {
  const openai = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'secret', PLAN_LLM_PROVIDER: 'openai'},
    probeImpl: async () => { throw new Error('should not probe'); },
    fetchImpl: async ({url, body, key}) => ({url, body, key, choices: [{message: {content: JSON.stringify({chapters: [], sentences: []})}}]}).then(value => { assert.equal(value.url, 'https://api.openai.com/v1/chat/completions'); assert.equal(value.body.model, 'gpt-4o-mini'); assert.equal(value.key, 'secret'); return value; }),
  });
  assert.equal(openai.provider, 'openai');
  const local = await draftWithLlm({
    words, removes, env: {OPENAI_API_KEY: 'secret', PLAN_LLM_PROVIDER: 'ollama', PLAN_LLM_MODEL: 'custom:7b'},
    probeImpl: async ({model}) => ({ok: model === 'custom:7b'}),
    fetchImpl: async ({url, body, key}) => ({url, body, key, choices: [{message: {content: JSON.stringify({chapters: [], sentences: []})}}]}).then(value => { assert.equal(value.url, 'http://127.0.0.1:11434/v1/chat/completions'); assert.equal(value.body.model, 'custom:7b'); assert.equal(value.key, ''); return value; }),
  });
  assert.equal(local.provider, 'ollama');
  assert.equal(local.model, 'custom:7b');
});

test('batches merge chapter titles and a failed batch is retried once then keeps the rule draft', async () => {
  const spoken = longWords();
  const base = draftPlan({words: spoken});
  assert.ok(base.sentences.length >= 3, base.sentences.map(sentence => sentence.id).join(','));
  const calls = [];
  const progress = [];
  const result = await draftWithLlm({
    words: spoken, env: {}, probeImpl: ollamaUp, batch: {maxSentences: 1, maxChars: 20},
    onProgress: event => progress.push(event.status),
    fetchImpl: async ({body}) => {
      const input = JSON.parse(body.messages[1].content);
      calls.push(input.sentences[0].id);
      return modelReply(input, {fail: row => row.sentences[0].id === 's2'});
    },
  });
  assert.equal(result.source, 'llm');
  assert.deepEqual(calls.filter(id => id === 's2'), ['s2', 's2']);
  assert.equal(calls.filter(id => id === 's1').length, 1);
  assert.equal(result.plan.sentences.find(sentence => sentence.id === 's1').labels[0].text, '先看');
  assert.deepEqual(result.plan.sentences.find(sentence => sentence.id === 's2').labels, base.sentences.find(sentence => sentence.id === 's2').labels);
  assert.equal(result.plan.chapters[0].title, '甲');
  assert.equal(result.plan.chapters[1].title, '');
  assert.equal(result.plan.chapters[2].title, '丙');
  assert.ok(result.warnings.some(item => item.message.includes('第 2 批')));
  assert.ok(progress.includes('retry'));
  assert.ok(progress.includes('fallback'));
});

function capturedResponse() {
  const chunks = [];
  return {chunks, res: {writeHead() {}, write(chunk) { chunks.push(chunk); }, end(chunk) { if (chunk) chunks.push(chunk); }}};
}

test('the editor endpoint hides the button when ollama is down and streams batch progress when it is up', async () => {
  const json = (res, code, obj) => { res.writeHead(code, {}); res.end(JSON.stringify(obj)); };
  const hidden = capturedResponse();
  await planDraftRoute({
    req: {method: 'GET', headers: {}}, res: hidden.res, url: new URL('http://localhost/api/plan/llm'), json, body: async () => ({}), env: {},
    probeImpl: async () => ({ok: false, reason: '没有探测到本机 Ollama'}),
  });
  const status = JSON.parse(hidden.chunks.at(-1));
  assert.equal(status.enabled, false);
  assert.equal(status.model, null);
  assert.match(status.message, /setup-local-llm\.sh/);

  const shown = capturedResponse();
  await planDraftRoute({
    req: {method: 'GET', headers: {}}, res: shown.res, url: new URL('http://localhost/api/plan/llm'), json, body: async () => ({}), env: {OPENAI_API_KEY: 'test', PLAN_LLM_PROVIDER: 'openai'},
    probeImpl: async () => { throw new Error('should not probe'); },
  });
  assert.equal(JSON.parse(shown.chunks.at(-1)).enabled, true);
  assert.equal(JSON.parse(shown.chunks.at(-1)).model, 'gpt-4o-mini');

  const stream = capturedResponse();
  await planDraftRoute({
    req: {method: 'POST', headers: {accept: 'application/x-ndjson'}}, res: stream.res, url: new URL('http://localhost/api/plan/draft'), json,
    body: async () => ({words: longWords(), removes: []}), env: {}, probeImpl: ollamaUp,
    fetchImpl: async ({body}) => modelReply(JSON.parse(body.messages[1].content)),
  });
  const events = stream.chunks.join('').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events[0].type, 'progress');
  assert.equal(events[0].model, DEFAULT_LOCAL_MODEL);
  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).source, 'llm');
  assert.equal(events.at(-1).plan.sentences.some(sentence => sentence.labels?.some(label => label.text === '先看')), true);
});
