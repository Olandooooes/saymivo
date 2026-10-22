import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {transcriptionProfile,SOURCE_AUDIO_CLOCK} from '../scripts/transcript-profile.mjs';
import {prepareRecognitionClockMigration,verifyDerivedClockCache,withDurableClockProof,writeRecognitionClockMigration} from '../scripts/recognition-clock-migration.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
function wav(pcm){const head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+pcm.length,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(16000,24);head.writeUInt32LE(32000,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(pcm.length,40);return Buffer.concat([head,pcm]);}
function fixture(run){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'koubo-derived-clock-'))),model='fixture-model';
 try{
  const sourcePath=path.join(root,'public/clips/raw.mp4');fs.mkdirSync(path.dirname(sourcePath),{recursive:true});fs.writeFileSync(sourcePath,'source identity fixture; not decoded');
  const profile=transcriptionProfile({root,model}),legacyDir=path.join(root,'public/clips/transcripts/recognition-'+sha('faster-whisper-v2:'+model).slice(0,12));fs.mkdirSync(legacyDir,{recursive:true});
  const legacyRawPath=path.join(legacyDir,'raw.json'),legacyMetaPath=path.join(legacyDir,'raw.meta.json'),legacyWavPath=path.join(root,'legacy.wav'),sourceZeroWavPath=path.join(root,'source-zero.wav');
  const original=[{word:'AI',startMs:100,endMs:300},{word:'Agent',startMs:300,endMs:650},{word:'保留零长',startMs:700,endMs:700}];
  fs.writeFileSync(legacyRawPath,JSON.stringify(original));fs.writeFileSync(legacyMetaPath,JSON.stringify({engine:'faster-whisper',model,wordTimestamps:true,audioUploaded:false}));
  const pcm=Buffer.alloc(32000);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE((i%400)-200,i);
  const zero=Buffer.concat([Buffer.alloc(3408*2),pcm]);fs.writeFileSync(legacyWavPath,wav(pcm));fs.writeFileSync(sourceZeroWavPath,wav(zero));
  const expectedSourceSha256=sha(fs.readFileSync(sourcePath));
  const receipt={...SOURCE_AUDIO_CLOCK,sourceSha256:expectedSourceSha256,wavSha256:sha(fs.readFileSync(sourceZeroWavPath)),wavBytes:44+zero.length,sampleCount:zero.length/2,durationSec:zero.length/32000,limitSec:null,expectedLeadingPaddingSamples:3408,audioOffsetFromVideoMs:213,sourceOriginSec:0};
  fs.writeFileSync(sourceZeroWavPath+'.clock.json',JSON.stringify(receipt));
  const options={sourcePath,legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath,offsetSamples:3408,profile,expectedSourceSha256,expectedLegacyRawSha256:sha(fs.readFileSync(legacyRawPath)),expectedLegacyWavSha256:sha(fs.readFileSync(legacyWavPath))};
  return run({root,model,options,original,receipt,profile});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('derived cache retains v2 provenance, exact PCM proof and zero-length words without inference',()=>fixture(({options,original,profile})=>{
 const candidate=prepareRecognitionClockMigration(options),meta=candidate.metadata;
 assert.equal(meta.recognizerVersion,'faster-whisper-v2');assert.equal(meta.cacheContractVersion,'faster-whisper-v3');assert.equal(meta.migration.newRecognitionPerformed,false);
 assert.equal(meta.originalRecognitionSha256,options.expectedLegacyRawSha256);
 assert.deepEqual(candidate.words,original.map(w=>({...w,startMs:w.startMs+213,endMs:w.endMs+213})));
 assert.equal(candidate.words[2].startMs,candidate.words[2].endMs);
 assert.equal(meta.migration.fullPcmBinding.sourceZeroSampleCount,19408);assert.equal(meta.migration.fullPcmBinding.legacySampleCount,16000);
 assert.equal(meta.migration.fullPcmBinding.sourceZeroSuffixPcmSha256,meta.migration.fullPcmBinding.legacyPcmSha256);
 assert.equal(verifyDerivedClockCache(meta,{profile,sourceSha256:meta.sourceSha256,words:candidate.words}),true);
 assert.deepEqual(prepareRecognitionClockMigration(options),candidate,'repeated preparation never adds a second shift');
}));

test('dry-run writes nothing, explicit write is exclusive, identical rerun is idempotent',()=>fixture(({options,root})=>{
 const candidate=prepareRecognitionClockMigration(options),outputDir=path.join(root,'candidate');
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir,basename:'raw'}).status,'dry-run');assert.equal(fs.existsSync(outputDir),false);
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir,basename:'raw',write:true}).status,'created');
 const before=fs.readFileSync(path.join(outputDir,'raw.json'));
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir,basename:'raw',write:true}).status,'already-identical');
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir,basename:'raw'}).status,'already-identical');
 const changed={...candidate,rawContent:candidate.rawContent+' '};assert.throws(()=>writeRecognitionClockMigration(changed,{outputDir,basename:'raw',write:true}),/destination exists/);
 assert.deepEqual(fs.readFileSync(path.join(outputDir,'raw.json')),before);
 assert.equal(sha(fs.readFileSync(options.legacyRawPath)),options.expectedLegacyRawSha256);
}));

