import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const final=new Set(['done','error','cancelled']);
const save=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
const hash=file=>new Promise((resolve,reject)=>{const h=createHash('sha256'),s=fs.createReadStream(file);s.on('error',reject);s.on('data',b=>h.update(b));s.on('end',()=>resolve(h.digest('hex')));});
export function validateMatteRequest(value,{PUBLIC}={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.src!=='string'||!/^clips\/[\w.-]+\.mp4$/i.test(value.src)||value.src.includes('..'))throw Error('请选择素材库中的本地MP4原片。');
  const {src,startMs,endMs}=value,fps=value.fps??30;
  if(![startMs,endMs,fps].every(Number.isFinite)||startMs<0||endMs<=startMs||endMs-startMs>10000||!Number.isInteger(fps)||![24,25,30,50,60].includes(fps))throw Error('人物遮挡层每次生成最多10秒，请使用原片整数帧率。');
  if(value.sourceSha256!==undefined&&!/^[a-f0-9]{64}$/i.test(value.sourceSha256))throw Error('预期原片SHA格式无效。');
  let file,root;try{root=fs.realpathSync(path.join(PUBLIC,'clips'));file=fs.realpathSync(path.join(PUBLIC,src));}catch{throw Error('原片不存在。');}
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('原片不在素材库内。');
  return {src,startMs,endMs,fps,...(value.sourceSha256?{sourceSha256:value.sourceSha256.toLowerCase()}:{})};
}

function localProcess(command,args,{ROOT,env=process.env,signal,onLine=()=>{}}){
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();const grouped=process.platform!=='win32';
    const child=spawn(command,args,{cwd:ROOT,env,detached:grouped,stdio:['ignore','pipe','pipe']});let tail='',out='',pending='';
    const stop=()=>{try{if(grouped&&child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{}};
    signal.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',b=>{out+=b;pending+=b;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)onLine(line);});
    child.stderr.on('data',b=>tail=(tail+b).slice(-4000));
    child.once('error',e=>{signal.removeEventListener('abort',stop);reject(e);});
    child.once('close',code=>{signal.removeEventListener('abort',stop);if(signal.aborted)return reject(signal.reason??Error('已取消'));
      if(code!==0)return reject(Error('本机人物分离失败：'+(tail.match(/Cannot read source[^\n]*/)?.[0]??tail.trim().split('\n').filter(Boolean).at(-1)??`exit ${code}`).slice(0,260)));
      resolve(out);
    });
  });
}
export async function probeMatteSource(file,{ROOT,signal}){
  let binary=process.env.KOUBO_FFPROBE;
  if(!binary){
    const bundled=path.join(ROOT,'node_modules','@remotion');
    const candidates=fs.existsSync(bundled)?fs.readdirSync(bundled).filter(n=>n.startsWith('compositor-')).map(n=>path.join(bundled,n,'ffprobe')).filter(fs.existsSync):[];
    binary=candidates.length===1?candidates[0]:'ffprobe';
  }
  const directory=path.dirname(binary),env={...process.env,DYLD_LIBRARY_PATH:directory+(process.env.DYLD_LIBRARY_PATH?path.delimiter+process.env.DYLD_LIBRARY_PATH:''),LD_LIBRARY_PATH:directory+(process.env.LD_LIBRARY_PATH?path.delimiter+process.env.LD_LIBRARY_PATH:'')};
  const data=JSON.parse(await localProcess(binary,['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,start_time,duration:stream_tags=rotate:stream_side_data=rotation','-of','json',file],{ROOT,env,signal}));
  const stream=data.streams?.[0];if(!stream)throw Error('原片没有可读取的视频轨。');
  const [a,b]=String(stream.r_frame_rate).split('/').map(Number),nominalFps=a/b;
  if(![stream.width,stream.height,Number(stream.duration),Number(stream.start_time),nominalFps].every(Number.isFinite)||stream.width<=0||stream.height<=0)throw Error('原片缺少可靠尺寸、帧率或源时钟。');
  if(Number(stream.tags?.rotate??0)!==0||(stream.side_data_list??[]).some(s=>Number(s.rotation??0)!==0))throw Error('当前人物层需要无旋转元数据的源视频，请先在素材库转正。');
  return {width:stream.width,height:stream.height,durationSec:Number(stream.duration),sourceOriginSec:Number(stream.start_time),nominalFps};
}

