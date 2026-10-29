import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {retainedWordStream,compileCodexCandidates,protectedDifference,analyzeCodexRetakes,readCodexEvidenceCache} from '../scripts/analyze-codex-retakes.mjs';
import {fixtureWords} from '../scripts/eval-codex-retakes.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const word=(word,startMs,endMs)=>({word,startMs,endMs});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retake-engine-')),PUBLIC=path.join(root,'public'),file=path.join(PUBLIC,'clips','synthetic.mp4');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic source identity; no real video or audio');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceSha256=sha(fs.readFileSync(file));
 const audioClock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
 const clips=[{id:'clip-a',src:'clips/synthetic.mp4',inSec:0,outSec:4,speed:1.25,sourceDurationSec:10},
  {id:'clip-b',src:'clips/synthetic.mp4',inSec:4,outSec:10,speed:1,sourceDurationSec:10}];
 const source={src:clips[0].src,sourceSha256,audioClock,wav:path.join(root,'unread-synthetic.wav'),range:[0,10],
  quiet:[[.75,1.1],[2.3,2.65],[4.5,4.8],[6.7,7.8]],
  words:[word('开场。',200,700),word('我们',1200,1500),word('先',1500,1700),word('检查',1700,1900),word('一个',1900,2200),
   word('我们',5000,5300),word('先',5300,5500),word('检查',5500,5700),word('一个',5700,6000),word('具体功能。',6000,6600),word('接着保存。',8200,8800)]};
 return {root,PUBLIC,file,clips,source,directory:path.join(root,'job')};
}
const decision=(extra={})=>({first:1,last:4,replacementFirst:5,replacementLast:9,kind:'false-start',reason:'前段在词组处中断，后段完整重说',...extra});
function injected(f,{asr=true,boundary=true,decisions=[decision()],onDecide=()=>{},source=f.source}={}){
 const calls=[];
 return {calls,options:{root:f.root,PUBLIC:f.PUBLIC,directory:f.directory,
  observe:async value=>{calls.push('observe');assert.equal(value.src,f.clips[0].src);return structuredClone(source);},
  decide:async(words,options)=>{calls.push('decide');assert.match(options.directory,/codex-0$/);await onDecide(words);return decisions;},
  checkBoundaries:async input=>{calls.push('boundaries');return {candidates:input.candidates.map(c=>({id:c.id,safe:boundary,evidence:{synthetic:true}}))};},
  confirm:async input=>{calls.push('confirm');return {candidates:input.candidates.map(c=>({id:c.id,confirmed:asr,model:'independent-synthetic-observation'}))};}}};
}
const request=f=>({clips:f.clips,mode:'codex',allowCloudText:true});

function splitTakes(f){
 f.source.words=[word('开场。',200,700),word('我们',1200,1500),word('先',1500,1700),word('检查',2700,2900),word('一个',2900,3200),
  word('我们',5000,5300),word('先',5300,5500),word('检查',6500,6700),word('一个',6700,7000),word('具体功能。',7000,7600),word('接着保存。',8200,8800)];
 f.source.quiet=[[.75,1.1],[1.72,2.68],[3.25,4.8],[5.52,6.48],[7.7,8]];
 const clip=(id,inSec,outSec)=>({id,src:f.source.src,inSec,outSec,speed:1,sourceDurationSec:10});
 f.clips=[clip('a-first-half',0,1.9),clip('a-second-half',2.5,4),clip('b-first-half',4.5,5.7),clip('b-second-half',6.3,10)];
 return f;
}

test('retained stream preserves clip order, exact instance IDs, original word time, and each speed',t=>{
 const f=fixture(t),before=structuredClone(f.source.words),stream=retainedWordStream(f.clips,[f.source]);
 assert.deepEqual(stream.map(w=>w.id),stream.map((_,i)=>i));assert.deepEqual(stream.map(w=>w.sourceIndex),stream.map((_,i)=>i));
 assert.deepEqual([...new Set(stream.map(w=>w.clipId))],['clip-a','clip-b']);
 assert.equal(stream[1].timelineMs,1200/1.25);assert.equal(stream[5].timelineMs,4000/1.25+1000);
 assert.deepEqual(stream.map(w=>[w.startMs,w.endMs]),before.map(w=>[w.startMs,w.endMs]));assert.deepEqual(f.source.words,before);
 const repeated=retainedWordStream([f.clips[0],{...f.clips[0],id:'another-instance'}],[f.source]);
 assert.equal(repeated[0].sourceIndex,repeated[5].sourceIndex);assert.notEqual(repeated[0].id,repeated[5].id);assert.equal(repeated[5].clipId,'another-instance');
 assert.throws(()=>retainedWordStream(f.clips,[]),/缺少原片识别/);
});

