import {resolveMediaCues} from './media-cues.mjs';
// Only use explicitly registered local assets with literal subtitle matches.
// Only explicit annotation coordinates may be reused; never invent clicks or execution results.
export function bindAutomaticSceneMedia(scenes=[],assets=[],captions=[]){
 const result=[],report=[];
 for(let i=0;i<scenes.length;i++){
  const scene=scenes[i];
  if(scene.media||!['speaker','slide','flow','demo'].includes(scene.layout)){result.push(scene);continue;}
  const matches=assets.filter(a=>a.enabled!==false&&Array.isArray(a.keywords)&&a.keywords.length>=2&&a.keywords.every(k=>k&&scene.sourceText?.includes(k)));
  if(matches.length!==1){result.push(scene);continue;}
  const asset=matches[0],parts=[scene];let end=scene.endMs;
  for(let j=i+1;j<scenes.length&&j<=i+2;j++){
   const next=scenes[j];
   if(next.media||next.clipId!==scene.clipId||next.src!==scene.src||next.startMs-end>100||next.endMs-scene.startMs>12000||!['speaker','flow','demo'].includes(next.layout)||!(asset.continuationKeywords??[]).some(k=>next.sourceText?.includes(k)))break;
   parts.push(next);end=next.endMs;
  }
  const startSec=asset.startSec??0;
  if(asset.kind==='video'&&(!Number.isFinite(asset.durationSec)||asset.durationSec-startSec<(end-scene.startMs)/1000)){result.push(scene);report.push({sceneId:scene.id,assetId:asset.id,status:'skipped',reason:'素材可用长度不足'});continue;}
  if(!Number.isFinite(asset.width)||!Number.isFinite(asset.height)||asset.width<=0||asset.height<=0){result.push(scene);continue;}
  const media={src:asset.src,kind:asset.kind,width:asset.width,height:asset.height,fit:'contain',...(asset.kind==='video'?{durationSec:asset.durationSec,startSec,rate:1}:{})};
  const merged={...scene,endMs:end,sourceCaptionIds:[...new Set(parts.flatMap(p=>p.sourceCaptionIds??[]))]};
  const cues=resolveMediaCues(merged,asset,captions);if(cues.camera)media.camera=cues.camera;
  result.push({...scene,endMs:end,layout:asset.kind==='image'&&cues.highlights.length?'spotlight':'demo',media,...(cues.highlights.length?{highlights:cues.highlights}:{}),missing:cues.report.some(r=>r.status==='skipped')?'素材已绑定，部分标记触发词未唯一命中，请检查。':undefined,label:asset.label,sourceNote:asset.sourceNote||'配套素材 · 不作为已完成执行的凭证',sourceText:parts.map(p=>p.sourceText??'').join(''),sourceCaptionIds:[...new Set(parts.flatMap(p=>p.sourceCaptionIds??[]))]});
  report.push({sceneId:scene.id,assetId:asset.id,status:'bound',matchedKeywords:asset.keywords,mergedSceneIds:parts.map(p=>p.id),annotations:cues.report});i+=parts.length-1;
 }
 return {scenes:result,report};
}
