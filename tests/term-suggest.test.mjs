import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestionsFromModel, suggestTermMistakes} from '../src/term-suggest.mjs';

test('model suggestions stay proposed and ignore text that is not in the transcript', () => {
  const suggestions = suggestionsFromModel({
    choices: [{message: {content: '```json\n{"edits":[{"before":"AIA","after":"AI Agent","status":"accepted","reason":"术语"},{"before":"","after":"x"},{"before":"同","after":"同"},{"before":"不在稿子里","after":"别的"}]}\n```'}}],
  }, 'AIA 技能');
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].before, 'AIA');
  assert.equal(suggestions[0].after, 'AI Agent');
  assert.equal(suggestions[0].status, 'proposed');
  assert.equal(suggestions[0].source, 'llm');
});

test('a missing local model returns no suggestions instead of failing', async () => {
  const down = await suggestTermMistakes({
    text: 'AIA 技能',
    env: {PLAN_LLM_PROVIDER: 'ollama'},
    fetchImpl: async () => { throw new Error('down'); },
  });
  assert.deepEqual(down.suggestions, []);
  assert.match(down.warning, /Ollama|模型/);
});

test('an available model can suggest a term without applying it', async () => {
  const result = await suggestTermMistakes({
    text: 'AIA 技能',
    env: {PLAN_LLM_PROVIDER: 'ollama', PLAN_LLM_MODEL: 'qwen2.5:7b'},
    fetchImpl: async url => {
      if (String(url).endsWith('/models')) return {ok: true, json: async () => ({models: [{name: 'qwen2.5:7b'}]})};
      return {ok: true, json: async () => ({choices: [{message: {content: JSON.stringify({edits: [{before: 'AIA', after: 'AI Agent', status: 'accepted', reason: '术语'}]})}}]})};
    },
  });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].status, 'proposed');
  assert.equal(result.suggestions[0].after, 'AI Agent');
  assert.equal(result.warning, undefined);
});
