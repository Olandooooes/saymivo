import test from 'node:test';import assert from 'node:assert/strict';
import {sceneTextLines,textUnits} from '../src/scene-text-lines.mjs';
test('Chinese display lines preserve original wording and keep lexical and timed emphasis phrases together',()=>{
 for(const text of ['他能不能把任务真正做完','结果有没有依据方便我检查','出错以后能不能停下来让我接著修改']){
  const lines=sceneTextLines(text,8,['停下来','出错','修改','检查']);
  assert.equal(lines.join(''),text);assert(lines.every(l=>textUnits(l)<=8));
  for(const phrase of ['真正','方便','停下来','检查','修改'])if(text.includes(phrase))assert(lines.some(l=>l.includes(phrase)));
  assert(!lines.slice(0,-1).some(l=>/(?:把|让|有没有|能不能)$/.test(l)));
 }
});
test('punctuation, explicit lines and long English identifiers keep their text without invented summaries',()=>{
 for(const text of ['先搜索资料，再整理结果。','AI Agent 怎么用？','HowToLiveBetter','保留\n原话']){
  const lines=sceneTextLines(text,8,['AI Agent','HowToLiveBetter']);
  assert.equal(lines.join(''),text.replaceAll('\n',''));
  assert(!lines.some(l=>/^[，。！？、；：]/.test(l)));
 }
 assert(sceneTextLines('HowToLiveBetter',8,['HowToLiveBetter']).includes('HowToLiveBetter'));
});
