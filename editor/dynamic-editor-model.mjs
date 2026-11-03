import {projectStoryboard,storyboardFrameRange} from '../src/storyboard.mjs';

export function dynamicEditorRawScene(scene){if(!scene)return null;const {visualPreset,dynamicMotion,...raw}=scene;return raw;}
export function dynamicEditorAppearance(state){const {scenes,...presentationWithoutScenes}=state.presentation??{};return {presentationWithoutScenes,accentColor:state.accentColor,meta:state.meta??null};}
export function dynamicEditorAssetSources(scene){return [...new Set([scene?.src,scene?.media?.src,...(scene?.nodes??[]).map(n=>n.assetSrc)].filter(v=>typeof v==='string'&&v.length))];}
export async function fetchDynamicEditorAssets(scene,{fetcher=fetch,signal}={}){
 const sources=dynamicEditorAssetSources(scene),result=await Promise.allSettled(sources.map(async src=>{const response=await fetcher('/api/dynamic-asset?src='+encodeURIComponent(src),{signal});const data=await response.json();if(!response.ok)throw Error(data.error??'素材身份读取失败');if(data.src!==src||!/^[a-f0-9]{64}$/i.test(data.sha256??'')||!['image','video'].includes(data.kind)||![data.width,data.height].every(n=>Number.isSafeInteger(n)&&n>0)||data.kind==='video'&&(!Number.isFinite(data.durationSec)||data.durationSec<=0))throw Error('素材身份或解码尺寸无效');return {...data,status:'ready'};}));
 return {assets:result.flatMap(r=>r.status==='fulfilled'?[r.value]:[]),errors:result.flatMap((r,i)=>r.status==='rejected'?[{src:sources[i],message:r.reason instanceof Error?r.reason.message:String(r.reason)}]:[])};
}
export function dynamicEditorProjectionWindow(scene,clips,fps){
 if(!scene||!Number.isFinite(fps)||fps<=0)return null;
 const projections=projectStoryboard([dynamicEditorRawScene(scene)],clips,fps);if(!projections.length)return null;
 // Same per-clip rounding as timeline.placeClips, without importing TS into a
 // directly executable pure module. Input clips are never rewritten or trimmed.
 const ranges=projections.map(p=>storyboardFrameRange(p,fps)),inFrame=Math.min(...ranges.map(r=>r.from)),outFrame=Math.max(...ranges.map(r=>r.from+r.durationInFrames))-1,durationInFrames=Math.max(1,clips.reduce((sum,c)=>sum+Math.max(1,Math.round(Math.max(0,(c.outSec-c.inSec)/(c.speed??1))*fps)),0));
 return inFrame>=0&&outFrame>=inFrame&&outFrame<durationInFrames?{inFrame,outFrame,durationInFrames,projections}:null;
}
