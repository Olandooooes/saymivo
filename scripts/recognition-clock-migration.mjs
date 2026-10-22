// A deterministic clock conversion of existing recognition, never new inference.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {SOURCE_AUDIO_CLOCK} from './transcript-profile.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const fileSha=file=>sha(fs.readFileSync(file));
const json=value=>JSON.stringify(value,null,2)+'\n';
const requireThat=(condition,message)=>{if(!condition)throw Error('Clock migration rejected: '+message);};
const sameClock=clock=>Object.entries(SOURCE_AUDIO_CLOCK).every(([key,value])=>clock?.[key]===value);
const resolved=(file,root)=>path.resolve(root,file);

function pcmWav(file){
 const bytes=fs.readFileSync(file);
 requireThat(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE','expected RIFF PCM WAV');
 let format,pcm;
 for(let at=12;at+8<=bytes.length;){
  const kind=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),start=at+8,end=start+size;
  requireThat(end<=bytes.length,'truncated WAV chunk');
  if(kind==='fmt '){requireThat(size>=16,'short WAV format');format={codec:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),bits:bytes.readUInt16LE(start+14)};}
  if(kind==='data'){requireThat(!pcm,'multiple WAV data chunks are unsupported');pcm=bytes.subarray(start,end);}
  at=end+(size%2);
 }
 requireThat(format?.codec===1&&format.channels===1&&format.rate===16000&&format.bits===16&&pcm&&pcm.length%2===0,'expected mono 16 kHz PCM16');
 return {bytes,pcm,samples:pcm.length/2};
}

export function fullPcmClockBinding({sourceSha256,legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath,offsetSamples,root=process.cwd()}){
 [legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath]=[legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath].map(file=>resolved(file,root));
 requireThat(Number.isSafeInteger(offsetSamples)&&offsetSamples>0&&offsetSamples*1000%16000===0,'offset must be positive, exact integral milliseconds at 16 kHz');
 const legacy=pcmWav(legacyWavPath),current=pcmWav(sourceZeroWavPath);
 const clock=JSON.parse(fs.readFileSync(sourceZeroWavPath+'.clock.json','utf8'));
 requireThat(sameClock(clock)&&clock.limitSec===null,'full source-zero receipt/version required');
 requireThat(clock.sourceSha256===sourceSha256&&clock.wavSha256===sha(current.bytes),'source-zero receipt SHA differs');
 requireThat(clock.sampleCount===current.samples&&clock.wavBytes===current.bytes.length,'source-zero receipt sample/byte count differs');
 requireThat(clock.expectedLeadingPaddingSamples===offsetSamples&&clock.audioOffsetFromVideoMs===offsetSamples*1000/16000,'receipt does not support the proposed clock shift');
 const prefix=current.pcm.subarray(0,offsetSamples*2),tail=current.pcm.subarray(offsetSamples*2);
 requireThat(current.samples===legacy.samples+offsetSamples,'full audio lengths differ beyond the leading shift');
 requireThat(prefix.length===offsetSamples*2&&prefix.every(value=>value===0),'prefix is not exactly zero PCM');
 requireThat(tail.equals(legacy.pcm),'complete PCM tail is not identical to legacy audio');
 const proof={version:'full-pcm-source-zero-binding-v1',operation:'exact-zero-prefix-and-identical-tail',sourceSha256,
  legacyRawSha256:fileSha(legacyRawPath),legacyMetaSha256:fileSha(legacyMetaPath),legacyWavSha256:sha(legacy.bytes),sourceZeroWavSha256:sha(current.bytes),
  legacyPcmSha256:sha(legacy.pcm),sourceZeroPcmSha256:sha(current.pcm),sourceZeroSuffixPcmSha256:sha(tail),sampleRate:16000,
  legacySampleCount:legacy.samples,sourceZeroSampleCount:current.samples,offsetSamples,offsetMs:offsetSamples*1000/16000,
  leadingSamplesAllZero:true,fullPcmSuffixExactMatch:true,uncomparedLegacySamples:0,uncomparedSourceZeroSuffixSamples:0};
 return {proof,clock};
}

