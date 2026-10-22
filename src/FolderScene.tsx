import React from 'react';
import {SceneIcon} from './SceneIcon';
import {easeOut} from './reference-motion.mjs';
import type {StoryScene} from './storyboard.mjs';
import {displayFont} from './DisplayFont';

// Original CSS illustration. Text remains editable; no borrowed reference art.
export function FolderScene({scene,elapsed,wide}:{scene:StoryScene;elapsed:number;wide:boolean}){
 const closing=scene.folderCloseMs===undefined?0:easeOut((elapsed-scene.folderCloseMs)/850);
 const nodes=scene.nodes??[],open=easeOut((elapsed-350)/1100)*(1-closing),appear=easeOut(elapsed/350);
 const paperWidth=wide?390:220,paperHeight=wide?590:300;
 return <div style={{display:'grid',gridTemplateColumns:wide?'30% 70%':'1fr',gap:20,marginTop:25}}>
  <div style={{display:'flex',flexDirection:'column',gap:wide?54:28,paddingTop:wide?45:0}}>{nodes.map((n,i)=>{
   const show=easeOut((elapsed-(n.atMs??0))/350);
   return <div key={n.id} style={{opacity:show,translate:`0 ${(1-show)*18}px`,position:'relative'}}>
    <div style={{display:'flex',gap:18,alignItems:'center',color:'#3156b9'}}><SceneIcon name={n.icon??'document'} size={wide?52:34} drawProgress={show}/><span style={{fontSize:wide?26:23,fontWeight:600,letterSpacing:3,color:'#79869e'}}>{String(i+1).padStart(2,'0')}</span></div>
    <div style={{fontFamily:displayFont,fontSize:wide?Math.min(64,280/Math.max(1,Array.from(n.text).length)):30,fontWeight:400,lineHeight:1.25,letterSpacing:-1,color:'#3156b9',marginTop:20}}>{n.text}</div>
    {n.detail&&<p style={{fontSize:wide?29:24,lineHeight:1.55,color:'#657188',margin:'14px 0 0'}}>{n.detail}</p>}
    <div style={{height:3,width:wide?250:150,background:'linear-gradient(90deg,#3156b9,#8276ae66)',marginTop:24,scale:`${show} 1`,transformOrigin:'left'}}/>
   </div>;
  })}</div>
  <div style={{height:paperHeight+40,position:'relative',perspective:1800,transformStyle:'preserve-3d',opacity:appear,translate:`0 ${(1-appear)*40}px`}}>
   <div style={{position:'absolute',left:wide?'31%':'29%',top:10,width:paperWidth,height:paperHeight,background:'#264594',border:'2px solid #30477e',borderRadius:'5px 20px 20px 5px',transform:'rotateY(-16deg) rotateZ(-3deg)',boxShadow:'12px 24px 32px #14254824'}}/>
   {nodes.map((n,i)=>{
    const show=easeOut((elapsed-(n.atMs??0))/650),spread=wide?i*Math.min(235,280/Math.max(1,nodes.length-1))*open*show:(i-(nodes.length-1)/2)*30*open;
    const label=wide&&/^[\u3400-\u9fff]{4}$/.test(n.text)?`${n.text.slice(0,2)}\n${n.text.slice(2)}`:n.text;
    return <div key={n.id} style={{position:'absolute',left:`calc(${wide?'31%':'29%'} + ${spread}px)`,top:18+i*4,width:paperWidth,height:paperHeight-12,boxSizing:'border-box',padding:wide?'36px 28px 24px 38px':'30px 22px 20px 34px',textAlign:wide&&i>0?'right':'left',background:i%2?'#f5f4fa':'#f4f7fb',border:'2px solid #acb8d2',borderRight:`8px solid ${n.color??['#b7c9ef','#b8abdc','#8dbbbf'][i%3]}`,borderRadius:'2px 13px 13px 2px',transformOrigin:'left center',transform:wide?`rotateY(${-10+i*10*open}deg) translateY(${(1-show)*20}px)`:`rotateY(${-10+(i-(nodes.length-1)/2)*32*open}deg) translateX(${(i-(nodes.length-1)/2)*100*open}px)`,boxShadow:'6px 10px 20px #1425481c',zIndex:3+i,opacity:wide?show:1}}>
     <div style={{position:'absolute',left:12,top:30,bottom:30,borderLeft:'3px dotted #aab6cc'}}/>
     <span style={{fontSize:wide?26:18,color:'#6d7f9f',fontWeight:600,letterSpacing:2}}>{String(i+1).padStart(2,'0')}</span>
     <div style={{margin:wide?'42px 0 30px':'28px 0 20px',color:'#3156b9',display:'flex',justifyContent:wide&&i>0?'flex-end':'flex-start'}}><SceneIcon name={n.icon??'document'} size={wide?94:45} drawProgress={show}/></div>
     <div style={{fontFamily:wide?displayFont:undefined,fontSize:wide?52:28,fontWeight:wide?400:800,lineHeight:1.2,letterSpacing:-1,color:'#3156b9',whiteSpace:'pre-line',opacity:easeOut((elapsed-(n.atMs??0))/350)}}>{label}</div>
     {[100,83,94].map((line,j)=><div key={j} style={{height:5,width:`${line}%`,background:'#c0cbe0',opacity:.45,marginTop:wide?26:20,scale:`${easeOut((elapsed-(n.atMs??0)-j*90)/500)} 1`,transformOrigin:wide&&i>0?'right':'left'}}/>)}
    </div>;
   })}
   <div style={{position:'absolute',left:wide?'31%':'29%',top:10,width:paperWidth,height:paperHeight,boxSizing:'border-box',padding:wide?'45px 30px':'34px 24px',border:'2px solid #334c85',borderRadius:'4px 18px 18px 4px',background:'linear-gradient(135deg,#3156b9,#29458e)',transformOrigin:'left center',transform:`rotateY(${-14-126*open}deg)`,zIndex:10,backfaceVisibility:'visible',boxShadow:'10px 20px 32px #14254829'}}>
    <div style={{fontFamily:wide?displayFont:undefined,fontSize:wide?43:25,fontWeight:wide?400:900,color:'#ecf0ff',lineHeight:1.4,opacity:Math.max(0,1-open*1.8)}}>{scene.title}</div>
    <div style={{position:'absolute',left:15,top:30,bottom:30,borderLeft:'4px dotted #b0c2f055'}}/>
   </div>
  </div>
 </div>;
}
