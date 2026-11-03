import {MeasuredText} from './MeasuredText';
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
 const preset=scene.visualPreset?.id==='person-backdrop',front=scene.embeddedText?.headline??(preset?'':scene.title),duration=scene.endMs-scene.startMs;
 return <AbsoluteFill data-title-treatment="embedded" style={{pointerEvents:'none',fontFamily:'PingFang SC,Microsoft YaHei,sans-serif'}}>
  <div style={{position:'absolute',top:'9%',left:'3%',opacity:p,translate:`0 ${(1-p)*-height*.06}px`}}><MeasuredText text={word} width={width*.94} height={height*.56} minFont={height*.10} maxFont={height*.64} weight={900} align="center" elapsed={elapsed} duration={duration} color={preset?'#f7f9fc':'rgba(32,43,37,.19)'}/></div>
  {person&&<Img data-person-matte={person.index} src={staticFile(person.src)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
  {front&&<div style={{position:'absolute',left:'5%',top:'59%',opacity:q,translate:`${(1-q)*-45}px 0`,WebkitTextStroke:'var(--koubo-emphasis-stroke, 1.2px #213027)',textShadow:'var(--koubo-emphasis-shadow, 0 3px 8px #15221866)'}}>
   <MeasuredText text={front} width={width*.38} height={height*.20} minFont={height*.04} maxFont={height*.12} elapsed={elapsed} duration={duration} color="var(--koubo-emphasis, #efff24)"/>
   <div style={{width:width*.08,height:6,background:'var(--koubo-emphasis-line, #d27836)',marginTop:25,scale:`${q} 1`,transformOrigin:'left'}}/>
  </div>}
 </AbsoluteFill>;
}
