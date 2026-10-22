import React from 'react';
import {useVideoConfig} from 'remotion';
import {displayFont} from './DisplayFont';
import {SceneIcon} from './SceneIcon';
import {easeOut} from './reference-motion.mjs';
import {sceneTextLines,textUnits} from './scene-text-lines.mjs';
import {nodeFocusAmount,type StoryScene,type SceneNode} from './storyboard.mjs';
import {OverviewComparison} from './OverviewComparison';

const criterionWord=(text:string)=>['任务','结果','出错','依据'].find(word=>text.includes(word))??text.slice(0,4);
function CueText({node,text,elapsed}:{node:SceneNode;text:string;elapsed:number}){
 const cues=(node.textCues??[]).map(c=>({...c,index:text.indexOf(c.text)})).filter(c=>c.index>=0).sort((a,b)=>a.index-b.index),parts:React.ReactNode[]=[];let end=0;
 for(const cue of cues){
  if(cue.index<end)continue;
  parts.push(text.slice(end,cue.index));
  const p=easeOut((elapsed-cue.atMs)/420);
  parts.push(<span key={cue.index} style={{position:'relative',display:'inline-block',color:p>0?'#abc1ff':undefined}}>{cue.text}<span style={{position:'absolute',left:0,right:0,bottom:1,height:3,background:'#abc1ff',scale:`${p} 1`,transformOrigin:'left'}}/></span>);
  end=cue.index+cue.text.length;
 }
 parts.push(text.slice(end));return <>{parts}</>;
}

export function EditorialCriteria({scene,elapsed}:{scene:StoryScene;elapsed:number}){
 const {width}=useVideoConfig();
 if(scene.layout==='overview'&&scene.overviewComparison)return <OverviewComparison scene={scene} elapsed={elapsed}/>;
 const nodes=scene.nodes??[],preview=scene.overviewMode==='preview',returning=scene.layout==='overview'&&!preview;
 const columnWidth=((width*.93-130)*.78-35*Math.max(0,nodes.length-1))/Math.max(1,nodes.length)-12;
 return <div style={{height:'100%',boxSizing:'border-box',padding:'55px 65px',color:'#edf0fb',display:'flex',flexDirection:'column'}}>
  <h2 style={{fontSize:returning?92:54,fontWeight:returning?700:600,margin:0,lineHeight:1.2,letterSpacing:-1,maxWidth:'78%'}}>{scene.title}</h2>
  <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,nodes.length)},minmax(0,1fr))`,gap:35,width:'78%',flex:1,paddingTop:returning?40:70,paddingBottom:70}}>
   {nodes.map((node,i)=>{
    const at=node.focusMs??node.atMs??0,entry=easeOut((elapsed-at)/460),focus=preview?entry:nodeFocusAmount(scene,node.id,elapsed),word=criterionWord(node.text);
    const body=scene.layout==='overview'?(node.detail??''):node.text;
    const lines=sceneTextLines(body,8,[word,...(node.textCues??[]).map(c=>c.text)]);
    const bodySize=Math.min(returning?42:47,columnWidth/Math.max(1,...lines.map(textUnits)));
    return <div key={node.id} style={{position:'relative',padding:'22px 12px 0 0',opacity:(preview?.7:.5)+(preview?.3:.5)*focus,translate:`0 ${-12*focus}px`,display:'flex',flexDirection:'column',minWidth:0}}>
     <div style={{fontSize:32,fontWeight:500,letterSpacing:3,color:'#a3a9c2',marginBottom:returning?25:40}}>{String(i+1).padStart(2,'0')}</div>
     <div style={{fontFamily:displayFont,fontSize:Math.min(returning?124:146,columnWidth/Math.max(2,Array.from(word).length)),fontWeight:400,lineHeight:1.05,letterSpacing:-3,color:'var(--koubo-emphasis-on-dark, #abc1ff)',transform:`translateY(${(1-entry)*10*focus}px)`,textShadow:focus?'0 0 38px #6b83bd38':undefined,whiteSpace:'nowrap'}}>{word}</div>
     <div style={{position:'relative',height:4,background:'#b3c2f025',marginTop:32,marginBottom:34}}><div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,#abc1ff,#8276ae)',scale:`${focus*entry} 1`,transformOrigin:'left'}}/></div>
     {preview?<div style={{position:'relative',width:108,height:108}}><div style={{position:'absolute',inset:0,opacity:.32}}><SceneIcon name={node.icon??(['check','search','edit'] as const)[i%3]} size={108} color="#abc1ff"/></div><div style={{position:'absolute',inset:0,opacity:entry>0?1:0}}><SceneIcon name={node.icon??(['check','search','edit'] as const)[i%3]} size={108} color="#abc1ff" drawProgress={entry}/></div></div>:<div style={{fontSize:bodySize,fontWeight:500,lineHeight:1.55,letterSpacing:-.5,color:'#edf0fb'}}>{lines.map((line,j)=><div key={j} style={{whiteSpace:'pre'}}><CueText node={node} text={line} elapsed={elapsed}/></div>)}</div>}
    </div>;
   })}
  </div>
 </div>;
}
