import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {observeIndependentSources,planRecallCandidates,recallWordStream,independentPasses,missingSpeechRanges,activeIndependentWriters,waitForIndependentWriter,markUnresolvedContext,enrichIndependentSource} from '../scripts/codex-retake-recall.mjs';

const word=(word,startMs,endMs)=>({word,startMs,endMs});
const clip={id:'clip',src:'clips/synthetic.mp4',inSec:0,outSec:20,sourceDurationSec:20,speed:1.25};
const source=words=>({src:clip.src,sourceSha256:'a'.repeat(64),clock:{sourceSha256:'a'.repeat(64)},range:[0,20],quiet:[],words,provider:'whisper-medium'});
const cut=extra=>({first:0,last:1,replacementFirst:2,replacementLast:4,kind:'false-start',reason:'合成独立观察发现前次中断',...extra});
const fixture=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-recall-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};

test('independent recall discovers a missing restart and a missing filler without manufacturing replacement words',async t=>{
 const directory=fixture(t),words=[word('先检查',1000,1300),word('一个',1300,1600),word('先检查',5000,5300),word('一个',5300,5500),word('具体功能。',5500,6000)];
 const result=await planRecallCandidates({clips:[clip],primarySources:[source(words.slice(2))],independentSources:[source(words)],directory,decide:async()=>[cut()]});
 assert.equal(result.passes[0].decisions.length,1);assert.equal(result.passes[0].classifications[0].discovery,'primary-transcript-missing-or-different');assert.equal(result.automaticApplyEnabled,false);
 const filler=source([word('嗯',1200,1400),word('完整解释。',2000,3000)]);
 const found=await planRecallCandidates({clips:[clip],primarySources:[source([filler.words[1]])],independentSources:[filler],directory:path.join(directory,'filler'),decide:async()=>[cut({first:0,last:0,replacementFirst:-1,replacementLast:-1,kind:'filler'})]});
 assert.equal(found.passes[0].decisions[0].replacementFirst,-1);assert.equal(found.passes[0].classifications[0].discovery,'primary-transcript-missing-or-different');assert.equal(found.automaticApplyEnabled,false);
});

test('word indices remain separate for different independent observation passes and clip instances',()=>{
 const evidence={...source([]),observationPasses:[{id:'core-overlap',provider:'whisper-medium',words:[word('前句',1000,1500)]},{id:'vad-isolated',provider:'whisper-medium',words:[word('嗯',500,700),word('前句',1000,1500)]}]};
 const passes=independentPasses([evidence]);assert.equal(passes.length,2);assert.equal(passes[0].sources[0].words[0].id,0);assert.equal(passes[1].sources[0].words[1].id,1);
 const stream=recallWordStream([clip,{...clip,id:'second',speed:1}],passes[1].sources);assert.equal(stream[2].clipId,'second');assert.equal(stream[2].sourceIndex,0);assert.equal(stream[2].timelineMs,16000+500);
});

test('uncertain independent clock regions and partly trimmed words remain blocked',async t=>{
 const directory=fixture(t),evidence=source([word('嗯',1200,1400),word('正文',2000,2500)]);evidence.unresolved=[{startMs:1250,endMs:1350,reason:'overlapping-observations'}];
 const decide=async()=>[cut({first:0,last:0,replacementFirst:-1,replacementLast:-1,kind:'filler'})];
 const result=await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide});assert.equal(result.passes[0].decisions.length,0);assert.ok(result.passes[0].blocked.length);assert.equal(result.passes[0].words[0].contextOnly,true);
 const trimmed=await planRecallCandidates({clips:[{...clip,inSec:1.3}],independentSources:[{...evidence,unresolved:[]}],directory:path.join(directory,'trimmed'),decide});assert.equal(trimmed.passes[0].blocked[0].reason,'trimmed-or-missing-independent-word');
});

test('conflicting proposals from overlapping semantic windows are both deferred',async t=>{
 const directory=fixture(t),words=Array.from({length:100},(_,i)=>word('合成词',i*100,i*100+80));
 const result=await planRecallCandidates({clips:[clip],independentSources:[source(words)],directory,coreWords:40,overlapWords:10,decide:async window=>{
  if(window[0].startMs===0)return [cut({first:37,last:42,replacementFirst:45,replacementLast:48})];
  if(window[0].startMs===3000)return [cut({first:10,last:14,replacementFirst:30,replacementLast:33})];return [];
 }});
 assert.equal(result.passes[0].decisions.length,0);assert.equal(result.passes[0].blocked.length,2);assert.ok(result.passes[0].blocked.every(item=>item.reason==='cross-window-decision-conflict'));
});

