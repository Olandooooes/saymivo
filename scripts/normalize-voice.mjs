// Non-destructive two-pass loudness normalisation. No speech synthesis or timing edits.
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const [source,output,reportFile]=process.argv.slice(2);
if(!source||!output){console.error('Usage: node scripts/normalize-voice.mjs input.mov output.mp4 [report.json]');process.exit(1);}
if(path.resolve(source)===path.resolve(output))throw Error('输出不可覆盖原片');
if(fs.existsSync(output))throw Error('输出已存在，请使用新的文件名');
const ffmpeg=fs.existsSync('.tools/bin/ffmpeg')?'.tools/bin/ffmpeg':'ffmpeg';
const run=args=>{const r=spawnSync(ffmpeg,['-hide_banner','-nostdin',...args],{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stderr?.slice(-1500)||String(r.error));return r.stderr;};
const stats=log=>{const matches=[...log.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];if(!matches.length)throw Error('没有检测到可用的音频响度');const result=JSON.parse(matches.at(-1)[0]);if(!Number.isFinite(Number(result.input_i)))throw Error('静音素材不能进行人声归一化');return result;};
const analysis=stats(run(['-i',source,'-vn','-af','loudnorm=I=-16:TP=-2.0:LRA=11:print_format=json','-f','null','-']));
const videoProbe=JSON.parse(spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,avg_frame_rate,duration','-of','json',source],{encoding:'utf8'}).stdout||'{}');
const videoStream=videoProbe.streams?.[0]??{};
const [rateNum,rateDen]=String(videoStream.avg_frame_rate||'').split('/').map(Number);
const videoFrames=Number(videoStream.nb_frames);
const videoDur=videoFrames>0&&rateNum>0&&rateDen>0?videoFrames*rateDen/rateNum:Number(videoStream.duration);
const trim=Number.isFinite(videoDur)&&videoDur>0?`,atrim=end=${videoDur.toFixed(6)},apad=whole_dur=${videoDur.toFixed(6)}`:'';
const filter=`loudnorm=I=-16:TP=-2.0:LRA=11:measured_I=${analysis.input_i}:measured_TP=${analysis.input_tp}:measured_LRA=${analysis.input_lra}:measured_thresh=${analysis.input_thresh}:offset=${analysis.target_offset}:linear=true:print_format=json${trim}`;
fs.mkdirSync(path.dirname(output),{recursive:true});
const temporary=output+'.part.mp4';
try{const applied=stats(run(['-i',source,'-map','0:v:0','-map','0:a:0','-c:v','copy','-af',filter,'-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart',temporary]));fs.renameSync(temporary,output);
 const report={source,output,target:{integratedLUFS:-16,truePeakDBTP:-2},analysis,applied,note:'保持视频码流及口述时间，不改变台词；真峰值目标 -2 dBTP，给 AAC 留余量。'};
 if(reportFile)fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){fs.rmSync(temporary,{force:true});throw e;}
