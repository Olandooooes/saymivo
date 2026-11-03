import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const within=(root,file)=>file.startsWith(root+path.sep);
const fail=(status,message)=>Object.assign(Error(message),{status});
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
const sameFile=(a,b)=>stamp(a)===stamp(b);
const imageFormats=new Set(['png_pipe','jpeg_pipe','webp_pipe','bmp_pipe','tiff_pipe','gif','apng','ico','qdraw_pipe','jpegxl_pipe','jxl_pipe','avif']);
// Exclude playlists/concat/image sequences: a media probe must not follow another
// filename or network URL embedded in an otherwise local PUBLIC file.
const formats='mov,matroska,webm,avi,flv,ogg,mpegts,mpegvideo,m4v,h264,hevc,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe,tiff_pipe,gif,apng,ico,jpegxl_pipe,jxl_pipe,avif';

export function validateDynamicAssetSource(src,{ROOT,PUBLIC}){
 if(typeof src!=='string'||!src||src.length>4096||path.isAbsolute(src)||/^[a-z][a-z\d+.-]*:/i.test(src)||/[\\\u0000-\u001f\u007f?#]/.test(src)||src.split('/').some(p=>!p||p==='.'||p==='..'))throw fail(400,'请选择项目素材库中的相对路径。');
 let root,publicRoot,file,stat;
 try{root=fs.realpathSync(ROOT);publicRoot=fs.realpathSync(PUBLIC);}catch{throw fail(400,'项目素材目录不可用。');}
 if(!within(root,publicRoot))throw fail(400,'素材目录必须位于当前项目内。');
 try{file=fs.realpathSync(path.join(publicRoot,src));stat=fs.statSync(file,{bigint:true});}catch{throw fail(404,'素材文件不存在。');}
 if(!within(publicRoot,file)||!stat.isFile())throw fail(400,'素材必须是当前项目素材库内的普通文件。');
 return {src,root,publicRoot,file,stat};
}

function localRun(command,args,opts){
 return new Promise(resolve=>{
  let stdout='',stderr='',settled=false;
  const done=result=>{if(!settled){settled=true;resolve(result);}};
  const child=spawn(command,args,opts);
  child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000);});
  child.once('error',()=>done({code:1,stdout,stderr}));child.once('close',code=>done({code,stdout,stderr}));
 });
}
export function dynamicAssetProbeBinary(ROOT){
 if(process.env.KOUBO_FFPROBE)return process.env.KOUBO_FFPROBE;
 const bundled=path.join(ROOT,'node_modules','@remotion');
 const candidates=fs.existsSync(bundled)?fs.readdirSync(bundled).filter(n=>n.startsWith('compositor-')).map(n=>path.join(bundled,n,'ffprobe')).filter(fs.existsSync):[];
 return candidates.length===1?candidates[0]:'ffprobe';
}
function imageExtension(header){
 if(header.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'png';
 if(header[0]===0xff&&header[1]===0xd8&&header[2]===0xff)return 'jpg';
 if(/^GIF8[79]a/.test(header.toString('ascii',0,6)))return 'gif';
 if(header.toString('ascii',0,2)==='BM')return 'bmp';
 if(['49492a00','4d4d002a'].includes(header.subarray(0,4).toString('hex')))return 'tiff';
 if(header.toString('ascii',0,4)==='RIFF'&&header.toString('ascii',8,12)==='WEBP')return 'webp';
 if(header.subarray(0,4).toString('hex')==='00000100')return 'ico';
 return null;
}
/** Probe the already checked open file, never a second pathname lookup. */
export async function probeDynamicAsset(handle,{ROOT,run=localRun}={}){
 const binary=dynamicAssetProbeBinary(ROOT),directory=path.dirname(binary);
 const env={...process.env,DYLD_LIBRARY_PATH:directory+(process.env.DYLD_LIBRARY_PATH?path.delimiter+process.env.DYLD_LIBRARY_PATH:''),LD_LIBRARY_PATH:directory+(process.env.LD_LIBRARY_PATH?path.delimiter+process.env.LD_LIBRARY_PATH:'')};
 const header=Buffer.alloc(16);await handle.read(header,0,header.length,0);
 const extension=imageExtension(header);let input=process.platform==='win32'?'pipe:3':'/dev/fd/3',temporary;
 // The bundled Remotion probe only enables image2, which needs a filename
 // extension to choose its image decoder. The private temporary alias points
 // at inherited fd 3, not at a second lookup of the source pathname. Disable
 // image sequences explicitly; remove the alias even on probe failure.
 let result;
 try{
  if(extension&&process.platform!=='win32'){
   temporary=await fs.promises.mkdtemp(path.join(os.tmpdir(),'saymivo-asset-probe-'));
   input=path.join(temporary,'source.'+extension);await fs.promises.symlink('/dev/fd/3',input);
  }
  result=await run(binary,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',temporary?'image2':formats,...(temporary?['-f','image2','-pattern_type','none']:[]),'-select_streams','v:0','-show_entries','stream=width,height,codec_type,nb_frames,duration:stream_tags=rotate:stream_side_data=rotation:format=format_name,duration','-of','json',input],{cwd:ROOT,env,stdio:['ignore','pipe','pipe',handle.fd],timeout:20000});
 }
 finally{if(temporary)await fs.promises.rm(temporary,{recursive:true,force:true});}
 if(result.code!==0)throw fail(422,'无法读取本地素材；请选择可解码的图片或视频。');
 let data;try{data=JSON.parse(result.stdout);}catch{throw fail(422,'素材尺寸信息无效。');}
 const stream=data.streams?.find(s=>s.codec_type==='video'),names=String(data.format?.format_name??'').split(',');
 if(!stream||![stream.width,stream.height].every(n=>Number.isSafeInteger(n)&&n>0)||!names.length)throw fail(422,'素材没有可靠的图像尺寸。');
 const rotations=[stream.tags?.rotate,...(stream.side_data_list??[]).map(s=>s.rotation)].filter(v=>v!==undefined).map(Number);
 if(rotations.some(n=>!Number.isFinite(n)||Math.abs(n/90-Math.round(n/90))>.00001))throw fail(422,'素材带有不支持的旋转信息，请先在素材库转正。');
 const quarters=rotations.map(n=>((Math.round(n/90)%4)+4)%4);
 if(new Set(quarters).size>1)throw fail(422,'素材旋转信息不一致。');
 const rotated=(quarters[0]??0)%2===1,width=rotated?stream.height:stream.width,height=rotated?stream.width:stream.height;
 const kind=temporary||names.some(n=>imageFormats.has(n))?'image':'video';
 if(kind==='image')return {width,height,kind};
 const durationSec=Number(data.format?.duration??stream.duration);
 if(!Number.isFinite(durationSec)||durationSec<=0)throw fail(422,'视频缺少可靠的时长。');
 return {width,height,kind,durationSec};
}

async function streamedHash(handle){
 const h=createHash('sha256'),stream=handle.createReadStream({start:0,autoClose:false,highWaterMark:1024*1024});let bytes=0n;
 for await(const chunk of stream){h.update(chunk);bytes+=BigInt(chunk.length);}
 return {sha256:h.digest('hex'),bytes};
}

/** Per-server private memory only; a changed inode/ctime invalidates even equal-size/mtime replacements. */
export function createDynamicAssetRoute({ROOT,PUBLIC,json,run,probe=probeDynamicAsset,maxCacheEntries=128}){
 const cache=new Map();
 async function inspect(src){
  const source=validateDynamicAssetSource(src,{ROOT,PUBLIC});let handle;
  try{
   handle=await fs.promises.open(source.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
   const opened=await handle.stat({bigint:true});
   if(!opened.isFile()||!sameFile(source.stat,opened))throw fail(409,'素材在校验期间发生变化，请重新读取。');
   const check=async()=>{
    const current=validateDynamicAssetSource(src,{ROOT,PUBLIC}),held=await handle.stat({bigint:true});
    if(current.file!==source.file||!sameFile(opened,current.stat)||!sameFile(opened,held))throw fail(409,'素材在校验期间发生变化，请重新读取。');
   };
   const key=source.file+':'+stamp(opened),cached=cache.get(key);
   if(cached){await check();return {src,...cached};}
   const hashed=await streamedHash(handle);
   if(hashed.bytes!==opened.size)throw fail(409,'素材读取期间发生变化，请重新读取。');
   await check();
   const metadata=await probe(handle,{ROOT,run});await check();
   if(!metadata||!['image','video'].includes(metadata.kind)||![metadata.width,metadata.height].every(n=>Number.isSafeInteger(n)&&n>0)||metadata.kind==='video'&&(!Number.isFinite(metadata.durationSec)||metadata.durationSec<=0))throw fail(422,'素材尺寸或时长信息无效。');
   const value={sha256:hashed.sha256,width:metadata.width,height:metadata.height,kind:metadata.kind,...(metadata.kind==='video'?{durationSec:metadata.durationSec}:{})};
   // Remove stale versions of this source before keeping the current result.
   for(const old of cache.keys())if(old.startsWith(source.file+':'))cache.delete(old);
   cache.set(key,value);while(cache.size>Math.max(0,maxCacheEntries))cache.delete(cache.keys().next().value);
   return {src,...value};
  }catch(e){if(e.status)throw e;throw fail(e.code==='ENOENT'?404:422,'无法安全读取本地素材，请重新选择。');}
  finally{await handle?.close();}
 }
 async function route(req,res,url){
  if(url.pathname!=='/api/dynamic-asset')return false;
  if(req.method!=='GET'){json(res,405,{error:'素材身份接口只支持读取。'});return true;}
  const values=url.searchParams.getAll('src');
  if(values.length!==1){json(res,400,{error:'请提供一个本地素材路径。'});return true;}
  try{json(res,200,await inspect(values[0]));}catch(e){json(res,e.status??422,{error:e.message});}
  return true;
 }
 return {route,inspect};
}
