import {pauseSegments} from './pause-plan.mjs';
// Acoustic pause cutting is local and does not need a speech model or API key.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const {clips,captions=[]}=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!clips?.length)throw Error('时间轴没有视频');
const plan=[];for(const [i,c]of clips.entries()){
 console.log(`PROGRESS:${Math.round(i/clips.length*90)}:检测停顿 ${i+1}/${clips.length}`);
 const r=spawnSync('ffmpeg',['-hide_banner','-i',path.join('public',c.src),'-af','silencedetect=noise=-42dB:d=0.65','-f','null','-'],{encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error('停顿检测失败：'+(r.stderr??r.error?.message??'').slice(-220));
 const gaps=[];let start=null;for(const line of r.stderr.split('\n')){const a=line.match(/silence_start: ([\d.]+)/),b=line.match(/silence_end: ([\d.]+)/);if(a)start=+a[1];if(b&&start!==null){gaps.push([start,+b[1]]);start=null;}}if(start!==null)gaps.push([start,c.sourceDurationSec]);
 let words=[];try{words=JSON.parse(fs.readFileSync(path.join('public/clips/transcripts',path.basename(c.src).replace(/\.[^.]+$/,'')+'.json'),'utf8'));}catch{}
 if(!words.length)words=captions.filter(cap=>cap.clipId===c.id).flatMap(cap=>cap.words??[]).sort((a,b)=>a.startMs-b.startMs);
 const segments=pauseSegments(c,gaps,words);
 // Entirely quiet source is kept for review rather than silently discarded.
 if(segments.length&&!(segments.length===1&&Math.abs(segments[0].inSec-c.inSec)<.03&&Math.abs(segments[0].outSec-c.outSec)<.03))plan.push({id:c.id,segments});
}fs.writeFileSync(path.join(process.env.KOUBO_OUTPUT_DIR||'public','trim-silence.json'),JSON.stringify({plan},null,2));console.log(`PROGRESS:100:已完成 ${plan.length} 段原片的停顿剪辑`);