function transformedWords(words,offsetMs){
 requireThat(Array.isArray(words)&&words.length>0&&words.every(w=>typeof w.word==='string'&&['startMs','endMs'].every(k=>Number.isFinite(w[k]))),'invalid original raw word list');
 return words.map(word=>({...word,startMs:word.startMs+offsetMs,endMs:word.endMs+offsetMs}));
}

function originalProvenance({legacyRawPath,legacyMetaPath},profile,root=process.cwd()){
 legacyRawPath=resolved(legacyRawPath,root);legacyMetaPath=resolved(legacyMetaPath,root);
 const original=JSON.parse(fs.readFileSync(legacyMetaPath,'utf8'));
 const inferred='recognition-'+sha('faster-whisper-v2:'+original.model).slice(0,12);
 requireThat(original.engine==='faster-whisper'&&profile.engine==='faster-whisper'&&original.model===profile.model,'original recognizer/model differs from consumer profile');
 requireThat(path.basename(path.dirname(legacyRawPath))===inferred,'legacy namespace does not match its original v2 model');
 requireThat(!original.audioClock&&!original.migration,'input is already clocked/derived; refusing a second shift');
 return original;
}

export function prepareRecognitionClockMigration({sourcePath,legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath,offsetSamples,profile,expectedSourceSha256,expectedLegacyRawSha256,expectedLegacyWavSha256}){
 const sourceSha256=fileSha(sourcePath);
 requireThat(sourceSha256===expectedSourceSha256&&fileSha(legacyRawPath)===expectedLegacyRawSha256&&fileSha(legacyWavPath)===expectedLegacyWavSha256,'explicit expected source/raw/WAV SHA does not match');
 const original=originalProvenance({legacyRawPath,legacyMetaPath},profile);
 const {proof,clock}=fullPcmClockBinding({sourceSha256,legacyRawPath,legacyMetaPath,legacyWavPath,sourceZeroWavPath,offsetSamples});
 const words=transformedWords(JSON.parse(fs.readFileSync(legacyRawPath,'utf8')),proof.offsetMs),rawContent=json(words);
 const migration={type:'derived-clock-v1',operation:proof.operation,offsetSamples,sampleRate:16000,offsetMs:proof.offsetMs,
  sourceSha256,legacyRawPath:path.resolve(legacyRawPath),legacyRawSha256:proof.legacyRawSha256,legacyMetaPath:path.resolve(legacyMetaPath),legacyMetaSha256:proof.legacyMetaSha256,
  legacyWavPath:path.resolve(legacyWavPath),legacyWavSha256:proof.legacyWavSha256,sourceZeroWavPath:path.resolve(sourceZeroWavPath),sourceZeroWavSha256:proof.sourceZeroWavSha256,
  inputTimestampBasis:'legacy-decoded-audio-sample-zero-ms',outputTimestampBasis:SOURCE_AUDIO_CLOCK.timestampBasis,newRecognitionPerformed:false,fullPcmBinding:proof};
 const identity={sourceSha256,legacyRawSha256:proof.legacyRawSha256,legacyWavSha256:proof.legacyWavSha256,sourceZeroWavSha256:proof.sourceZeroWavSha256,offsetSamples,cacheContractVersion:profile.recognizerVersion};
 const metadata={schemaVersion:3,kind:'recognition-clock-migration',engine:original.engine,model:original.model,
  recognizerVersion:'faster-whisper-v2',recognizerVersionEvidence:'Inferred from original model and v2 namespace; original metadata has no version.',
  cacheContractVersion:profile.recognizerVersion,originalRecognizerMetadata:original,sourceSha256,audioClock:clock,recognitionSha256:sha(rawContent),
  originalRecognitionSha256:proof.legacyRawSha256,migrationId:sha(json(identity)),migration,audioUploaded:false,
  limitations:['Timebase conversion of existing recognition, not new inference or phonetic/word accuracy validation.',
   'Legacy metadata did not record its historical WAV SHA. The selected old raw/WAV are explicitly bound by expected hashes; past model input cannot be proved retrospectively.']};
 return {words,metadata,rawContent,metaContent:json(metadata)};
}

