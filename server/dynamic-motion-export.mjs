import {requiresDynamicMatte} from '../src/dynamic-matte.mjs';
import {presentationSize} from '../src/presentation.mjs';
import {dynamicMotionEnvironmentFromState,validateSavedSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';
import {audioClockProjectSegments} from '../src/audio-clock-integration.mjs';

/** Re-read files before export. A stored filename or old renderer receipt is
 * insufficient after a file, caption layout or retained instance changes. */
export async function verifyDynamicMotionsForExport(props,inspect,{fps=30,materializeAudio,inspectMatte}={}){
 const scenes=(props.presentation?.scenes??[]).filter(scene=>scene.dynamicMotion);
 if(!scenes.length)return;
 const clips=props.clips??[],size=presentationSize(props.presentation),durationInFrames=clips.reduce((sum,clip)=>sum+Math.max(1,Math.round((clip.outSec-clip.inSec)/(clip.speed??1)*fps)),0),state={...props,meta:{fps,...size,durationInFrames}},cache=new Map();
 const identity=src=>{if(!cache.has(src))cache.set(src,inspect(src));return cache.get(src);};
 const schedule=audioClockProjectSegments(props.presentation?.scenes??[],clips,fps,size);if(schedule.issues.length)throw Error('A/B音轨时窗需要重新预览：'+schedule.issues.join('；'));
 for(const scene of scenes){
  const saved=scene.dynamicMotion,sourceIdentity=await identity(scene.src),assetSources=[...new Set([scene.media?.src,...(scene.nodes??[]).map(node=>node.assetSrc)].filter(Boolean))],assets=await Promise.all(assetSources.map(identity));
  let matteEvidence;if(requiresDynamicMatte(saved.config)){if(!inspectMatte)throw Error('人物交接需要重新核对本场RGBA序列');matteEvidence=await inspectMatte({src:scene.src,prefix:scene.personMatte?.prefix,startMs:scene.startMs,endMs:scene.endMs});}
  let audioEvidence;
  if(saved.config?.kind==='audio-clock-ab'){
   if(!materializeAudio)throw Error('A/B音轨需要本地重新核对PCM与播放资产，不能仅用旧文件名导出。');
   audioEvidence=await Promise.all(saved.config.takes.map(async take=>({takeId:take.id,...await materializeAudio(take.source.src,{startMs:take.startMs,endMs:take.endMs,bins:saved.audioEvidence?.find(e=>e.takeId===take.id)?.analysis?.bins?.length??256})})));
  }
  const environment=dynamicMotionEnvironmentFromState(state,{sourceIdentity,assets,...(matteEvidence?{matteEvidence}:{}),...(audioEvidence?{audioEvidence}:{}),contextSnapshot:saved.contextSnapshot,font:{status:'ready'}}),result=validateSavedSceneDynamicMotion(scene,environment);
  if(!result.ok)throw Error('分镜“'+scene.title+'”的动效需要重新预览：'+result.issues.join('；'));
 }
}
/** Saving an A/B selection also checks its additional real sources, without
 * changing the save contract of existing visual-only projects. */
export async function verifyAudioClockMotionsForSave(props,inspect,options){
 const scenes=props.presentation?.scenes??[],audio=scenes.filter(s=>s.dynamicMotion?.config?.kind==='audio-clock-ab'||requiresDynamicMatte(s.dynamicMotion?.config));
 if(audio.length){
  // Keep ordinary scene ownership in this gate; only the expensive source
  // revalidation loop is narrowed so visual-only saves keep their old contract.
  const schedule=audioClockProjectSegments(scenes,props.clips??[],options?.fps??30,presentationSize(props.presentation));
  if(schedule.issues.length)throw Error('A/B音轨时窗需要重新预览：'+schedule.issues.join('；'));
  await verifyDynamicMotionsForExport({...props,presentation:{...props.presentation,scenes:audio}},inspect,options);
 }
}