export function validateMatteFrames({report,directory,input,source,sourceSha256,prefix}){
  const times=(report.sourceTimestamps??[]).map(n=>n*1000),count=Math.ceil(input.endMs/1000*input.fps-1e-6)-Math.floor(input.startMs/1000*input.fps+1e-6);
  if(report.count!==count||report.fps!==input.fps||times.length!==count||!times.every((n,i)=>Number.isFinite(n)&&n>=0&&(!i||n>times[i-1]))||!Number.isFinite(report.sourceOriginSec)||!Number.isFinite(source.sourceOriginSec)||Math.abs(report.sourceOriginSec-source.sourceOriginSec)>.002)throw Error('人物帧的源时间戳不完整或时钟不匹配。');
  if(times[0]>input.startMs+500/input.fps||times.at(-1)+1000/input.fps<input.endMs-500/input.fps)throw Error('人物帧未覆盖所请求的原片范围。');
  const coverage=report.alphaCoverage;
  if(!Array.isArray(coverage)||coverage.length!==count||coverage.some(n=>!Number.isFinite(n)||n<=.005||n>=.995))throw Error('部分帧没有可用的透明人物区域，请换一段清晰真人画面。');
  for(let i=0;i<count;i++){
    const file=path.join(directory,`frame-${String(i).padStart(5,'0')}.png`),fd=fs.openSync(file,'r'),header=Buffer.alloc(26);
    try{if(fs.readSync(fd,header,0,26,0)!==26||header.toString('hex',0,8)!=='89504e470d0a1a0a'||header.readUInt32BE(16)!==source.width||header.readUInt32BE(20)!==source.height||header[25]!==6)throw Error('人物帧不是与原片同尺寸的RGBA PNG。');}finally{fs.closeSync(fd);}
  }
  return {prefix,sourceStartMs:times[0],fps:input.fps,count,timesMs:times,src:input.src,sourceSha256,
    width:source.width,height:source.height,endMs:times.at(-1)+1000/input.fps};
}

export async function runPersonMatteJob({ROOT,PUBLIC,input,directory,assetDirectory,prefix,signal,onProgress,probe=probeMatteSource,nativeRun=localProcess}){
  if(process.platform!=='darwin')throw Error('本地人物分离目前需要macOS Apple Vision。');
  const file=path.join(PUBLIC,input.src);onProgress(.02,'验证原片SHA、尺寸与时钟');
  const sourceSha256=await hash(file);if(input.sourceSha256&&sourceSha256!==input.sourceSha256)throw Error('原片SHA已改变，请重新选择素材。');
  const source=await probe(file,{ROOT,signal});signal.throwIfAborted();
  if(Math.abs(source.nominalFps-input.fps)>.01)throw Error(`请选择原片帧率 ${source.nominalFps.toFixed(3)}fps；当前人物层不重采样。`);
  if(input.endMs>source.durationSec*1000+.5||source.width*source.height>3840*2160)throw Error('请求超出视频范围或源画幅超过4K。');
  const first=Math.floor(input.startMs/1000*input.fps+1e-6),count=Math.ceil(input.endMs/1000*input.fps-1e-6)-first;
  const reportFile=path.join(directory,'native-report.json'),moduleCache=path.join(ROOT,'.auto-jobs','person-matte-runtime');fs.mkdirSync(moduleCache,{recursive:true});fs.mkdirSync(assetDirectory,{recursive:true});
  onProgress(.08,'本机Apple Vision分离人物，保留原片RGB');
  await nativeRun('swift',['-module-cache-path',moduleCache,path.join(ROOT,'scripts','person-matte.swift'),file,assetDirectory,String(first),String(count),String(input.fps),reportFile],{ROOT,signal,
    onLine:line=>{const m=line.match(/^PROGRESS:([0-9.]+):(.*)$/);if(m)onProgress(.08+.84*Math.min(1,Number(m[1])),m[2]);}});
  signal.throwIfAborted();onProgress(.95,'验证透明通道和逐帧源时间');
  if(await hash(file)!==sourceSha256)throw Error('生成人物层期间原片已变化，结果未绑定。');
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  const personMatte=validateMatteFrames({report,directory:assetDirectory,input,source,sourceSha256,prefix});
  const result={personMatte,proof:{src:input.src,sourceSha256,sourceOriginSec:source.sourceOriginSec,timestampBasis:'source-video-presentation-ms',
    requested:{startMs:input.startMs,endMs:input.endMs,fps:input.fps},width:source.width,height:source.height,method:'Apple Vision accurate local person segmentation; original source RGB + alpha',audioOrVideoUploaded:false,generatedFace:false},warnings:['头发、手指及快速运动边缘需在预览中检查；这不是生成式换脸。']};
  save(path.join(assetDirectory,'manifest.json'),result);return result;
}

