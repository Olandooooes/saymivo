import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverRetakes,decideRetakes,applySemanticChoices,finalizeRetakes,sequenceAlignment,retakeUnits} from '../server/retake-analyzer.mjs';

const clip={id:'source',src:'clips/synthetic.mp4',inSec:0,outSec:30,speed:1,sourceDurationSec:30};
function words(text,start,end){
  const chars=[...text.replace(/[。！？]/g,'')],step=(end-start)/chars.length;
  return chars.map((word,i)=>({word:word+(i===chars.length-1&&/[。！？]$/.test(text)?'。':''),startMs:Math.round((start+i*step)*1000),endMs:Math.round((start+(i+1)*step)*1000)}));
}
const input=(early='我们先研究一个',late='我们先研究一个具体功能。',bridge=[])=>[
  ...words(early,1,2),...bridge,...words(late,6,8)];
function evidence(candidate,changes={}){
  return {clip,confirmations:{[candidate.id]:{earlier:words(candidate.earlier.text,candidate.earlier.startSec,candidate.earlier.endSec),
    later:words(candidate.retain.text,candidate.retain.startSec,candidate.retain.endSec),model:'independent synthetic recognizer'}},
    boundaries:{[candidate.id]:{safe:true,startSec:candidate.earlier.startSec-.1,endSec:candidate.retain.startSec-.1}},...changes};
}
const first=(all)=>discoverRetakes(all,clip).find(c=>c.earlier.startSec===1&&c.retain.startSec===6);

test('sequence comparison retains source word clocks instead of inventing character times',()=>{
  const units=retakeUnits([{word:'具体功能。',startMs:1000,endMs:2400}]);
  assert.equal(units.length,4);assert.ok(units.every(w=>w.startSec===1&&w.endSec===2.4));
  assert.equal(units.at(-1).terminal,true);assert.equal(sequenceAlignment('功能三','功能四').distance,1);
});
test('unfinished prefix is approved only with independent recognition and safe cuts',()=>{
  const c=first(input());assert.ok(c);assert.equal(c.prefix,true);
  const [approved]=decideRetakes([c],evidence(c));assert.equal(approved.status,'approved');
  assert.equal(approved.remove.startSec,.9);assert.equal(approved.remove.endSec,5.9);
  assert.equal(c.status,'review','input discovery is immutable');
  assert.equal(decideRetakes([c],{clip})[0].status,'review');
  assert.equal(decideRetakes([c],evidence(c,{boundaries:{[c.id]:{safe:false}}}))[0].status,'review');
});
test('bridge speech cannot be swallowed by a matching prefix, including cloud choices',()=>{
  const c=first(input(undefined,undefined,words('这个版本已经修复了崩溃。',3,4)));
  assert.ok(c.interveningSpeech);assert.match(c.interveningSpeech.text,/崩溃/);
  const [review]=decideRetakes([c],evidence(c));assert.equal(review.status,'review');
  assert.match(review.reason,/独立转写语音/);
  assert.equal(applySemanticChoices([review],[{candidateId:c.id,action:'discard-earlier',confidence:'high'}])[0].status,'review');
});
test('acoustic untranscribed bridge speech blocks approval',()=>{
  const c=first(input()),ev=evidence(c);ev.boundaries[c.id]={safe:false,uncoveredSpeechSec:.7,startSec:.9,endSec:5.9};
  assert.equal(decideRetakes([c],ev)[0].status,'review');
});
test('full repeated sentences are not automatically treated as mistakes or emphasis',()=>{
  const c=first(input('我们先研究一个具体功能。','我们先研究一个具体功能。'));
  assert.ok(c.exact);assert.equal(decideRetakes([c],evidence(c))[0].status,'review');
});
test('number, negation and English name changes remain review even if a model chooses one',()=>{
  for(const [early,late] of [['这个版本需要三次','这个版本需要四次确认。'],
    ['这个功能不能直接使用','这个功能可以直接使用。'],['我们使用NOVA处理数据','我们使用VEGA处理数据。']]){
    const c=first(input(early,late));assert.ok(c,early);assert.equal(c.changedProtected,true,early);
    const [review]=decideRetakes([c],evidence(c));assert.equal(review.status,'review');
    assert.equal(applySemanticChoices([review],[{candidateId:c.id,action:'discard-earlier',confidence:'high'}])[0].status,'review');
  }
});
test('wrong narrow recognition and out-of-range cuts remain review',()=>{
  const c=first(input()),ev=evidence(c);ev.confirmations[c.id].earlier=words('完全不同',1,2);
  assert.equal(decideRetakes([c],ev)[0].status,'review');
  const invalid=decideRetakes([c],evidence(c,{boundaries:{[c.id]:{safe:true,startSec:-.1,endSec:5.9}}}))[0];
  assert.equal(invalid.status,'review');
  assert.equal(applySemanticChoices([invalid],[{candidateId:c.id,action:'discard-earlier',confidence:'high'}])[0].status,'review');
});
test('a shared character suffix inside a multi-character word has no invented cut boundary',()=>{
  const w=[{word:'独特我们先研究一个',startMs:1000,endMs:2000},...words('我们先研究一个具体功能。',6,8)];
  assert.equal(discoverRetakes(w,clip).length,0);
});
test('near restart remains visible despite a much longer new take',()=>{
  const c=first(input('这台机器里面通常会放着','这台机器里面通常会放入很多零件这些零件还需要逐项检查。'));
  assert.ok(c);assert.equal(c.prefix,false);assert.equal(decideRetakes([c],evidence(c))[0].status,'review');
});
test('A→B→C approved take chain consistently retains final independently verified C',()=>{
  const base=first(input()),ready=decideRetakes([base],evidence(base))[0];
  const a={...ready,id:'a',earlier:{text:'我们先研究一个'},remove:{startSec:.9,endSec:5.9,text:'A'},retain:{startSec:6,endSec:8,text:'我们先研究一个具体功能'}};
  const b={...ready,id:'b',earlier:{text:'我们先研究一个具体功能'},remove:{startSec:5.9,endSec:10.9,text:'B'},retain:{startSec:11,endSec:14,text:'我们先研究一个具体功能的实现'}};
  const out=finalizeRetakes([a,b]);assert.ok(out.every(c=>c.status==='approved'));
  assert.ok(out.every(c=>c.retain.startSec===11));
  assert.equal(finalizeRetakes([a,{...b,status:'review'}])[0].retain.startSec,6,'review chain cannot redirect approved evidence');
});
test('conflicting approved cuts are deferred and semantic IDs cannot inject timestamps',()=>{
  const c=first(input()),ready=decideRetakes([c],evidence(c))[0];
  const out=finalizeRetakes([ready,{...ready,id:'duplicate'}]);assert.equal(out.filter(c=>c.status==='approved').length,1);
  const result=applySemanticChoices([ready],[{candidateId:'invented',action:'discard-earlier',confidence:'high',startSec:0,endSec:30}]);
  assert.deepEqual(result,[ready]);
});
