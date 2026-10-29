import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRefinedSources} from '../scripts/refine-retake-clocks.mjs';

const sha='a'.repeat(64),modelSha='b'.repeat(64);
const word=(word,startMs,endMs,extra={})=>({word,startMs,endMs,...extra});
const token=(text,start_time,end_time)=>({text,start_time,end_time});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fixture({middleText='嗯',modelText=middleText}={}){
 const words=[word('前',10100,10300),word('后',10900,11200)],
  rawWindow={startSec:10,endSec:12,coreStartSec:10,coreEndSec:12,kind:'core-overlap',text:`前${middleText}后`,words:structuredClone(words)},
  source={src:'clips/synthetic.mp4',sourceSha256:sha,provider:'independent-local-model',
   clock:{sourceSha256:sha,wavSha256:'c'.repeat(64),durationSec:12},audioClock:{sourceSha256:sha,wavSha256:'c'.repeat(64),durationSec:12},
   wav:'/synthetic/source-zero.wav',range:[10,12],quiet:[[10.3,10.5],[10.7,10.9]],speech:[[10.1,11.2]],modelSha256:modelSha,
   words:structuredClone(words),unresolved:[],observationPasses:[{id:'core-overlap',provider:'independent-local-model',
    modelSha256:modelSha,words:structuredClone(words),unresolved:[],windows:[rawWindow]}]},
  raw=[source],tokens=[token('前',.1,.3),token(modelText,.5,.7),token('后',.9,1.2)],
  middleCharacters=modelText.replace(/[^\p{L}\p{N}]/gu,'').length,charRanges=[[0,1],[1,1+middleCharacters],[1+middleCharacters,2+middleCharacters]],
  groups=tokens.map((t,index)=>({text:t.text,charStart:charRanges[index][0],charEnd:charRanges[index][1],startSec:10+t.start_time,endSec:10+t.end_time,tokenIndices:[index],valid:true})),
  refinedWords=tokens.map((t,index)=>word(t.text,Math.round((10+t.start_time)*1000),Math.round((10+t.end_time)*1000),
   {id:index,windowIndex:0,observedTokenIndices:[index],observedCharRange:charRanges[index]})).map((w,index)=>index===1?{...w,word:middleText}:w),
  refinedWindow={...structuredClone(rawWindow),timingProvider:'qwen-forced-aligner',rawWords:structuredClone(rawWindow.words),
   rawAlignmentTokens:structuredClone(tokens),words:structuredClone(refinedWords),unresolved:[],
   alignment:{tokenTextMatches:true,groups,wordCharacters:[{id:0,start:0,end:2+middleCharacters}],unresolved:[],sourceRange:[10,12]}},
  refinedPass={...structuredClone(source.observationPasses[0]),timingProvider:'qwen-forced-aligner',
   rawWords:structuredClone(words),rawUnresolved:[],words:structuredClone(refinedWords),unresolved:[],windows:[refinedWindow]},
  refined=[{...structuredClone(source),timingProvider:'qwen-forced-aligner',
   clockRefinement:{version:'independent-window-alignment-v1',rawEvidenceSha256:digest(raw)},
   rawObservationPasses:structuredClone(source.observationPasses),rawWords:structuredClone(words),rawUnresolved:[],
   words:structuredClone(refinedWords),unresolved:[],observationPasses:[refinedPass]}];
 return {raw,refined};
}

