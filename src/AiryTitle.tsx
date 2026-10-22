import {displayFont} from './DisplayFont';
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {easeOut,headlineLines} from './reference-motion.mjs';
import type {StoryScene} from './storyboard.mjs';

export function AiryTitle({scene,elapsed,width,height}:{scene:StoryScene;elapsed:number;width:number;height:number}){
 const wide=width>height,lines=headlineLines(scene.title,wide?9:12),enter=easeOut(elapsed/350);
 return <AbsoluteFill data-title-treatment="airy" style={{fontFamily:'PingFang SC, Microsoft YaHei, sans-serif',pointerEvents:'none'}}>
  <AbsoluteFill style={{background:wide?'linear-gradient(90deg,#f5f3ec 0%,#f5f3ec 29%,#f5f3ecf0 39%,#f5f3ec80 48%,#f5f3ec00 59%)':'linear-gradient(#f5f3ec 0%,#f5f3ecee 30%,transparent 60%)'}}/>
  <div style={{position:'absolute',left:'6%',top:wide?'20%':'9%',width:wide?'43%':'88%'}}>
   <div style={{marginTop:32}}>{lines.map((line,i)=>{const q=easeOut((elapsed-80-i*85)/430),units=Array.from(line).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.58:1),0);const base=wide?(i===0?138:92):68;return <div key={i} style={{fontSize:Math.min(base*(scene.layout==='chapter'?(scene.chapterTypography?.lineScales?.[i]??1):1),(wide?width*.43:width*.85)/Math.max(1,units)),fontFamily:displayFont,fontWeight:400,letterSpacing:0,lineHeight:1.2,color:'var(--koubo-emphasis, #efff24)',WebkitTextStroke:'var(--koubo-emphasis-stroke, 1px #213027)',textShadow:'var(--koubo-emphasis-shadow, 0 3px 8px #15221866)',opacity:q,transform:`translateY(${(1-q)*20}px)`,whiteSpace:'nowrap',marginBottom:10}}>{line}</div>;})}</div>
   <div style={{width:65,height:5,marginTop:30,borderRadius:3,background:'var(--koubo-emphasis-line, #a5b64a)',opacity:enter}}/>
   {scene.body&&<p style={{fontSize:wide?29:30,lineHeight:1.6,color:'#646d63',marginTop:28,maxWidth:'95%',opacity:enter}}>{scene.body}</p>}
  </div>
 </AbsoluteFill>;
}
