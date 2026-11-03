import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

// A deliberately narrow, measured encoder contract. Updating a dependency or
// platform requires a new ADTS/direct-MP4 calibration, not a guessed AAC delay.
// The installed stripped ffprobe writes FF_PROFILE_AAC_LOW as "1".
const audited={version:'4.0.380',platform:'darwin-arm64',delay:2048,rate:48000,
 ffmpeg:'bdab41e23ecd1c16ce3330318993c633ed6a52a1cf489e589866937e776be319',
 ffprobe:'1da19b94c960aa3f14ca5f0b2dfa599cde2f94298a68a1a26c6e593b6e92d132',
 config:'71cf9f68df1bfb7967168aa405fadc772236eaf855a76718ca8aa88689cb2f70',
 files:{'compress-audio.js':'d91c6e4ccc4702b2ef74b7d5f105dd66cd2042d69a0cb829603e1cb0a129f0d8','create-audio.js':'936088940ec118adfcb931ec70bada5c367476e6eb1f737d79da3910c415bbc9','stitch-frames-to-video.js':'82a2495a6cf97943c60f31b0a35719849a68e5d640710c9da5043020c02253e6','sample-rate.js':'7e9082b462b0dc1ce9ee23fba036db7a1cbdc911123549d630afcdb58efeb816','options/audio-codec.js':'29e75127ca2872cc772c9c2f30557886435f86622bfaf0dd972722bd191a39b6','call-ffmpeg.js':'decee777d79f60b32a1a361f72c4653d2b1954d4ef17807e0b466f675f710524'}};
const digest=b=>createHash('sha256').update(b).digest('hex');
const fail=message=>Object.assign(Error(message),{code:'EXPORT_AUDIO_FINALIZATION'});
const check=(ok,message)=>{if(!ok)throw fail(message);};
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
const json=value=>JSON.stringify(value);
const shaPattern=/^SHA256:[a-f0-9]{64}$/i;
const abort=signal=>{if(signal?.aborted)throw fail('音频收尾已取消；原始渲染文件已保留。');};

async function hashFile(file){
 const handle=await fs.promises.open(file,'r');try{return await hashHandle(handle);}finally{await handle.close();}
}
async function hashHandle(handle){
 const h=createHash('sha256');for await(const b of handle.createReadStream({start:0,autoClose:false}))h.update(b);return h.digest('hex');
}
async function run(command,args,{env,stdio,signal,timeout=120000}={}){
 abort(signal);
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env,stdio:stdio??['ignore','pipe','pipe']});let stdout=[],size=0,stderr='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>{child.kill('SIGKILL');finish(fail('音频收尾已取消；原始渲染文件已保留。'));};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(fail('音频收尾超时；原始渲染文件已保留。'));},timeout);
  signal?.addEventListener('abort',cancel,{once:true});
  child.stdout.on('data',b=>{size+=b.length;if(size>64*1024*1024){child.kill('SIGKILL');finish(fail('音频包验证记录超出安全容量。'));}else stdout.push(b);});
  child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-4000);});
  child.once('error',e=>finish(fail('无法启动音频收尾工具：'+e.message)));
  child.once('close',code=>finish(code===0?null:fail('音频收尾工具失败：'+stderr),Buffer.concat(stdout).toString('utf8')));
 });
}
const rational=(n,t)=>{check(Number.isSafeInteger(n),'音视频包时间戳无效。');const [a,b]=t.split('/').map(BigInt);check(a>0n&&b>0n,'音视频包时间基无效。');return [BigInt(n)*a,b];};
function sameTime(a,at,b,bt,shift=0){const [an,ad]=rational(a,at),[bn,bd]=rational(b,bt);return (an*bd-bn*ad)*48000n===BigInt(shift)*ad*bd;}

