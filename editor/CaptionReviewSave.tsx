import React,{useRef,useState} from 'react';
import type {Caption} from '../src/captions';
export const CaptionReviewSave:React.FC<{caption:Caption;src:string}>=({caption,src})=>{
 const initial=useRef(caption.words.map(w=>({...w})));
 const key=`caption-review-undo:${src}:${caption.startMs}:${caption.endMs}`;
 const [token,setToken]=useState(()=>localStorage.getItem(key)||'');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const words=(items:Caption['words'])=>items.map(w=>({word:w.text,startMs:w.startMs,endMs:w.endMs}));
 const request=async(action:'save'|'undo')=>{
  setBusy(true);setMessage('');
  try{
   const response=await fetch(`/api/caption-reviews/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='save'?{src,audioClock:caption.audioClock,beforeWords:words(caption.reviewOriginalWords??initial.current),replacementWords:words(caption.words)}:{src,token})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'操作未完成');
   if(action==='save'){setToken(result.token);localStorage.setItem(key,result.token);setMessage('本句校对已保存，下次生成字幕时复用。');}
   else{setToken('');localStorage.removeItem(key);setMessage('已撤回复用记录，当前工程的字幕保持原样。');}
  }catch(error){setMessage(error instanceof Error?error.message:'操作未完成');}
  finally{setBusy(false);}
 };
 return <div className="mt-2 mb-3 text-[11px] text-on-surface-variant"><button type="button" disabled={busy} onClick={()=>void request('save')} className="px-2 py-1 rounded border border-outline-variant">{busy?'处理中…':'保存本句校对供重生成复用'}</button>{token&&<button type="button" disabled={busy} onClick={()=>void request('undo')} className="ml-2 underline">撤回本次复用记录</button>}<p className="mt-1">保存本句文字和当前词时间，仅对同一原片生效。</p>{message&&<p role="status">{message}</p>}</div>;
};