test('a deletion crossing an unresolved speech gap cannot silently drop unobserved words',async t=>{
 const directory=fixture(t),evidence=source([word('先检查',1000,1300),word('一个',2000,2400),word('先检查',5000,5300),word('一个',5300,5500),word('功能',5500,6000)]);
 evidence.unresolved=[{startMs:1450,endMs:1800,reason:'conflicting-overlapping-observations'}];
 const result=await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide:async()=>[cut()]});assert.equal(result.passes[0].decisions.length,0);assert.ok(result.passes[0].blocked.length);
 const unknown=await planRecallCandidates({clips:[clip],independentSources:[{...evidence,unresolved:[{reason:'invalid-model-clock',word:{word:'额'}}]}],directory:path.join(directory,'unknown'),decide:async()=>[cut()]});assert.ok(unknown.passes[0].words.every(word=>word.contextOnly));assert.equal(unknown.passes[0].decisions.length,0);
});

test('unresolved gaps mark actual neighboring words before Codex sees the word stream',async t=>{
 const directory=fixture(t),evidence=source([word('前句',1000,1400),word('后句',3000,3400),word('再继续',5000,5500)]);
 evidence.unresolved=[{reason:'untranscribed-nonquiet-speech',startMs:2000,endMs:2200}];
 const original=recallWordStream([clip],[evidence]),marked=markUnresolvedContext(original,[clip],[evidence]);
 assert.equal(marked[0].contextOnly,true);assert.equal(marked[1].contextOnly,true);assert.equal(marked[2].contextOnly,undefined);
 assert.deepEqual(marked.map(w=>[w.startMs,w.endMs,w.word]),original.map(w=>[w.startMs,w.endMs,w.word]));assert.equal(original[0].contextOnly,undefined);
 let saw=false;await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide:async words=>{saw=true;assert.equal(words[0].contextOnly,true);assert.equal(words[1].contextOnly,true);return [];}});assert.equal(saw,true);
});

test('speech islands omitted by ASR remain explicit unknown speech rather than guessed filler words',()=>{
 const evidence={...source([word('前句',1000,1500),word('后句',3000,4000)]),speech:[[0,5]],quiet:[[0,1],[1.5,2],[2.4,3],[4,5]]};
 assert.deepEqual(missingSpeechRanges(evidence,evidence.words),[{reason:'untranscribed-nonquiet-speech',startMs:2000,endMs:2400,provider:'independent-vad-coverage'}]);
 const passes=independentPasses([evidence]);assert.equal(passes[0].sources[0].unresolved[0].startMs,2000);assert.deepEqual(passes[0].sources[0].words.map(w=>w.word),['前句','后句']);
});

test('residual clip ownership aliases do not remove unresolved context protection',()=>{
 const evidence={...source([word('前句',1000,1400),word('后句',3000,3400),word('其后',5000,5500)]),unresolved:[{startMs:2000,endMs:2200}]};
 const child={...clip,id:'retained-child'},words=recallWordStream([child],[evidence]).map(value=>({...value,observationClipId:value.clipId,clipId:clip.id}));
 const marked=markUnresolvedContext(words,[child],[evidence]);
 assert.deepEqual(marked.map(value=>value.contextOnly===true),[true,true,false]);
 assert.ok(marked.every(value=>value.clipId===clip.id&&value.observationClipId===child.id));
 assert.deepEqual(marked.map(value=>[value.startMs,value.endMs]),words.map(value=>[value.startMs,value.endMs]));
});