test('candidate compilation binds a removed first clip to the retained second clip without inventing decisions',t=>{
 const f=fixture(t),words=retainedWordStream(f.clips,[f.source]),before=structuredClone({words,clips:f.clips,source:f.source});
 const result=compileCodexCandidates([decision()],words,f.clips,[f.source]);assert.equal(result.blocked.length,0);assert.equal(result.candidates.length,1);
 const c=result.candidates[0];assert.equal(c.clipId,'clip-a');assert.equal(c.retain.clipId,'clip-b');assert.equal(c.retain.src,f.source.src);
 assert.equal(c.remove.text,'我们先检查一个');assert.equal(c.retain.text,'我们先检查一个具体功能。');assert.equal(c.status,'review');
 assert.equal(c.boundaryStatus,'word-clock-and-quiet-checked');assert.ok(c.remove.startSec<1.2&&c.remove.endSec>2.2);assert.equal(c.protectedChanged,false);
 assert.deepEqual({words,clips:f.clips,source:f.source},before);
 const filler=compileCodexCandidates([decision({kind:'filler',replacementFirst:-1,replacementLast:-1})],words,f.clips,[f.source]);assert.equal(filler.candidates.length,0);assert.equal(filler.blocked.length,1);
});

test('one take split by pause trimming compiles as one decision with every exact clip part',t=>{
 const f=splitTakes(fixture(t)),words=retainedWordStream(f.clips,[f.source]);
 const result=compileCodexCandidates([decision()],words,f.clips,[f.source]);
 assert.equal(result.blocked.length,0);assert.equal(result.candidates.length,1);
 const c=result.candidates[0];assert.equal(c.first,1);assert.equal(c.last,4);assert.equal(c.replacementFirst,5);assert.equal(c.replacementLast,9);
 assert.deepEqual(c.removeParts.map(p=>[p.clipId,p.first,p.last]),[['a-first-half',1,2],['a-second-half',3,4]]);
 assert.deepEqual(c.retainParts.map(p=>[p.clipId,p.first,p.last]),[['b-first-half',5,6],['b-second-half',7,9]]);
 assert.equal(c.removeParts[0].endSec,1.9);assert.equal(c.removeParts[1].startSec,2.5);
 assert.equal(c.removeParts.map(p=>p.text).join(''),c.remove.text);assert.equal(c.retainParts.map(p=>p.text).join(''),c.retain.text);
 assert.ok(c.removeParts.every(p=>p.boundaryStatus==='word-clock-and-quiet-checked'));
 assert.equal(c.boundaryStatus,'word-clock-and-quiet-checked');
 for(const part of [...c.removeParts,...c.retainParts])assert.ok(part.startSec>=part.clipInSec&&part.endSec<=part.clipOutSec);
});

test('earlier better take remains supported when both takes have multiple pause-trimmed parts',t=>{
 const f=splitTakes(fixture(t)),words=retainedWordStream(f.clips,[f.source]);
 const result=compileCodexCandidates([decision({first:5,last:9,replacementFirst:1,replacementLast:4})],words,f.clips,[f.source]);
 assert.equal(result.blocked.length,0);assert.equal(result.candidates.length,1);
 const c=result.candidates[0];assert.equal(c.removeParts.length,2);assert.equal(c.retainParts.length,2);
 assert.equal(c.retainParts[0].clipId,'a-first-half');assert.equal(c.removeParts[0].clipId,'b-first-half');
 assert.equal(c.boundaryStatus,'word-clock-and-quiet-checked');
});

