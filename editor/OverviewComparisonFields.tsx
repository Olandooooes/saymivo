import React,{useEffect,useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import {createOverviewComparison} from '../src/overview-comparison.mjs';

type ImageAsset={id:string;src:string;kind:string;label:string};
export function OverviewComparisonFields({scene,assets,onChange}:{scene:StoryScene;assets:ImageAsset[];onChange:(patch:Partial<StoryScene>)=>void}){
 const comparison=scene.overviewComparison,images=assets.filter(asset=>asset.kind==='image');
 const [beforeSrc,setBeforeSrc]=useState(comparison?.before.src??''),[afterSrc,setAfterSrc]=useState(comparison?.after.src??'');
 useEffect(()=>{setBeforeSrc(comparison?.before.src??'');setAfterSrc(comparison?.after.src??'');},[scene.id,comparison?.before.src,comparison?.after.src]);
 if(scene.layout!=='overview')return null;
 const duration=Math.max(0,(scene.endMs-scene.startMs-1)/1000);
 return <details open={!!comparison}><summary>原片与成片对照</summary><p className="muted">选择同一段素材的加工前后图片，保留总览导航。加工项填写原话支持的内容。</p>
  {(['before','after'] as const).map(side=>{
   const item=comparison?.[side],src=item?.src??(side==='before'?beforeSrc:afterSrc),name=side==='before'?'原片':'成片';
   return <div key={side}><label>{name}图片<select aria-label={name+'对照图片 '+scene.id} value={src} onChange={event=>{const value=event.target.value;if(comparison){if(value)onChange({overviewComparison:{...comparison,[side]:{...comparison[side],src:value}}});}else (side==='before'?setBeforeSrc:setAfterSrc)(value);}}><option value="">选择已导入的图片…</option>{src&&!images.some(asset=>asset.src===src)&&<option value={src}>{src.split('/').at(-1)}</option>}{images.map(asset=><option key={asset.id} value={asset.src}>{asset.label}</option>)}</select></label>{item&&<><label>{name}标签<input aria-label={name+'对照标签 '+scene.id} maxLength={24} value={item.label} onChange={event=>onChange({overviewComparison:{...comparison!,[side]:{...item,label:event.target.value}}})}/></label><label>{name}入场秒<input aria-label={name+'对照入场秒 '+scene.id} type="number" min="0" max={duration} step=".01" value={Number((item.atMs/1000).toFixed(3))} onChange={event=>{const atMs=Number(event.target.value)*1000;if(Number.isFinite(atMs))onChange({overviewComparison:{...comparison!,[side]:{...item,atMs}}});}}/></label></>}</div>;
  })}
  {!comparison?<button type="button" disabled={!beforeSrc||!afterSrc||beforeSrc===afterSrc} onClick={()=>onChange({overviewComparison:createOverviewComparison(beforeSrc,afterSrc,scene.endMs-scene.startMs)})}>启用原片与成片对照</button>:<>
   {comparison.steps.map((step,index)=><div key={step.id}><label>加工项{index+1}<input aria-label={'对照加工项 '+scene.id+' '+index} maxLength={20} value={step.text} onChange={event=>onChange({overviewComparison:{...comparison,steps:comparison.steps.map((item,i)=>i===index?{...item,text:event.target.value}:item)}})}/></label><label>加工项入场秒<input aria-label={'对照加工项入场秒 '+scene.id+' '+index} type="number" min="0" max={duration} step=".01" value={Number((step.atMs/1000).toFixed(3))} onChange={event=>{const atMs=Number(event.target.value)*1000;if(Number.isFinite(atMs))onChange({overviewComparison:{...comparison,steps:comparison.steps.map((item,i)=>i===index?{...item,atMs}:item)}});}}/></label><button type="button" disabled={comparison.steps.length<=1} onClick={()=>onChange({overviewComparison:{...comparison,steps:comparison.steps.filter((_,i)=>i!==index)}})}>移除加工项</button></div>)}
   <button type="button" disabled={comparison.steps.length>=5} onClick={()=>onChange({overviewComparison:{...comparison,steps:[...comparison.steps,{id:'step-'+Date.now(),text:'新重点',atMs:comparison.steps.at(-1)?.atMs??0}]}})}>添加加工项</button>
   <button type="button" onClick={()=>onChange({overviewComparison:undefined})}>关闭原片与成片对照</button>
  </>}
 </details>;
}
