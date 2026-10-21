import React from 'react';import {AbsoluteFill,Img,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Caption} from './captions';import type {Presentation} from './presentation.mjs';
import {activeScene,sceneEnvelope,headlineLines,easeOut} from './reference-motion.mjs';
export function ReferenceLayer({captions,presentation,plane='background'}:{captions:Caption[];presentation:Presentation;plane?:'background'|'foreground'}){
 const {width,height,fps}=useVideoConfig(),frame=useCurrentFrame(),ms=frame/fps*1000,wide=width>height;
 const c=activeScene(captions,ms),m=c?.motion;if(!c||!m||m.layout==='speaker')return null;const foreground=m.layout==='headline'||m.layout==='keyword';if(foreground!==(plane==='foreground'))return null;
 const phaseStart=m.phaseStartMs??c.startMs,phaseEnd=m.phaseEndMs??c.endMs;
 const env=sceneEnvelope(ms,phaseStart,phaseEnd,presentation.motionPace),p=env.enter,opacity=p*env.exit;
 const yellow='#f0ff18',title=m.title,lines=headlineLines(title,wide?8:10),headline=m.layout==='headline',keyword=m.layout==='keyword';
 const body=m.body??c.words.map(w=>w.text).join('');
 const focus={x:.15,y:.25,w:.65,h:.25,...m.focus};focus.w=Math.max(.02,Math.min(focus.w,1-focus.x));focus.h=Math.max(.02,Math.min(focus.h,1-focus.y));
 const board={left:width*.04,top:height*.055,width:width*.92,height:height*(wide?.74:.59)};
 const numeric=title.match(/\d+(?:\.\d+)?/),counter=numeric?title.replace(numeric[0],(Number(numeric[0])*p).toFixed(numeric[0].includes('.')?numeric[0].split('.')[1].length:0)):title;
 return <AbsoluteFill style={{pointerEvents:'none',fontFamily:'PingFang SC,Microsoft YaHei,sans-serif'}}>
 {headline?<div style={{position:'absolute',left:width*.042,top:height*(wide?.12:.06),width:width*(wide?.43:.91),opacity:env.exit}}>
  <div style={{display:'inline-block',color:'#fff',fontWeight:850,fontSize:wide?40:30,padding:wide?'12px 38px':'9px 26px',border:'3px solid #fff',borderRadius:70,marginBottom:wide?45:18,opacity:p,translate:`${(1-p)*-40}px 0`}}>{m.label??'重点表达'}</div>
  {lines.map((line,i)=>{const q=easeOut((ms-phaseStart-i*95)/330);const weight=Array.from(line).reduce((n,v)=>n+(/[A-Za-z0-9]/.test(v)?.55:1),0);const size=Math.min(wide?142:88,wide?Infinity:height*.135/(Math.max(1,lines.length)*1.28),Math.max(wide?45:30,(wide?760:900)/Math.max(5,weight)));return <div key={i} style={{fontSize:size,fontWeight:950,lineHeight:1.28,letterSpacing:-2,color:yellow,opacity:q,translate:`${(1-q)*-70}px ${(1-q)*15}px`,scale:1+(1-q)*.12,rotate:`${(1-q)*(i%2?2:-2)}deg`,transformOrigin:'left center',textShadow:'2px 4px 0 #151515,5px 10px 12px #000b',overflowWrap:'anywhere'}}>{line}</div>;})}
 </div>:keyword?<div style={{position:'absolute',left:wide?'4%':'8%',right:wide?'56%':'8%',top:wide?'64%':'10%',display:'flex',justifyContent:'center',opacity,translate:`0 ${(1-p)*45}px`,scale:1+(1-p)*.12}}><div style={{background:'#191b20c9',color:yellow,fontSize:wide?76:64,fontWeight:900,padding:'18px 50px',borderRadius:100,border:'3px solid #fff9',boxShadow:'0 12px 35px #0005',textAlign:'center',maxWidth:'90%',overflowWrap:'anywhere'}}>{numeric?counter:title}</div></div>:
 <div style={{position:'absolute',...board,opacity,transform:`perspective(2100px) translateY(${(1-p)*50}px) rotateY(${wide?-3-(1-p)*6:0}deg) rotateZ(${wide?-.6-(1-p)*1.2:0}deg) scale(${.97+p*.03})`,transformOrigin:'center',border:'10px solid #d5d8df',borderRadius:35,background:'#faf9f6',boxShadow:'0 22px 70px #0008',boxSizing:'border-box',overflow:'hidden'}}>
  {m.assetSrc?<Img src={staticFile(m.assetSrc)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<div style={{padding:wide?'52px 65px':'55px 45px'}}>
   <div style={{display:'flex',alignItems:'center',gap:18,fontSize:wide?24:27,letterSpacing:3,color:'#7d7469'}}><span style={{width:12,height:12,borderRadius:'50%',background:'#f18a32'}}/>{m.label??'内容讲解'}</div>
   <div style={{fontSize:wide?86:76,fontWeight:900,lineHeight:1.25,marginTop:35,color:'#111',maxWidth:'85%',overflowWrap:'anywhere'}}>{title}</div>
   <div style={{height:8,width:Math.max(4,Math.min(260,title.length*28))*p,background:'#f18a32',marginTop:22,marginBottom:35}}/>
   {body!==title&&<div style={{fontSize:wide?43:44,lineHeight:1.65,color:'#282828',maxWidth:wide?'74%':'100%',opacity:easeOut((ms-phaseStart-130)/380),translate:`0 ${(1-p)*20}px`}}>{body}</div>}
   <div style={{position:'absolute',bottom:35,left:wide?65:45,color:'#8d8173',fontSize:22}}>引用口播原话 · {presentation.title}</div>
  </div>}
  {m.layout==='spotlight'&&<svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position:'absolute',inset:0}}><defs><filter id="reference-glow"><feGaussianBlur stdDeviation="4"/></filter></defs><path d={`M0 0H1000V1000H0Z M${focus.x*1000} ${focus.y*1000}h${focus.w*1000}v${focus.h*1000}h-${focus.w*1000}Z`} fill="#111" fillOpacity={.5*p} fillRule="evenodd"/><rect x={focus.x*1000-4} y={focus.y*1000-4} width={focus.w*1000+8} height={focus.h*1000+8} rx="8" fill="none" stroke="#fff" strokeWidth="12" opacity={p*.7} filter="url(#reference-glow)"/><rect x={focus.x*1000} y={focus.y*1000} width={focus.w*1000} height={focus.h*1000} rx="5" fill="none" stroke="#fff6bf" strokeWidth="3" opacity={p}/><rect x={focus.x*1000} y={(focus.y+focus.h*.75)*1000} width={focus.w*1000*easeOut((ms-phaseStart-150)/600)} height={focus.h*1000*.25} fill="#efff19" fillOpacity=".3"/></svg>}
 </div>}
 </AbsoluteFill>;
}