test('source words omitted by a prior edit and source-time rewind cannot become a contiguous take',t=>{
 const f=splitTakes(fixture(t));f.source.words.splice(3,0,word('独有补充',2000,2200));
 let stream=retainedWordStream(f.clips,[f.source]);
 let result=compileCodexCandidates([decision()],stream,f.clips,[f.source]);
 assert.equal(result.candidates.length,0);assert.match(result.blocked[0].reason,/未纳入比较/);
 f.source.words.splice(3,1);f.clips=[f.clips[1],f.clips[0],...f.clips.slice(2)];stream=retainedWordStream(f.clips,[f.source]);
 result=compileCodexCandidates([decision({first:0,last:4,replacementFirst:5,replacementLast:9})],stream,f.clips,[f.source]);
 assert.equal(result.candidates.length,0);assert.match(result.blocked[0].reason,/回绕/);
});

test('each newly exposed part boundary needs quiet evidence even when overall outer boundaries are safe',t=>{
 const f=splitTakes(fixture(t));f.source.quiet=f.source.quiet.filter(([a])=>a!==1.72);
 const result=compileCodexCandidates([decision()],retainedWordStream(f.clips,[f.source]),f.clips,[f.source]);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].boundaryStatus,'needs-review');
 assert.ok(result.candidates[0].removeParts.some(p=>p.boundaryStatus==='needs-review'));
});

test('a word crossing an existing clip edge remains full-span context and blocks nearby automatic decisions',t=>{
 const f=fixture(t);f.clips[0].inSec=.4;
 const stream=retainedWordStream(f.clips,[f.source]),partial=stream[0];
 assert.equal(partial.word,'开场。');assert.equal(partial.startMs,200);assert.equal(partial.endMs,700);
 assert.equal(partial.trimmed,true);assert.equal(partial.contextOnly,true);assert.equal(partial.timelineMs,0);
 const result=compileCodexCandidates([decision()],stream,f.clips,[f.source]);
 assert.equal(result.candidates.length,0);assert.match(result.blocked[0].reason,/上下文不完整/);
});

test('partial or corrupt source evidence caches are misses and every audio clock identity must agree',async t=>{
 const f=fixture(t),cache=path.join(f.root,'cache');fs.mkdirSync(cache);
 const clockSpec={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sampleRate:16000,channels:1,sampleWidthBytes:2};
 const identity={source:'synthetic',engineVersion:'synthetic'},range=[0,1],wav=Buffer.from('synthetic PCM identity, not played or decoded');
 const clock={...clockSpec,sourceSha256:f.source.sourceSha256,wavSha256:sha(wav),wavBytes:wav.length,sampleCount:16000,durationSec:1};
 const obs={clock,words:[word('合成',100,300)],quiet:[],range};
 const publish=()=>{
  fs.writeFileSync(path.join(cache,'source.wav'),wav);fs.writeFileSync(path.join(cache,'source.wav.clock.json'),JSON.stringify(clock));fs.writeFileSync(path.join(cache,'observations.json'),JSON.stringify(obs));
  fs.writeFileSync(path.join(cache,'receipt.json'),JSON.stringify({identity:JSON.stringify(identity),payloadSha256:sha(fs.readFileSync(path.join(cache,'observations.json'))),wavClockSha256:sha(fs.readFileSync(path.join(cache,'source.wav.clock.json')))}));
 };
 const read=()=>readCodexEvidenceCache({cache,identity,sourceSha256:f.source.sourceSha256,range,clockSpec});
 publish();assert.deepEqual(await read(),obs);
 for(const file of ['receipt.json','observations.json','source.wav.clock.json']){
  publish();fs.writeFileSync(path.join(cache,file),'{incomplete');assert.equal(await read(),null);
 }
 publish();fs.appendFileSync(path.join(cache,'source.wav'),'changed bytes');assert.equal(await read(),null);
 publish();fs.rmSync(path.join(cache,'source.wav.clock.json'));assert.equal(await read(),null);
 publish();const wrong={...obs,clock:{...clock,sourceSha256:'c'.repeat(64)}};fs.writeFileSync(path.join(cache,'observations.json'),JSON.stringify(wrong));
 const receipt=JSON.parse(fs.readFileSync(path.join(cache,'receipt.json')));receipt.payloadSha256=sha(fs.readFileSync(path.join(cache,'observations.json')));fs.writeFileSync(path.join(cache,'receipt.json'),JSON.stringify(receipt));
 assert.equal(await read(),null);
 publish();assert.equal(await readCodexEvidenceCache({cache,identity:{...identity,engineVersion:'changed'},sourceSha256:f.source.sourceSha256,range,clockSpec}),null);
});

