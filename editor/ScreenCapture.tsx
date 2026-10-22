import React,{useEffect,useRef,useState} from 'react';
import {useEditor} from './store';
export function ScreenCapture(){
 const [state,setState]=useState('idle'),[message,setMessage]=useState(''),[backup,setBackup]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),backupRef=useRef('');
 useEffect(()=>()=>{if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());if(backupRef.current)URL.revokeObjectURL(backupRef.current);},[]);
 const start=async()=>{
  if(!navigator.mediaDevices?.getDisplayMedia||typeof MediaRecorder==='undefined'){setMessage('当前浏览器不支持录屏，请用 Chrome 打开本地工作台。');return;}
  setState('choosing');setMessage('请选择这个本地工作台标签页。只录画面，不录声音。');
  try{
   const captured=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false,preferCurrentTab:true,monitorTypeSurfaces:'exclude'} as DisplayMediaStreamOptions);
   captured.getAudioTracks().forEach(t=>t.stop());
   stream.current=captured;
   const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4'];
   const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
   const rec=new MediaRecorder(new MediaStream(captured.getVideoTracks()),mimeType?{mimeType}:undefined),chunks:BlobPart[]=[];
   recorder.current=rec;
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onstop=async()=>{
    captured.getTracks().forEach(t=>t.stop());setState('saving');
    const blob=new Blob(chunks,{type:rec.mimeType});
    if(!blob.size){setMessage('没有取得录制画面，请重新选择标签页。');setState('idle');return;}
    if(backupRef.current)URL.revokeObjectURL(backupRef.current);
    backupRef.current=URL.createObjectURL(blob);setBackup(backupRef.current);
    try{
     const name='workbench-screen-'+Date.now()+'.webm';
     const response=await fetch('/api/add-broll-asset?kind=video&name='+name,{method:'POST',body:blob});
     const asset=await response.json();if(!response.ok)throw Error(asset.error??'保存失败');
     useEditor.getState().addBrollAsset(asset);setMessage('录屏已保存在本机素材库：'+asset.src+'。可在分镜中绑定。');
    }catch(e){setMessage('录屏转换未完成，可先下载原始录像保留：'+String(e));}
    setState('idle');
   };
   captured.getVideoTracks()[0].onended=()=>{if(rec.state==='recording')rec.stop();};
   rec.start(1000);setState('recording');setMessage('正在录制所选画面 · 无摄像头、无麦克风、无系统声音');
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());setState('idle');setMessage(e instanceof DOMException&&e.name==='NotAllowedError'?'未开始录制：浏览器未取得所选画面。':String(e));}
 };
 return <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'7px 18px',background:'#171c20',color:'#d4d9dc',fontSize:13}}><button disabled={state==='choosing'||state==='saving'} onClick={()=>state==='recording'?recorder.current?.stop():void start()}>{state==='recording'?'■ 停止并保存录屏':state==='choosing'?'选择录制画面中…':state==='saving'?'保存录屏中…':'◉ 录制操作画面'}</button><span role="status">{message||'可选：录制本地工作台操作，作为口播配套画面。'}</span>{backup&&<a href={backup} download="workbench-screen-original.webm">下载原始录像</a>}</div>;
}
