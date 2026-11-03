import React from 'react';
import {AbsoluteFill,useVideoConfig} from 'remotion';
import type {StoryScene} from './storyboard.mjs';
import {visualContentRect,visualSequence} from './visual-presets.mjs';
import {easeOut} from './reference-motion.mjs';
import {MeasuredText} from './MeasuredText';
import {SceneMedia} from './SceneMedia';
import {SpatialEvidenceScene} from './SpatialEvidenceScene';

export function VisualPresetScene({scene,elapsed}:{scene:StoryScene;elapsed:number}){
 const {width,height}=useVideoConfig(),rect=visualContentRect(scene,width,height),sequence=visualSequence(scene,elapsed);
 const {current,index,nodes,from,to}=sequence,local=elapsed-from,duration=Math.max(1,to-from),enter=easeOut(local/420),exit=easeOut((duration-local)/240);
 const id=scene.visualPreset?.id,accent='var(--koubo-emphasis-on-dark, #b4c6ff)',text=current.text+(current.detail?'\n'+current.detail:'')+(current.bullets?.length?'\n'+current.bullets.join('\n'):'');
 const title=id==='floating-evidence'||nodes.length>1?scene.title:'';
 const header=title?<div style={{position:'absolute',left:rect.x,top:height*.045}}><MeasuredText text={title} width={rect.width} height={height*.07} minFont={height*.023} maxFont={height*.041} elapsed={elapsed} duration={sequence.duration} color="#e4eaf8"/></div>:null;
 if(id==='orbit-evidence'||id==='grouped-evidence')return <SpatialEvidenceScene scene={scene} elapsed={elapsed}/>;
 if(id==='floating-evidence'&&scene.media){
  const p=easeOut(elapsed/550),out=easeOut((sequence.duration-elapsed)/350),box={x:rect.x,y:height*.16,width:rect.width,height:height*.59};
  return <AbsoluteFill style={{pointerEvents:'none',opacity:out}}>{header}<div style={{position:'absolute',left:box.x,top:box.y,width:box.width,height:box.height,opacity:p,transform:`perspective(2200px) rotateY(${-9+7*p}deg) rotateZ(${-1.8+1.1*p}deg) translateY(${(1-p)*height*.07}px)`,transformOrigin:'center',border:'2px solid #c8e8f78c',borderRadius:20,background:'#9ac6ed15',boxShadow:'0 28px 80px #030a2280',boxSizing:'border-box'}}><div style={{position:'absolute',left:12,top:12,right:12,bottom:12,borderRadius:12}}><SceneMedia scene={scene} elapsed={elapsed} width={box.width-28} height={box.height-28}/></div></div>{scene.body&&<div style={{position:'absolute',left:rect.x,top:height*.78}}><MeasuredText text={scene.body} width={rect.width} height={height*.065} minFont={height*.025} maxFont={height*.034} elapsed={elapsed} duration={sequence.duration} color="#eef3ff"/></div>}</AbsoluteFill>;
 }
 if(id==='fine-process'){
  const graphY=height*.24,graphHeight=height*.18,positions=nodes.map((n,i)=>({x:rect.x+rect.width*(.08+.84*i/Math.max(1,nodes.length-1)),y:graphY-Math.sin(i/Math.max(1,nodes.length-1)*Math.PI)*graphHeight*.42}));
  return <AbsoluteFill style={{pointerEvents:'none'}}>{header}<svg style={{position:'absolute',inset:0,width,height,overflow:'visible'}}>{positions.slice(1).map((point,i)=>{const previous=positions[i],p=easeOut((elapsed-sequence.starts[i+1])/430);return <g key={nodes[i+1].id}><path d={`M${previous.x} ${previous.y} Q${(previous.x+point.x)/2} ${Math.min(previous.y,point.y)-35} ${point.x} ${point.y}`} fill="none" stroke="#72dcf538" strokeWidth={2}/><path d={`M${previous.x} ${previous.y} Q${(previous.x+point.x)/2} ${Math.min(previous.y,point.y)-35} ${point.x} ${point.y}`} fill="none" stroke="#80e7ff" strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1-p}/></g>;})}{positions.map((point,i)=><g key={nodes[i].id}><circle cx={point.x} cy={point.y} r={i===index?21:11} fill={i===index?'#b9f1ff':'#253b59'} stroke="#8ddff8" strokeWidth={2}/><text x={point.x} y={point.y+height*.065} fill={i===index?'#eafaff':'#8aacc6'} fontFamily="sans-serif" fontSize={height*.025} textAnchor="middle">{String(i+1).padStart(2,'0')}</text></g>)}</svg><div style={{position:'absolute',left:rect.x,top:height*.39,opacity:enter*exit,translate:`${(1-enter)*35}px 0`}}><MeasuredText text={text} width={rect.width} height={height*.35} minFont={height*.035} maxFont={height*.095} elapsed={local} duration={duration} color="#d7f6ff"/></div></AbsoluteFill>;
 }
 if(id==='clear-type'){
  // Keep authored lines together when the loaded font can fit them; the text
  // component falls back to complete wrapping/paging for longer paragraphs.
  const outline=local>duration*.62;
  return <AbsoluteFill style={{pointerEvents:'none'}}>{header}<div style={{position:'absolute',left:rect.x,top:rect.y+height*.12,opacity:enter*exit,translate:`0 ${(1-enter)*height*.055}px`,color:outline?'transparent':'var(--koubo-emphasis, #3156b9)',WebkitTextStroke:outline?'1.4px var(--koubo-emphasis, #3156b9)':'0 transparent',textShadow:outline?'none':'0 4px 25px #07112630'}}><MeasuredText text={text} width={rect.width} height={rect.height-height*.15} minFont={height*.034} maxFont={height*.14} elapsed={local} duration={duration} protectedPhrases={text.split('\n').filter(Boolean)}/></div></AbsoluteFill>;
 }
 return <AbsoluteFill style={{pointerEvents:'none'}}>{header}<div aria-hidden="true" style={{position:'absolute',left:rect.x,top:height*.16,fontSize:height*.54,fontWeight:800,lineHeight:1,color:'#c8d8ff0c',fontFamily:'sans-serif',translate:`${(1-enter)*-45}px 0`}}>{String(index+1).padStart(2,'0')}</div><div style={{position:'absolute',left:rect.x,top:rect.y+height*.08,opacity:enter*exit,translate:`${(index%2?-1:1)*(1-enter)*75}px ${(1-enter)*15}px`}}><MeasuredText text={text} width={rect.width} height={rect.height-height*.09} minFont={height*.04} maxFont={height*.16} elapsed={local} duration={duration} color={accent} protectedPhrases={text.split('\n').filter(Boolean)}/><div style={{marginTop:height*.015,height:5,width:rect.width*.17,background:accent,scale:`${enter} 1`,transformOrigin:'left'}}/></div></AbsoluteFill>;
}