test('actual rejected semantic prefix proposal cannot auto-delete a shared beginning before a different continuation',async t=>{
 const f=fixture(t),cases=JSON.parse(fs.readFileSync(new URL('./codex-retake-eval-fixtures.json',import.meta.url))),example=cases.find(value=>value.id==='synthetic-005');
 const observed=fixtureWords(example),duration=observed.at(-1).endMs/1000+1;
 // Only measured clause gaps are quiet. The 30ms word gaps within a sentence
 // must not be promoted to safe silence because the model asks to cut there.
 f.source.quiet=observed.flatMap((w,i)=>i&&w.clauseIndex!==observed[i-1].clauseIndex?[[observed[i-1].endMs/1000,w.startMs/1000]]:[]);
 f.source.words=observed.map(({clauseIndex,clipId,...w})=>w);f.source.range=[0,duration];
 f.clips=[{id:'clip-a',src:f.source.src,inSec:0,outSec:duration,speed:1,sourceDurationSec:duration}];
 // Recorded raw proposal from the unchanged final synthetic-005 run. Keep
 // the semantic evaluator's original failure; this tests the production gate.
 const proposal={first:11,last:13,replacementFirst:4,replacementLast:6,kind:'retake',reason:'重复前文“先检查输入”，保留异常样本记录和测试输出两项独有信息。'};
 assert.equal(f.source.words.slice(proposal.first,proposal.last+1).map(w=>w.word).join(''),'先检查输入，');
 assert.equal(f.source.words[proposal.last+1].startMs-f.source.words[proposal.last].endMs,30);
 const pipeline=injected(f,{decisions:[proposal],asr:true,boundary:true,onDecide:words=>{
  assert.ok(words.every(w=>!Object.hasOwn(w,'clauseIndex')&&!Object.hasOwn(w,'expectation')));
 }});
 const result=await analyzeCodexRetakes(request(f),pipeline.options);
 assert.equal(result.counts.candidates,1);assert.equal(result.counts.approved,0);assert.equal(result.counts.review,1);
 const candidate=result.candidates[0];assert.equal(candidate.status,'review');assert.equal(candidate.boundaryStatus,'needs-review');
 assert.ok(candidate.removeParts.every(part=>part.boundaryStatus==='needs-review'));
 assert.ok(candidate.evidence.some(e=>e.kind==='acoustic-boundaries'&&e.safe===false));
 assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});

test('Chinese number changes are protected independently of model confidence',()=>{
 assert.equal(protectedDifference('需要三次检查','需要五次检查'),true);
 assert.equal(protectedDifference('这个步骤需要一百元','这个步骤需要一千元'),true);
});
test('decimal changes cannot disappear when punctuation is normalized',()=>{
 assert.equal(protectedDifference('需要1.5小时','需要15小时'),true);
 assert.equal(protectedDifference('需要1.50小时','需要1.50小时完成'),false);
});
test('negation and English name differences remain protected; ordinary completion is allowed',()=>{
 assert.equal(protectedDifference('不会修改原文件','会修改原文件'),true);
 assert.equal(protectedDifference('会修改原文件','不会修改原文件'),true);
 assert.equal(protectedDifference('使用Qwen识别','使用Gemini识别'),true);
 assert.equal(protectedDifference('我们先检查一个','我们先检查一个完整功能'),false);
 assert.equal(protectedDifference('先检查一个','先检查一个没有变化的功能'),false);
});

test('unknown clip identity and missing source evidence are blocked rather than compiled as safe cuts',t=>{
 const f=fixture(t),words=retainedWordStream(f.clips,[f.source]);
 const unknown=words.map(w=>w.id>=1&&w.id<=4?{...w,clipId:'unknown-instance'}:w);
 const first=compileCodexCandidates([decision()],unknown,f.clips,[f.source]);assert.equal(first.candidates.length,0);assert.equal(first.blocked.length,1);
 const noSource=compileCodexCandidates([decision()],words,f.clips,[]);assert.equal(noSource.candidates.length,0);assert.equal(noSource.blocked.length,1);
});

