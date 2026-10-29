import {dynamicMotionLibrary} from '../src/dynamic-motion-library.mjs';
import React,{useState} from 'react';
import {visualPreset,type VisualPresetId} from '../src/visual-presets.mjs';
import {motionReferenceCatalog,motionReferenceCoverage,motionReferenceSources,motionReferenceGroups,localMotionPresetCoverage,motionReferenceImplementationState} from '../src/motion-reference-catalog.mjs';

const phaseNames={entry:'入场',movement:'运动',transformation:'转换',occlusion:'遮挡',hold:'停留',exit:'退场'};
const stamp=(sec:number)=>`${Math.floor(sec/60).toString().padStart(2,'0')}:${Math.floor(sec%60).toString().padStart(2,'0')}`;
export function ReferenceMechanisms({onTry,onTryDynamic}:{onTry:(id:VisualPresetId)=>void;onTryDynamic?:(id:string)=>void}){
 const [episode,setEpisode]=useState('77'),[group,setGroup]=useState('all'),[query,setQuery]=useState('');
 const entries=motionReferenceCatalog.filter(entry=>(episode==='all'||String(entry.source.episode)===episode)&&(group==='all'||entry.reusableClassId===group)&&(!query||[entry.name,entry.mechanism,...entry.spokenSemantics,...Object.values(entry.phases).map(phase=>phase.description??'')].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return <div className="p-5 space-y-4">
  <div className="rounded border border-amber-300/40 p-4"><p className="font-bold">{motionReferenceCoverage.label}</p><p className="text-sm mt-2">{motionReferenceCoverage.method}</p><p className="text-xs opacity-70 mt-2">{motionReferenceCoverage.limitations.join(' ')}</p></div>
  <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">{motionReferenceSources.map(source=><article key={source.videoId} className="border rounded p-3 text-sm">
   <a href={source.url} target="_blank" rel="noreferrer" className="font-bold underline">第{source.episode}集 · 官方原视频</a><p className="text-xs mt-1">{source.publishedAt}</p><p className="text-xs opacity-70 mt-1">{stamp(source.durationSec)} · {motionReferenceCatalog.filter(entry=>entry.source.videoId===source.videoId).length}条操作族记录</p>
   <p className="text-xs mt-2">全段捕获样本已审；{source.research.keySlowReviewed?'重点慢放样本已审':'重点慢放审阅中'}</p>{source.research.pending.map(note=><p key={note} className="text-xs text-amber-300 mt-1">待补：{note}</p>)}
  </article>)}</div>
  <p className="text-sm">五条共{motionReferenceCatalog.length}条操作族记录，归入{motionReferenceGroups.length}个复用分组。同类在不同视频重复出现时保留来源与变体，不按截图或出现次数增加特效数量。</p>
  <div className="flex flex-wrap gap-4 items-end"><label className="text-sm">参考视频<select aria-label="参考视频筛选" className="block bg-surface-container-lowest border rounded p-2 mt-1" value={episode} onChange={event=>setEpisode(event.target.value)}><option value="all">五条汇总</option>{motionReferenceSources.map(source=><option key={source.episode} value={source.episode}>第{source.episode}集 · {source.publishedAt}</option>)}</select></label>
   <label className="text-sm">复用分组<select aria-label="参考机制分组筛选" className="block bg-surface-container-lowest border rounded p-2 mt-1 max-w-full" value={group} onChange={event=>setGroup(event.target.value)}><option value="all">全部分组</option>{motionReferenceGroups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   <label className="text-sm">查找用途或运动<input aria-label="查找参考机制" value={query} onChange={event=>setQuery(event.target.value)} className="block bg-surface-container-lowest border rounded p-2 mt-1" placeholder="如：计数、原文、文件、围栏"/></label>
  </div>
  <p role="status" className="text-xs opacity-70">当前显示{entries.length}条；研究记录与可应用效果分别标记。</p>
  {entries.map(entry=>{const integration=motionReferenceImplementationState(entry,dynamicMotionLibrary.map(item=>item.id));return <article key={entry.id} className="border border-outline-variant/50 rounded-lg p-4" data-reference-mechanism={entry.id}>
   <div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">{entry.name}</h3><span className="text-xs">{integration.label}</span></div>
   <p className="text-xs opacity-70 mt-1">第{entry.source.episode}集 · {motionReferenceGroups.find(item=>item.id===entry.reusableClassId)?.name}</p>
   <div className="flex flex-wrap gap-2 mt-2">{entry.observation.rangesSec.map(([from,to],index)=><a key={index} href={entry.source.url} target="_blank" rel="noreferrer" className="text-xs underline">{stamp(from)}–{stamp(to)}</a>)}</div>
   <p className="text-sm mt-3">{entry.mechanism}</p>{entry.spokenSemantics.length>0&&<p className="text-xs mt-2">口播用途：{entry.spokenSemantics.join('；')}</p>}
   <details className="text-sm mt-3"><summary>入场、运动、转换、遮挡与退场</summary><div className="space-y-2 mt-3">{(Object.keys(phaseNames) as Array<keyof typeof phaseNames>).map(phase=><p key={phase}><strong>{phaseNames[phase]}：</strong>{entry.phases[phase].description??'此阶段未观察，不推定'}</p>)}</div></details>
   {entry.slowReplayNotes.length>0&&<details className="text-sm mt-3"><summary>重点慢放后的补充与修正</summary><ul className="list-disc pl-5 space-y-2 mt-3">{entry.slowReplayNotes.map((note,index)=><li key={index}>{note}</li>)}</ul></details>}
   <details className="text-xs mt-3"><summary>所需资料、使用边界与实现缺口</summary><p className="mt-2">所需资料：{entry.elements.length?entry.elements.join('；'):'按当前场景明确资料与来源'}</p><p className="mt-2">{entry.limits.join('；')}</p><p className="mt-2">{entry.observation.accuracyNote} 静音画面观察，未听审。</p><p className="mt-2">已接部分：{entry.implementation.implementedPart??'尚无对应原生参数入口'}</p>{entry.implementation.missingParts.length>0&&<p className="mt-2 text-amber-300">尚缺能力或组合边界：{entry.implementation.missingParts.join('；')}</p>}<p className="mt-2">本场验证：{entry.implementation.acceptance}</p>{integration.unregisteredIds.length>0&&<p className="mt-2">未接入入口：{integration.unregisteredIds.join('、')}</p>}{entry.alternatives.map(alternative=><p key={alternative.presetId} className="mt-2">相关能力「{visualPreset(alternative.presetId)?.name}」：{alternative.limitation}</p>)}</details>
   <div className="flex flex-wrap gap-3 mt-3">{onTryDynamic&&integration.entryIds.map(id=>{const item=dynamicMotionLibrary.find(item=>item.id===id);return item?<button key={id} type="button" onClick={()=>onTryDynamic(id)} className="text-xs border rounded px-3 py-1">实验配置与预览：{item.name}</button>:null;})}{entry.implementation.presetIds.filter(id=>localMotionPresetCoverage.some(preset=>preset.id===id&&preset.available)).map(id=><button key={id} type="button" onClick={()=>onTry(id)} className="text-xs border rounded px-3 py-1">预览相关基础能力：{visualPreset(id)?.name}</button>)}</div>
  </article>;})}
 </div>;
}