function envelopeFixture({interior=false,afterOutsideCore=false}={}){
 const {raw,refined}=fixture(),rawSource=raw[0],result=refined[0],rawPass=rawSource.observationPasses[0],
  rawWindow=rawPass.windows[0],text=interior?'前嗯后':'前后嗯',
  tokens=interior?[token('前',.1,.3),token('嗯',1,1),token('后',1.5,1.7)]:
   [token('前',.1,.3),token('后',afterOutsideCore?2.1:1,afterOutsideCore?2.3:1.2),token('嗯',3.5,3.5)],
  orphanIndex=interior?1:2,windowEnvelope=interior?[10300,11500]:[afterOutsideCore?12300:11200,14000],
  groups=tokens.map((t,index)=>({text:t.text,charStart:index,charEnd:index+1,startSec:10+t.start_time,
   endSec:10+t.end_time,tokenIndices:[index],valid:index!==orphanIndex})),
  observedWords=groups.flatMap((g,index)=>g.valid?[word(g.text,Math.round(g.startSec*1000),Math.round(g.endSec*1000),
   {windowIndex:0,observedTokenIndices:[index],observedCharRange:[index,index+1]})]:[]),
  canonicalWords=observedWords.filter(w=>(w.startMs+w.endMs)/2000<12).map((w,id)=>({...w,id})),
  issue={reason:'invalid-or-unresolved-alignment-group',startMs:windowEnvelope[0],endMs:windowEnvelope[1],
   contextRangeOnly:true,sourceWindowRange:[10,14],text:'嗯',observedCharRange:[orphanIndex,orphanIndex+1],
   observedTokenIndices:[orphanIndex],rawObservedRangeSec:[groups[orphanIndex].startSec,groups[orphanIndex].endSec]},
  canonicalIssues=windowEnvelope[0]<12000?[{...structuredClone(issue),windowIndex:0,endMs:Math.min(12000,windowEnvelope[1]),
   contextSourceRangeMs:[...windowEnvelope]}]:[];
 Object.assign(rawSource,{range:[10,14],quiet:[],speech:[],clock:{...rawSource.clock,durationSec:14},audioClock:{...rawSource.audioClock,durationSec:14}});
 Object.assign(rawWindow,{text,endSec:14,coreEndSec:12});
 const pass=result.observationPasses[0],refinedWindow=pass.windows[0];
 Object.assign(refinedWindow,{...structuredClone(rawWindow),timingProvider:'qwen-forced-aligner',rawWords:structuredClone(rawWindow.words),
  rawUnresolved:[],rawAlignmentTokens:tokens,words:observedWords,unresolved:[issue],
  alignment:{tokenTextMatches:true,groups,wordCharacters:[{id:0,start:0,end:3}],unresolved:[],sourceRange:[10,14]}});
 Object.assign(pass,{words:canonicalWords,unresolved:canonicalIssues});
 Object.assign(result,{range:structuredClone(rawSource.range),quiet:[],speech:[],clock:structuredClone(rawSource.clock),audioClock:structuredClone(rawSource.audioClock),
  words:structuredClone(canonicalWords),unresolved:structuredClone(canonicalIssues),rawObservationPasses:structuredClone(rawSource.observationPasses)});
 result.clockRefinement.rawEvidenceSha256=digest(raw);
 return {raw,refined};
}

test('a distinct aligned clock keeps complete independent text and immutable raw recognition receipts',()=>{
 const {raw,refined}=fixture(),originalRaw=structuredClone(raw),originalRefined=structuredClone(refined);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 assert.deepEqual(raw,originalRaw);assert.deepEqual(refined,originalRefined);
 assert.equal(refined[0].provider,raw[0].provider);
 assert.deepEqual(refined[0].observationPasses[0].windows[0].words.map(w=>w.word),['前','嗯','后']);
});

test('source identity, evidence hashes, source clock and acoustic receipts cannot change in refinement',()=>{
 const mutations=[
  source=>{source.src='clips/another.mp4';},source=>{source.sourceSha256='d'.repeat(64);},
  source=>{source.provider='gemini';},source=>{source.wav='/synthetic/other.wav';},
  source=>{source.range=[0,12];},source=>{source.quiet=[];},source=>{source.speech=[];},
  source=>{source.modelSha256='e'.repeat(64);},source=>{source.clock.durationSec=13;},
  source=>{source.audioClock.sourceSha256='f'.repeat(64);},
  source=>{source.clockRefinement.rawEvidenceSha256='0'.repeat(64);},
  source=>{source.clockRefinement.version='unknown';},source=>{source.timingProvider='unverified-model';}
 ];
 for(const mutate of mutations){const {raw,refined}=fixture();mutate(refined[0]);assert.throws(()=>validateRefinedSources(raw,refined));}
 const {raw,refined}=fixture();assert.throws(()=>validateRefinedSources(raw,[]));
 assert.throws(()=>validateRefinedSources(raw,[...refined,...structuredClone(refined)]));
});

test('raw pass, word and unresolved evidence are bound to the original observation',()=>{
 const mutations=[
  source=>{source.rawWords[0].startMs=10000;},
  source=>{source.rawUnresolved.push({reason:'invented raw issue'});},
  source=>{source.rawObservationPasses[0].windows[0].words[0].word='替换原文';},
  source=>{source.observationPasses[0].windows[0].rawWords[0].endMs=10400;}
 ];
 for(const mutate of mutations){const {raw,refined}=fixture();mutate(refined[0]);assert.throws(()=>validateRefinedSources(raw,refined));}
});