test('replacement conflicts across proposals never become independent automatic approvals',t=>{
 const f=fixture(t);f.clips[1].sourceDurationSec=15;f.clips[0].sourceDurationSec=15;
 f.clips.push({id:'clip-c',src:f.source.src,inSec:10,outSec:15,speed:1,sourceDurationSec:15});
 f.source.words.push(word('我们先检查一个具体功能。',11000,12000));f.source.quiet.push([10.4,10.9],[12.1,12.5]);
 const words=retainedWordStream(f.clips,[f.source]);
 const result=compileCodexCandidates([decision(),decision({first:5,last:9,replacementFirst:11,replacementLast:11,kind:'retake'})],words,f.clips,[f.source]);
 assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].conflict,true);assert.equal(result.candidates[0].status,'review');
});

test('complete injected analysis preserves snapshot and approves only independently confirmed cross-clip retakes',async t=>{
 const f=fixture(t),before=structuredClone(f.clips),pipeline=injected(f);
 fs.mkdirSync(path.join(f.PUBLIC,'clips','reviews'));fs.writeFileSync(path.join(f.PUBLIC,'clips','reviews','synthetic.source-edit-decisions.json'),'invalid private editing decisions must not be read');
 const result=await analyzeCodexRetakes(request(f),pipeline.options);
 assert.deepEqual(pipeline.calls,['observe','decide','boundaries','confirm']);assert.deepEqual(result.snapshot.clips,before);assert.deepEqual(f.clips,before);
 assert.equal(result.counts.approved,1);assert.equal(result.candidates[0].clipId,'clip-a');assert.equal(result.candidates[0].retain.clipId,'clip-b');
 assert.equal(result.candidates[0].status,'approved');assert.equal(result.audioUploaded,false);assert.equal(result.cloudTextSent,true);
 assert.equal(result.sources[0].sourceSha256,sha(fs.readFileSync(f.file)));assert.deepEqual(result.sources[0].audioClock,f.source.audioClock);
 assert.ok(result.candidates[0].evidence.some(e=>e.kind==='independent-local-asr'&&e.confirmed===true));
 assert.ok(result.candidates[0].evidence.some(e=>e.kind==='source-boundary-v2'&&e.safe===true));assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});

for(const [label,settings]of [['ASR rejects the transcript',{asr:false}],['boundary observation rejects a seam',{boundary:false}],['ASR confirmation is not boolean true',{asr:'confirmed'}],['boundary approval is not boolean true',{boundary:'safe'}],['no measured quiet anchors',{sourceTransform:s=>({...s,quiet:[]})}],['negation differs',{sourceTransform:s=>({...s,words:s.words.map((w,i)=>i===1?{...w,word:'我们不会'}:i===5?{...w,word:'我们会'}:w)})}],['negation is added to the replacement',{sourceTransform:s=>({...s,words:s.words.map((w,i)=>i===4||i===8?{...w,word:'输入'}:i===5?{...w,word:'我们不会'}:w)})}],['Chinese numbers differ',{sourceTransform:s=>({...s,words:s.words.map((w,i)=>i===4?{...w,word:'三个'}:i===8?{...w,word:'五个'}:w)})}]]){
 test(`analysis never approves when ${label}`,async t=>{
  const f=fixture(t),pipeline=injected(f,{...settings,...(settings.sourceTransform?{source:settings.sourceTransform(f.source)}:{})});
  const result=await analyzeCodexRetakes(request(f),pipeline.options);assert.equal(result.counts.approved,0);assert.equal(result.candidates[0].status,'review');assert.equal(result.candidates[0].confidence,'review');
 });
}

test('analysis rejects replacement-deletion conflicts and invalid model IDs before boundary approval',async t=>{
 const f=fixture(t);
 for(const decisions of [[decision(),decision({first:5,last:9,replacementFirst:0,replacementLast:0})],[decision({last:999})]]){
  const pipeline=injected(f,{decisions});await assert.rejects(analyzeCodexRetakes(request(f),pipeline.options),/保留的表达|不存在的词/);
  assert.deepEqual(pipeline.calls,['observe','decide']);
 }
});

