import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareRetakeComparisons,normalizeRetakeComparison,comparisonTextsForCandidate} from '../scripts/retake-comparison.mjs';
import {mergeRetakeEvidence} from '../scripts/merge-retake-evidence.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const candidate=(id,text,retain)=>({id,src:'clips/synthetic.mp4',clipId:'remove',kind:'retake',remove:{startSec:1,endSec:2,text},retain:{clipId:'keep',src:'clips/synthetic.mp4',startSec:5,endSec:7,text:retain},status:'approved',confidence:'high',score:1,reason:'synthetic',evidence:[]});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'retake-comparison-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'scripts'));const script=path.join(root,'scripts/normalize-retake-comparison.py');fs.writeFileSync(script,'synthetic frozen converter identity');
 const normalization={version:'opencc-t2s-comparison-v1',packageVersion:'synthetic',scriptSha256:sha(fs.readFileSync(script)),configSha256:'a'.repeat(64),dictionaries:[{name:'synthetic',sha256:'b'.repeat(64)}],implementation:[{name:'synthetic',sha256:'c'.repeat(64)}],rawRecognitionChanged:false,expectedTextSupplied:false};
 const inputs=[];return {root,directory:path.join(root,'comparison'),normalization,inputs,run:async(command,args,options)=>{assert.equal(command,path.join(root,'.venv/bin/python'));assert.equal(args[0],'-c');assert.equal(args[2],script);assert.equal(options.timeoutMs,30000);const input=JSON.parse(fs.readFileSync(args[3]));inputs.push(input);
  const texts=input.texts.map(value=>value.replaceAll('這個','这个').replaceAll('電腦','电脑').replaceAll('說明','说明').replaceAll('會','会'));
  fs.writeFileSync(args[4],JSON.stringify({texts,normalization}));}};
}

test('batch OpenCC copies bind both original texts and retain all raw text, state and receipts',async t=>{
 const f=fixture(t),input=[candidate('a','這個電腦','完整說明'),candidate('b','这个电脑','完整说明')],before=structuredClone(input),prepared=await prepareRetakeComparisons(input,f);
 assert.deepEqual(f.inputs,[{texts:['這個電腦','完整說明','这个电脑','完整说明']}]);assert.deepEqual(input,before);assert.deepEqual(prepared.warnings,[]);
 assert.ok(prepared.candidates.every(value=>comparisonTextsForCandidate(value).valid));assert.equal(prepared.receipt.inputSha256,sha(fs.readFileSync(prepared.receipt.inputPath)));assert.equal(prepared.receipt.outputSha256,sha(fs.readFileSync(prepared.receipt.outputPath)));
 const merged=mergeRetakeEvidence(prepared.candidates);assert.equal(merged.candidates.length,1);assert.equal(merged.candidates[0].remove.text,'這個電腦');assert.equal(merged.candidates[0].retain.text,'完整說明');assert.equal(merged.candidates[0].status,'approved');
 const reviews=await prepareRetakeComparisons(input.map(value=>({...value,status:'review',confidence:'review',score:0})),{...f,directory:path.join(f.root,'reviews')});assert.equal(mergeRetakeEvidence(reviews.candidates).candidates[0].status,'review');
});

test('normalization preserves decimals, numeric punctuation, signs, percentages and negation',()=>{
 for(const [a,b]of [['1.5','15'],['1,500','1500'],['-2','2'],['+2','2'],['20%','20'],['不会修改','会修改'],["don't",'dont']])assert.notEqual(normalizeRetakeComparison(a),normalizeRetakeComparison(b));
 assert.equal(normalizeRetakeComparison('需要 １．５ 小时。'),normalizeRetakeComparison('需要1.5小时'));
});

for(const [label,tamper]of [
 ['raw text changed',value=>{value.remove.text='不会修改';}],
 ['original binding forged',value=>{value.comparisonCopies.originalSha256='0'.repeat(64);}],
 ['comparison copy modified',value=>{value.comparisonCopies.texts.remove='不同内容';}],
 ['candidate identity swapped',value=>{value.comparisonCopies.candidateId='other';}],
 ['converter receipt modified',value=>{value.comparisonCopies.normalization.rawRecognitionChanged=true;}],
])test(label+' cannot consume stale comparison evidence',async t=>{
 const f=fixture(t),prepared=await prepareRetakeComparisons([candidate('a','這個電腦','完整說明'),candidate('b','这个电脑','完整说明')],f);
 prepared.candidates=prepared.candidates.map(value=>structuredClone(value));tamper(prepared.candidates[0]);
 assert.equal(comparisonTextsForCandidate(prepared.candidates[0]).valid,false);const result=mergeRetakeEvidence(prepared.candidates);assert.equal(result.candidates.length,2);assert.ok(result.candidates.every(value=>value.status==='review'));assert.equal(result.warnings.length,1);
});

test('converter failure falls back to unmodified raw comparisons and never promotes review suggestions',async t=>{
 const f=fixture(t),input=[candidate('a','這個電腦','完整說明'),candidate('b','这个电脑','完整说明')].map(value=>({...value,status:'review',confidence:'review',score:0})),before=structuredClone(input);
 const result=await prepareRetakeComparisons(input,{...f,run:async()=>{throw Error('synthetic converter unavailable');}});assert.deepEqual(result.candidates,before);assert.match(result.warnings[0],/保留原文比较/);assert.ok(mergeRetakeEvidence(result.candidates).candidates.every(value=>value.status==='review'));assert.deepEqual(input,before);
});

test('cancellation propagates instead of being treated as a comparison fallback',async t=>{
 const f=fixture(t),controller=new AbortController();controller.abort(Error('synthetic cancellation'));
 await assert.rejects(prepareRetakeComparisons([candidate('a','原文','保留')],{...f,signal:controller.signal}),/synthetic cancellation/);
});
