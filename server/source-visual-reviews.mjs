import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {reuseOverview} from '../src/reuse-overview.mjs';
import {reviewedSceneDesign} from './scene-design-review.mjs';
import {sourceCaptionClock,reviewClockMatches} from '../src/source-review-clock.mjs';
const clean=s=>String(s??'').replace(/\s+/g,'');
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
const anchorMatch=(s,a)=>Math.abs(s.startMs-a.startMs)<1&&Math.abs(s.endMs-a.endMs)<1&&clean(s.sourceText)===clean(a.sourceText);
export function applyVisualReview(project,review,src,options={}){
 const p=structuredClone(project),report=[];
 if(review.version!==1||!Array.isArray(review.decisions)||review.decisions.length>200)return {project:p,report:[{src,status:'skipped',reason:'invalid-review'}]};
 // Rebuild linked overview content first, then restore its reviewed appearance.
 const ordered=[...review.decisions.filter(d=>d.kind!=='scene-design'),...review.decisions.filter(d=>d.kind==='scene-design')];
 for(const decision of ordered){
  const scenes=p.presentation?.scenes??[];
  if(decision.kind==='caption-style'){
   const a=decision.anchor,style=decision.style;
   if(!a||!finite(a.startMs,0,Infinity)||!finite(a.endMs,a.startMs+1,Infinity)||!style||!finite(style.topPct,5,92)||!finite(style.scale,.3,2)||(style.holdMs!==undefined&&!finite(style.holdMs,0,1000))){report.push({src,status:'skipped',reason:'invalid-caption-style'});continue;}
   const targets=p.captions.filter(c=>p.clips.find(x=>x.id===c.clipId)?.src===src&&c.startMs>=a.startMs&&c.endMs<=a.endMs);
   // A reviewed cue end is exact; restoring an older appearance must not add
   // a held tail after that end. Normal, word-derived cues still use style hold.
   for(const c of targets)Object.assign(c,{topPct:style.topPct,scale:style.scale,...(c.timingScope==='cue'?{holdMs:c.holdMs??0}:style.holdMs===undefined?{}:{holdMs:style.holdMs})});
   report.push({src,kind:decision.kind,status:targets.length?'applied':'skipped',captionIds:targets.map(c=>c.id)});continue;
  }
  const matches=scenes.filter(s=>s.src===src&&decision.anchor&&anchorMatch(s,decision.anchor));
  if(matches.length!==1){report.push({src,kind:decision.kind,status:'skipped',reason:'missing-or-ambiguous-scene'});continue;}
  const target=matches[0];
  if(decision.kind==='scene-design'){
   if(decision.layout!==target.layout){report.push({src,kind:decision.kind,status:'skipped',reason:'changed-design-layout'});continue;}
   const result=reviewedSceneDesign(target,decision.design,options);
   if(result.error){report.push({src,kind:decision.kind,status:'skipped',reason:result.error});continue;}
   scenes[scenes.indexOf(target)]=result.scene;report.push({src,kind:decision.kind,status:'applied',sceneId:target.id});
  }else if(decision.kind==='speaker'){
   const s=decision.speaker;
   if(!s||!finite(s.x,0,100)||!finite(s.y,0,100)||!finite(s.scale,.5,2)||!finite(s.shiftY,-20,20)){report.push({src,status:'skipped',reason:'invalid-speaker'});continue;}
   target.speaker={x:s.x,y:s.y,scale:s.scale,shiftY:s.shiftY};report.push({src,kind:decision.kind,status:'applied',sceneId:target.id});
  }else if(decision.kind==='overview-return'){
   const sources=scenes.filter(s=>s.src===src&&s.layout==='overview'&&decision.overviewAnchor&&anchorMatch(s,decision.overviewAnchor));
   const source=sources.length===1?sources[0]:null,index=decision.activeNodeIndex;
   if(!source||!Number.isInteger(index)||index<0||index>=source.nodes.length){report.push({src,status:'skipped',reason:'missing-or-ambiguous-overview'});continue;}
   const reused=reuseOverview(target,source,source.nodes[index].id);
   if(reused.error){report.push({src,status:'skipped',reason:reused.error});continue;}
   scenes[scenes.indexOf(target)]=reused.scene;report.push({src,kind:decision.kind,status:'applied',sceneId:target.id,sourceSceneId:source.id});
  }else report.push({src,status:'skipped',reason:'unknown-decision'});
 }
 return {project:p,report};
}
export function applySourceVisualReviews(project,{PUBLIC}){
 let p=project;const report=[];
 for(const src of new Set(project.clips.map(c=>c.src))){
  const file=path.join(PUBLIC,'clips/reviews',path.basename(src).replace(/\.[^.]+$/,'')+'.visual.json');
  if(!fs.existsSync(file))continue;
  try{
   const review=JSON.parse(fs.readFileSync(file,'utf8')),hash=createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,src))).digest('hex');
   if(review.sourceSha256!==hash){report.push({src,status:'skipped',reason:'source-sha-mismatch'});continue;}
   const clock=sourceCaptionClock(p,src);
   if(!reviewClockMatches(review.audioClock,clock)||(clock&&clock.sourceSha256!==hash)){report.push({src,status:'skipped',reason:'audio-clock-mismatch'});continue;}
   const result=applyVisualReview(p,review,src,{PUBLIC});p=result.project;report.push(...result.report);
  }catch{report.push({src,status:'skipped',reason:'unreadable-review'});}
 }
 return {project:p,report};
}
