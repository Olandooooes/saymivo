import React from 'react';
import {useVideoConfig} from 'remotion';
import {easeOut} from './reference-motion.mjs';
import {visualSequence} from './visual-presets.mjs';
import type {StoryScene} from './storyboard.mjs';
import {OverviewComparison} from './OverviewComparison';
import {MeasuredText} from './MeasuredText';

// Preserve complete authored wording. Focused measured items replace truncated labels.
export function EditorialCriteria({scene,elapsed}:{scene:StoryScene;elapsed:number}){
 const {width,height}=useVideoConfig();
 if(scene.layout==='overview'&&scene.overviewComparison)return <OverviewComparison scene={scene} elapsed={elapsed}/>;
 const sequence=visualSequence(scene,elapsed),{current,index,from,to}=sequence;
 const text=scene.layout==='overview'?(current.detail??current.text):current.text+(current.detail?'\n'+current.detail:'')+(current.bullets?.length?'\n'+current.bullets.join('\n'):'');
 const contentWidth=width*.64,p=easeOut((elapsed-from)/380);
 return <div style={{position:'absolute',inset:0,color:'#edf0fb'}}>
  <div style={{position:'absolute',left:width*.035,top:height*.035}}><MeasuredText text={scene.title} width={contentWidth} height={height*.10} minFont={height*.027} maxFont={height*.053} elapsed={elapsed} duration={sequence.duration}/></div>
  <div style={{position:'absolute',left:width*.035,top:height*.19,color:'#a3b9e8',fontSize:height*.029,letterSpacing:3}}>{String(index+1).padStart(2,'0')} / {String(sequence.nodes.length).padStart(2,'0')}</div>
  <div style={{position:'absolute',left:width*.035,top:height*.29,opacity:p,translate:`0 ${(1-p)*24}px`}}><MeasuredText text={text} width={contentWidth} height={height*.39} minFont={height*.038} maxFont={height*.083} elapsed={elapsed-from} duration={Math.max(1,to-from)} cues={current.textCues?.map(c=>({...c,atMs:c.atMs-from}))}/></div>
  <div style={{position:'absolute',left:width*.035,top:height*.74,width:contentWidth,height:3,display:'flex',gap:12}}>{sequence.nodes.map((n,i)=><div key={n.id} style={{flex:1,background:i===index?'#b4c6ff':'#b4c6ff30',scale:`${i===index?p:1} 1`,transformOrigin:'left'}}/>)}</div>
 </div>;
}
