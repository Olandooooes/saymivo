import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fixtureWords,evaluateFixture,runEvaluation} from '../scripts/eval-codex-retakes.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./codex-retake-eval-fixtures.json',import.meta.url)));
const idsFor=(words,clause)=>words.filter(word=>word.clauseIndex===clause).map(word=>word.id);
const decision=(words,remove=1,retain=2)=>{const first=idsFor(words,remove),last=idsFor(words,retain);return {first:first[0],last:first.at(-1),replacementFirst:last[0],replacementLast:last.at(-1),kind:'retake',reason:'synthetic decision'};};

test('semantic evaluator detects a missed restart, lost unique information, and an invalid replacement',()=>{
 const fixture=fixtures[0],words=fixtureWords(fixture),valid=decision(words);
 assert.equal(evaluateFixture(fixture,words,[valid]).passed,true);
 assert.equal(evaluateFixture(fixture,words,[]).passed,false);
 const overbroad={...valid,first:0};const lost=evaluateFixture(fixture,words,[overbroad]);assert.equal(lost.passed,false);assert.ok(lost.deletedProtectedIds.length);
 const wrong={...valid,replacementFirst:0,replacementLast:2};assert.equal(evaluateFixture(fixture,words,[wrong]).replacementErrors.length,1);
 const emphasize=fixtures[1],emphasisWords=fixtureWords(emphasize);assert.equal(evaluateFixture(emphasize,emphasisWords,[]).passed,true);assert.equal(evaluateFixture(emphasize,emphasisWords,[decision(emphasisWords)]).passed,false);
});

test('regression calls receive word evidence only and evaluation errors remain failures',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'retake-eval-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let calls=0;
 const report=await runEvaluation(fixtures.slice(0,2),{directory,decide:async(words,options)=>{
  calls++;assert.deepEqual(Object.keys(words[0]).sort(),['clipId','endMs','id','startMs','word']);assert.match(options.directory,/synthetic-00[12]$/);
  assert.ok(words.every((word,index)=>word.id===index&&word.endMs>word.startMs));
  if(calls===1)return [decision(fixtureWords(fixtures[0]))];throw Error('synthetic transport failure');
 }});
 assert.equal(calls,2);assert.equal(report.groundTruthSentToModel,false);assert.deepEqual(report.summary,{total:2,completed:2,passed:1,failed:1,errors:1});assert.equal(report.passed,false);
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'report.json')));assert.match(saved.cases[1].error,/transport failure/);
});