export function createPersonMatteAnalyzer({ROOT,PUBLIC,json,body,isBusy=()=>false,runJob=runPersonMatteJob,platform=process.platform}){
  const base=path.join(ROOT,'.auto-jobs','person-matte'),jobs=new Map(),controllers=new Map();fs.mkdirSync(base,{recursive:true});
  const status=id=>path.join(base,id,'status.json'),persist=job=>save(status(job.id),{...job,updatedAt:new Date().toISOString()});
  for(const id of fs.readdirSync(base)){if(!/^[a-f0-9-]{36}$/i.test(id))continue;try{const j=JSON.parse(fs.readFileSync(status(id)));if(j.id!==id)continue;if(!final.has(j.status)){j.status='error';j.error='服务重启中断了人物层生成，请重试。';fs.rmSync(path.join(PUBLIC,`broll-assets/person-matte-${id}`),{recursive:true,force:true});persist(j);}jobs.set(id,j);}catch{}}
  const busy=()=>[...jobs.values()].some(j=>!final.has(j.status));
  async function route(req,res,url){
    if(!url.pathname.startsWith('/api/person-matte/'))return false;
    if(req.method==='POST'&&url.pathname==='/api/person-matte/analyze'){
      if(platform!=='darwin'){json(res,400,{error:'本地人物分离目前需要macOS Apple Vision。'});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地分析或导出任务，请完成后再生成人物层。'});return true;}
      let input;try{input=validateMatteRequest(JSON.parse(await body(req)||'{}'),{PUBLIC});}catch(e){json(res,400,{error:e.message});return true;}
      if(busy()||isBusy()){json(res,409,{error:'已有本地分析或导出任务，请完成后重试。'});return true;}
      const id=randomUUID(),directory=path.join(base,id),relative=`broll-assets/person-matte-${id}`,assetDirectory=path.join(PUBLIC,relative),prefix=relative+'/frame-';fs.mkdirSync(directory);
      const job={id,status:'running',progress:0,label:'准备本机人物分离',snapshot:input,createdAt:new Date().toISOString()};jobs.set(id,job);persist(job);
      const controller=new AbortController();controllers.set(id,controller);save(path.join(directory,'input.json'),input);
      Promise.resolve().then(()=>runJob({ROOT,PUBLIC,input,directory,assetDirectory,prefix,signal:controller.signal,
        onProgress:(n,label)=>{if(job.status==='running'){job.progress=Math.max(job.progress,Math.min(.995,n));job.label=label;persist(job);}}}))
        .then(result=>{if(controller.signal.aborted)return;job.result=result;job.status='done';job.progress=1;job.label='原片人物遮挡层已生成';persist(job);})
        .catch(e=>{if(controller.signal.aborted)return;job.status='error';job.error=String(e.message??e).slice(0,350);job.label=job.error;fs.rmSync(assetDirectory,{recursive:true,force:true});persist(job);})
        .finally(()=>{controllers.delete(id);if(job.status==='cancelled')fs.rmSync(assetDirectory,{recursive:true,force:true});});
      json(res,202,{jobId:id});return true;
    }
    const m=url.pathname.match(/^\/api\/person-matte\/([a-f0-9-]{36})(\/cancel)?$/i);if(!m){json(res,404,{error:'没有这个人物层接口。'});return true;}
    const job=jobs.get(m[1]);if(!job){json(res,404,{error:'人物层任务不存在。'});return true;}
    if(req.method==='GET'&&!m[2]){json(res,200,job);return true;}
    if(req.method==='POST'&&m[2]){if(!final.has(job.status)){job.status='cancelled';job.label='已取消，原片未改变';controllers.get(job.id)?.abort(Error('用户取消人物层生成'));fs.rmSync(path.join(PUBLIC,`broll-assets/person-matte-${job.id}`),{recursive:true,force:true});persist(job);}json(res,200,{id:job.id,status:job.status});return true;}
    json(res,405,{error:'不支持的请求方法。'});return true;
  }
  return {route,busy};
}
