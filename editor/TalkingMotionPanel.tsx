import React,{useEffect,useMemo,useState} from 'react';
import type {PlayerRef} from '@remotion/player';
import {useEditor} from './store';
import {matchTalkingMotion,projectTalkingMotion,talkingMotionNames,type TalkingCue} from '../src/talking-motion.mjs';
export const TalkingMotionPanel:React.FC<{playerRef:React.RefObject<PlayerRef|null>}>=({playerRef})=>{
 const [playing,setPlaying]=useState<string|null>(null);
 const s=useEditor(),[start,setStart]=useState('0'),[length,setLength]=useState('25'),[message,setMessage]=useState('');
 const cues=s.presentation.talkingMotion??[],fps=s.meta?.fps??30,projected=useMemo(()=>projectTalkingMotion(cues,s.captions,s.clips,fps),[cues,s.captions,s.clips,fps]);
 useEffect(()=>{if(!playing)return;const player=playerRef.current,cue=projected.find(c=>c.id===playing);if(!player||!cue){setPlaying(null);return;}const stop=()=>{if(player.getCurrentFrame()/fps*1000>=cue.endMs){player.pause();setPlaying(null);}};player.addEventListener('frameupdate',stop);return()=>{player.removeEventListener('frameupdate',stop);player.pause();};},[playing,projected,playerRef,fps]);
 const update=(cue:TalkingCue,patch:Partial<TalkingCue>)=>s.setPresentation({...s.presentation,talkingMotion:cues.map(c=>c.id===cue.id?{...c,...patch}:c)});
 const generate=()=>{
  const a=Number(start),duration=Number(length);if(!Number.isFinite(a)||a<0||!Number.isFinite(duration)||duration<5||duration>60){setMessage('起点需为非负秒数，范围为5–60秒。');return;}
  const next=matchTalkingMotion(s.captions,s.clips,{startMs:a*1000,endMs:(a+duration)*1000,fps});
  if(!next.length){setMessage('这段没有足够明确且完整的匹配，保留普通口播。可换一段；不会为了添加动效改写内容。');return;}
  const keep=cues.filter(c=>{const p=projected.find(x=>x.id===c.id);return !p||p.endMs<=a*1000||p.startMs>=(a+duration)*1000;});
  s.setPresentation({...s.presentation,talkingMotion:[...keep,...next]});setMessage(`已在所选范围匹配 ${next.length} 项，实时预览已启用，可撤销。原声、剪辑与字幕未改。`);
  const first=projectTalkingMotion(next,s.captions,s.clips,fps)[0];if(first)playerRef.current?.seekTo(Math.ceil(first.startMs/1000*fps)+Math.round(fps*.5));
 };
 return <section className="space-y-4"><h3 className="font-bold">蓝字动效自动匹配 · 小段预览</h3><p className="text-xs opacity-75">复用已确认的蓝字动效：思源黑体、双侧布局、逐行入场与旧论点退淡。依据现有字幕匹配论点、转折与顺序步骤。只用原话；未匹配处保留口播。每次最多3项，先检查画面与阅读节奏。</p>
 <button className="underline text-sm" onClick={()=>setStart(((playerRef.current?.getCurrentFrame()??0)/fps).toFixed(2))}>以当前播放位置为起点</button>
 <label className="block text-sm">起点（秒）<input aria-label="动效匹配起点秒" type="number" min="0" value={start} onChange={e=>setStart(e.target.value)} className="w-full bg-surface-container p-2"/></label>
 <label className="block text-sm">范围（秒）<input aria-label="动效匹配范围秒" type="number" min="5" max="60" value={length} onChange={e=>setLength(e.target.value)} className="w-full bg-surface-container p-2"/></label>
 <button className="rounded bg-primary-container text-on-primary-container px-3 py-2" onClick={generate}>自动匹配并实时预览</button><p role="status" className="text-sm">{message}</p>
 {cues.map(c=>{const p=projected.find(x=>x.id===c.id);return <article key={c.id} className="border border-outline-variant rounded p-3 space-y-2"><strong>{talkingMotionNames[c.kind]}</strong><p className="text-xs">{p?`${(p.startMs/1000).toFixed(2)}–${(p.endMs/1000).toFixed(2)} 秒`:'字幕或剪辑已变化，请重新匹配此项'}</p><p className="text-sm">{c.items.map(i=>i.text).join(' / ')}</p><p className="text-xs opacity-70">{c.reason}</p>
 <button className="underline mr-4" disabled={!p} onClick={()=>{if(p){playerRef.current?.seekTo(Math.ceil(p.startMs/1000*fps));setPlaying(c.id);playerRef.current?.play();}}}>播放本项</button><button className="underline" onClick={()=>s.setPresentation({...s.presentation,talkingMotion:cues.filter(x=>x.id!==c.id)})}>移除本项</button>
 <label className="block text-xs">字号比例<input aria-label={`动效字号 ${c.id}`} className="w-full" type="range" min=".7" max="1.35" step=".05" value={c.scale} onChange={e=>update(c,{scale:Number(e.target.value)})}/></label>
 <label className="block text-xs">顶部位置 {c.topPct}%<input aria-label={`动效位置 ${c.id}`} className="w-full" type="range" min="3" max="55" value={c.topPct} onChange={e=>update(c,{topPct:Number(e.target.value)})}/></label>
 <label className="block text-xs">左侧位置 {c.leftPct??4}%<input aria-label={`动效水平位置 ${c.id}`} className="w-full" type="range" min="3" max="65" value={c.leftPct??4} onChange={e=>update(c,{leftPct:Number(e.target.value)})}/></label>
 <label className="block text-xs">面板宽度 {c.widthPct??28}%<input aria-label={`动效宽度 ${c.id}`} className="w-full" type="range" min="20" max="30" value={c.widthPct??28} onChange={e=>update(c,{widthPct:Number(e.target.value)})}/></label>
 <label className="block text-xs">入场时长 {c.entryMs}毫秒<input aria-label={`动效入场 ${c.id}`} className="w-full" type="range" min="160" max="800" step="20" value={c.entryMs} onChange={e=>update(c,{entryMs:Number(e.target.value)})}/></label>
 </article>;})}<p className="text-xs opacity-60">位置为可调预设，尚未自动检测人脸；请预览确认避开人物与字幕。大幅改字幕或剪口后需要重新匹配。</p></section>;
};
