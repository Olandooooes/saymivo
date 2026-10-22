import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {SOURCE_AUDIO_CLOCK} from '../scripts/transcript-profile.mjs';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const validWords=words=>Array.isArray(words)&&words.length>0&&words.length<=250&&words.every((w,i)=>typeof w.word==='string'&&w.word.length>0&&w.word.length<=500&&Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&w.startMs>=0&&w.endMs>w.startMs&&w.endMs<=86400000&&(!i||w.startMs>=words[i-1].endMs));
export async function captionReviewRoute({req,res,url,ROOT,PUBLIC,json,body}){
 if(!['/api/caption-reviews/save','/api/caption-reviews/undo'].includes(url.pathname))return false;
 if(req.method!=='POST'){json(res,405,{error:'请使用保存或撤回操作'});return true;}
 try{
  const input=JSON.parse(await body(req));
  if(typeof input.src!=='string'||!/^clips\/[\w.-]+\.(mp4|mov|webm)$/i.test(input.src))throw Error('原片地址无效');
  const media=fs.realpathSync(path.join(PUBLIC,input.src));if(!media.startsWith(fs.realpathSync(path.join(PUBLIC,'clips'))+path.sep))throw Error('原片不在素材库中');
  const key=path.basename(input.src).replace(/\.[^.]+$/,''),dir=path.join(PUBLIC,'clips','reviews'),file=path.join(dir,key+'.json'),history=path.join(ROOT,'.caption-review-history');
  fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(history,{recursive:true});
  const sourceSha256=createHash('sha256').update(fs.readFileSync(media)).digest('hex');
  let current=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,source:input.src,sourceSha256,patches:[]};
  if(current.sourceSha256!==sourceSha256)throw Error('原片已变化，原校对记录未覆盖，请使用新素材名称');
  if(url.pathname.endsWith('/undo')){
   if(typeof input.token!=='string'||!/^[-\w]{36}$/.test(input.token))throw Error('撤回凭据无效');
   const hfile=path.join(history,input.token+'.json'),saved=JSON.parse(fs.readFileSync(hfile,'utf8'));
   if(saved.source!==input.src||saved.sourceSha256!==sourceSha256)throw Error('撤回记录与原片不匹配');
   const at=current.patches.findIndex(p=>p.id===saved.id);
   if(at<0||digest(current.patches[at])!==saved.savedDigest){json(res,409,{error:'这条记录已有后续修改，已保留后续内容'});return true;}
   if(saved.before)current.patches[at]=saved.before;else current.patches.splice(at,1);
   fs.writeFileSync(file,JSON.stringify(current,null,2));json(res,200,{ok:true});return true;
  }
  if(!validWords(input.beforeWords)||!validWords(input.replacementWords))throw Error('本句词时间无效，请保留有时间点的完整字幕');
  if(!input.audioClock||Object.entries(SOURCE_AUDIO_CLOCK).some(([key,value])=>input.audioClock[key]!==value)||input.audioClock.sourceSha256!==sourceSha256||!(/^[a-f0-9]{64}$/i).test(input.audioClock.wavSha256??''))throw Error('当前字幕没有经验证的原片音频时钟，不能保存为重生成记录。请使用带音频时钟的新识别字幕；旧工程字幕已保留。');
  const audioClock={...SOURCE_AUDIO_CLOCK,sourceSha256,wavSha256:input.audioClock.wavSha256};
  const before=input.beforeWords,after=input.replacementWords;
  if(Math.abs(before[0].startMs-after[0].startMs)>1||Math.abs(before.at(-1).endMs-after.at(-1).endMs)>1)throw Error('本句裁切范围已变化，请重新校对当前片段');
  const id=`editor-${after[0].startMs}-${after.at(-1).endMs}`,at=current.patches.findIndex(p=>p.id===id),previous=at<0?null:current.patches[at];
  const acceptedText=[...new Set([...(previous?.acceptedText??[]),before.map(w=>w.word).join('')])];
  const patch={id,audioClock,windowStartMs:Math.max(0,after[0].startMs-1000),windowEndMs:after.at(-1).endMs+1000,acceptedText,replacementWords:after.map(({word,startMs,endMs})=>({word,startMs,endMs})),evidence:['编辑器内保存的本句校对'],reviewer:'editor',savedAt:new Date().toISOString()};
  if(at<0)current.patches.push(patch);else current.patches[at]=patch;
  const token=randomUUID();fs.writeFileSync(path.join(history,token+'.json'),JSON.stringify({source:input.src,sourceSha256,id,before:previous,savedDigest:digest(patch)},null,2));
  fs.writeFileSync(file,JSON.stringify(current,null,2));json(res,200,{ok:true,token});
 }catch(error){json(res,400,{error:error.message||'保存校对失败，原记录已保留'});}
 return true;
}