test('derived cache refuses altered hashes, source, PCM proof, original provenance and double shifts',()=>fixture(({options,profile})=>{
 const candidate=prepareRecognitionClockMigration(options),verify=(meta,words=candidate.words)=>verifyDerivedClockCache(meta,{profile,sourceSha256:candidate.metadata.sourceSha256,words});
 const changed=edit=>{const m=structuredClone(candidate.metadata);edit(m);return m;};
 for(const edit of [m=>m.recognizerVersion='faster-whisper-v3',m=>m.cacheContractVersion='future',m=>m.sourceSha256='wrong',m=>m.migration.offsetSamples=6816,m=>m.migration.legacyRawSha256='wrong',m=>m.migration.fullPcmBinding.fullPcmSuffixExactMatch=false,m=>m.originalRecognizerMetadata.model='other',m=>m.migrationId='wrong'])assert.throws(()=>verify(changed(edit)),/Clock migration rejected/);
 assert.throws(()=>verify(candidate.metadata,candidate.words.map(w=>({...w,startMs:w.startMs+213,endMs:w.endMs+213}))),/exact original clock transform/);
 assert.throws(()=>prepareRecognitionClockMigration({...options,expectedLegacyRawSha256:'wrong'}),/expected source\/raw\/WAV SHA/);
 const altered=fs.readFileSync(options.sourceZeroWavPath);altered[altered.length-1]^=1;fs.writeFileSync(options.sourceZeroWavPath,altered);
 const receiptFile=options.sourceZeroWavPath+'.clock.json',receipt=JSON.parse(fs.readFileSync(receiptFile));receipt.wavSha256=sha(altered);fs.writeFileSync(receiptFile,JSON.stringify(receipt));
 assert.throws(()=>verify(candidate.metadata),/complete PCM tail is not identical/);
}));

test('actual source-zero loader accepts only the explicit derived contract without launching recognition',()=>fixture(({options,profile,root,model})=>{
 const candidate=prepareRecognitionClockMigration(options);writeRecognitionClockMigration(candidate,{outputDir:profile.cacheDir,basename:'raw',write:true});
 fs.mkdirSync(path.join(root,'.venv/bin'),{recursive:true});fs.writeFileSync(path.join(root,'.venv/bin/faster-whisper-ready'),'');
 const module=new URL('../scripts/lib-transcribe.mjs',import.meta.url).href;
 const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {transcribeClip,transcriptAudioClock} from ${JSON.stringify(module)};const clip={id:'raw',src:'clips/raw.mp4'};process.stdout.write(JSON.stringify({words:transcribeClip(clip),clock:transcriptAudioClock(clip)}));`],{cwd:root,env:{...process.env,AUTOBROLL_MODEL:model},encoding:'utf8'}));
 assert.deepEqual(result.words,candidate.words);assert.deepEqual(result.clock,candidate.metadata.audioClock);
 assert.equal(JSON.parse(fs.readFileSync(path.join(profile.cacheDir,'raw.meta.json'))).recognizerVersion,'faster-whisper-v2');
 const isolated=path.join(root,'isolated-public'),cacheDir=path.join(isolated,'clips/transcripts',path.basename(profile.cacheDir));
 fs.mkdirSync(path.join(isolated,'clips'),{recursive:true});fs.symlinkSync(options.sourcePath,path.join(isolated,'clips/raw.mp4'));
 writeRecognitionClockMigration(candidate,{outputDir:cacheDir,basename:'raw',write:true});
 fs.mkdirSync(path.join(isolated,'clips/reviews'),{recursive:true});
 const replacement=[{word:'隔离校对',startMs:candidate.words[0].startMs,endMs:candidate.words[0].endMs}];
 fs.writeFileSync(path.join(isolated,'clips/reviews/raw.json'),JSON.stringify({sourceSha256:candidate.metadata.sourceSha256,patches:[{id:'isolated',audioClock:candidate.metadata.audioClock,windowStartMs:0,windowEndMs:550,acceptedText:['AI'],replacementWords:replacement}]}));
 const overridden=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {transcribeClip,transcriptCacheFile} from ${JSON.stringify(module)};const clip={id:'raw',src:'clips/raw.mp4'};process.stdout.write(JSON.stringify({words:transcribeClip(clip),cache:transcriptCacheFile(clip)}));`],{cwd:root,env:{...process.env,AUTOBROLL_MODEL:model,KOUBO_PUBLIC_DIR:isolated},encoding:'utf8'}));
 assert.equal(overridden.cache,path.join(cacheDir,'raw.json'));assert.equal(overridden.words[0].word,'隔离校对');
 assert.equal(fs.existsSync(path.join(root,'public/clips/reviews/raw.json')),false,'override review is isolated from production public');
}));