test('source bytes changing during semantic analysis invalidate the entire result',async t=>{
 const f=fixture(t),pipeline=injected(f,{onDecide:()=>fs.writeFileSync(f.file,'changed source identity')});
 await assert.rejects(analyzeCodexRetakes(request(f),pipeline.options),/原片变化.*作废/);
 assert.equal(fs.existsSync(path.join(f.directory,'result.json')),false);assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});

test('an existing seam crossing another free ASR word stays review without running otherwise-passing expensive gates',async t=>{
 const f=fixture(t);f.source.provider='qwen';const independent=structuredClone(f.source);independent.provider='whisper-medium';independent.words[0].endMs=1150;
 const pipeline=injected(f),result=await analyzeCodexRetakes(request(f),{...pipeline.options,independentObserve:async()=>[independent],residualRounds:0,
  recallPlanner:async options=>({passes:[{id:'independent',sources:options.independentSources,words:retainedWordStream(options.clips,options.independentSources),
   decisions:options.independentSources[0].provider==='qwen'?[decision()]:[],blocked:[]}]}),
 });
 assert.equal(result.counts.candidates,1);assert.equal(result.counts.approved,0);assert.equal(result.counts.review,1);
 const c=result.candidates[0],proof=c.evidence.find(e=>e.kind==='quiet-margin');
 assert.equal(c.status,'review');assert.equal(c.boundaryStatus,'needs-review');assert.equal(proof.requiresReview,true);
 assert.ok(proof.reviewReasons.includes('existing-cut-overlaps-retained-word-observation'));
 // The conflict is not hidden by moving the cut. The original planned seam
 // still intersects the alternate word clock and is visibly unapproved.
 assert.ok(c.remove.startSec*1000<independent.words[0].endMs);
 assert.equal(pipeline.calls.includes('boundaries'),false);assert.equal(pipeline.calls.includes('confirm'),false);
 assert.ok(c.evidence.some(e=>e.kind==='source-boundary-v2'&&e.safe===false));
 assert.ok(c.evidence.some(e=>e.kind==='independent-local-asr'&&e.confirmed===false));
});

test('whole-workbench pipeline verifies each recognizer in its own index space and rescans the actual remaining clips',async t=>{
 const f=fixture(t),order=[],seenProviders=[],independent={...structuredClone(f.source),provider:'whisper-medium'};
 // A second recognizer splits a retained opening differently. Its indices
 // must never be copied into the primary source array.
 independent.words.splice(0,1,word('开',200,400),word('场。',400,700));
 let plans=0,comparisons=0,protectedComparisons=0;
 const options={root:f.root,PUBLIC:f.PUBLIC,directory:f.directory,
  observe:async()=>({...structuredClone(f.source),provider:'qwen'}),
  independentObserve:async()=>{order.push('independent-observe');return [independent];},
  refineClocks:async({sources})=>{order.push('refine');assert.equal(sources[0].provider,'whisper-medium');return sources;},
  recallPlanner:async({clips,independentSources,makeWordStream})=>{
   const stream=makeWordStream(clips,independentSources);plans++;
   if(plans===3){assert.ok(clips.some(c=>c.id!=='clip-a'&&c.id!=='clip-b'));assert.equal(stream.filter(w=>w.clipId==='clip-a').some(w=>w.word==='我们'),false);}
   return {passes:[{id:plans===1?'primary':'core-overlap',sources:independentSources,words:stream,decisions:plans===1?[decision()]:plans===2?[decision({first:2,last:5,replacementFirst:6,replacementLast:10})]:[],blocked:[]}]};
  },
  checkBoundaries:async input=>{order.push('boundaries');return {candidates:input.candidates.map(c=>({id:c.id,safe:true,evidence:{synthetic:true}}))};},
  confirm:async input=>{seenProviders.push(input.confirmationProvider);return {candidates:input.candidates.map(c=>({id:c.id,confirmed:true}))};}
  ,prepareComparison:async(candidates,{directory})=>{if(directory.endsWith('protected-comparison'))protectedComparisons++;else{comparisons++;assert.match(directory,/comparison-merge-[01]$/);}return {candidates:structuredClone(candidates),warnings:[]};}
 };
 const result=await analyzeCodexRetakes(request(f),options);
 assert.equal(order[0],'independent-observe','all clocks are available before any acoustic margin is considered');assert.equal(order[1],'refine','new timing evidence is checked before cut verification');
 assert.deepEqual(seenProviders,['whisper-medium','qwen']);assert.equal(plans,3);assert.equal(result.residual.performed,true);
 assert.equal(comparisons,2,'both the initial and residual merge use comparison-copy preparation');
 assert.equal(protectedComparisons,2,'each nonempty recognizer pass prepares protected comparisons before verification');
 assert.equal(result.counts.approved,1);assert.equal(result.merge.duplicates.length,1);
 assert.deepEqual(f.clips,request(f).clips);assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
 const evidence=JSON.parse(fs.readFileSync(path.join(f.directory,'evidence-sources.json')));assert.equal(evidence.sources.length,2);
 assert.equal(evidence.sources[0].words.length+1,evidence.sources[1].words.length);
});