test('recognition passes and full source windows cannot be relabeled, removed or cropped',()=>{
 const mutations=[
  source=>{source.observationPasses[0].id='substituted';},
  source=>{source.observationPasses[0].provider='qwen-asr';},
  source=>{source.observationPasses=[];},
  source=>{source.observationPasses[0].windows=[];},
  source=>{source.observationPasses[0].windows[0].text='前后';},
  source=>{source.observationPasses[0].windows[0].startSec=10.2;},
  source=>{source.observationPasses[0].windows[0].endSec=11.8;},
  source=>{source.observationPasses[0].windows[0].coreStartSec=10.2;},
  source=>{source.observationPasses[0].windows[0].coreEndSec=11.8;},
  source=>{source.observationPasses[0].timingProvider='another';},
  source=>{source.observationPasses[0].windows[0].timingProvider='another';}
 ];
 for(const mutate of mutations){const {raw,refined}=fixture();mutate(refined[0]);assert.throws(()=>validateRefinedSources(raw,refined));}
});

test('refined words must be finite positive source-clock ranges with actual observed token coverage',()=>{
 const mutations=[
  source=>{source.observationPasses[0].windows[0].words[1].word='替换';},
  source=>{source.observationPasses[0].windows[0].words[1].startMs=10550;},
  source=>{source.observationPasses[0].windows[0].words[1].endMs=10500;},
  source=>{source.observationPasses[0].windows[0].words[1].startMs=Number.NaN;},
  source=>{source.observationPasses[0].windows[0].words[1].startMs=12500;},
  source=>{source.observationPasses[0].windows[0].words[1].observedTokenIndices=[0];},
  source=>{source.observationPasses[0].windows[0].words[1].observedCharRange=[0,1];},
  source=>{source.observationPasses[0].windows[0].rawAlignmentTokens=[];},
  source=>{source.observationPasses[0].words[1].startMs=10200;},
  source=>{source.words[1].word='替换';}
 ];
 for(const mutate of mutations){const {raw,refined}=fixture();mutate(refined[0]);assert.throws(()=>validateRefinedSources(raw,refined));}
});

test('decimal and punctuation meaning remains bound to the full original free-recognition text',()=>{
 const {raw,refined}=fixture({middleText:'1.5，',modelText:'15'});
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 for(const changed of ['15，','1,5，','1.5']){
  const altered=structuredClone(refined),source=altered[0],pass=source.observationPasses[0];
  source.words[1].word=changed;pass.words[1].word=changed;pass.windows[0].words[1].word=changed;
  assert.throws(()=>validateRefinedSources(raw,altered),`changed original number/punctuation to ${changed}`);
 }
});

test('unknown evidence attached only to a recognition window cannot silently disappear',()=>{
 const {raw,refined}=fixture(),unknown={reason:'unlocated-semantic-observation',detail:'must remain context protection'};
 raw[0].observationPasses[0].windows[0].unresolved=[unknown];
 const result=refined[0],pass=result.observationPasses[0],window=pass.windows[0];
 result.rawObservationPasses=structuredClone(raw[0].observationPasses);
 result.clockRefinement.rawEvidenceSha256=digest(raw);window.rawUnresolved=[structuredClone(unknown)];
 window.unresolved=[structuredClone(unknown)];pass.unresolved=[{...structuredClone(unknown),windowIndex:0}];result.unresolved=structuredClone(pass.unresolved);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 pass.unresolved=[];result.unresolved=[];
 assert.throws(()=>validateRefinedSources(raw,refined),'window-only unknown evidence must reach the active canonical pass');
 window.unresolved=[];
 assert.throws(()=>validateRefinedSources(raw,refined));
});

test('untranscribed nonquiet speech must keep active protection after a word clock is refined',()=>{
 const {raw,refined}=fixture(),source=refined[0],pass=source.observationPasses[0];
 raw[0].speech=[[10,12]];source.speech=structuredClone(raw[0].speech);
 source.clockRefinement.rawEvidenceSha256=digest(raw);
 const missing={reason:'untranscribed-nonquiet-speech',startMs:11200,endMs:12000,provider:'independent-vad-coverage'};
 pass.unresolved=[structuredClone(missing)];source.unresolved=structuredClone(pass.unresolved);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 pass.unresolved=[{...missing,endMs:11300}];source.unresolved=structuredClone(pass.unresolved);
 assert.throws(()=>validateRefinedSources(raw,refined),'a marker protecting only part of an observed gap is insufficient');
 pass.unresolved=[];source.unresolved=[];
 assert.throws(()=>validateRefinedSources(raw,refined),'a new clock cannot silently certify unknown nonquiet speech');
});

