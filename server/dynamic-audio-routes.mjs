import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {dynamicAssetProbeBinary,validateDynamicAssetSource,probeDynamicAsset} from './dynamic-asset-routes.mjs';

const RATE=16000,MAX_SECONDS=600,FORMATS='wav,aiff,mp3,flac,ogg,mov,matroska,webm,avi';
const fail=(status,message)=>Object.assign(Error(message),{status});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
const digest=value=>createHash('sha256').update(value).digest('hex');
export const dynamicAudioAnalysisVersion='pcm16-source-zero-waveform-v1';
export function dynamicAudioFfmpegBinary(ROOT){
 if(process.env.KOUBO_FFMPEG)return process.env.KOUBO_FFMPEG;
 const local=path.join(ROOT,'.tools','bin','ffmpeg');if(fs.existsSync(local))return local;
 const bundled=path.join(ROOT,'node_modules','@remotion');
 const found=fs.existsSync(bundled)?fs.readdirSync(bundled).filter(n=>n.startsWith('compositor-')).map(n=>path.join(bundled,n,'ffmpeg')).filter(fs.existsSync):[];
 return found.length===1?found[0]:'ffmpeg';
}
function environment(binary){const directory=path.dirname(binary);return {...process.env,DYLD_LIBRARY_PATH:directory+(process.env.DYLD_LIBRARY_PATH?path.delimiter+process.env.DYLD_LIBRARY_PATH:''),LD_LIBRARY_PATH:directory+(process.env.LD_LIBRARY_PATH?path.delimiter+process.env.LD_LIBRARY_PATH:'')};}
/** Bound stdout and duration; decoder input is only the inherited checked fd. */
function localRun(command,args,options){
 return new Promise(resolve=>{
  const {maxBytes=1024*1024,...opts}=options,child=spawn(command,args,opts),parts=[];let bytes=0,stderr='',settled=false,overflow=false;
  const finish=value=>{if(!settled){settled=true;resolve(value);}};
  child.stdout.on('data',part=>{bytes+=part.length;if(bytes>maxBytes){overflow=true;child.kill('SIGKILL');}else parts.push(part);});
  child.stderr.on('data',part=>{stderr=(stderr+part).slice(-2000);});
  child.once('error',()=>finish({code:1,stdout:Buffer.concat(parts),stderr}));
  child.once('close',code=>finish({code:overflow?1:code,stdout:Buffer.concat(parts),stderr}));
 });
}
const rational=value=>{
 if(value===undefined||value===null||value==='N/A')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?(?:\/\d+)?$/.test(value))return null;
 const [a,b]=value.split('/').map(Number),result=b===undefined?a:a/b;return Number.isFinite(result)?result:null;
};
function streamStart(stream){
 const pts=rational(stream?.start_pts),base=rational(stream?.time_base);
 if(pts!==null&&base!==null)return pts*base;
 return rational(stream?.start_time);
}
export async function probeDynamicAudioClock(handle,{ROOT,run=localRun}){
 const binary=dynamicAssetProbeBinary(ROOT),input=process.platform==='win32'?'pipe:3':'/dev/fd/3';
 const result=await run(binary,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',FORMATS,'-show_streams','-show_format','-of','json',input],{cwd:ROOT,env:environment(binary),stdio:['ignore','pipe','pipe',handle.fd],timeout:20000,maxBytes:1024*1024});
 if(result.code!==0)throw fail(422,'无法读取本地音轨；不支持播放列表或外部引用。');
 let data;try{data=JSON.parse(String(result.stdout));}catch{throw fail(422,'本地音轨元数据无效。');}
 const audio=data.streams?.find(s=>s.codec_type==='audio'),video=data.streams?.find(s=>s.codec_type==='video');
 if(!audio||!Number.isInteger(audio.index)||!Number.isInteger(audio.channels)||audio.channels<1)throw fail(422,'素材没有可分析的真实音轨。');
 const containerStart=rational(data.format?.start_time)??0,sourceOriginSec=video?streamStart(video):containerStart,audioFirstPtsSec=streamStart(audio)??(!video?containerStart:null),containerDurationSec=rational(data.format?.duration);
 if(sourceOriginSec===null||audioFirstPtsSec===null||!finite(sourceOriginSec)||!finite(audioFirstPtsSec)||Math.abs(sourceOriginSec)>86400||Math.abs(audioFirstPtsSec)>86400)throw fail(422,'音轨缺少可靠的源时间原点。');
 if(containerDurationSec!==null&&containerDurationSec>MAX_SECONDS+.1)throw fail(422,'独立音频比较首版仅分析10分钟内的本地素材。');
 return {basis:video?'first-video-pts':'container-start',sourceOriginSec,audioFirstPtsSec,audioOffsetMs:(audioFirstPtsSec-sourceOriginSec)*1000,audioStreamIndex:audio.index,originalChannels:audio.channels};
}
/** FFmpeg's portable WAV muxer writes unknown RIFF/data lengths to a pipe.
 * Walk real RIFF chunks; accept only mono PCM16/16k, never guess an audio offset. */
export function pcmFromDynamicAudioWav(bytes){
 const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes??[]);
 if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw fail(422,'解码器未返回有效PCM WAVE音轨。');
 const size=b.readUInt32LE(4);if(size!==0xffffffff&&size+8!==b.length)throw fail(422,'PCM WAVE容器长度不完整。');
 let at=12,format=false,pcm=null;
 while(at+8<=b.length){
  const tag=b.toString('ascii',at,at+4),declared=b.readUInt32LE(at+4),from=at+8,length=declared===0xffffffff&&tag==='data'?b.length-from:declared,to=from+length;
  if(to>b.length)throw fail(422,'PCM WAVE分块不完整。');
  if(tag==='fmt '){if(format||length<16||b.readUInt16LE(from)!==1||b.readUInt16LE(from+2)!==1||b.readUInt32LE(from+4)!==RATE||b.readUInt32LE(from+8)!==RATE*2||b.readUInt16LE(from+12)!==2||b.readUInt16LE(from+14)!==16)throw fail(422,'需要真实单声道16k PCM16音轨。');format=true;}
  if(tag==='data'){if(pcm||!format||!length||length%2)throw fail(422,'PCM采样分块无效。');pcm=b.subarray(from,to);}
  at=to+(length%2);if(at===b.length+1&&length%2)throw fail(422,'PCM WAVE填充分块不完整。');
 }
 if(!format||!pcm||at!==b.length||pcm.length/2>MAX_SECONDS*RATE)throw fail(422,'PCM WAVE采样不完整或超过10分钟。');return pcm;
}
export async function decodeDynamicAudioPcm(handle,clock,{ROOT,run=localRun}){
 const binary=dynamicAudioFfmpegBinary(ROOT),input=process.platform==='win32'?'pipe:3':'/dev/fd/3',filter=`asetpts=PTS-(${clock.sourceOriginSec})/TB,aresample=${RATE}:first_pts=0`;
 const result=await run(binary,['-nostdin','-hide_banner','-loglevel','error','-copyts','-protocol_whitelist','file,pipe','-format_whitelist',FORMATS,'-i',input,'-map',`0:${clock.audioStreamIndex}`,'-vn','-sn','-dn','-af',filter,'-ac','1','-ar',String(RATE),'-c:a','pcm_s16le','-t',String(MAX_SECONDS+.1),'-f','wav','pipe:1'],{cwd:ROOT,env:environment(binary),stdio:['ignore','pipe','pipe',handle.fd],timeout:60000,maxBytes:Math.ceil((MAX_SECONDS+.11)*RATE)*2+65536});
 if(result.code!==0)throw fail(422,'无法完整解码音轨；本地FFmpeg需要WAVE、PCM16、asetpts和aresample支持。');
 return pcmFromDynamicAudioWav(result.stdout);
}
/** Values are derived from every actual PCM sample, without per-row normalization. */
export function dynamicAudioWaveform(pcm,{startMs,endMs,bins=256}){
 if(!Buffer.isBuffer(pcm)||!pcm.length||pcm.length%2||![startMs,endMs].every(finite)||startMs<0||endMs<=startMs||!Number.isInteger(bins)||bins<16||bins>1024)throw fail(400,'请指定有效的音频片段与16—1024个波形采样格。');
 const sampleCount=pcm.length/2,startSample=Math.round(startMs*RATE/1000),endSample=Math.round(endMs*RATE/1000);
 if(startSample<0||endSample>sampleCount||endSample-startSample<16||endSample-startSample>60*RATE)throw fail(400,'比较片段须在真实音轨内，长度不超过60秒。');
 const count=Math.min(bins,endSample-startSample),waveform=[];
 for(let i=0;i<count;i++){
  const from=startSample+Math.floor((endSample-startSample)*i/count),to=startSample+Math.floor((endSample-startSample)*(i+1)/count);let min=1,max=-1,squares=0;
  for(let sample=from;sample<to;sample++){const value=pcm.readInt16LE(sample*2)/32768;min=Math.min(min,value);max=Math.max(max,value);squares+=value*value;}
  waveform.push({startSample:from,endSample:to,min,max,rms:Math.sqrt(squares/(to-from))});
 }
 return {sampleRate:RATE,channels:1,sampleCount,durationMs:sampleCount/RATE*1000,pcmSha256:digest(pcm),range:{startSample,endSample,startMs:startSample/RATE*1000,endMs:endSample/RATE*1000},bins:waveform};
}
export function createDynamicAudioRoute({ROOT,PUBLIC,json,run=localRun,probe=probeDynamicAudioClock,decode=decodeDynamicAudioPcm,assetProbe=probeDynamicAsset}){
 async function read(src,{startMs,endMs,bins=256}={},materialize=false){
  if(![startMs,endMs].every(finite)||startMs<0||endMs<=startMs||endMs-startMs>60000||!Number.isInteger(bins)||bins<16||bins>1024)throw fail(400,'请明确选择两个真实音频片段；单段不超过60秒。');
  const source=validateDynamicAssetSource(src,{ROOT,PUBLIC});let handle;
  try{
   handle=await fs.promises.open(source.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));const opened=await handle.stat({bigint:true});
   if(!opened.isFile()||stamp(opened)!==stamp(source.stat))throw fail(409,'音频在校验期间发生变化，请重新读取。');
   const check=async()=>{const now=validateDynamicAssetSource(src,{ROOT,PUBLIC}),held=await handle.stat({bigint:true});if(now.file!==source.file||stamp(now.stat)!==stamp(opened)||stamp(held)!==stamp(opened))throw fail(409,'音频在分析期间发生变化，请重新读取。');};
   const hash=createHash('sha256');let bytes=0n;for await(const part of handle.createReadStream({start:0,autoClose:false})){hash.update(part);bytes+=BigInt(part.length);}if(bytes!==opened.size)throw fail(409,'音频在读取期间发生变化。');await check();
   const sourceSha256=hash.digest('hex'),clock=await probe(handle,{ROOT,run});await check();const pcm=await decode(handle,clock,{ROOT,run});await check();
   const waveform=dynamicAudioWaveform(pcm,{startMs,endMs,bins}),payload={version:1,method:dynamicAudioAnalysisVersion,src,sha256:sourceSha256,sourceClock:'source-zero-ms',clock,...waveform},analysis={...payload,analysisSha256:digest(JSON.stringify(payload))};
   if(!materialize)return analysis;
   if(clock.basis!=='first-video-pts')throw fail(422,'A/B工作台首版只使用项目内带实际音轨的视频。');
   const metadata=await assetProbe(handle,{ROOT,run});await check();if(metadata.kind!=='video')throw fail(422,'请选择带实际音轨的视频。');
   const sourceIdentity={src,sha256:sourceSha256,...metadata},segment=pcm.subarray(waveform.range.startSample*2,waveform.range.endSample*2),header=Buffer.alloc(44);
   header.write('RIFF');header.writeUInt32LE(36+segment.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(RATE,24);header.writeUInt32LE(RATE*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(segment.length,40);const wav=Buffer.concat([header,segment]);
   const directory=path.join(source.publicRoot,'derived-audio');await fs.promises.mkdir(directory,{recursive:true});if((await fs.promises.lstat(directory)).isSymbolicLink()||await fs.promises.realpath(directory)!==directory)throw fail(400,'本地衍生音轨目录必须是项目内的普通目录。');
   const name=sourceSha256+'-'+analysis.analysisSha256+'.wav',file=path.join(directory,name),wavSha=digest(wav);
   const temporary=path.join(directory,'.'+name+'.'+randomUUID()+'.tmp');
   try{
    await fs.promises.writeFile(temporary,wav,{flag:'wx',mode:0o600});
    // link publishes a fully written inode without ever overwriting an existing
    // content address. Interrupted writes can only leave an ignored temp file.
    try{await fs.promises.link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}
    const held=await fs.promises.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));try{const stat=await held.stat();if(!stat.isFile()||stat.size!==wav.length||digest(await held.readFile())!==wavSha)throw fail(409,'同名衍生音轨内容已变化，请重新分析。');}finally{await held.close();}
   }finally{await fs.promises.unlink(temporary).catch(()=>{});} 
   await check();
   return {analysis,sourceIdentity,playbackAsset:{src:'derived-audio/'+name,sha256:wavSha,kind:'audio',segmentPcmSha256:digest(segment),sourceSha256,analysisSha256:analysis.analysisSha256,sourceStartMs:waveform.range.startMs,sourceEndMs:waveform.range.endMs,sampleCount:segment.length/2,sampleRate:RATE,channels:1,durationMs:segment.length/2/RATE*1000}};
  }catch(error){if(error.status)throw error;throw fail(422,'无法安全分析本地音轨，请重新选择可解码的文件。');}finally{await handle?.close();}
 }
 const analyze=(src,range)=>read(src,range,false),materialize=(src,range)=>read(src,range,true);
 async function route(req,res,url){
  const material=url.pathname==='/api/dynamic-audio/materialize';if(url.pathname!=='/api/dynamic-audio'&&!material)return false;
  if(req.method!==(material?'POST':'GET')){json(res,405,{error:material?'请明确提交本地视频音轨分析。':'本地波形接口只支持读取。'});return true;}
  const keys=['src','startMs','endMs','bins'];
  if([...url.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>url.searchParams.getAll(k).length>(k==='bins'?1:1))||['src','startMs','endMs'].some(k=>url.searchParams.getAll(k).length!==1)){json(res,400,{error:'请提供唯一素材和明确片段起止时间。'});return true;}
  const number=k=>{const value=url.searchParams.get(k);return typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)?Number(value):NaN;};
  try{json(res,200,await (material?materialize:analyze)(url.searchParams.get('src'),{startMs:number('startMs'),endMs:number('endMs'),bins:url.searchParams.has('bins')?number('bins'):256}));}catch(error){json(res,error.status??422,{error:error.message});}
  return true;
 }
 return {route,analyze,materialize};
}
