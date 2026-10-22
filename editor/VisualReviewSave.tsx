import React,{useState} from 'react';
import {useEditor} from './store';
import type {StoryScene} from '../src/storyboard.mjs';
import {sourceCaptionClock} from '../src/source-review-clock.mjs';
export function VisualReviewSave({scene}:{scene:StoryScene}){
 const state=useEditor(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const src=scene.src??state.clips.find(c=>c.id===scene.clipId)?.src;
 const storageKey=`visual-review-undo:${src}:${scene.startMs}:${scene.endMs}`;
 const [token,setToken]=useState(()=>localStorage.getItem(storageKey)||'');
 const request=async(action:'save'|'undo')=>{
  setBusy(true);setMessage('');
  try{
   if(!src)throw Error('原片地址无效');
   const audioClock=sourceCaptionClock(state,src);
   if(action==='save'&&audioClock===null)throw Error('同一原片的字幕时钟不一致，未保存画面复用记录');
   const captions=state.captions.filter(c=>state.clips.find(x=>x.id===c.clipId)?.src===src&&c.startMs>=scene.startMs&&c.endMs<=scene.endMs).map(c=>({startMs:c.startMs,endMs:c.endMs,topPct:c.topPct,scale:c.scale??1,holdMs:c.holdMs??700}));
   const response=await fetch('/api/visual-reviews/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='undo'?{src,token}:{src,audioClock,scene:{...scene,src},captions,overviewSource:state.presentation.scenes?.find(s=>s.id===scene.overviewSourceSceneId)})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'画面校对未保存');
   if(action==='save'){setToken(result.token);localStorage.setItem(storageKey,result.token);setMessage(`已保存本段 ${result.count} 项画面设置，同一原片重生成时复用。`);}
   else{setToken('');localStorage.removeItem(storageKey);setMessage('已撤回本次复用记录，当前工程画面保持原样。');}
  }catch(e){setMessage(e instanceof Error?e.message:'画面校对未保存');}finally{setBusy(false);}
 };
 return <div className="muted"><button type="button" aria-label={'保存本段画面校对 '+scene.id} disabled={busy||!src||!scene.sourceText} onClick={()=>void request('save')}>{busy?'处理中…':'保存本段画面供重生成复用'}</button>{token&&<button type="button" onClick={()=>void request('undo')} disabled={busy}>撤回本次画面复用记录</button>}<p>保存本段人物构图、字幕位置、字号与句末延留，以及已选择的总览返回节点。仅对同一原片生效。</p>{message&&<p role="status">{message}</p>}</div>;
}