export function exactPictureSamples(stream){
 // ffprobe's decimal duration is rounded to six places: 61/30 seconds becomes
 // 2.033333 and would falsely reject a valid 97,600-sample picture duration.
 check(Number.isSafeInteger(stream?.duration_ts)&&typeof stream.time_base==='string','视频缺少精确时间基时长。');
 const [n,d]=rational(stream.duration_ts,stream.time_base),samples=n*48000n;
 check(samples>0n&&samples%d===0n&&samples/d<=BigInt(Number.MAX_SAFE_INTEGER),'视频时长不能精确映射48k音频。');return Number(samples/d);
}

/** Actual coded payloads, every timestamp and duration; no tolerance/gain fit. */
export function verifyFinalizedPackets(raw,candidate){
 const result={};
 for(const kind of ['video','audio']){
  const s=raw.streams?.filter(s=>s.codec_type===kind),t=candidate.streams?.filter(s=>s.codec_type===kind);
  check(s?.length===1&&t?.length===1,'收尾必须保留唯一音轨和视频轨。');const a=s[0],b=t[0];
  for(const k of ['codec_name','profile','width','height','sample_rate','channels','channel_layout','pix_fmt','r_frame_rate','avg_frame_rate'])check(a[k]===b[k],`收尾改变了${kind}轨格式：${k}`);
  check(shaPattern.test(a.extradata_hash)&&a.extradata_hash===b.extradata_hash,'收尾改变了编解码器配置。');
  const ap=raw.packets.filter(p=>p.stream_index===a.index),bp=candidate.packets.filter(p=>p.stream_index===b.index);
  check(ap.length>0&&ap.length===bp.length,'收尾丢失或增加了音视频包。');
  for(let i=0;i<ap.length;i++){
   check(shaPattern.test(ap[i].data_hash)&&ap[i].data_hash===bp[i].data_hash&&ap[i].size===bp[i].size,`收尾改变了${kind}第${i}包内容。`);
   for(const k of ['pts','dts'])check(sameTime(ap[i][k],a.time_base,bp[i][k],b.time_base,kind==='audio'?audited.delay:0),`收尾改变了${kind}第${i}包${k}。`);
   check(sameTime(ap[i].duration,a.time_base,bp[i].duration,b.time_base),`收尾改变了${kind}第${i}包时长。`);
  }
  if(kind==='audio'){
   const skip=bp[0].side_data_list?.find(s=>s.side_data_type==='Skip Samples');
   check(skip?.skip_samples===audited.delay&&skip.discard_padding===0,'收尾没有准确表达编码器起始填充。');
   check(bp.slice(1).every(p=>!p.side_data_list?.some(s=>s.side_data_type==='Skip Samples'&&(s.skip_samples||s.discard_padding))),'收尾出现额外音频裁切。');
  }
  result[kind]={packets:ap.length,packetSequenceSha256:digest(ap.map(p=>p.data_hash).join('\n')),extradataSha256:a.extradata_hash,timeBase:a.time_base,firstPtsBefore:ap[0].pts,firstPtsAfter:bp[0].pts};
 }
 check(raw.streams.length===2&&candidate.streams.length===2,'不支持额外媒体轨的音频收尾。');return result;
}
async function wavData(file){
 const h=await fs.promises.open(file,'r');try{
  const size=(await h.stat()).size,header=Buffer.alloc(12);await h.read(header,0,12,0);check(header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WAVE','音频校验未生成标准PCM WAV。');
  let offset=12,fmt,data;while(offset+8<=size){const b=Buffer.alloc(8);await h.read(b,0,8,offset);const n=b.readUInt32LE(4),id=b.toString('ascii',0,4);check(offset+8+n<=size,'PCM校验文件不完整。');
   if(id==='fmt '){check(n>=16&&n<=65536,'PCM格式块无效。');const f=Buffer.alloc(16);await h.read(f,0,16,offset+8);fmt={format:f.readUInt16LE(0),channels:f.readUInt16LE(2),rate:f.readUInt32LE(4),bits:f.readUInt16LE(14)};}
   if(id==='data')data={offset:offset+8,length:n};offset+=8+n+(n%2);
  }
  check(fmt?.format===1&&fmt.channels===2&&fmt.rate===audited.rate&&fmt.bits===16&&data&&data.length%4===0,'PCM校验格式不匹配。');return {...data,handle:h};
 }catch(e){await h.close();throw e;}
}
async function comparePcm(rawWav,nextWav,pictureSamples,signal){
 const a=await wavData(rawWav);let b;try{
  b=await wavData(nextWav);const skip=audited.delay*4;
  check(a.length-skip===b.length&&b.length/4>=pictureSamples,'收尾的音频采样覆盖不完整。');
  const tail=b.length/4-pictureSamples;check(Number.isSafeInteger(tail)&&tail>=0&&tail<1024,'收尾的编码尾部填充不符合已核链。');
  const h=createHash('sha256');let pos=0;
  while(pos<b.length){abort(signal);const len=Math.min(1024*1024,b.length-pos),x=Buffer.allocUnsafe(len),y=Buffer.allocUnsafe(len);const xr=await a.handle.read(x,0,len,a.offset+skip+pos),yr=await b.handle.read(y,0,len,b.offset+pos);check(xr.bytesRead===len&&yr.bytesRead===len&&x.equals(y),'收尾PCM不等于原解码去编码填充后的完整序列。');h.update(y);pos+=len;}
  return {rate:audited.rate,channels:2,skippedSamples:audited.delay,rawSamples:a.length/4,finalSamples:b.length/4,pictureSamples,tailPaddingSamples:tail,identicalRawAfterSkip:true,pcmSha256:h.digest('hex')};
 }finally{await a.handle.close();await b?.handle.close();}
}

/** Private in-process producer receipts. No HTTP body may mint an encoder proof. */
export function createExportAudioFinalizer({ROOT,EXPORTS,runCommand=run}={}){
 const receipts=new WeakMap();
 async function chain(){
  const renderer=path.join(ROOT,'node_modules/@remotion/renderer'),binaryDir=path.join(ROOT,'node_modules/@remotion/compositor-'+audited.platform);
  check(process.platform+'-'+process.arch===audited.platform,'此编码工具链尚未完成音频填充校准；原始文件已保留。');
  for(const pkg of ['renderer','cli','compositor-'+audited.platform])check(JSON.parse(await fs.promises.readFile(path.join(ROOT,'node_modules/@remotion',pkg,'package.json'),'utf8')).version===audited.version,'Remotion版本已变化，不能套用旧编码填充。');
  const actual={version:audited.version,ffmpeg:await hashFile(path.join(binaryDir,'ffmpeg')),ffprobe:await hashFile(path.join(binaryDir,'ffprobe')),config:await hashFile(path.join(ROOT,'remotion.config.ts')),files:{}};
  for(const [file,expected]of Object.entries(audited.files)){actual.files[file]=await hashFile(path.join(renderer,'dist',file));check(actual.files[file]===expected,'Remotion音频实现已变化，不能套用旧编码填充。');}
  check(actual.ffmpeg===audited.ffmpeg&&actual.ffprobe===audited.ffprobe&&actual.config===audited.config,'编码器或导出配置尚未完成音频填充校准。');
  return {...actual,binaryDir};
 }
 async function captureRender({args,outFile,propsFile}){
  const proof={};let receipt;
  try{
   const exportsReal=await fs.promises.realpath(EXPORTS);check(path.dirname(path.resolve(outFile))===exportsReal&&/^edited-[\w-]+\.mp4$/.test(path.basename(outFile)),'导出收尾文件不在当前导出目录。');
   check(args[0]==='remotion'&&args[1]==='render'&&args[2]==='MultiClip'&&args[3]===outFile&&args.includes('--props='+propsFile),'无法确认实际Remotion导出调用。');
   check(args.slice(4).every(a=>/^--(?:props=|concurrency=\d+$|x264-preset=(?:veryfast|ultrafast)$|offthreadvideo-cache-size-in-bytes=\d+$|scale=0\.5$)/.test(a)),'导出参数已改变音频链，不能自动套用编码填充。');
   receipt={outFile,exportsReal,propsFile,propsSha256:await hashFile(propsFile),chain:await chain(),args:[...args]};
  }catch(e){receipt={error:e.message};}
  receipts.set(proof,receipt);return proof;
 }
 async function finalizeCompleted({proof,expectedRawSha256,signal,onProgress}={}){
  const r=receipts.get(proof);check(r&&!r.error,r?.error??'缺少当前本机导出的编码链证明。');receipts.delete(proof);abort(signal);
  check(json(await chain())===json(r.chain),'编码工具在渲染期间已变化。');
  check(await hashFile(r.propsFile)===r.propsSha256,'渲染快照在导出期间已变化。');
  const lstat=await fs.promises.lstat(r.outFile,{bigint:true});check(lstat.isFile()&&!lstat.isSymbolicLink()&&await fs.promises.realpath(r.outFile)===r.outFile,'导出原文件身份无效。');
  const h=await fs.promises.open(r.outFile,'r');let secondInput,temporary,published,publishedProof;
  try{
   const before=stamp(await h.stat({bigint:true})),rawSha256=await hashHandle(h);check(before===stamp(lstat),'导出原文件读取期间已变化。');
   // Two FFmpeg inputs must have separate open descriptions: duplicated /dev/fd
   // descriptors share seek positions on macOS and can otherwise lose packets.
   secondInput=await fs.promises.open(r.outFile,'r');check(before===stamp(await secondInput.stat({bigint:true})),'导出第二输入身份已变化。');
   if(expectedRawSha256)check(rawSha256===expectedRawSha256,'实际导出文件与指定快照SHA不匹配。');
   const env={...process.env,DYLD_LIBRARY_PATH:r.chain.binaryDir},ffmpeg=path.join(r.chain.binaryDir,'ffmpeg'),ffprobe=path.join(r.chain.binaryDir,'ffprobe');
   const common={env,signal,stdio:['ignore','pipe','pipe',h.fd]};
   const probe=async(input,opts=common)=>JSON.parse(await runCommand(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov','-show_packets','-show_streams','-show_format','-show_data_hash','sha256','-of','json',input],opts));
   const raw=await probe('/dev/fd/3'),a=raw.streams?.filter(s=>s.codec_type==='audio'),v=raw.streams?.filter(s=>s.codec_type==='video');
   check(v?.length===1,'导出缺少唯一视频轨。');
   async function stable(){abort(signal);check(before===stamp(await h.stat({bigint:true}))&&before===stamp(await secondInput.stat({bigint:true}))&&before===stamp(await fs.promises.lstat(r.outFile,{bigint:true}))&&rawSha256===await hashHandle(h),'音频收尾期间原始导出已变化。');}
   if(a?.length===0){await stable();return {status:'no-audio',file:path.basename(r.outFile),rawSha256};}
   check(a?.length===1&&raw.streams.length===2,'暂不支持多音轨或额外轨的自动收尾。');
   check(a[0].codec_name==='aac'&&['LC','1'].includes(a[0].profile)&&a[0].sample_rate==='48000'&&a[0].channels===2,'实际音轨不是已校准的48k立体声AAC LC。');
   const packets=raw.packets.filter(p=>p.stream_index===a[0].index),first=packets[0],skip=first?.side_data_list?.find(d=>d.side_data_type==='Skip Samples');
   if(skip?.skip_samples===2048&&first.pts===-2048&&a[0].time_base==='1/48000'&&skip.discard_padding===0){await stable();return {status:'already-timed',file:path.basename(r.outFile),rawSha256};}
   check(first?.pts===0&&first.dts===0&&Number(a[0].start_time)===0&&!packets.some(p=>p.side_data_list?.some(d=>d.side_data_type==='Skip Samples'&&(d.skip_samples||d.discard_padding))),'实际音轨已有偏移或裁切表达，拒绝重复补偿。');
   check(v[0].codec_name==='h264','实际视频不是已校准导出链的H264。');
   const pictureSamples=exactPictureSamples(v[0]);
   temporary=await fs.promises.mkdtemp(path.join(r.exportsReal,'.audio-finalize-'));const candidate=path.join(temporary,'candidate.mp4');
   onProgress?.('正在校验音画同步');
   await runCommand(ffmpeg,['-hide_banner','-protocol_whitelist','file,pipe','-f','mov','-i','/dev/fd/3','-itsoffset','-0.04266666666666667','-protocol_whitelist','file,pipe','-f','mov','-i','/dev/fd/4','-map','0:v:0','-map','1:a:0','-map_metadata','0','-c','copy','-avoid_negative_ts','disabled','-use_editlist','1','-movie_timescale','48000','-movflags','+faststart','-f','mp4','-n',candidate],{...common,stdio:['ignore','pipe','pipe',h.fd,secondInput.fd]});
   const next=await probe(candidate),packetProof=verifyFinalizedPackets(raw,next);
   const rawWav=path.join(temporary,'raw.wav'),nextWav=path.join(temporary,'final.wav');
   for(const [input,output]of [['/dev/fd/3',rawWav],[candidate,nextWav]])await runCommand(ffmpeg,['-hide_banner','-protocol_whitelist','file,pipe','-f','mov','-i',input,'-map','0:a:0','-c:a','pcm_s16le','-ar','48000','-ac','2','-threads','1','-n',output],common);
   const pcmProof=await comparePcm(rawWav,nextWav,pictureSamples,signal);await stable();check(json(await chain())===json(r.chain),'编码工具在收尾期间已变化。');
   const candidateSha256=await hashFile(candidate),name=path.basename(r.outFile,'.mp4')+'-final.mp4',destination=path.join(r.exportsReal,name);
   const report={version:1,status:'finalized',createdAt:new Date().toISOString(),rawFile:path.basename(r.outFile),file:name,rawSha256,sha256:candidateSha256,propsSha256:r.propsSha256,encoderChain:r.chain,delaySamples:audited.delay,movieTimescale:48000,packetProof,pcmProof,rawDurationSec:Number(raw.format.duration),durationSec:Number(next.format.duration)};
   // link is atomic and fails if a previous final exists. Keep raw forever.
   abort(signal);await fs.promises.writeFile(path.join(temporary,'proof.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});abort(signal);await fs.promises.link(candidate,destination);published=destination;
   abort(signal);await fs.promises.link(path.join(temporary,'proof.json'),destination+'.audio-proof.json');publishedProof=destination+'.audio-proof.json';abort(signal);
   return {...report,proofFile:name+'.audio-proof.json'};
  }catch(e){if(publishedProof)await fs.promises.rm(publishedProof,{force:true});if(published)await fs.promises.rm(published,{force:true});throw e;}
  finally{await h.close();await secondInput?.close();if(temporary)await fs.promises.rm(temporary,{recursive:true,force:true});}
 }
 return {captureRender,finalizeCompleted};
}

/** Shared by the actual render close handler: no ready URL before verification. */
export async function finishRenderedExportAudio({finalizer,proof,onState}){
 onState({status:'running',progress:99,label:'正在校验音画同步'});
 let state;
 try{
  const f=await finalizer.finalizeCompleted({proof});
  state={status:'done',progress:100,file:`/exports/${f.file}`,audioFinalization:{status:f.status,rawSha256:f.rawSha256,sha256:f.sha256,proofFile:f.proofFile}};
 }catch(e){state={status:'error',error:`音频同步收尾未通过，原始渲染已保留：${e instanceof Error?e.message:'请重试导出。'}`};}
 onState(state);return state;
}