test('same-window repeated overlapping observations are unresolved without changing raw clocks or source receipts',async t=>{
 const directory=fixture(t),first=word('嗯',1000,1500),second=word('嗯',1300,1800),next=word('完整解释',2500,3500);
 const evidence={...source([first,next]),unresolved:[],observationPasses:[
  {id:'core-overlap',provider:'whisper-medium',words:[first,next],windows:[{startSec:0,endSec:4,words:[first,second,next]}]},
  {id:'vad-isolated',provider:'whisper-medium',words:[first,next],windows:[{startSec:0,endSec:4,words:[first,next]},{startSec:0,endSec:4,words:[second]}]}]};
 const original=structuredClone(evidence),enriched=enrichIndependentSource(evidence),issue=enriched.unresolved[0];
 assert.equal(issue.reason,'same-window-overlapping-repeated-observations');assert.equal(issue.startMs,1000);assert.equal(issue.endMs,1800);
 assert.deepEqual(issue.words.map(value=>[value.startMs,value.endMs]),[[1000,1500],[1300,1800]]);
 assert.deepEqual(evidence,original);assert.deepEqual(enriched.words,original.words);assert.deepEqual(enriched.observationPasses[0].windows,original.observationPasses[0].windows);
 assert.equal(enriched.observationPasses[1].unresolved.length,0);assert.equal(enrichIndependentSource(enriched).unresolved.length,1);
 const passes=independentPasses([evidence]);assert.equal(passes[0].sources[0].unresolved.length,1);assert.equal(passes[1].sources[0].unresolved.length,0);
 let calls=0;const result=await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide:async words=>{
  calls++;if(calls===1)assert.equal(words[0].contextOnly,true);
  return calls===1?[cut({first:0,last:0,replacementFirst:-1,replacementLast:-1,kind:'filler'})]:[];
 }});assert.equal(result.passes[0].decisions.length,0);assert.ok(result.passes[0].blocked.length);
});

test('an omitted raw filler creates one whole-window context pass and still needs semantic and acoustic validation',async t=>{
 const directory=fixture(t),before=word('先说明',1000,1400),filler=word('嗯，',2000,2200),after=word('完整功能',3000,3500),other=word('另一窗口',10000,11000);
 const evidence={...source([before,after,other]),observationPasses:[{id:'vad-isolated',provider:'whisper-medium',words:[before,after,other],windows:[
  {startSec:0,endSec:4,coreStartSec:2.5,coreEndSec:4,words:[before,filler,after]},
  {startSec:9,endSec:12,coreStartSec:9,coreEndSec:12,words:[other]}]}]};
 const original=structuredClone(evidence),passes=independentPasses([evidence]);assert.equal(passes.length,2);
 const context=passes[1];assert.equal(context.origin,'raw-window-filler-context');assert.equal(context.parentPass,'vad-isolated');assert.equal(context.windowIndex,0);
 assert.deepEqual(context.sources[0].words.map(value=>[value.word,value.startMs,value.endMs]),[before,filler,after].map(value=>[value.word,value.startMs,value.endMs]));
 assert.deepEqual(context.sources[0].words.map(value=>value.id),[0,1,2]);assert.equal(context.sources[0].provider,'whisper-medium');assert.deepEqual(evidence,original);
 let windows=0;const result=await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide:async words=>{
  windows++;return words.some(value=>value.word===filler.word)?[cut({first:1,last:1,replacementFirst:-1,replacementLast:-1,kind:'filler'})]:[];
 }});
 assert.equal(windows,2);assert.equal(result.passes[0].decisions.length,0);assert.equal(result.passes[1].decisions.length,1);
 assert.equal(result.passes[1].automaticApplyEnabled,false);assert.equal(result.automaticApplyEnabled,false);
});

test('only a fully covering pure filler clock suppresses raw context recall; meaningful words and expressive particles do not',()=>{
 const filler=word('呃',1500,1800),window={startSec:0,endSec:4,words:[word('前文',500,1000),filler,word('后文',2500,3000)]};
 const withCanonical=canonical=>({...source(canonical),observationPasses:[{id:'core-overlap',provider:'whisper-medium',words:canonical,windows:[window]}]});
 assert.equal(independentPasses([withCanonical([word('有价值的说明',1000,4000)])]).length,2);
 assert.equal(independentPasses([withCanonical([word('嗯嗯',1400,1900)])]).length,1);
 assert.equal(independentPasses([withCanonical([word('呃',1600,1900)])]).length,2);
 const notFillers=['啊','哦','金额','感恩','嗯好','恩人'];
 for(const value of notFillers){const words=[word(value,1000,1500)],evidence={...source([]),observationPasses:[{id:'vad-isolated',words:[],windows:[{startSec:0,endSec:3,words}]}]};assert.equal(independentPasses([evidence]).length,1,value);}
 const zero={...source([]),observationPasses:[{id:'vad-isolated',words:[],windows:[{startSec:0,endSec:3,words:[word('呃',1000,1000)]}]}]};assert.equal(independentPasses([zero]).length,1);
});

