import React,{useRef,useState} from 'react';
export function SourceAudition({src,startMs,endMs,onPlay}:{src:string;startMs:number;endMs:number;onPlay:()=>void}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 const from=Math.max(0,startMs/1000-.35),to=endMs/1000+.35;
 return <div style={{marginBottom:12}}><audio ref={audio} src={'/'+src} preload="none" onTimeUpdate={()=>{if(audio.current&&audio.current.currentTime>=to){audio.current.pause();setPlaying(false);}}} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)} onError={()=>{setError('素材声音无法加载，请检查视频文件');setPlaying(false);}}/>
 <button type="button" aria-label={playing?'停止原声试听':'试听素材原声本句'} onClick={async()=>{
  const media=audio.current;if(!media)return;
  if(playing){media.pause();return;}
  setError('');onPlay();
  try{media.currentTime=from;await media.play();setPlaying(true);}catch{setError('未能播放，请重试或检查素材');setPlaying(false);}
 }} className="px-2 py-1 rounded border border-outline-variant/40 text-[12px]">{playing?'■ 停止试听':'▶ 试听本句原声'}</button>
 <small style={{display:'block',marginTop:5,color:'#aaa'}}>素材时间 {from.toFixed(2)}—{to.toFixed(2)} 秒 · 前后各保留0.35秒</small>{error&&<p role="status">{error}</p>}</div>;
}