export function verifyDerivedClockCache(metadata,{profile,sourceSha256,words,root=process.cwd()}){
 requireThat(metadata.kind==='recognition-clock-migration'&&metadata.cacheContractVersion===profile.recognizerVersion,'unknown derived cache contract');
 requireThat(metadata.recognizerVersion==='faster-whisper-v2','original recognizer version was relabelled');
 const m=metadata.migration;
 requireThat(m?.type==='derived-clock-v1'&&m.operation==='exact-zero-prefix-and-identical-tail'&&m.newRecognitionPerformed===false,'unsupported migration operation');
 requireThat(m.sourceSha256===sourceSha256&&metadata.sourceSha256===sourceSha256&&m.sampleRate===16000,'migration source/sample rate differs');
 requireThat(m.inputTimestampBasis==='legacy-decoded-audio-sample-zero-ms'&&m.outputTimestampBasis===SOURCE_AUDIO_CLOCK.timestampBasis,'migration clock basis differs');
 const original=originalProvenance(m,profile,root);
 requireThat(metadata.engine===original.engine&&metadata.model===original.model,'top-level original recognizer/model changed');
 requireThat(isDeepStrictEqual(metadata.originalRecognizerMetadata,original),'original recognizer provenance changed');
 const {proof,clock}=fullPcmClockBinding({...m,sourceSha256,root});
 requireThat(isDeepStrictEqual(m.fullPcmBinding,proof)&&isDeepStrictEqual(metadata.audioClock,clock),'full PCM binding/clock receipt changed');
 for(const field of ['legacyRawSha256','legacyMetaSha256','legacyWavSha256','sourceZeroWavSha256','offsetMs'])requireThat(m[field]===proof[field],'migration '+field+' differs');
 requireThat(metadata.originalRecognitionSha256===proof.legacyRawSha256,'original raw SHA differs');
 requireThat(isDeepStrictEqual(words,transformedWords(JSON.parse(fs.readFileSync(resolved(m.legacyRawPath,root),'utf8')),proof.offsetMs)),'derived words differ from the exact original clock transform');
 if(m.proofStorage){
  requireThat(m.proofStorage.version==='project-relative-v1','unknown proof storage version');
  requireThat(Array.isArray(m.proofStorage.artifacts)&&m.proofStorage.artifacts.length===5,'invalid durable proof manifest');
  requireThat(m.proofStorage.sourcePath===metadata.audioClock.sourcePath&&!path.isAbsolute(m.proofStorage.sourcePath)&&resolved(m.proofStorage.sourcePath,root).startsWith(path.resolve(root)+path.sep),'durable source path is not project-relative');
  for(const artifact of m.proofStorage.artifacts){
   requireThat(!path.isAbsolute(artifact.path)&&resolved(artifact.path,root).startsWith(path.resolve(root)+path.sep),'proof path is not project-relative');
   requireThat(fileSha(resolved(artifact.path,root))===artifact.sha256,'durable proof artifact SHA differs');
  }
  requireThat([m.legacyRawPath,m.legacyMetaPath,m.legacyWavPath,m.sourceZeroWavPath,m.sourceZeroWavPath+'.clock.json'].every(file=>m.proofStorage.artifacts.some(a=>a.path===file)),'durable proof manifest does not cover every dependency');
 }
 const identity={sourceSha256,legacyRawSha256:proof.legacyRawSha256,legacyWavSha256:proof.legacyWavSha256,sourceZeroWavSha256:proof.sourceZeroWavSha256,offsetSamples:m.offsetSamples,cacheContractVersion:profile.recognizerVersion};
 requireThat(metadata.migrationId===sha(json(identity)),'migration identity differs');
 return true;
}

