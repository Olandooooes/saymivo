import {validRegionTemplates,validCameraHints} from '../src/media-cues.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=ROOT=>{const file=path.join(ROOT,'.auto-media-library.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];};
export function loadAutoMediaLibrary(ROOT,PUBLIC,{includeDisabled=false}={}){
 try{return read(ROOT).filter(asset=>{try{
  if(typeof asset.src!=='string'||!/^broll-assets\/[\w.-]+\.(mp4|webm|jpg|jpeg|png|webp|svg)$/i.test(asset.src)||!['image','video'].includes(asset.kind)||typeof asset.label!=='string'||typeof asset.sourceNote!=='string'||!Array.isArray(asset.keywords)||asset.keywords.length<2||!asset.keywords.every(k=>typeof k==='string'&&k.length>=2)||!Number.isFinite(asset.width)||!Number.isFinite(asset.height)||asset.width<=0||asset.height<=0)return false;
  if(!validRegionTemplates(asset.regions)||!validCameraHints(asset.cameraHints))return false;
  const file=fs.realpathSync(path.join(PUBLIC,asset.src)),root=fs.realpathSync(path.join(PUBLIC,'broll-assets'));
  return file.startsWith(root+path.sep)&&(includeDisabled||asset.enabled!==false)&&hash(file)===asset.sha256;
 }catch{return false;}});}catch{return [];}
}
export async function autoMediaLibraryRoute({req,res,url,ROOT,PUBLIC,json,body,run}){
 if(url.pathname!=='/api/auto-media-library')return false;
 if(req.method==='GET'){json(res,200,{assets:loadAutoMediaLibrary(ROOT,PUBLIC,{includeDisabled:true})});return true;}
 if(req.method!=='POST'){json(res,405,{error:'请使用素材库操作'});return true;}
 try{
  const input=JSON.parse(await body(req));if(typeof input.src!=='string'||!/^broll-assets\/[\w.-]+\.(mp4|webm|jpg|jpeg|png|webp|svg)$/i.test(input.src))throw Error('仅支持本地配套素材');
  const previous=read(ROOT).find(a=>a.src===input.src);
  let assets=read(ROOT).filter(a=>a.src!==input.src);
  if(input.enabled===false&&previous)assets.push({...previous,enabled:false});
  if(input.enabled!==false){
   const file=fs.realpathSync(path.join(PUBLIC,input.src)),root=fs.realpathSync(path.join(PUBLIC,'broll-assets'));if(!file.startsWith(root+path.sep))throw Error('素材路径无效');
   const validTags=tags=>Array.isArray(tags)&&tags.length<=12&&tags.every(t=>typeof t==='string'&&t.trim().length>=2&&t.length<=40);
   if(!validTags(input.keywords)||new Set(input.keywords.map(t=>t.trim())).size<2||!validTags(input.continuationKeywords??[]))throw Error('请填写至少两个匹配关键词，每个2–40字');
   if(typeof input.label!=='string'||!input.label.trim()||input.label.length>120||typeof input.sourceNote!=='string'||input.sourceNote.length>400)throw Error('请填写素材标题和来源说明');
   let info;
   if(/\.svg$/i.test(input.src)){
    const svg=fs.readFileSync(file,'utf8');if(svg.length>2000000||/<(?:script|foreignObject)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|(?:href|src)\s*=\s*['"](?:https?:|file:|\/\/)|url\(\s*['"]?https?:|@import/i.test(svg))throw Error('SVG只支持不含脚本或外部引用的本地图形');
    const tag=svg.match(/<svg\b[^>]*>/i)?.[0]??'',width=Number(tag.match(/\bwidth=['"]([\d.]+)(?:px)?['"]/i)?.[1]),height=Number(tag.match(/\bheight=['"]([\d.]+)(?:px)?['"]/i)?.[1]);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>16384||height>16384)throw Error('SVG需提供有效的像素宽高');info={streams:[{codec_type:'video',width,height}]};
   }else{
    const probe=await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file]);if(probe.code!==0)throw Error('无法读取素材尺寸');info=JSON.parse(probe.stdout);
   }
   const video=info.streams?.find(s=>s.codec_type==='video');if(!video?.width||!video.height)throw Error('素材没有可用画面');
   const regions=input.regions??previous?.regions??[],cameraHints=input.cameraHints??previous?.cameraHints??[];
   if(!validRegionTemplates(regions)||!validCameraHints(cameraHints))throw Error('标记区域或镜头触发词无效，请检查坐标和范围');
   const kind=/\.(mp4|webm)$/i.test(input.src)?'video':'image',startSec=Number(input.startSec??0),durationSec=Number(info.format?.duration);
   if(!Number.isFinite(startSec)||startSec<0||(kind==='video'&&(!Number.isFinite(durationSec)||startSec>=durationSec)))throw Error('素材起点超出范围');
   const thumb='broll-assets/thumbs/'+path.basename(input.src).replace(/\.[^.]+$/,'.jpg');
   assets.push({...(fs.existsSync(path.join(PUBLIC,thumb))?{thumb:'/'+thumb}:{}),id:path.basename(input.src),src:input.src,kind,label:input.label.trim(),sourceNote:input.sourceNote,keywords:[...new Set(input.keywords.map(t=>t.trim()))],continuationKeywords:[...new Set((input.continuationKeywords??[]).map(t=>t.trim()))],width:video.width,height:video.height,...(kind==='video'?{durationSec,startSec}:{}),regions,cameraHints,enabled:true,sha256:hash(file)});
  }
  const file=path.join(ROOT,'.auto-media-library.json');fs.writeFileSync(file+'.tmp',JSON.stringify(assets,null,2));fs.renameSync(file+'.tmp',file);json(res,200,{ok:true,assets});
 }catch(error){json(res,400,{error:error.message||'素材库未更新'});}
 return true;
}