test('comparison preparation cannot upgrade state or change candidate raw text and failure stays visible',async t=>{
 const f=fixture(t),pipeline=injected(f,{asr:false});
 const result=await analyzeCodexRetakes(request(f),{...pipeline.options,prepareComparison:async candidates=>({candidates:candidates.map(c=>({...c,status:'approved',confidence:'high'})),warnings:[]})});
 assert.equal(result.counts.approved,0);assert.equal(result.candidates[0].status,'review');assert.ok(result.warnings.some(value=>value.includes('改动了候选原文、状态或证据')));
});

test('whole-workbench pipeline compiles fillers without inventing a replacement and still requires independent confirmation',async t=>{
 const f=fixture(t);f.clips=[{...f.clips[0],speed:1,outSec:2}];
 f.source.words=[word('我们',100,300),word('呃',500,700),word('继续',1000,1200)];f.source.quiet=[[.32,.48],[.72,.98]];f.source.range=[0,2];
 const options={root:f.root,PUBLIC:f.PUBLIC,directory:f.directory,observe:async()=>structuredClone(f.source),
  decide:async()=>[{first:1,last:1,replacementFirst:-1,replacementLast:-1,kind:'filler',reason:'无意义的犹豫音'}],
  checkBoundaries:async input=>({candidates:input.candidates.map(c=>({id:c.id,safe:true}))}),
  confirm:async()=>{throw Error('filler must use the free two-provider filler verifier');},
  confirmFiller:async input=>({candidates:input.candidates.map(c=>({id:c.id,confirmed:true}))})};
 const result=await analyzeCodexRetakes(request(f),options);assert.equal(result.counts.fillersApproved,1);assert.equal(result.candidates[0].retain,null);
 options.directory=path.join(f.root,'rejected');options.confirmFiller=async input=>({candidates:input.candidates.map(c=>({id:c.id,confirmed:false}))});
 const rejected=await analyzeCodexRetakes(request(f),options);assert.equal(rejected.counts.approved,0);assert.equal(rejected.counts.review,1);
});


test('failed independent clock refinement aborts before any deletion verification or result is published',async t=>{
 const f=fixture(t),pipeline=injected(f);pipeline.options.decide=async()=>[];
 await assert.rejects(analyzeCodexRetakes(request(f),{...pipeline.options,independentObserve:async()=>[structuredClone(f.source)],
  refineClocks:async()=>{throw Error('synthetic corrupt clock receipt');},
  recallPlanner:async options=>({passes:[{id:'primary',sources:options.independentSources,words:retainedWordStream(options.clips,options.independentSources),decisions:[],blocked:[]}]})
 }),/corrupt clock receipt/);
 assert.equal(pipeline.calls.includes('boundaries'),false);assert.equal(pipeline.calls.includes('confirm'),false);
 assert.equal(fs.existsSync(path.join(f.directory,'full-analysis.json')),false);assert.equal(fs.existsSync(path.join(f.PUBLIC,'projects')),false);
});