test('a source-level unknown observation protects every independent recognition pass',()=>{
 const {raw,refined}=fixture(),unknown={reason:'unlocated-source-observation'},source=refined[0];
 raw[0].unresolved=[structuredClone(unknown)];
 raw[0].observationPasses.push({...structuredClone(raw[0].observationPasses[0]),id:'vad-isolated'});
 source.observationPasses.push({...structuredClone(source.observationPasses[0]),id:'vad-isolated'});
 source.rawObservationPasses=structuredClone(raw[0].observationPasses);source.rawUnresolved=structuredClone(raw[0].unresolved);
 source.clockRefinement.rawEvidenceSha256=digest(raw);source.unresolved=[structuredClone(unknown)];
 for(const pass of source.observationPasses)pass.unresolved=[structuredClone(unknown)];
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 source.observationPasses[1].unresolved=[];
 assert.throws(()=>validateRefinedSources(raw,refined),'keeping unknown evidence only in the primary pass is insufficient');
});

test('an unresolved suffix keeps its full neighboring-observation envelope and only the responsible core overlap',()=>{
 const {raw,refined}=envelopeFixture(),source=refined[0],pass=source.observationPasses[0],window=pass.windows[0];
 assert.deepEqual([window.unresolved[0].startMs,window.unresolved[0].endMs],[11200,14000]);
 assert.deepEqual([pass.unresolved[0].startMs,pass.unresolved[0].endMs],[11200,12000]);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 const shortEnvelope=structuredClone(refined);shortEnvelope[0].observationPasses[0].windows[0].unresolved[0].startMs=13500;
 assert.throws(()=>validateRefinedSources(raw,shortEnvelope),'the orphan timestamp cannot replace the bounded unknown-speech envelope');
 pass.unresolved[0].startMs=11900;source.unresolved=structuredClone(pass.unresolved);
 assert.throws(()=>validateRefinedSources(raw,refined),'canonical protection must cover the whole envelope overlapping its core');
});

test('an unresolved envelope wholly outside its core is retained in the window without poisoning canonical words',()=>{
 const {raw,refined}=envelopeFixture({afterOutsideCore:true}),pass=refined[0].observationPasses[0];
 assert.deepEqual([pass.windows[0].unresolved[0].startMs,pass.windows[0].unresolved[0].endMs],[12300,14000]);
 assert.deepEqual(pass.unresolved,[]);assert.deepEqual(pass.words.map(w=>w.word),['前']);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
});

test('an interior orphan is protected between both reliable observations without creating a word clock',()=>{
 const {raw,refined}=envelopeFixture({interior:true}),source=refined[0],pass=source.observationPasses[0],window=pass.windows[0];
 assert.deepEqual(window.words.map(w=>[w.word,w.startMs,w.endMs]),[['前',10100,10300],['后',11500,11700]]);
 assert.deepEqual([window.unresolved[0].startMs,window.unresolved[0].endMs],[10300,11500]);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 window.unresolved[0].startMs=11000;pass.unresolved[0].startMs=11000;source.unresolved=structuredClone(pass.unresolved);
 assert.throws(()=>validateRefinedSources(raw,refined),'a zero model token does not locate the surrounding unknown speech');
});

test('cross-window observations of 1.5 and 15 at the same clock remain a protected textual conflict',()=>{
 const {raw,refined}=fixture({middleText:'1.5'}),source=refined[0],pass=source.observationPasses[0],
  secondRawWindow=structuredClone(raw[0].observationPasses[0].windows[0]),secondWindow=structuredClone(pass.windows[0]);
 secondRawWindow.text='前15后';raw[0].observationPasses[0].windows.push(secondRawWindow);
 secondWindow.text='前15后';secondWindow.rawAlignmentTokens[1].text='15';secondWindow.alignment.groups[1].text='15';
 secondWindow.words=secondWindow.words.map((word,index)=>({...word,word:index===1?'15':word.word,windowIndex:1}));
 pass.windows.push(secondWindow);source.rawObservationPasses=structuredClone(raw[0].observationPasses);
 source.clockRefinement.rawEvidenceSha256=digest(raw);
 assert.throws(()=>validateRefinedSources(raw,refined),'cleaned numeric equality cannot select the first original text as corroboration');
 const conflict={reason:'conflicting-refined-observed-spans',startMs:10500,endMs:10700,
  words:[structuredClone(pass.windows[0].words[1]),structuredClone(secondWindow.words[1])]};
 pass.words=pass.words.filter(word=>word.word!=='1.5').map((word,id)=>({...word,id}));
 pass.unresolved=[conflict];source.words=structuredClone(pass.words);source.unresolved=structuredClone(pass.unresolved);
 assert.doesNotThrow(()=>validateRefinedSources(raw,refined));
 assert.deepEqual(source.words.map(word=>word.word),['前','后']);
});
