import React,{useState} from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
import {reuseOverview} from '../src/reuse-overview.mjs';
export function OverviewReuseTools({scene,scenes,onChange}:{scene:StoryScene;scenes:StoryScene[];onChange:(patch:Partial<StoryScene>)=>void}){
 const [sourceId,setSourceId]=useState(''),[nodeId,setNodeId]=useState(''),[message,setMessage]=useState('');
 const options=scenes.filter(s=>s.id!==scene.id&&s.layout==='overview'&&s.nodes?.length);
 const source=options.find(s=>s.id===sourceId);
 if(!options.length)return null;
 return <details><summary>复用总览与返回节点</summary><p className="muted">把当前段落改为已有总览的可编辑快照，保留当前原声和时间。会替换此镜的配图、标签及图解；可撤销。快照与原总览分别修改。</p><label>选择总览<select aria-label={'复用总览 '+scene.id} value={sourceId} onChange={e=>{setSourceId(e.target.value);setNodeId('');}}><option value="">选择已有总览…</option>{options.map(s=><option key={s.id} value={s.id}>{s.title} · {s.id}</option>)}</select></label>{source&&<label>返回时突出<select aria-label={'返回总览节点 '+scene.id} value={nodeId} onChange={e=>setNodeId(e.target.value)}><option value="">全项预览</option>{source.nodes?.map(n=><option key={n.id} value={n.id}>{n.text}</option>)}</select></label>}<button disabled={!source} onClick={()=>{if(!source)return;const result=reuseOverview(scene,source,nodeId||undefined);if('error' in result)setMessage(result.error);else{onChange({...result.scene,media:undefined,highlights:undefined,links:undefined,tags:undefined,stackStyle:undefined,folderCloseMs:undefined,iconDrawMs:undefined,chapterTypography:undefined,headlinePosition:undefined,summarySourceSceneId:undefined,missing:undefined});setMessage('已复用总览，可单独修改并撤销。');}}}>应用总览到当前段落</button><p role="status">{message}</p></details>;
}
