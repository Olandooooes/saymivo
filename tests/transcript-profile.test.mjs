import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {transcriptionProfile,SOURCE_AUDIO_CLOCK} from '../scripts/transcript-profile.mjs';

test('available local medium is preferred without sharing or replacing the old transcript cache',()=>{
 const profile=transcriptionProfile({root:'/work',exists:p=>p.includes('whisper-medium')});
 assert.equal(profile.model,'/work/.models/whisper-medium');
 assert.match(profile.cacheDir,/\/transcripts\/recognition-/);
 const small=transcriptionProfile({root:'/work',model:'/work/.models/whisper-small'});
 assert.notEqual(profile.cacheDir,small.cacheDir);
 assert.deepEqual(profile,transcriptionProfile({root:'/work',model:profile.model}));
});
test('explicit model choice wins and offline small remains a fallback',()=>{
 assert.equal(transcriptionProfile({root:'/work',model:'/custom/model',exists:()=>true}).model,'/custom/model');
 assert.equal(transcriptionProfile({root:'/work',exists:p=>p.includes('whisper-small')}).model,'/work/.models/whisper-small');
 assert.equal(transcriptionProfile({root:'/work',exists:()=>false}).model,'small');
});
test('source-zero profiles isolate both recognizers from legacy caches and each other',()=>{
 const root='/work',model='/work/.models/whisper-medium';
 const local=transcriptionProfile({root,model});
 const whisperx=transcriptionProfile({root,model,engine:'whisperx'});
 const legacyFingerprint=createHash('sha256').update('faster-whisper-v2:'+model).digest('hex').slice(0,12);
 const legacy=path.join(root,'public','clips','transcripts','recognition-'+legacyFingerprint);
 assert.equal(SOURCE_AUDIO_CLOCK.version,'source-zero-v1');
 assert.equal(SOURCE_AUDIO_CLOCK.timestampBasis,'source-video-presentation-ms');
 for(const profile of [local,whisperx]){
  assert.equal(profile.recognizerVersion,profile.engine+'-v3');
  assert.deepEqual(profile.audioClock,SOURCE_AUDIO_CLOCK);
  assert.notEqual(profile.cacheDir,legacy);
  assert.notEqual(profile.cacheDir,path.join(root,'public','clips','transcripts'));
  assert.deepEqual(profile,transcriptionProfile({root,model,engine:profile.engine}));
 }
 assert.notEqual(local.cacheDir,whisperx.cacheDir);
 assert.equal(transcriptionProfile({root,engine:'whisperx',exists:()=>false}).model,'medium');
});
