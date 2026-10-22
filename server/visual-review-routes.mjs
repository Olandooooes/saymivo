import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {captureSceneDesign,reviewedSceneDesign} from './scene-design-review.mjs';
import {reviewClockMatches} from '../src/source-review-clock.mjs';
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const anchor=s=>({startMs:s.startMs,endMs:s.endMs,sourceText:s.sourceText});
const validAnchor=s=>s&&Number.isFinite(s.startMs)&&s.startMs>=0&&Number.isFinite(s.endMs)&&s.endMs>s.startMs&&s.endMs<=86400000&&typeof s.sourceText==='string'&&s.sourceText.length>0&&s.sourceText.length<=10000;
const key=d=>JSON.stringify([d.kind,d.anchor.startMs,d.anchor.endMs,d.anchor.sourceText]);
export async function visualReviewRoute({req,res,url,ROOT,PUBLIC,json,body}){
 if(!['/api/visual-reviews/save','/api/visual-reviews/undo'].includes(url.pathname))return false;
 if(req.method!=='POST'){json(res,405,{error:'请使用保存或撤回操作'});return true;}
 try{
  const input=JSON.parse(await body(req));if(typeof input.src!=='string'||!/^clips\/[\w.-]+\.(mp4|mov|webm)$/i.test(input.src))throw Error('原片地址无效');
  const media=fs.realpathSync(path.join(PUBLIC,input.src));if(!media.startsWith(fs.realpathSync(path.join(PUBLIC,'clips'))+path.sep))throw Error('原片不在素材库中');
  const dir=path.join(PUBLIC,'clips/reviews'),history=path.join(ROOT,'.visual-review-history'),file=path.join(dir,path.basename(input.src).replace(/\.[^.]+$/,'')+'.visual.json');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(history,{recursive:true});
  const sha=createHash('sha256').update(fs.readFileSync(media)).digest('hex');let current=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,sourceSha256:sha,decisions:[]};
  if(current.sourceSha256!==sha||current.version!==1||!Array.isArray(current.decisions))throw Error('原片或记录已变化，未覆盖原校对');
  if(url.pathname.endsWith('/undo')){
   if(typeof input.token!=='string'||!/^[-\w]{36}$/.test(input.token))throw Error('撤回凭据无效');
   const h=JSON.parse(fs.readFileSync(path.join(history,input.token+'.json'),'utf8'));
   if(h.src!==input.src||h.sha!==sha)throw Error('撤回记录与原片不符');
   if(digest(current)!==h.savedDigest){json(res,409,{error:'已有后续校对，未覆盖后续记录'});return true;}
   fs.writeFileSync(file,JSON.stringify(h.before,null,2));json(res,200,{ok:true});return true;
  }
  if(input.audioClock!==undefined&&(!reviewClockMatches(input.audioClock,input.audioClock)||input.audioClock.sourceSha256!==sha))throw Error('音频时钟凭据无效或与原片不符');
  const initializeClock=current.decisions.length===0&&current.audioClock===undefined;
  if(!initializeClock&&!reviewClockMatches(current.audioClock,input.audioClock))throw Error('音频时钟已变化，未混合覆盖旧画面校对');
  const s=input.scene;if(!validAnchor(s)||s.src!==input.src)throw Error('当前分镜需要有效原声范围和原话');
  const decisions=[];
  const design=captureSceneDesign(s);
  if(design){const checked=reviewedSceneDesign(s,design,{PUBLIC});if(checked.error)throw Error('分镜设计无法保存：'+checked.error);decisions.push({kind:'scene-design',anchor:anchor(s),layout:s.layout,design});}
  if(s.speaker){const x={x:50,y:50,scale:1,shiftY:0,...s.speaker};if(![x.x,x.y,x.scale,x.shiftY].every(Number.isFinite)||x.x<0||x.x>100||x.y<0||x.y>100||x.scale<.5||x.scale>2||x.shiftY< -20||x.shiftY>20)throw Error('人物构图超出可复用范围');decisions.push({kind:'speaker',anchor:anchor(s),speaker:{x:x.x,y:x.y,scale:x.scale,shiftY:x.shiftY}});}
  const caps=input.captions??[];if(!Array.isArray(caps)||caps.length>500)throw Error('字幕范围无效');
  for(const c of caps){
   if(c.startMs<s.startMs||c.endMs>s.endMs)continue;
   if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.endMs<=c.startMs||!Number.isFinite(c.topPct)||c.topPct<5||c.topPct>92||!Number.isFinite(c.scale)||c.scale<.3||c.scale>2||(c.holdMs!==undefined&&(!Number.isFinite(c.holdMs)||c.holdMs<0||c.holdMs>1000)))throw Error('字幕样式无效');
  }
  // Store each contiguous style run separately, never span a differently styled cue.
  const sorted=[...caps].filter(c=>c.startMs>=s.startMs&&c.endMs<=s.endMs).sort((a,b)=>a.startMs-b.startMs);let run;
  for(const c of sorted){if(run&&run.style.topPct===c.topPct&&run.style.scale===c.scale&&run.style.holdMs===(c.holdMs??700)&&c.startMs-run.anchor.endMs<=1000)run.anchor.endMs=c.endMs;else{run={kind:'caption-style',anchor:{startMs:c.startMs,endMs:c.endMs,sourceText:s.sourceText},style:{topPct:c.topPct,scale:c.scale,holdMs:c.holdMs??700}};decisions.push(run);}}
  if(s.layout==='overview'&&s.overviewSourceSceneId&&s.overviewMode!=='preview'){const o=input.overviewSource;if(!validAnchor(o)||o.src!==input.src||o.id!==s.overviewSourceSceneId||o.layout!=='overview'||!Array.isArray(o.nodes))throw Error('总览来源无效');const index=o.nodes.findIndex(n=>n.id===s.activeNodeId);if(index<0)throw Error('请选择当前总览节点后保存');decisions.push({kind:'overview-return',anchor:anchor(s),overviewAnchor:anchor(o),activeNodeIndex:index});}
  if(!decisions.length)throw Error('本段没有可保存的人物、字幕或总览设置');
  const before=structuredClone(current),keys=new Set(decisions.map(key));current.decisions=current.decisions.filter(d=>!keys.has(key(d)));current.decisions.push(...decisions);if(current.decisions.length>200)throw Error('校对记录过多，请先整理');
  if(initializeClock&&input.audioClock!==undefined)current.audioClock=structuredClone(input.audioClock);
  current.savedAt=new Date().toISOString();const token=randomUUID();fs.writeFileSync(path.join(history,token+'.json'),JSON.stringify({src:input.src,sha,before,savedDigest:digest(current)}));fs.writeFileSync(file,JSON.stringify(current,null,2));json(res,200,{ok:true,token,count:decisions.length});
 }catch(e){json(res,400,{error:e.message||'画面校对未保存'});}
 return true;
}
