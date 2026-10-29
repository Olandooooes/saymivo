import {transcriptCacheFile,transcribeClip} from './lib-transcribe.mjs';
import {speechPauseGaps} from './speech-pause-gaps.mjs';
import {localAudioPass} from './analyze-retakes.mjs';
import {RETAKE_ANALYZER_VERSION} from '../server/retake-analyzer.mjs';
import {pauseSegments,protectedPauseWords,assertPauseWordSafety} from './pause-plan.mjs';
// Acoustic detection is local; installed local models add independent word guards. No cloud calls.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const {clips,captions=[]}=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!clips?.length)throw Error('时间轴没有视频');
const PUBLIC=process.env.KOUBO_PUBLIC_DIR?path.resolve(process.env.KOUBO_PUBLIC_DIR):path.resolve('public');
fs.mkdirSync('.captions-tmp',{recursive:true});
const audioDir=fs.mkdtempSync(path.join('.captions-tmp','pause-source-zero-')),sources=new Map();
const python=fs.existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
const sourceAudio=c=>{
 if(sources.has(c.src))return sources.get(c.src);
 const wav=path.join(audioDir,`source-${sources.size}.wav`);
 const extracted=spawnSync(python,['scripts/source_audio.py',path.join(PUBLIC,c.src),wav],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(extracted.status!==0)throw Error('停顿音频时钟提取失败：'+(extracted.stderr??extracted.error?.message??'').slice(-300));
 const receipt=JSON.parse(fs.readFileSync(wav+'.clock.json','utf8')),value={wav,receipt};sources.set(c.src,value);return value;
};
const plan=[],warnings=[];try{
 let independent=[];
 if(fs.existsSync('.models/whisper-small/model.bin')&&fs.existsSync('.models/whisper-medium/model.bin')){
  const input=path.join(audioDir,'independent-input.json'),output=path.join(audioDir,'independent-output.json');
  fs.writeFileSync(input,JSON.stringify({root:process.cwd(),public:PUBLIC,sources:[...new Set(clips.map(c=>c.src))].map(src=>({src})),analyzerVersion:RETAKE_ANALYZER_VERSION}));
  const observed=await localAudioPass({root:process.cwd(),operation:'analyze',input,output,onProgress:(_,label)=>console.log(`PROGRESS:15:${label}`)});
  fs.writeFileSync(input,JSON.stringify({root:process.cwd(),sources:observed.sources,analyzerVersion:RETAKE_ANALYZER_VERSION}));
  independent=(await localAudioPass({root:process.cwd(),operation:'repair',input,output,onProgress:(_,label)=>console.log(`PROGRESS:35:${label}`)})).sources;
 }else warnings.push('缺少本地独立识别模型：仅用已有词时间保护，仍须逐处试听。');
 for(const [i,c]of clips.entries()){
 console.log(`PROGRESS:${Math.round(40+i/clips.length*50)}:检测停顿 ${i+1}/${clips.length}`);
 const audio=sourceAudio(c);
 const r=spawnSync('ffmpeg',['-hide_banner','-i',audio.wav,'-vn','-af','silencedetect=noise=-42dB:d=0.65','-f','null','-'],{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error('停顿检测失败：'+(r.stderr??r.error?.message??'').slice(-220));
 const gaps=[];let start=null;for(const line of r.stderr.split('\n')){const a=line.match(/silence_start: ([\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)start=+a[1];if(b&&start!==null){gaps.push([start,+b[1]]);start=null;}}if(start!==null)gaps.push([start,c.sourceDurationSec]);
 let words=[];try{if(fs.existsSync(transcriptCacheFile(c)))words=transcribeClip(c);}catch{}
 const observed=independent.find(s=>s.src===c.src);
 if(observed&&observed.sourceSha256!==audio.receipt.sourceSha256)throw Error('停顿独立识别与原片身份不一致');
 words=protectedPauseWords(words,captions.filter(cap=>cap.clipId===c.id).flatMap(cap=>cap.words??[]),observed?.words??[]);
 // VAD also catches non-speech handling noise inside a long spoken pause.
 // It cannot override any cached word interval, including quiet syllables.
 let speechGaps=[];
 if(fs.existsSync('.venv/bin/faster-whisper-ready')){
  const vad=spawnSync('.venv/bin/python',['scripts/detect-speech-pauses.py','--clocked-wav',audio.wav],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(vad.status===0){try{speechGaps=speechPauseGaps(JSON.parse(vad.stdout));}catch{}}
 }
 const candidates=[...gaps,...speechGaps].sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const gap of candidates){const last=merged.at(-1);if(last&&gap[0]<=last[1])last[1]=Math.max(last[1],gap[1]);else merged.push([...gap]);}
 const segments=assertPauseWordSafety(c,pauseSegments(c,merged,words),words);
 // Entirely quiet source is kept for review rather than silently discarded.
 if(segments.length&&!(segments.length===1&&Math.abs(segments[0].inSec-c.inSec)<.03&&Math.abs(segments[0].outSec-c.outSec)<.03))plan.push({id:c.id,segments});
}fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR||PUBLIC,'trim-silence.json'),JSON.stringify({plan,warnings,independentWordProtection:independent.map(s=>({src:s.src,sourceSha256:s.sourceSha256,wordCount:s.words.length,repairPasses:s.repairPasses?.length??0})),sourceClocks:[...sources].map(([src,a])=>({src,...a.receipt,wavRetained:false}))},null,2));console.log(`PROGRESS:100:已完成 ${plan.length} 段原片的停顿剪辑`);
}finally{fs.rmSync(audioDir,{recursive:true,force:true});}
