// Default: dry-run. --write exclusively creates an explicit target cache pair.
import fs from 'node:fs';import path from 'node:path';
import {transcriptionProfile} from './transcript-profile.mjs';
import {prepareRecognitionClockMigration,verifyDerivedClockCache,withDurableClockProof,writeRecognitionClockMigration} from './recognition-clock-migration.mjs';
const options={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(['--write','--durable-proof'].includes(key))options[key.slice(2)]=true;else{if(!key.startsWith('--')||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error('Expected named migration arguments');options[key.slice(2)]=process.argv[++i];}}
for(const key of ['source','legacy-raw','legacy-meta','legacy-wav','source-zero-wav','expected-source-sha','expected-legacy-raw-sha','expected-legacy-wav-sha','offset-samples'])if(!options[key])throw Error('Missing --'+key);
const original=JSON.parse(fs.readFileSync(options['legacy-meta'],'utf8'));
const profile=transcriptionProfile({model:original.model});
let candidate=prepareRecognitionClockMigration({sourcePath:options.source,legacyRawPath:options['legacy-raw'],legacyMetaPath:options['legacy-meta'],legacyWavPath:options['legacy-wav'],sourceZeroWavPath:options['source-zero-wav'],offsetSamples:Number(options['offset-samples']),profile,expectedSourceSha256:options['expected-source-sha'],expectedLegacyRawSha256:options['expected-legacy-raw-sha'],expectedLegacyWavSha256:options['expected-legacy-wav-sha']});
verifyDerivedClockCache(candidate.metadata,{profile,sourceSha256:candidate.metadata.sourceSha256,words:candidate.words});
if(options['durable-proof'])candidate=withDurableClockProof(candidate,{sourcePath:options.source});
const result=writeRecognitionClockMigration(candidate,{outputDir:options['output-dir']||profile.cacheDir,basename:path.basename(options['legacy-raw'],'.json'),write:options.write===true});
console.log(JSON.stringify({...result,wordCount:candidate.words.length,recognitionSha256:candidate.metadata.recognitionSha256,migrationId:candidate.metadata.migrationId,recognizerVersion:candidate.metadata.recognizerVersion,cacheContractVersion:candidate.metadata.cacheContractVersion,newRecognitionPerformed:false},null,2));
