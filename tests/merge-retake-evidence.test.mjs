import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRetakeEvidence} from '../scripts/merge-retake-evidence.mjs';

const src='clips/synthetic.mp4',sha='a'.repeat(64);
const evidence=owner=>[{kind:'independent-local-asr',confirmed:true,owner},{kind:'acoustic-boundaries',safe:true,owner},{kind:'source-boundary-v2',safe:true,sourceSha256:sha,owner}];
const proposal=(extra={})=>({id:'a',originPass:'qwen-primary',src,clipId:'remove',kind:'retake',
 remove:{startSec:1,endSec:2,text:'共同起句'},retain:{clipId:'keeper-a',src,startSec:10,endSec:12,text:'完整表达'},
 status:'approved',confidence:'high',score:1,reason:'合成取舍',evidence:evidence('a'),...extra});
const automaticallySelected=result=>result.candidates.filter(c=>c.status==='approved'&&c.confidence==='high').map(c=>c.id).sort();

test('duplicate review proposals cannot combine complementary receipts into an automatic approval',()=>{
 const a=proposal({status:'review',confidence:'review',score:0,evidence:[{kind:'independent-local-asr',confirmed:true,owner:'a'}]}),
  b=proposal({id:'b',originPass:'whisper-recall',status:'review',confidence:'review',score:0,evidence:[{kind:'source-boundary-v2',safe:true,sourceSha256:sha,owner:'b'},{kind:'acoustic-boundaries',safe:true,owner:'b'}]}),before=structuredClone([a,b]);
 const result=mergeRetakeEvidence([a,b]);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.candidates.length,1);
 const kept=result.candidates[0];assert.equal(kept.status,'review');assert.equal(kept.evidence.some(e=>e.kind==='source-boundary-v2'),false);
 assert.ok(kept.evidence.some(e=>e.kind==='recall-corroboration'&&e.candidateId==='b'&&e.status==='review'));
 assert.deepEqual([a,b],before);
});

test('an already approved duplicate keeps its own receipts rather than borrowing the other recognizer verification',()=>{
 const a=proposal({status:'review',confidence:'review',score:0,evidence:[{kind:'independent-local-asr',confirmed:true,owner:'a'}]}),
  b=proposal({id:'b',originPass:'whisper-recall',remove:{startSec:1.02,endSec:2.02,text:'共同 起句'},retain:{clipId:'keeper-a',src,startSec:10.03,endSec:12.03,text:'完整表达'},evidence:evidence('b')});
 const result=mergeRetakeEvidence([a,b]);assert.deepEqual(automaticallySelected(result),['b']);assert.equal(result.candidates.length,1);
 assert.ok(result.candidates[0].evidence.filter(e=>e.kind!=='recall-corroboration').every(e=>e.owner==='b'));
 assert.deepEqual(result.candidates[0].originPasses,['whisper-recall','qwen-primary']);
});

test('two verified suggestions choosing different retained takes become review instead of arbitrary duplicate approval',()=>{
 const a=proposal(),b=proposal({id:'b',originPass:'whisper-recall',retain:{clipId:'keeper-b',src,startSec:20,endSec:22,text:'另一完整表达'},evidence:evidence('b')});
 const result=mergeRetakeEvidence([a,b]);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.candidates.length,2);
 assert.ok(result.candidates.every(c=>c.status==='review'&&c.confidence==='review'&&c.score===0));assert.deepEqual(result.conflicts,[['a','b']]);
});

test('a separately approved deletion covering a retained partition revokes its dependent automatic take',()=>{
 const a=proposal({retainParts:[{clipId:'keeper-a',src,startSec:10,endSec:11},{clipId:'keeper-b',src,startSec:11.5,endSec:12}]}),
  b=proposal({id:'b',originPass:'independent',clipId:'keeper-b',remove:{startSec:11.6,endSec:11.9,text:'另一废弃片段'},retain:{clipId:'keeper-c',src,startSec:20,endSec:22,text:'完整第三遍'},evidence:evidence('b')});
 const result=mergeRetakeEvidence([a,b]);assert.deepEqual(automaticallySelected(result),['b']);assert.equal(result.candidates.find(c=>c.id==='a').status,'review');
 assert.ok(result.conflicts.some(([id,reason])=>id==='a'&&reason==='retained-version-conflict'));
});

test('mutually deleting each other retained takes revokes both approvals independent of input order',()=>{
 const a=proposal(),b=proposal({id:'b',originPass:'independent',clipId:'keeper-a',remove:{startSec:10,endSec:12,text:'第二种废弃取舍'},retain:{clipId:'remove',src,startSec:1,endSec:2,text:'应保留第一遍'},evidence:evidence('b')});
 for(const candidates of [[a,b],[b,a]]){
  const result=mergeRetakeEvidence(candidates);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.candidates.length,2);
  assert.ok(result.candidates.every(c=>c.status==='review'));
 }
});

test('a conflicting review proposal is not hidden behind the other proposal approval',()=>{
 const a=proposal({remove:{startSec:1,endSec:2,text:'会修改原文件'}}),b=proposal({id:'b',status:'review',confidence:'review',score:0,remove:{startSec:1,endSec:2,text:'不会修改原文件'},retain:{clipId:'keeper-b',src,startSec:20,endSec:22,text:'另一版本'}});
 for(const input of [[a,b],[b,a]]){const result=mergeRetakeEvidence(input);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.candidates.length,2);assert.equal(result.duplicates.length,0);}
});

test('one bridging overlap cannot deduplicate away a conflicting second removal',()=>{
 const a=proposal({remove:{startSec:1,endSec:2,text:'共同起句'}}),b=proposal({id:'b',remove:{startSec:2.5,endSec:3.5,text:'另一项有效内容'}}),c=proposal({id:'c',remove:{startSec:1.5,endSec:3,text:'共同起句'}});
 for(const input of [[a,b,c],[c,b,a],[b,c,a]]){const result=mergeRetakeEvidence(input);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.candidates.length,3);}
});

for(const [left,right]of [['1.5小时','15小时'],['1,500元','1500元'],['-2度','2度'],['+2度','2度'],['20%','20'],['不会修改','会修改']])test(`meaningful difference ${left} / ${right} cannot be hidden by punctuation removal`,()=>{
 const a=proposal({remove:{startSec:1,endSec:2,text:left}}),b=proposal({id:'b',remove:{startSec:1,endSec:2,text:right}});
 const result=mergeRetakeEvidence([a,b]);assert.deepEqual(automaticallySelected(result),[]);assert.equal(result.conflicts.length,1);assert.equal(result.duplicates.length,0);
});

test('different retained numbers in overlapping takes remain review',()=>{
 const a=proposal({retain:{clipId:'keeper-a',src,startSec:10,endSec:12,text:'耗时1.5小时'}}),b=proposal({id:'b',retain:{clipId:'keeper-a',src,startSec:10,endSec:12,text:'耗时15小时'}});
 assert.deepEqual(automaticallySelected(mergeRetakeEvidence([a,b])),[]);
});
