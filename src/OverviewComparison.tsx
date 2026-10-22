import React from 'react';
import {Img,staticFile,useVideoConfig} from 'remotion';
import {displayFont} from './DisplayFont';
import {easeOut} from './reference-motion.mjs';
import {focusedNodeId,type StoryScene} from './storyboard.mjs';

export function OverviewComparison({scene,elapsed}:{scene:StoryScene;elapsed:number}){
 const {width,height}=useVideoConfig(),wide=width>height,comparison=scene.overviewComparison!;
 const active=scene.overviewMode==='preview'?undefined:focusedNodeId(scene,elapsed);
 const image=(side:'before'|'after')=>{
  const item=comparison[side],entry=easeOut((elapsed-item.atMs)/360);
  return <div data-overview-comparison={side} style={{minWidth:0,opacity:entry,translate:`${(side==='before'?-1:1)*(1-entry)*24}px 0`}}>
   <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,color:side==='after'?'#b4c6ff':'#dce1ef',fontSize:wide?32:29,fontWeight:650}}><span style={{width:7,height:7,borderRadius:'50%',background:'currentColor'}}/>{item.label}</div>
   <div style={{aspectRatio:'16/9',borderRadius:14,overflow:'hidden',border:`1px solid ${side==='after'?'#a5baff88':'#cbd3e333'}`,boxShadow:side==='after'?`0 10px 35px #5d75c0${Math.round(entry*30).toString(16).padStart(2,'0')}`:'0 10px 30px #0003',background:'#101521'}}><Img src={staticFile(item.src)} style={{display:'block',width:'100%',height:'100%',objectFit:'contain'}}/></div>
  </div>;
 };
 const steps=<div style={{position:'relative',display:'flex',flexDirection:wide?'column':'row',justifyContent:'center',alignItems:wide?'flex-start':'center',gap:18,marginTop:wide?30:0,paddingRight:wide?110:0}}>{comparison.steps.map(step=>{
  const entry=easeOut((elapsed-step.atMs)/280);
  return <div key={step.id} style={{fontFamily:displayFont,fontSize:wide?58:35,lineHeight:1.1,color:'#b4c6ff',opacity:entry,translate:`0 ${(1-entry)*13}px`,whiteSpace:'nowrap'}}>{step.text}</div>;
 })}<svg viewBox="0 0 110 20" width={wide?110:70} height={20} style={{position:wide?'absolute':undefined,right:wide?0:undefined,top:wide?'50%':undefined,translate:wide?'0 -50%':undefined,opacity:easeOut((elapsed-comparison.after.atMs)/320),flexShrink:0}}><path d="M1 10H104M96 2L105 10L96 18" fill="none" stroke="#a8b8e6" strokeWidth="2"/></svg></div>;
 return <div style={{height:'100%',boxSizing:'border-box',padding:wide?'44px 55px':'30px',color:'#edf0fb',display:'flex',flexDirection:'column'}}>
  <h2 style={{fontSize:wide?64:48,fontWeight:650,margin:0,lineHeight:1.2,letterSpacing:-1,maxWidth:'90%'}}>{scene.title}</h2>
  <div data-overview-navigation={scene.id} style={{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,scene.nodes?.length??0)},minmax(0,1fr))`,gap:wide?28:16,marginTop:wide?22:28,paddingBottom:wide?12:15,borderBottom:'1px solid #b3c2f02b'}}>{(scene.nodes??[]).map((node,index)=>{
   const selected=node.id===active,entry=easeOut((elapsed-(node.atMs??0))/300);
   return <div key={node.id} style={{display:'flex',alignItems:'baseline',gap:14,opacity:entry*(selected?1:.53),color:selected?'#b4c6ff':'#a3a9c2'}}><span style={{fontSize:wide?17:19,letterSpacing:2}}>{String(index+1).padStart(2,'0')}</span><span style={{fontFamily:displayFont,fontSize:32,lineHeight:1.15,whiteSpace:'nowrap'}}>{node.text}</span><span style={{height:3,flex:1,background:selected?'linear-gradient(90deg,#abc1ff,#8276ae)':'#b3c2f025',alignSelf:'center'}}/></div>;
  })}</div>
  <div style={{width:wide?'79%':'100%',marginTop:wide?34:30,display:'grid',gridTemplateColumns:wide?'minmax(0,32fr) minmax(0,68fr)':'1fr',gap:wide?26:18,alignItems:wide?'start':'center'}}>
   {wide?<div style={{minWidth:0}}>{image('before')}{steps}</div>:<>{image('before')}{steps}</>}
   {image('after')}
  </div>
 </div>;
}
