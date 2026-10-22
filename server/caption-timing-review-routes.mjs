import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {validCaptionTimingReview} from '../src/caption-timing-review.mjs';
import {reviewClockMatches} from '../src/source-review-clock.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function captionTimingReviewRoute({req,res,url,ROOT,PUBLIC,json,body}){
 if(!['/api/caption-timing-reviews/save','/api/caption-timing-reviews/undo'].includes(url.pathname))return false;
 if(req.method!=='POST'){json(res,405,{error:'请使用保存或撤回操作'});return true;}
 try{
  const input=JSON.parse(await body(req));
  if(typeof input.src!=='string'||!/^clips\/[\w.-]+\.(mp4|mov|webm)$/i.test(input.src))throw Error('原片地址无效');
  const media=fs.realpathSync(path.join(PUBLIC,input.src));if(!media.startsWith(fs.realpathSync(path.join(PUBLIC,'clips'))+path.sep))throw Error('原片不在素材库中');
  const key=path.basename(input.src).replace(/\.[^.]+$/,''),dir=path.join(PUBLIC,'clips/reviews'),file=path.join(dir,key+'.json'),history=path.join(ROOT,'.caption-timing-review-history');
  const sourceSha256=createHash('sha256').update(fs.readFileSync(media)).digest('hex');
  const current=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,source:input.src,sourceSha256,patches:[]};
  if(current.sourceSha256!==sourceSha256)throw Error('原片已变化，原校对记录已保留');
  const records=current.captionTimingReviews??[];
  if(url.pathname.endsWith('/undo')){
   if(typeof input.token!=='string'||!/^[-\w]{36}$/.test(input.token))throw Error('撤回凭据无效');
   const saved=JSON.parse(fs.readFileSync(path.join(history,input.token+'.json'),'utf8'));
   if(saved.source!==input.src||saved.sourceSha256!==sourceSha256)throw Error('撤回记录与原片不匹配');
   if(saved.changes.some(change=>{const value=records.find(r=>r.id===change.id);return !value||digest(value)!==change.savedDigest;})){json(res,409,{error:'记录已有后续修改，已保留后续内容'});return true;}
   for(const change of saved.changes){const i=records.findIndex(r=>r.id===change.id);if(change.before)records[i]=change.before;else records.splice(i,1);}
   current.captionTimingReviews=records;fs.writeFileSync(file,JSON.stringify(current,null,2));json(res,200,{ok:true});return true;
  }
  const requests=input.reviews??[{anchor:input.anchor,range:input.range,holdMs:input.holdMs}];
  if(input.audioClock&&(!reviewClockMatches(input.audioClock,input.audioClock)||input.audioClock.sourceSha256!==sourceSha256))throw Error('整句校时的原声音频时钟无效，原记录已保留');
  if(current.audioClock&&!reviewClockMatches(current.audioClock,input.audioClock))throw Error('工程与已迁移记录的音频时钟不同，未覆盖原校时；请打开当前工程后保存');
  if(!Array.isArray(requests)||!requests.length||requests.length>20)throw Error('整句边界记录无效');
  const next=requests.map(r=>({id:`cue-${digest(r.anchor).slice(0,20)}`,anchor:r.anchor,range:r.range,holdMs:r.holdMs??0}));
  if(next.some(r=>!validCaptionTimingReview(r)||r.anchor.text.length>600||r.anchor.endMs>86400000||r.range.endMs>86400000)||new Set(next.map(r=>r.id)).size!==next.length)throw Error('请保留有效的原句范围和新的整句起止');
  const changes=next.map(r=>({id:r.id,before:records.find(p=>p.id===r.id)??null,savedDigest:null}));
  if(changes.some(c=>c.before&&!reviewClockMatches(c.before.audioClock??current.audioClock,input.audioClock)))throw Error('同一句已有其他音频时钟的记录，未覆盖原校时');
  for(const [i,r]of next.entries()){
   const saved={...r,...(input.audioClock?{audioClock:input.audioClock}:{}),evidence:requests[i].evidence??['编辑器整句起止校对'],wordTimingPolicy:'preserve',savedAt:new Date().toISOString()};
   changes[i].savedDigest=digest(saved);const at=records.findIndex(p=>p.id===r.id);if(at<0)records.push(saved);else records[at]=saved;
  }
  fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(history,{recursive:true});const token=randomUUID();
  fs.writeFileSync(path.join(history,token+'.json'),JSON.stringify({source:input.src,sourceSha256,changes},null,2));
  current.captionTimingReviews=records;fs.writeFileSync(file,JSON.stringify(current,null,2));json(res,200,{ok:true,token,count:next.length});
 }catch(error){json(res,400,{error:error.message||'整句边界保存失败，原记录已保留'});}
 return true;
}
