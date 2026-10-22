import {ReferenceLayer} from './ReferenceLayer';
import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame,useVideoConfig,interpolate} from 'remotion';
import type {Caption} from './captions';import type {Clip} from './timeline';
import {projectChapters,type Presentation} from './presentation.mjs';
function CleanKnowledgeLayer({captions,presentation}:{captions:Caption[];presentation:Presentation}){
 const frame=useCurrentFrame(),{width,height,fps}=useVideoConfig(),ms=frame/fps*1000,wide=width>height;
 const c=captions.find(c=>c.motion&&ms>=c.startMs&&ms<c.endMs),m=c?.motion;
 if(!c||!m||m.layout==='speaker')return null;
 const enter=interpolate(ms,[c.startMs,c.startMs+Math.min(300,(c.endMs-c.startMs)/2)],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 const headline=m.layout==='headline',text=m.body??c.words.map(w=>w.text).join('');
 const board={left:width*.035,top:height*.07,width:width*.93,height:height*(wide?.72:.58)};
 const focus=m.focus??{x:.15,y:.25,w:.65,h:.25};
 return <AbsoluteFill style={{pointerEvents:'none',fontFamily:'PingFang SC,Microsoft YaHei,sans-serif'}}>
  {headline?<div style={{position:'absolute',left:width*.045,top:height*.12,width:width*(wide?.42:.9),opacity:enter,translate:`${(1-enter)*-35}px 0`}}><div style={{fontSize:Math.min(wide?116:88,Math.max(42,(wide?720:950)/Math.max(6,m.title.length)*2)),fontWeight:900,color:'#f1ff27',lineHeight:1.3,overflowWrap:'anywhere',textShadow:'0 5px 1px #000,0 12px 25px #0008'}}>{m.title}</div></div>:
  <div style={{position:'absolute',...board,opacity:enter,translate:`0 ${(1-enter)*25}px`,borderRadius:30,background:'#f5f3ee',boxShadow:'0 25px 65px #0007',overflow:'hidden',color:'#191b20'}}>
   {m.assetSrc?<Img src={staticFile(m.assetSrc)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<div style={{padding:wide?'55px 65px':'60px 50px',height:'100%',boxSizing:'border-box'}}><h2 style={{fontWeight:700,fontSize:wide?82:76,lineHeight:1.2,margin:'0 0 35px',maxWidth:wide?'86%':'100%',overflowWrap:'anywhere'}}>{m.title}</h2><div style={{height:7,width:110,background:'#f38b36',marginBottom:35}}/><p style={{fontSize:wide?42:45,lineHeight:1.55,margin:0,maxWidth:wide?'76%':'100%',color:'#4b4a48'}}>{text===m.title?'':text}</p></div>}
   {m.layout==='spotlight'&&<svg width="100%" height="100%" style={{position:'absolute',inset:0}} viewBox="0 0 1000 1000" preserveAspectRatio="none"><path d={`M0 0H1000V1000H0Z M${focus.x*1000} ${focus.y*1000}h${focus.w*1000}v${focus.h*1000}h-${focus.w*1000}Z`} fill="#0009" fillRule="evenodd"/><rect x={focus.x*1000} y={focus.y*1000} width={focus.w*1000} height={focus.h*1000} fill="none" stroke="#f6cf49" strokeWidth="5"/></svg>}
  </div>}
 </AbsoluteFill>;
}
export function ChapterBar({presentation,clips,totalFrames}:{presentation:Presentation;clips:Clip[];totalFrames:number}){
 const frame=useCurrentFrame(),{width,height,fps}=useVideoConfig(),wide=width>height;const chapters=projectChapters(presentation.chapters,clips,fps);if(!chapters.length)return null;
 const ms=frame/fps*1000;let active=0;chapters.forEach((c,i)=>{if(c.at<=ms)active=i;});
 return <div style={{position:'absolute',bottom:0,left:0,right:0,height:wide?74:105,background:'#090b10f5',fontFamily:'PingFang SC,sans-serif',color:'white',pointerEvents:'none'}}><div style={{height:5,background:'#ffffff22'}}><div style={{height:'100%',width:`${Math.min(100,(frame+1)/totalFrames*100)}%`,background:'#f38b36'}}/></div><div style={{display:'flex',height:'calc(100% - 5px)',alignItems:'center',gap:wide?0:20,padding:'0 28px'}}>{wide?chapters.map((c,i)=><div key={c.id} style={{flex:1,minWidth:0,padding:'0 18px',fontSize:Math.max(17,Math.min(25,150/chapters.length)),color:i===active?'#f6ce7c':'#b1b2b5',borderRight:i<chapters.length-1?'1px solid #ffffff33':undefined,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{String(i+1).padStart(2,'0')} · {c.title}</div>):<><b style={{fontSize:32,color:'#f6ce7c'}}>{String(active+1).padStart(2,'0')}</b><span style={{fontSize:28}}>{chapters[active].title}</span><span style={{marginLeft:'auto',fontSize:23,color:'#aaa'}}>{active+1}/{chapters.length}</span></>}</div></div>;
}

export function KnowledgeLayer(props:{captions:Caption[];presentation:Presentation}){return props.presentation.style==='reference'?<ReferenceLayer {...props}/>:<CleanKnowledgeLayer {...props}/>;}