test('raw context passes retain zero-time and overlapping-clock failures as unresolved rather than making words',async t=>{
 const directory=fixture(t),before=word('前文',500,900),filler=word('嗯',1500,1700),zero=word('呃',2000,2000),after=word('后文',3000,3500);
 const evidence={...source([before,after]),observationPasses:[{id:'vad-isolated',words:[before,after],windows:[{startSec:0,endSec:4,words:[before,filler,zero,after],unresolved:[{reason:'alignment-incomplete',startMs:2400,endMs:2600}]}]}]};
 const context=independentPasses([evidence])[1].sources[0];assert.deepEqual(context.words.map(value=>value.word),['前文','嗯','后文']);
 assert.ok(context.unresolved.some(value=>value.reason==='non-positive-or-invalid-window-word'&&value.word.startMs===2000&&value.word.endMs===2000));
 assert.ok(context.unresolved.some(value=>value.reason==='alignment-incomplete'));
 const result=await planRecallCandidates({clips:[clip],independentSources:[evidence],directory,decide:async words=>words.some(value=>value.word==='嗯')?[cut({first:1,last:1,replacementFirst:-1,replacementLast:-1,kind:'filler'})]:[]});
 assert.equal(result.passes[1].decisions.length,0);assert.ok(result.passes[1].blocked.length);
 const clash={...evidence,observationPasses:[{id:'vad-isolated',words:[before,after],windows:[{startSec:0,endSec:4,words:[before,filler,word('独有信息',1600,2300),after]}]}]};
 const clashed=independentPasses([clash])[1].sources[0];assert.deepEqual(clashed.words.map(value=>value.word),['前文','后文']);assert.ok(clashed.unresolved.some(value=>value.reason==='conflicting-overlapping-window-words'));
 const missing={...evidence,speech:[[0,4],[10,15]],quiet:[[0,.5],[.9,1.5],[1.7,2],[2.5,3],[3.5,4]],observationPasses:[{id:'vad-isolated',words:[before,after],windows:[{startSec:0,endSec:4,words:[before,filler,after]}]}]};
 const scoped=independentPasses([missing])[1].sources[0];assert.deepEqual(scoped.speech,[[0,4]]);
 assert.ok(scoped.unresolved.some(value=>value.reason==='untranscribed-nonquiet-speech'&&value.startMs===2000&&value.endMs===2500));
 assert.ok(!scoped.unresolved.some(value=>value.startMs>=10000));
});

test('refined raw-window recall keeps its actual timing provider and one source index space across multi-source timelines',()=>{
 const raw=[word('前文',1000,1400),word('恩',2000,2200),word('后文',3000,3500)],otherSrc='clips/other.mp4',otherClip={...clip,id:'other',src:otherSrc,inSec:0,outSec:5,speed:1};
 const evidence={...source([raw[0],raw[2]]),timingProvider:'forced-alignment',observationPasses:[{id:'core-overlap',provider:'whisper-medium',timingProvider:'forced-alignment',words:[raw[0],raw[2]],windows:[{startSec:0,endSec:4,words:raw,rawWords:[word('旧观察',500,500)],rawAlignmentTokens:raw}]}]};
 const other={...source([word('其他源正文',1000,2000)]),src:otherSrc};
 const passes=independentPasses([evidence,other]),context=passes.find(value=>value.origin==='raw-window-filler-context');
 assert.equal(context.sources[0].provider,'whisper-medium');assert.equal(context.sources[0].timingProvider,'forced-alignment');assert.deepEqual(context.sources[1].words,[]);
 const stream=recallWordStream([otherClip,clip],context.sources);assert.equal(stream.length,3);assert.ok(stream.every(value=>value.src===clip.src&&value.clipId===clip.id));
 assert.deepEqual(stream.map(value=>value.sourceIndex),[0,1,2]);assert.equal(stream[0].timelineMs,5000+1000/clip.speed);
 assert.deepEqual(context.sources[0].windows[0].rawAlignmentTokens,raw);
});

