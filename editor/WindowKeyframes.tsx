import React from 'react';
import type {StoryScene} from '../src/storyboard.mjs';
export function WindowKeyframes({scene,onChange}:{scene:StoryScene;onChange:(patch:Partial<StoryScene>)=>void}){
 const window=scene.window??{x:.765,y:.46,size:.205},points=window.keyframes??[];
 const next=points.length?Math.max(...points.map(p=>p.atMs))+1000:0;
 const set=(keyframes:NonNullable<typeof window.keyframes>)=>onChange({window:{...window,keyframes}});
 return <details><summary>人物窗移动与大小关键帧（{points.length}）</summary><p className="muted">以原片场景起点计时，剪辑和变速后沿用。请预览检查人物与正文避让。</p>{points.map((p,i)=><div key={i}>{(['atMs','x','y','size'] as const).map(k=><label key={k}>{({atMs:'场景内秒',x:'横向位置 0—1',y:'纵向位置 0—1',size:'大小（画幅宽度比例）'})[k]}<input aria-label={k+' 人物窗关键帧 '+scene.id+' '+i} type="number" step={k==='atMs'?.1:.005} value={k==='atMs'?p.atMs/1000:p[k]} onChange={e=>set(points.map((v,j)=>j===i?{...v,[k]:+e.target.value*(k==='atMs'?1000:1)}:v))}/></label>)}<button onClick={()=>set(points.filter((_,j)=>j!==i))}>移除人物窗关键帧</button></div>)}<button disabled={next>=scene.endMs-scene.startMs} onClick={()=>set([...points,{atMs:next,x:window.x,y:window.y,size:window.size}])}>添加人物窗关键帧</button></details>;
}
