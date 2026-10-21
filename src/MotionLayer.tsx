import React from 'react';
import {useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
import type {Caption} from './captions';
export const MotionLayer:React.FC<{captions:Caption[];accentColor?:string}>=({captions,accentColor='#d8f99a'})=>{
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),ms=frame/fps*1000;
 const c=captions.find(c=>c.motion&&ms>=c.startMs&&ms<c.endMs);if(!c?.motion)return null;
 const {kind,title}=c.motion,elapsed=(ms-c.startMs)/1000,progress=interpolate(elapsed,[0,.35],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const parts=title.split(/[，,。]/).filter(Boolean);
 const card=kind==='steps'||kind==='compare'||kind==='number'||kind==='card';const n=title.match(/\d+(?:\.\d+)?\s*(?:%|倍|万|亿|元|分钟|秒|个)/)?.[0];
 return <div style={{position:'absolute',left:card?80:70,right:card?80:70,top:card?150:90,opacity:progress,translate:`0px ${(1-progress)*35}px`,fontFamily:'PingFang SC, Microsoft YaHei, sans-serif',color:'#f1f6e8',pointerEvents:'none'}}>
  <div style={{fontSize:24,letterSpacing:5,color:accentColor,marginBottom:25}}>{kind==='card'?'CONCEPT NOTE':kind==='steps'?'STEP BY STEP':kind==='compare'?'ANOTHER PERSPECTIVE':kind==='number'?'BY THE NUMBERS':'KEY TAKEAWAY'}</div>
  <div style={{padding:card?'42px 38px':'30px 35px',borderRadius:24,background:'rgba(18,27,15,.94)',border:'2px solid '+accentColor+'55',boxShadow:'0 20px 70px #0006'}}>
   <div style={{height:6,width:65,background:accentColor,borderRadius:5,marginBottom:28}}/>
   {kind==='number'&&n&&<div style={{fontSize:120,fontWeight:800,color:accentColor,lineHeight:1.15,marginBottom:20}}>{n.replace(/\d+(?:\.\d+)?/,v=>String(Math.round(Number(v)*progress)))}</div>}
   {kind==='compare'&&parts.length>=2?<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:22}}>{[parts[0],parts.slice(1).join('，')].map((part,i)=><div key={i} style={{padding:22,borderRadius:16,background:i?'#354829':'#263020',border:'1px solid '+(i?accentColor+'66':'#ffffff22')}}><div style={{fontSize:21,color:i?accentColor:'#9ca98e',marginBottom:14}}>{i?'B / 对比二':'A / 对比一'}</div><div style={{fontSize:46,fontWeight:650,lineHeight:1.5}}>{part}</div></div>)}</div>:<div style={{fontSize:card?60:48,fontWeight:650,lineHeight:1.55,overflowWrap:'anywhere'}}>{title}</div>}
   {kind==='steps'&&<div style={{display:'flex',gap:18,marginTop:35}}>{[1,2,3].map(i=><div key={i} style={{height:5,flex:1,background:accentColor,opacity:Math.max(.15,Math.min(1,progress*3-i+1))}}/>)}</div>}
  </div>
 </div>;
};
