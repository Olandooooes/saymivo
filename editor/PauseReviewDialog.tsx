import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Clip} from '../src/timeline';
import type {AutocutPlan} from '../src/apply-autocut-project.mjs';
import {pauseCuts,selectedPausePlan} from '../src/pause-review.mjs';
import {SourceAudition} from './SourceAudition';
export function PauseReviewDialog({clips,plan,onApply,onClose,onPause}:{clips:Clip[];plan:AutocutPlan;onApply:(plan:AutocutPlan)=>void;onClose:()=>void;onPause:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cuts=useMemo(()=>pauseCuts(clips,plan),[clips,plan]);
 const [selected,setSelected]=useState(cuts.map(c=>c.id)),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 const saved=cuts.filter(c=>selected.includes(c.id)).reduce((n,c)=>n+(c.endSec-c.startSec)/(clips.find(p=>p.id===c.clipId)?.speed??1),0);
 return <dialog ref={dialog} onCancel={onClose} aria-labelledby="pause-review-title" className="rounded-xl bg-surface text-on-surface p-5 w-[min(850px,95vw)] max-h-[85vh] overflow-auto backdrop:bg-black/60">
 <div className="flex justify-between"><h2 id="pause-review-title" className="font-bold text-lg">停顿剪辑核对</h2><button type="button" onClick={onClose}>关闭</button></div>
 <p className="my-3">检测到 {cuts.length} 处拟删除区间，当前选择可缩短 {saved.toFixed(2)} 秒。尚未修改时间线。</p>
 <p className="text-sm opacity-75">请试听原声，取消不自然或有疑问的剪口。词时间保护不能保证没有削字；应用后可用一次撤销恢复。</p>
 <div className="flex gap-3 my-3"><button type="button" onClick={()=>setSelected([])}>全部保留</button><button type="button" onClick={()=>setSelected(cuts.map(c=>c.id))}>选择全部剪口</button></div>
 {cuts.map((c,i)=><article key={c.id} className="border border-outline-variant rounded p-3 my-2"><label className="flex gap-2"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,c.id]:s.filter(id=>id!==c.id))}/><span>{i+1}. 删除原片 {c.startSec.toFixed(3)}—{c.endSec.toFixed(3)} 秒</span></label><SourceAudition src={c.src} startMs={Math.max(0,c.startSec-1.5)*1000} endMs={(c.endSec+1.5)*1000} onPlay={onPause}/></article>)}
 {error&&<p role="alert">{error}</p>}
 <button type="button" disabled={!selected.length} className="lime-button" onClick={()=>{try{onApply(selectedPausePlan(clips,cuts,selected));}catch(e){setError(e instanceof Error?e.message:'应用失败');}}}>应用所选 {selected.length} 处剪口</button>
 </dialog>;
}
