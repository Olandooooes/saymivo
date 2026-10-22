import test from 'node:test';import assert from 'node:assert/strict';
import {applyWordReviews} from '../scripts/word-reviews.mjs';
import {transcriptionProfile} from '../scripts/transcript-profile.mjs';
import {captionReviewRoute} from '../server/caption-review-routes.mjs';
import {styleCaptions} from '../server/auto-plan.mjs';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const patch={id:'term',windowStartMs:1000,windowEndMs:4000,acceptedText:['agent'],replacementWords:[{word:'Agent',startMs:1500,endMs:2200}]};
test('review matches split tokens, preserves other speech and never mutates recognition',()=>{
 const input=[{word:'ag',startMs:1600,endMs:1900},{word:'ent,',startMs:1900,endMs:2400},{word:'后文',startMs:3000,endMs:3500}],copy=structuredClone(input);
 const result=applyWordReviews(input,[patch]);assert.equal(result.report[0].status,'applied');assert.deepEqual(result.words,[...patch.replacementWords,input[2]]);assert.deepEqual(input,copy);
 assert.equal(applyWordReviews(result.words,[patch]).report[0].status,'unchanged');
});
test('ambiguous or changed source wording is retained without guessing',()=>{
 const input=[{word:'Agent',startMs:1500,endMs:1800},{word:'Agent',startMs:2000,endMs:2500}];
 assert.equal(applyWordReviews(input,[patch]).report[0].reason,'ambiguous source span');
 assert.deepEqual(applyWordReviews([{word:'其他概念',startMs:1500,endMs:2500}],[patch]).words,[{word:'其他概念',startMs:1500,endMs:2500}]);
});
test('small neighboring time overlap is bounded while a large conflict blocks reuse',()=>{
 const input=[{word:'前文',startMs:900,endMs:1540},{word:'Agent',startMs:1600,endMs:2300}];
 const result=applyWordReviews(input,[patch]);assert.equal(result.words[1].startMs,1540);assert.equal(result.report[0].boundaryAdjustmentMs.left,40);
 const conflict=[{...input[0],endMs:1700},input[1]];assert.deepEqual(applyWordReviews(conflict,[patch]).words,conflict);
});
test('invalid reviewed timing cannot corrupt a transcription',()=>{
 const input=[{word:'Agent',startMs:1500,endMs:2500}];
 for(const replacementWords of [[{word:'Agent',startMs:2000,endMs:1000}],[{word:'A',startMs:1500,endMs:2100},{word:'B',startMs:1800,endMs:2300}]])assert.deepEqual(applyWordReviews(input,[{...patch,replacementWords}]).words,input);
});
for(const engine of ['faster-whisper','whisperx'])test(`the ${engine} loader verifies source-zero caches and applies only compatible reviews`,async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'koubo-review-')));
 try{
  fs.mkdirSync(path.join(root,'public/clips/transcripts'),{recursive:true});fs.mkdirSync(path.join(root,'public/clips/reviews'));
  const model=engine==='faster-whisper'?'fixture-model':'medium';
  if(engine==='faster-whisper'){
   fs.mkdirSync(path.join(root,'.venv/bin'),{recursive:true});
   fs.writeFileSync(path.join(root,'.venv/bin/faster-whisper-ready'),'');
  }
  const profile=transcriptionProfile({root,model,engine});
  const media=path.join(root,'public/clips/raw.mp4');
  const plainCache=path.join(root,'public/clips/transcripts/raw.json');
  const legacyFingerprint=createHash('sha256').update('faster-whisper-v2:'+model).digest('hex').slice(0,12);
  const legacyCache=path.join(root,'public/clips/transcripts','recognition-'+legacyFingerprint,'raw.json');
  const cache=path.join(profile.cacheDir,'raw.json'),metaFile=path.join(profile.cacheDir,'raw.meta.json');
  const reviewFile=path.join(root,'public/clips/reviews/raw.json');
  const reportFile=path.join(root,'public/raw.review-applied.json');
  const sha=value=>createHash('sha256').update(value).digest('hex');
  // No decoding occurs in this integrity test: these bytes test source identity.
  fs.writeFileSync(media,'fixture-source-1');
  const legacyRaw=JSON.stringify([{word:'legacy',startMs:1600,endMs:2400}]);
  fs.writeFileSync(plainCache,legacyRaw);fs.mkdirSync(path.dirname(legacyCache),{recursive:true});fs.writeFileSync(legacyCache,legacyRaw);
  assert.equal(fs.existsSync(cache),false,'legacy caches must not satisfy the source-zero profile');
  fs.mkdirSync(profile.cacheDir,{recursive:true});
  const input=[{word:'agent',startMs:1813,endMs:2613}],raw=JSON.stringify(input);
  fs.writeFileSync(cache,raw);
  const sourceSha256=sha(fs.readFileSync(media)),audioClock={...profile.audioClock,sourceSha256,wavSha256:'a'.repeat(64)};
  const meta={recognizerVersion:profile.recognizerVersion,audioClock,sourceSha256,recognitionSha256:sha(raw)};
  const metadata=JSON.stringify(meta);fs.writeFileSync(metaFile,metadata);
  const legacyReview=JSON.stringify({sourceSha256,patches:[patch]});fs.writeFileSync(reviewFile,legacyReview);
  const module=new URL('../scripts/lib-transcribe.mjs',import.meta.url).href;
  const code=`import {transcribeClip,transcriptCacheFile} from ${JSON.stringify(module)};
   const clip={id:'raw',src:'clips/raw.mp4'};
   try{process.stdout.write(JSON.stringify({cache:transcriptCacheFile(clip),words:transcribeClip(clip)}));}
   catch(error){process.stdout.write(JSON.stringify({error:error.message}));}`;
  const run=()=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{
   cwd:root,encoding:'utf8',env:{...process.env,AUTOBROLL_MODEL:model,KOUBO_OUTPUT_DIR:path.join(root,'public')},
  }));
  const assertPreserved=()=>{
   assert.equal(fs.readFileSync(plainCache,'utf8'),legacyRaw);
   assert.equal(fs.readFileSync(legacyCache,'utf8'),legacyRaw);
   assert.equal(fs.readFileSync(cache,'utf8'),raw);
  };
  assert.deepEqual(run(),{cache,words:input});
  let report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  assert.equal(report.report[0].status,'skipped');assert.match(report.report[0].reason,/clock.*legacy|legacy.*clock/);
  assert.equal(fs.readFileSync(reviewFile,'utf8'),legacyReview);assertPreserved();
  if(engine==='faster-whisper'){
   const clip={id:'raw',src:'clips/raw.mp4',inSec:0,outSec:4,sourceDurationSec:4};
   const inputFile=path.join(root,'input.json');fs.writeFileSync(inputFile,JSON.stringify({clips:[clip]}));
   const generator=new URL('../scripts/captions-multiclip.mjs',import.meta.url);
   // No Python/model executable is provided in this fixture; a cache miss fails.
   execFileSync(process.execPath,[fileURLToPath(generator),inputFile],{cwd:root,encoding:'utf8',stdio:'pipe',env:{...process.env,AUTOBROLL_MODEL:model,KOUBO_LOCAL_ONLY:'1',AUTOBROLL_FACE_AWARE:'0',KOUBO_OUTPUT_DIR:path.join(root,'public')}});
   const generated=JSON.parse(fs.readFileSync(path.join(root,'public/captions.multi.json'),'utf8'));
   assert.equal(generated.length,1);assert.deepEqual(generated[0].audioClock,audioClock);
   const reflowed=styleCaptions(generated,[clip]);assert.deepEqual(reflowed[0].audioClock,audioClock);
   assert.equal(styleCaptions(generated.map(({audioClock,...caption})=>caption),[clip])[0].audioClock,undefined);
   const beforeWords=reflowed[0].words.map(w=>({word:w.text,startMs:w.startMs,endMs:w.endMs}));
   const replacementWords=beforeWords.map(w=>({...w,word:'Agent'}));let saved;
   await captionReviewRoute({req:{method:'POST'},res:{},url:new URL('http://localhost/api/caption-reviews/save'),ROOT:root,PUBLIC:path.join(root,'public'),body:async()=>JSON.stringify({src:clip.src,audioClock:reflowed[0].audioClock,beforeWords,replacementWords}),json:(_,code,data)=>{saved={code,data};}});
   assert.equal(saved.code,200,saved.data?.error);
   const stored=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
   assert.equal(stored.audioClock,undefined);assert.equal(stored.patches[0].audioClock,undefined);
   assert.deepEqual(stored.patches[1].audioClock,audioClock);
   assert.deepEqual(run(),{cache,words:replacementWords});assertPreserved();
  }
  const compatiblePatch={...patch,replacementWords:patch.replacementWords.map(w=>({...w,startMs:w.startMs+213,endMs:w.endMs+213}))};
  fs.writeFileSync(reviewFile,JSON.stringify({sourceSha256,audioClock,patches:[compatiblePatch]}));
  assert.deepEqual(run(),{cache,words:compatiblePatch.replacementWords});
  report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  assert.equal(report.report[0].status,'applied');assert.equal(report.sourceCacheUnchanged,true);assert.deepEqual(report.audioClock,audioClock);
  assert.equal(fs.readFileSync(metaFile,'utf8'),metadata);assertPreserved();

  for(const [name,changed,reason] of [
   ['recognizer version',{...meta,recognizerVersion:'faster-whisper-v2'},/时钟版本/],
   ['clock version',{...meta,audioClock:{...audioClock,version:'legacy'}},/时钟版本/],
   ['timestamp basis',{...meta,audioClock:{...audioClock,timestampBasis:'decoded-audio-ms'}},/时钟版本/],
   ['source hash',{...meta,sourceSha256:'different-source'},/源文件 SHA/],
   ['clock source hash',{...meta,audioClock:{...audioClock,sourceSha256:'different-source'}},/源文件 SHA/],
   ['recognition hash',{...meta,recognitionSha256:'different-recognition'},/元数据 SHA/],
  ]){
   const changedMetadata=JSON.stringify(changed);fs.writeFileSync(metaFile,changedMetadata);
   assert.match(run().error,reason,name+' must be rejected');
   assert.equal(fs.readFileSync(metaFile,'utf8'),changedMetadata);assertPreserved();
  }
  fs.rmSync(metaFile);assert.match(run().error,/ENOENT/,'a cache without provenance must be rejected');assertPreserved();
  fs.writeFileSync(metaFile,metadata);
  fs.writeFileSync(media,'a-different-source');assert.match(run().error,/源文件 SHA/);
  assert.equal(fs.readFileSync(metaFile,'utf8'),metadata);assertPreserved();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
