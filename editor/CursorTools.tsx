import React from 'react';
import type {StoryScene} from '../src/storyboard.mjs';

export function CursorTools({scene,onChange}:{scene:StoryScene;onChange:(patch:Partial<StoryScene>)=>void}){
 const media=scene.media!;
 const points=media.cursor??[];
 return <details><summary>示意光标与点击（{points.length}）</summary>
  <p className="muted">仅绘制讲解指针，不执行真实点击。坐标相对素材内容，随素材镜头移动；时间从本场景原片起点计算。</p>
  {points.map((point,index)=><div key={index} style={{borderTop:'1px solid #ffffff25',padding:'10px 0'}}>
   {(['atMs','x','y'] as const).map(field=><label key={field}>{field==='atMs'?'光标场景内秒':field==='x'?'光标横向位置 0—1':'光标纵向位置 0—1'}<input aria-label={`${field} 示意光标 ${scene.id} ${index+1}`} type="number" min="0" max={field==='atMs'?(scene.endMs-scene.startMs)/1000:1} step={field==='atMs'?.1:.01} value={field==='atMs'?point.atMs/1000:point[field]} onChange={e=>onChange({media:{...media,cursor:points.map((p,i)=>i===index?{...p,[field]:+e.target.value*(field==='atMs'?1000:1)}:p)}})}/></label>)}
   <label><input aria-label={`点击示意 ${scene.id} ${index+1}`} type="checkbox" checked={!!point.click} onChange={e=>onChange({media:{...media,cursor:points.map((p,i)=>i===index?{...p,click:e.target.checked}:p)}})}/> 在此处显示点击波纹</label>
   <button onClick={()=>onChange({media:{...media,cursor:points.filter((_,i)=>i!==index)}})}>移除光标点</button>
  </div>)}
  <button disabled={points.length>0&&Math.max(...points.map(p=>p.atMs))>=scene.endMs-scene.startMs} onClick={()=>onChange({media:{...media,cursor:[...points,{atMs:points.length?Math.min(scene.endMs-scene.startMs,Math.max(...points.map(p=>p.atMs))+1000):0,x:.5,y:.5}]}})}>添加示意光标点</button>
 </details>;
}