test('durable proof is opt-in, dry-run creates nothing, and relative artifacts survive a project restore',()=>fixture(({options,profile,root,model})=>{
 const candidate=withDurableClockProof(prepareRecognitionClockMigration(options),{root,sourcePath:options.sourcePath});
 const proofDir=path.join(root,candidate.metadata.migration.proofStorage.baseDir);
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir:profile.cacheDir,basename:'raw'}).status,'dry-run');
 assert.equal(fs.existsSync(proofDir),false);assert.equal(fs.existsSync(profile.cacheDir),false);
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir:profile.cacheDir,basename:'raw',write:true}).status,'created');
 assert.equal(candidate.metadata.recognizerVersion,'faster-whisper-v2');assert.equal(candidate.metadata.audioClock.sourcePath,'public/clips/raw.mp4');
 assert.ok(candidate.metadata.migration.legacyRawPath.includes('/recognition-'));
 assert.equal(candidate.metadata.migration.proofStorage.artifacts.length,5);
 assert.equal(writeRecognitionClockMigration(candidate,{outputDir:profile.cacheDir,basename:'raw',write:true}).status,'already-identical');
 fs.rmSync(path.dirname(options.legacyRawPath),{recursive:true});
 for(const file of [options.legacyWavPath,options.sourceZeroWavPath,options.sourceZeroWavPath+'.clock.json'])fs.rmSync(file);
 assert.equal(verifyDerivedClockCache(candidate.metadata,{profile,sourceSha256:candidate.metadata.sourceSha256,words:candidate.words,root}),true,'temporary original artifacts are no longer required');
 fs.mkdirSync(path.join(root,'.venv/bin'),{recursive:true});fs.writeFileSync(path.join(root,'.venv/bin/faster-whisper-ready'),'');
 const restored=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'koubo-clock-restored-')));
 try{
  fs.cpSync(root,restored,{recursive:true});
  const module=new URL('../scripts/lib-transcribe.mjs',import.meta.url).href;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {transcribeClip} from ${JSON.stringify(module)};process.stdout.write(JSON.stringify(transcribeClip({id:'raw',src:'clips/raw.mp4'})));`],{cwd:restored,env:{...process.env,AUTOBROLL_MODEL:model},encoding:'utf8'}));
  assert.deepEqual(result,candidate.words);
 }finally{fs.rmSync(restored,{recursive:true,force:true});}
 const first=candidate.proofArtifacts[0];fs.writeFileSync(path.join(root,first.path),'changed');
 assert.throws(()=>writeRecognitionClockMigration(candidate,{outputDir:profile.cacheDir,basename:'raw',write:true}),/proof exists with different/);
 assert.throws(()=>verifyDerivedClockCache(candidate.metadata,{profile,sourceSha256:candidate.metadata.sourceSha256,words:candidate.words,root}),/rejected/);
}));
