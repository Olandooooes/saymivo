import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const SOURCE_AUDIO_CLOCK=JSON.parse(fs.readFileSync(new URL('./source-audio-clock.json',import.meta.url),'utf8'));

// Keep recognizer upgrades separate from the original recognition cache.
// A previously generated small-model transcript is never silently overwritten.
export function transcriptionProfile({root=process.cwd(),model,engine='faster-whisper',exists=fs.existsSync}={}){
 const local=['medium','small'].map(size=>path.join(root,'.models','whisper-'+size));
 const selected=model||(engine==='whisperx'?'medium':local.find(p=>exists(path.join(p,'model.bin')))||'small');
 const recognizerVersion=engine+'-v3';
 const fingerprint=createHash('sha256').update(recognizerVersion+':'+SOURCE_AUDIO_CLOCK.version+':'+selected+':lexical-boundaries-v1').digest('hex').slice(0,12);
 return {model:selected,engine,recognizerVersion,audioClock:SOURCE_AUDIO_CLOCK,cacheDir:path.join(root,'public','clips','transcripts','recognition-'+fingerprint)};
}
