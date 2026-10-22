import {displayFont} from './DisplayFont';
import React from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
import {easeOut} from './reference-motion.mjs';
import {personMatteFrame} from './person-matte.mjs';
import type {StoryScene} from './storyboard.mjs';

// This sits inside the SAME camera transform as the live source, so person RGB,
// alpha and background do not drift apart when the editor reframes the speaker.
export function EmbeddedTitle({scene,sourceMs,width,height}:{scene:StoryScene;sourceMs:number;width:number;height:number}){
 const elapsed=sourceMs-scene.startMs,p=easeOut((elapsed-(scene.transitionMs??200))/480),q=easeOut((elapsed-(scene.transitionMs??200)-120)/420);
 const person=personMatteFrame(scene.personMatte,sourceMs),word=scene.embeddedText?.backdrop??scene.title;
 return <AbsoluteFill data-title-treatment="embedded" style={{pointerEvents:'none',fontFamily:'PingFang SC,Microsoft YaHei,sans-serif'}}>
  <div style={{position:'absolute',top:'11%',left:'3%',width:'94%',fontSize:Math.min(width*.235,width*.94/Math.max(1,Array.from(word).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.66:1),0))),fontWeight:900,lineHeight:.95,letterSpacing:-width*.007,textAlign:'center',whiteSpace:'nowrap',color:'rgba(32,43,37,.19)',WebkitTextStroke:'1px rgba(32,43,37,.15)',opacity:p,translate:`0 ${(1-p)*-height*.06}px`}}>{word}</div>
  {person&&<Img data-person-matte={person.index} src={staticFile(person.src)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
  <div style={{position:'absolute',left:'5%',top:'59%',opacity:q,translate:`${(1-q)*-45}px 0`}}>
   <div style={{fontSize:width*.078,fontFamily:displayFont,fontWeight:400,letterSpacing:-3,lineHeight:1.1,color:'var(--koubo-emphasis, #efff24)',WebkitTextStroke:'var(--koubo-emphasis-stroke, 1.2px #213027)',textShadow:'var(--koubo-emphasis-shadow, 0 3px 8px #15221866)'}}>{scene.embeddedText?.headline??scene.title}</div>
   <div style={{width:width*.08,height:6,background:'var(--koubo-emphasis-line, #d27836)',marginTop:25,scale:`${q} 1`,transformOrigin:'left'}}/>
  </div>
 </AbsoluteFill>;
}
