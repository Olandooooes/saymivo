import React from 'react';
import {SceneIcon} from './SceneIcon';
import {easeOut} from './reference-motion.mjs';
import {focusedNodeId,type StoryScene} from './storyboard.mjs';
import {displayFont} from './DisplayFont';
import {sceneTextLines} from './scene-text-lines.mjs';

// Keep the source label intact; short Chinese actions read as two large lines.
const flowLabel=(text:string)=>{
 const clean=text.replace(/[、，]$/,'');
 return /^[\u3400-\u9fff]{4}$/.test(clean)?`${clean.slice(0,2)}\n${clean.slice(2)}`:clean;
};

export function EditorialFlow({scene,elapsed,wide}:{scene:StoryScene;elapsed:number;wide:boolean}){
 const nodes=scene.nodes??[],active=focusedNodeId(scene,elapsed),current=nodes.find(n=>n.id===active)??nodes[0];
 const index=Math.max(0,nodes.findIndex(n=>n.id===current?.id)),p=easeOut((elapsed-(current?.atMs??0))/320);
 if(wide)return <div style={{height:'100%',boxSizing:'border-box',padding:'50px 64px',color:'#202c3b',position:'relative'}}>
  <h2 style={{fontSize:56,fontWeight:600,letterSpacing:-1,margin:0,lineHeight:1.25}}>{scene.title}</h2>
  <div style={{position:'absolute',left:64,right:'21%',top:190,bottom:54,display:'grid',gridTemplateColumns:`repeat(${Math.max(1,nodes.length)},minmax(0,1fr))`,gap:34}}>
   {nodes.map((node,i)=>{
    const at=node.atMs??0,show=easeOut((elapsed-at)/420),selected=node.id===current?.id,spoken=elapsed>=at;
    const color=node.color??'#3156b9',next=nodes[i+1],link=next?easeOut((elapsed-(next.atMs??0))/430):0;
    const label=flowLabel(node.text),length=Math.max(...label.split('\n').map(line=>Array.from(line).length),1);
    return <div key={node.id} style={{position:'relative',minWidth:0,opacity:.24+.76*show,translate:`0 ${(1-show)*24}px`}}>
     <div style={{fontSize:30,fontWeight:500,letterSpacing:3,color:selected?color:'#75819b',marginBottom:30}}>{String(i+1).padStart(2,'0')}</div>
     <div style={{height:154,position:'relative',display:'flex',alignItems:'center',color:selected?color:spoken?'#66728b':'#8e98aa'}}>
      <div style={{position:'absolute',left:-20,top:2,width:150,height:150,borderRadius:43,background:`radial-gradient(ellipse at center,${color}16,${color}00 72%)`,scale:.85+.15*show}}/>
      <SceneIcon name={node.icon??'document'} size={122} color={selected?color:spoken?'#66728b':'#8e98aa'} drawProgress={show}/>
      {next&&<svg viewBox="0 0 180 32" preserveAspectRatio="none" style={{position:'absolute',left:148,right:-24,top:58,width:'calc(100% - 124px)',height:32,overflow:'visible'}}>
       <path d="M0 16H166" pathLength={1} fill="none" stroke="#a4b0cb55" strokeWidth={2}/>
       <path d="M0 16H166" pathLength={1} fill="none" stroke={color} strokeWidth={3} strokeDasharray={1} strokeDashoffset={1-link}/>
       <path d="M157 7L167 16L157 25" fill="none" stroke={color} strokeWidth={3} opacity={link}/>
      </svg>}
     </div>
     <div style={{fontFamily:displayFont,fontSize:Math.min(112,235/length),fontWeight:400,letterSpacing:-2,lineHeight:1.12,whiteSpace:'pre-line',marginTop:20,color:selected?color:spoken?'#263548':'#7e899e',scale:selected?1:.92,transformOrigin:'left top'}}>{label}</div>
     <div style={{height:4,width:Math.min(190,235),background:color,marginTop:25,scale:`${selected?show:0} 1`,transformOrigin:'left'}}/>
     {node.detail&&<div style={{fontSize:34,fontWeight:500,lineHeight:1.5,color:'#657188',marginTop:19,maxWidth:250,whiteSpace:'pre-line',opacity:show,translate:`0 ${(1-show)*15}px`}}>{sceneTextLines(node.detail,7).join('\n')}</div>}
    </div>;
   })}
  </div>
 </div>;
 return <div style={{height:'100%',boxSizing:'border-box',padding:wide?'48px 65px':'35px',display:'flex',flexDirection:'column',color:'#223128'}}>
  <h2 style={{fontSize:wide?58:45,fontWeight:650,letterSpacing:-1,margin:0,lineHeight:1.25}}>{scene.title}</h2>
  {current&&<div style={{flex:1,display:'flex',alignItems:'center',gap:wide?52:25,width:wide?'81%':'100%',minHeight:wide?350:200,position:'relative'}}>
   <div style={{position:'relative',width:wide?225:100,height:wide?225:100,flexShrink:0,display:'grid',placeItems:'center',borderRadius:wide?55:25,background:'linear-gradient(135deg,#d9823bd9,#c26c29f2)',boxShadow:'0 18px 45px #a2662520',opacity:p,rotate:`${(1-p)*-9}deg`,scale:.92+.08*p}}><SceneIcon name={current.icon??'document'} size={wide?100:50} color="#fff" drawProgress={p}/></div>
   <div style={{opacity:p,translate:`0 ${(1-p)*25}px`,minWidth:0}}><div style={{fontSize:wide?Math.min(112,current.text.length>10?82:112):50,fontWeight:800,letterSpacing:-2,lineHeight:1.2,overflowWrap:'anywhere'}}>{current.text.replace(/[、，]$/,'')}</div>{current.detail&&<div style={{fontSize:wide?34:27,lineHeight:1.5,color:'#7b6b59',marginTop:26}}>{current.detail}</div>}</div>
  </div>}
  <div style={{width:wide?'77%':'100%',display:'grid',gridTemplateColumns:`repeat(${Math.max(1,nodes.length)},1fr)`,gap:28,paddingBottom:12}}>{nodes.map((n,i)=>{const spoken=elapsed>=(n.atMs??0),selected=n.id===current?.id;return <div key={n.id} style={{position:'relative',opacity:spoken?1:.23}}>
   {i<nodes.length-1&&<div style={{position:'absolute',height:2,left:56,right:-28,top:28,background:i<index?'#cc793f':'#a4afa14a'}}/>}
   <div style={{position:'relative',width:56,height:56,borderRadius:16,display:'grid',placeItems:'center',background:selected?'#d47b34':'#e4e9df',color:selected?'#fff':'#566352'}}><SceneIcon name={n.icon??'document'} size={28}/></div>
   <div style={{fontSize:wide?27:21,fontWeight:selected?750:550,lineHeight:1.4,marginTop:18,color:selected?'#a85422':'#586152'}}>{n.text.replace(/[、，]$/,'')}</div>
  </div>;})}</div>
 </div>;
}
