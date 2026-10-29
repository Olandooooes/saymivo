import React,{useEffect,useRef} from 'react';
import {RetakeTools} from './RetakeTools';

export function RetakeDialog({onClose,...props}:React.ComponentProps<typeof RetakeTools>&{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 return <dialog ref={dialog} aria-labelledby="retake-dialog-title" className="bg-surface-container text-on-surface border border-outline-variant rounded-xl p-0 w-[min(960px,92vw)] max-h-[90vh] backdrop:bg-black/70" onKeyDown={e=>e.stopPropagation()} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3 flex items-center justify-between"><h2 id="retake-dialog-title" className="font-bold">口播精剪</h2><button type="button" aria-label="关闭口播精剪" onClick={onClose} className="px-3 py-1 rounded border border-outline-variant">关闭</button></div>
  <RetakeTools {...props}/>
 </dialog>;
}