// Prepare a portable proof bundle without writing it. Absolute model strings in
// originalRecognizerMetadata remain historical provenance; artifact paths below
// resolve against the caller's current project root after a restore.
export function withDurableClockProof(candidate,{root=process.cwd(),sourcePath}={}){
 const metadata=structuredClone(candidate.metadata),m=metadata.migration;
 const base=path.join('public','clips','transcripts','clock-provenance',metadata.migrationId);
 const legacyDirectory=path.join(base,'legacy',path.basename(path.dirname(m.legacyRawPath)));
 const targets={legacyRawPath:path.join(legacyDirectory,path.basename(m.legacyRawPath)),legacyMetaPath:path.join(legacyDirectory,path.basename(m.legacyMetaPath)),
  legacyWavPath:path.join(base,'legacy','audio',path.basename(m.legacyWavPath)),sourceZeroWavPath:path.join(base,'source-zero',path.basename(m.sourceZeroWavPath))};
 const proofArtifacts=[];
 for(const [field,target] of Object.entries(targets)){
  proofArtifacts.push({path:target,content:fs.readFileSync(resolved(m[field],root))});m[field]=target;
 }
 const source=path.relative(path.resolve(root),resolved(sourcePath??metadata.audioClock.sourcePath,root));
 requireThat(source&&!source.startsWith('..')&&!path.isAbsolute(source),'source must be inside the project for durable proof');
 metadata.audioClock.sourcePath=source;
 proofArtifacts.push({path:targets.sourceZeroWavPath+'.clock.json',content:Buffer.from(json(metadata.audioClock))});
 m.proofStorage={version:'project-relative-v1',baseDir:base,sourcePath:source,artifacts:proofArtifacts.map(a=>({path:a.path,sha256:sha(a.content)}))};
 return {...candidate,metadata,metaContent:json(metadata),proofArtifacts,proofRoot:path.resolve(root)};
}

export function writeRecognitionClockMigration(candidate,{outputDir,basename,write=false}){
 const raw=path.join(outputDir,basename+'.json'),meta=path.join(outputDir,basename+'.meta.json');
 const exists=[fs.existsSync(raw),fs.existsSync(meta)];
 if(exists.some(Boolean)){
  requireThat(exists.every(Boolean)&&fileSha(raw)===sha(candidate.rawContent)&&fileSha(meta)===sha(candidate.metaContent),'destination exists with different/incomplete content; no overwrite');
 }
 const pending=[];
 for(const artifact of candidate.proofArtifacts??[]){
  const target=resolved(artifact.path,candidate.proofRoot);
  requireThat(!path.isAbsolute(artifact.path)&&target.startsWith(candidate.proofRoot+path.sep),'durable destination escapes project');
  if(fs.existsSync(target))requireThat(fileSha(target)===sha(artifact.content),'durable proof exists with different content; no overwrite');
  else pending.push({...artifact,target});
 }
 if(exists.every(Boolean)&&!pending.length)return {status:'already-identical',raw,meta};
 if(!write)return {status:'dry-run',raw,meta,proofArtifactsToCreate:pending.map(a=>a.path)};
 for(const artifact of pending){fs.mkdirSync(path.dirname(artifact.target),{recursive:true});fs.writeFileSync(artifact.target,artifact.content,{flag:'wx'});}
 if(candidate.proofArtifacts)verifyDerivedClockCache(candidate.metadata,{profile:{engine:candidate.metadata.engine,model:candidate.metadata.model,recognizerVersion:candidate.metadata.cacheContractVersion},sourceSha256:candidate.metadata.sourceSha256,words:candidate.words,root:candidate.proofRoot});
 if(!exists.every(Boolean)){
  fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(meta,candidate.metaContent,{flag:'wx'});fs.writeFileSync(raw,candidate.rawContent,{flag:'wx'});
 }
 return {status:exists.every(Boolean)?'proof-restored':'created',raw,meta};
}