test('observer sends only source identities/ranges, rejects changed sources, and uses cancellable local execution',async t=>{
 const root=fixture(t),PUBLIC=path.join(root,'public');fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,clip.src),'synthetic bytes');
 const sourceSha256=createHash('sha256').update('synthetic bytes').digest('hex'),evidence={...source([]),sourceSha256,wav:path.join(root,'source.wav'),reviewedDecisions:'never input',captions:'never input'};
 const controller=new AbortController();let runs=0;
 const result=await observeIndependentSources({root,PUBLIC,clips:[clip],sources:[evidence],directory:path.join(root,'job'),signal:controller.signal,run:async(command,args,options)=>{
  runs++;assert.equal(command,path.join(root,'.venv/bin/python'));assert.equal(options.signal,controller.signal);const request=JSON.parse(fs.readFileSync(args[1]));
  assert.deepEqual(Object.keys(request).sort(),['root','sources','threads']);assert.deepEqual(Object.keys(request.sources[0]).sort(),['range','sourceSha256','src','wav']);assert.equal(request.threads,2);
  fs.writeFileSync(args[2],JSON.stringify({sources:[{...request.sources[0],clock:{sourceSha256},words:[word('嗯',100,200)],observationPasses:[{id:'core-overlap',words:[word('嗯',100,200)],windows:[{words:[word('嗯',100,200),word('嗯',150,250)]}]}]}],audioUploaded:false,geminiCalled:false}));
 }});assert.equal(runs,1);assert.equal(result[0].sourceSha256,sourceSha256);assert.equal(result[0].unresolved[0].reason,'same-window-overlapping-repeated-observations');
 assert.equal(result[0].unresolved[0].endMs,250);assert.equal(result[0].observationPasses[0].unresolved[0].startMs,100);
 fs.writeFileSync(path.join(PUBLIC,clip.src),'changed');await assert.rejects(observeIndependentSources({root,PUBLIC,clips:[clip],sources:[evidence],directory:path.join(root,'changed'),run:async()=>{throw Error('must not execute');}}),/原片已变化/);
});

test('active independent cache writers are awaited and stale owners do not start duplicate waits',async t=>{
 const root=fixture(t),lock=path.join(root,'.auto-jobs/codex-independent-evidence','a'.repeat(64),'.lock');fs.mkdirSync(lock,{recursive:true});fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));
 assert.equal(activeIndependentWriters(root).length,1);assert.equal(activeIndependentWriters(root,{isProcessAlive:()=>false}).length,0);
 const messages=[],waiting=waitForIndependentWriter({root,pollMs:5,timeoutMs:5000,onProgress:(_,message)=>messages.push(message)});
 setTimeout(()=>fs.rmSync(lock,{recursive:true,force:true}),20);const result=await waiting;
 assert.ok(result.polls>=1);assert.ok(messages.some(message=>message.includes('复用正在生成')));
});

test('cancelling a shared-writer wait never terminates or removes that writer',async t=>{
 const root=fixture(t),lock=path.join(root,'.auto-jobs/codex-independent-evidence','b'.repeat(64),'.lock');fs.mkdirSync(lock,{recursive:true});fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));
 const controller=new AbortController(),waiting=waitForIndependentWriter({root,signal:controller.signal,pollMs:1000,timeoutMs:5000});controller.abort(Error('synthetic wait cancelled'));
 await assert.rejects(waiting,/synthetic wait cancelled/);assert.equal(fs.existsSync(lock),true);assert.equal(activeIndependentWriters(root)[0].pid,process.pid);
 await assert.rejects(waitForIndependentWriter({root,pollMs:5,timeoutMs:15}),/超过45分钟/);
});

test('observer starts no Python process until an existing independent writer has finished',async t=>{
 const root=fixture(t),PUBLIC=path.join(root,'public'),directory=path.join(root,'job'),lock=path.join(root,'.auto-jobs/codex-independent-evidence','c'.repeat(64),'.lock');
 fs.mkdirSync(path.join(PUBLIC,'clips'),{recursive:true});fs.writeFileSync(path.join(PUBLIC,clip.src),'synthetic shared evidence');
 fs.mkdirSync(lock,{recursive:true});fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));
 const sourceSha256=createHash('sha256').update('synthetic shared evidence').digest('hex');let starts=0;
 const waiting=observeIndependentSources({root,PUBLIC,clips:[clip],sources:[{...source([]),sourceSha256,wav:path.join(root,'source.wav')}],directory,
  waitForWriter:options=>waitForIndependentWriter({...options,pollMs:5,timeoutMs:5000}),run:async(_,args)=>{
   starts++;assert.equal(fs.existsSync(lock),false);const input=JSON.parse(fs.readFileSync(args[1]));fs.writeFileSync(args[2],JSON.stringify({sources:[{...input.sources[0],clock:{sourceSha256},words:[]}],audioUploaded:false,geminiCalled:false}));
  }});
 await new Promise(resolve=>setTimeout(resolve,15));assert.equal(starts,0);fs.rmSync(lock,{recursive:true,force:true});await waiting;assert.equal(starts,1);
});
