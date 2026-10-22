import {EditorialCriteria} from './EditorialCriteria';
import {emphasisGeometry,emphasisLineGeometry} from './emphasis-layout.mjs';
import {displayFont} from './DisplayFont';
import {lectureTransition,closingTextTransition} from './lecture-transition.mjs';
import {chapterSweep} from './chapter-entry.mjs';
import {EditorialFlow} from './EditorialFlow';
import {AiryTitle} from './AiryTitle';
import {StructuredScene} from './StructuredScene';
import {SceneIcon} from './SceneIcon';
import {SceneMedia} from './SceneMedia';
import React from 'react';
import {tagAnimationEnvelope,tagContextEnvelope,kineticWholeLineEnvelope} from './tag-animation.mjs';
import {AbsoluteFill,Freeze,Img,OffthreadVideo,Video,Sequence,staticFile,useCurrentFrame,useVideoConfig,getRemotionEnvironment} from 'remotion';
import {easeOut,headlineLines} from './reference-motion.mjs';
import {focusedNodeId,nodeFocusAmount,previousStoryboardScene,storyboardFrameRange,type StoryScene} from './storyboard.mjs';
const yellow='#efff24',ink='#17191b',orange='#c66e35';
const font='PingFang SC, Microsoft YaHei, sans-serif';
function SceneVisual({scene,ms,plane,settledPanel=false,contentOpacity=1,surface=true,panelPose}:{scene:StoryScene;ms:number;plane:string;settledPanel?:boolean;contentOpacity?:number;surface?:boolean;panelPose?:StoryScene['containerPose']}){
 const {width:w,height:h,fps}=useVideoConfig();const wide=w>h;const blurId='chapter-'+React.useId().replace(/:/g,'');
 const elapsed=(ms-(scene.phaseStartMs??scene.startMs))*(scene.speed??1),p=scene.transitionMs===0?1:easeOut(elapsed/(scene.transitionMs??200));
 if(scene.layout==='speaker'||scene.titleTreatment==='embedded')return null;
 const foreground=['headline','chapter','outro'].includes(scene.layout);
 if((plane==='foreground')!==foreground)return null;
 if(scene.titleTreatment==='airy'&&['chapter','headline'].includes(scene.layout)&&(!scene.headlinePosition||scene.headlinePosition==='left'))return <AiryTitle scene={scene} elapsed={elapsed} width={w} height={h}/>;
 const title=scene.title,lines=headlineLines(title,wide?9:12),nodes=scene.nodes??[];
 const sweeping=scene.layout==='chapter'&&scene.chapterTypography?.entry==='sweep';const sweep=chapterSweep(elapsed,{delayMs:scene.chapterTypography?.delayMs??100});const chapterFilter=sweeping?`url(#${blurId})`:`blur(${(1-p)*8}px)`;
 const tiny:React.CSSProperties={fontSize:wide?24:26,letterSpacing:3,color:orange,fontWeight:750};
 const tag=null;
 if(scene.layout==='headline'&&scene.headlinePosition&&scene.headlinePosition!=='left')return <AbsoluteFill style={{fontFamily:font,pointerEvents:'none'}}>
  {lines.map((line,i)=>{const q=easeOut((elapsed-i*110)/360),split=scene.headlinePosition==='split';return <div key={i} style={{position:'absolute',left:'4%',right:'4%',top:split?(i===0?'6%':`${77.5+(i-1)*12}%`):scene.headlinePosition==='top'?`${6+i*12}%`:`${62+i*12}%`,fontSize:wide?Math.min(split&&i>0?72:96,1520/Math.max(12,line.length)):64,lineHeight:1.15,textAlign:'center',fontFamily:displayFont,fontWeight:400,color:'var(--koubo-emphasis-on-dark, #efff24)',opacity:q,translate:`0 ${(1-q)*24}px`,textShadow:'var(--koubo-emphasis-shadow, 3px 5px 0 #101014)'}}>{line}</div>;})}
 </AbsoluteFill>;
 if(scene.layout==='outro')return <AbsoluteFill style={{fontFamily:font,pointerEvents:'none'}}>
  <div style={{position:'absolute',left:'5%',top:'9%',width:'59%'}}>{lines.map((line,i)=><div key={i} style={{fontSize:wide?122:70,fontFamily:displayFont,fontWeight:400,color:'var(--koubo-emphasis-on-dark, #efff24)',lineHeight:1.25,opacity:p,translate:`${(1-p)*-45}px 0`,textShadow:'var(--koubo-emphasis-shadow, 3px 5px 0 #101014)'}}>{line}</div>)}</div>
  <div style={{position:'absolute',left:'5%',top:'48%',width:'58%',display:'flex',gap:wide?65:25}}>{nodes.map((n,i)=>{const show=easeOut((elapsed-(n.atMs??0))/220),draw=scene.iconDrawMs===0?1:easeOut((elapsed-(n.atMs??0))/(scene.iconDrawMs??650));return <div key={n.id} style={{width:wide?230:155,textAlign:'center',opacity:show,translate:`0 ${(1-show)*20}px`}}><SceneIcon name={n.icon??'star'} size={wide?190:110} color={n.color??['#a7edff','#e1b8ee','#d5b2ff'][i%3]} glow drawProgress={draw}/><div style={{fontSize:wide?29:27,color:'#e5e9ed',fontWeight:750,marginTop:22,lineHeight:1.4}}>{n.text}</div></div>;})}</div>
  {scene.body&&<div style={{position:'absolute',left:'5%',top:'75%',maxWidth:'60%',color:'#d2d6de',fontSize:30,lineHeight:1.5,opacity:easeOut((elapsed-600)/300)}}>{scene.body}</div>}
 </AbsoluteFill>;
 if(foreground)return <AbsoluteFill style={{fontFamily:font,pointerEvents:'none'}}>
  {sweeping&&<svg width={0} height={0} style={{position:'absolute'}}><defs><filter id={blurId} x="-100%" y="-50%" width="300%" height="200%"><feGaussianBlur stdDeviation={`${sweep.blurX} ${sweep.blurY}`}/></filter></defs></svg>}
  <div style={{position:'absolute',left:'4.5%',top:wide?'11%':'6%',width:wide?'47%':'91%'}}>{tag}
   <div style={{marginTop:32}}>{lines.map((line,i)=>{const q=scene.layout==='chapter'?(sweeping?sweep.opacity:p):easeOut((elapsed-i*110)/360);return <div key={i} style={{filter:scene.layout==='chapter'?chapterFilter:undefined,fontSize:scene.layout==='chapter'?Math.min((wide?Math.min(112,730/Math.max(6,line.length)):70)*(scene.chapterTypography?.lineScales?.[i]??1),(wide?w*.50:w*.88)/Math.max(1,Array.from(line).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.6:1),0))):wide?Math.min(112,730/Math.max(6,line.length)):70,whiteSpace:scene.layout==='chapter'?'nowrap':undefined,fontFamily:displayFont,fontWeight:400,lineHeight:1.28,color:'var(--koubo-emphasis-on-dark, #efff24)',letterSpacing:-2,opacity:q,translate:`${sweeping?sweep.x:(1-q)*-60}px ${sweeping?0:(1-q)*12}px`,textShadow:'var(--koubo-emphasis-shadow, 3px 5px 0 #101014)'}}>{line}</div>;})}</div>
   {scene.body&&<p style={{fontSize:wide?32:35,color:'#e2e3e8',lineHeight:1.65,maxWidth:'92%',marginTop:35,opacity:easeOut((elapsed-400)/350)}}>{scene.body}</p>}
   {nodes.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:18,marginTop:38}}>{nodes.map(n=>{const q=easeOut((elapsed-(n.atMs??0))/300);return <div key={n.id} style={{opacity:q,translate:`0 ${(1-q)*24}px`,background:'#3d3f45db',border:'2px solid #ffffff78',borderRadius:55,padding:'12px 25px',fontSize:wide?36:34,color:'var(--koubo-emphasis-on-dark, #efff24)',fontWeight:850,display:'flex',alignItems:'center',gap:18}}>{n.icon&&<SceneIcon name={n.icon} size={40} color={yellow} glow/>}{n.text}</div>;})}</div>}
  </div>
 </AbsoluteFill>;
 const panelProgress=settledPanel?1:p;
 const pose=panelPose??scene.containerPose;
 const panel={left:w*.035,top:h*.035,width:w*.93,height:h*(wide?.83:.61)};
 const contentWidth=wide?'77%':'100%';
 const focused=focusedNodeId(scene,elapsed);
 const comparison=Boolean(scene.layout==='overview'&&scene.overviewComparison)||(wide&&!scene.media&&(scene.layout==='cards'||(scene.layout==='overview'&&(scene.nodes?.length??0)<=4)));
 const Media=getRemotionEnvironment().isRendering?OffthreadVideo:Video;
 return <AbsoluteFill style={{fontFamily:font,pointerEvents:'none'}}><div data-scene={scene.id} style={{position:'absolute',...panel,border:surface&&!comparison?'1px solid #e6e3db':'1px solid transparent',borderRadius:12,background:surface?(comparison?'linear-gradient(120deg,#101c38c9,#15172b94)':scene.media?.kind==='video'?'#101216':scene.layout==='flow'?'linear-gradient(135deg,#fbfcf6f5,#e6eee4e8)':'#fafaf5'):'transparent',boxShadow:surface&&!comparison?'0 18px 65px #0004':undefined,overflow:'hidden',boxSizing:'border-box',opacity:panelProgress,transform:`perspective(${pose?.perspective??2400}px) rotateY(${(pose?.rotateY??-1.5)-(1-panelProgress)*3}deg) rotateZ(${pose?.rotateZ??-.3}deg) translateY(${(1-panelProgress)*35}px)`}}>
  <AbsoluteFill style={{opacity:contentOpacity}}>
  {scene.layout==='flow'&&!scene.media?<EditorialFlow scene={scene} elapsed={elapsed} wide={wide}/>:comparison?<EditorialCriteria scene={scene} elapsed={elapsed}/>:scene.media?<SceneMedia scene={scene} elapsed={elapsed} width={panel.width-16} height={panel.height-16}/>:<div style={{padding:wide?'40px 48px':'35px',width:contentWidth,boxSizing:'border-box'}}>
   <h2 style={{fontWeight:700,fontSize:wide?52:48,color:ink,lineHeight:1.25,letterSpacing:-1,margin:'20px 0 30px',maxWidth:'100%',overflowWrap:'anywhere'}}>{title}</h2>
   {scene.body&&<p style={{fontSize:wide?32:34,lineHeight:1.6,color:'#63625f',margin:'0 0 30px'}}>{scene.body}</p>}
   {['overview','stack','route','gallery'].includes(scene.layout)?<StructuredScene scene={scene} elapsed={elapsed} wide={wide}/>:scene.layout==='demo'?<div style={{border:'2px solid #d8d6cf',borderRadius:20,background:'white',padding:30}}>{nodes.map((n,i)=>{const q=easeOut((elapsed-(n.atMs??0))/320);return <div key={n.id} style={{marginTop:20,display:'flex',alignItems:'center',gap:18,opacity:q,translate:`0 ${(1-q)*15}px`,fontSize:33,color:focused===n.id?ink:'#888'}}><span style={{background:focused===n.id?yellow:'#eee',borderRadius:12,padding:'7px 14px',fontSize:24,fontWeight:800}}>{String(i+1).padStart(2,'0')}</span><div><b>{n.text}</b>{n.detail&&<small style={{display:'block',fontSize:23,marginTop:6,color:'#7d7973'}}>{n.detail}</small>}</div></div>;})}</div>:
    <div style={{display:'grid',gridTemplateColumns:wide?`repeat(${Math.min(nodes.length||1,scene.layout==='flow'?4:3)},1fr)`:'1fr',gap:wide?20:14,marginTop:wide?40:20}}>{nodes.map((n,i)=>{const q=easeOut((elapsed-(n.atMs??0))/330),focus=focused===n.id,focusAmount=nodeFocusAmount(scene,n.id,elapsed);return <div key={n.id} style={{position:'relative',opacity:q*(scene.layout==='cards'?.5+.5*focusAmount:1),translate:`0 ${(1-q)*24}px`,background:`rgb(${234+21*focusAmount},${232+23*focusAmount},${226+29*focusAmount})`,borderRadius:20,padding:wide?'25px 22px':'20px',borderTop:`6px solid ${n.color??(focus?orange:'#bdb8ae')}`,boxShadow:focus?'0 14px 30px #00000012':undefined,minHeight:wide?160:70}}><div style={{fontSize:21,color:orange,marginBottom:16,fontWeight:800}}>{String(i+1).padStart(2,'0')}</div><div style={{fontSize:wide?(nodes.length>3?35:43):36,fontWeight:900,color:ink,lineHeight:1.35,overflowWrap:'anywhere'}}>{n.text}</div>{n.detail&&<div style={{fontSize:wide?26:27,lineHeight:1.65,color:'#66615a',marginTop:20,background:focus&&scene.layout!=='flow'?`${yellow}77`:undefined}}>{n.detail}</div>}{scene.layout==='flow'&&i<nodes.length-1&&wide&&<span style={{position:'absolute',right:-24,top:'42%',fontSize:38,color:orange,zIndex:3}}>→</span>}</div>;})}</div>}
  </div>}
 </AbsoluteFill></div></AbsoluteFill>;
}
function SceneTags({scene,ms}:{scene:StoryScene;ms:number}){
 const {width,height}=useVideoConfig();
 const elapsed=(ms-(scene.phaseStartMs??scene.startMs))*(scene.speed??1);
 return <AbsoluteFill style={{pointerEvents:'none',fontFamily:font}}>{(scene.tags??[]).map(t=>{
  if(elapsed<t.atMs||elapsed>=t.endMs)return null;
  const p=tagAnimationEnvelope(t,elapsed,'label').opacity;
  const context=tagContextEnvelope(t,elapsed);
  const contextText=(text:string)=>context.enabled?<><span style={{opacity:context.fillOpacity}}>{text}</span><span aria-hidden="true" style={{position:'absolute',inset:0,color:'transparent',WebkitTextFillColor:'transparent',WebkitTextStroke:'1.6px var(--koubo-emphasis, #efff24)',textShadow:'none',opacity:context.outlineOpacity}}>{text}</span></>:text;
  if(scene.tagTreatment==='kinetic'){
   const {right,span,size,enter,opacity,x,y}=emphasisGeometry(t,width,height,elapsed);
   const singleLine=!t.text.includes('\n'),wholeLine=singleLine?kineticWholeLineEnvelope(t,elapsed):undefined;
   const lineTimed=(t.lineAtMs?.length??0)>1&&t.lineAtMs?.length===t.text.split('\n').length;
   const firstLine=lineTimed?tagAnimationEnvelope({...t,atMs:t.lineAtMs![0]},elapsed):undefined;
   return <div key={t.id} data-scene-tag={t.id} style={{position:'absolute',left:t.x*width,top:t.y*height,width:width*span,fontFamily:displayFont,fontSize:size,fontWeight:400,lineHeight:1.12,color:'var(--koubo-emphasis, #efff24)',letterSpacing:0,textAlign:right?'right':'left',whiteSpace:'pre-line',WebkitTextStroke:'var(--koubo-emphasis-stroke, 1.2px #213027)',textShadow:'var(--koubo-emphasis-shadow, 0 3px 8px #15221866)',opacity:wholeLine?wholeLine.opacity:lineTimed?1:opacity,transform:wholeLine?`translateY(${wholeLine.y}px)`:lineTimed?'none':`translate(${x}px,${y}px) scale(${.96+.04*enter})`,transformOrigin:right?'right':'left'}}>{t.text.split("\n").map((line,index,lines)=>{const motion=wholeLine?{opacity:1,y:0}:emphasisLineGeometry(t,index,lines.length,elapsed);return <span key={index} style={{display:"block",opacity:motion.opacity,transform:`translateY(${motion.y}px)`,...(context.enabled?{position:'relative'}:{})}}>{contextText(line||"\u00a0")}</span>;})}<div style={{height:5,width:Math.min(size*1.4,140),marginTop:16,marginLeft:right?'auto':0,background:'var(--koubo-emphasis-line, #efff24)',opacity:wholeLine?(context.enabled?context.underlineOpacity:1):context.enabled?(firstLine?.opacity??1)*context.underlineOpacity:firstLine?.opacity,transform:`scaleX(${wholeLine?.enter??firstLine?.enter??enter})`,transformOrigin:right?'right':'left'}}/></div>;
  }
  return <div key={t.id} data-scene-tag={t.id} style={{position:'absolute',left:t.x*width,top:t.y*height,maxWidth:width*.48,boxSizing:'border-box',padding:'14px 26px',borderRadius:18,background:context.enabled?`color-mix(in srgb, #464950dc ${context.fillOpacity*100}%, transparent)`:'#464950dc',border:context.enabled?`1px solid color-mix(in srgb, #ffffff44 ${context.fillOpacity*100}%, transparent)`:'1px solid #ffffff44',color:'var(--koubo-emphasis-on-dark, #efff24)',fontSize:Math.min(width,height)*.043*(t.scale??1),fontWeight:850,lineHeight:1.35,overflowWrap:'anywhere',boxShadow:context.enabled?`0 9px 22px color-mix(in srgb, #0005 ${context.fillOpacity*100}%, transparent)`:'0 9px 22px #0005',opacity:p,transform:`translateY(${(1-p)*20}px) rotate(${t.rotate??0}deg)`}}>{context.enabled?<span style={{position:'relative',display:'block'}}>{contextText(t.text)}</span>:t.text}</div>;
 })}</AbsoluteFill>;
}
export function StoryboardLayer({scenes,plane='background'}:{scenes:StoryScene[];plane?:string}){
 const {fps}=useVideoConfig(),frame=useCurrentFrame(),ms=frame/fps*1000;
 const scene=scenes.filter(s=>{const r=storyboardFrameRange(s,fps);return frame>=r.from&&frame<r.from+r.durationInFrames;}).at(-1);if(!scene)return null;
 const range=storyboardFrameRange(scene,fps);
 const previous=previousStoryboardScene(scenes,scene);
 const transition=(scene.transitionMs??200)/(scene.speed??1),progress=transition?easeOut((ms-scene.startMs)/transition):1;
 const cross=previous&&previous.sourceId!==scene.sourceId&&Math.abs(previous.endMs-scene.startMs)<40&&(scene.sourceOffsetMs??0)<(scene.transitionMs??200)&&progress<1;
 // A shared opaque page avoids both moving cut edges and transparent text ghosts.
 const isPanel=(s:StoryScene)=>!['speaker','headline','chapter','outro'].includes(s.layout);
 const panelSwap=Boolean(cross&&previous&&isPanel(previous)&&isPanel(scene)&&plane==='background');
 const closing=closingTextTransition(previous?.layout,scene.layout,transition?(ms-scene.startMs)/transition:1);
 const closingSwap=Boolean(cross&&closing.separate);
 const swap=lectureTransition(transition?(ms-scene.startMs)/transition:1,previous?.containerPose,scene.containerPose);
 const oldLayer=cross&&<Sequence key={'previous-'+previous.id} from={storyboardFrameRange(previous,fps).from} durationInFrames={storyboardFrameRange({...previous,endMs:scene.startMs+transition},fps).durationInFrames}><div style={{position:'absolute',inset:0,opacity:panelSwap?swap.outgoing:closingSwap?closing.outgoing:plane==='foreground'||scene.layout==='outro'?1-progress:1}}><Freeze frame={storyboardFrameRange(previous,fps).durationInFrames-1}><SceneVisual scene={previous} ms={previous.endMs-.01} plane={plane} settledPanel={panelSwap} surface={!panelSwap} panelPose={panelSwap?swap.pose:undefined}/></Freeze></div></Sequence>;
 const currentLayer=<Sequence key={'current-'+scene.id} from={range.from} durationInFrames={range.durationInFrames} premountFor={fps}><div style={{position:'absolute',inset:0,opacity:closingSwap&&plane==='foreground'?closing.incoming:1}}><SceneVisual scene={scene} ms={ms} plane={plane} settledPanel={panelSwap} contentOpacity={panelSwap?swap.incoming:1} panelPose={panelSwap?swap.pose:undefined}/>{plane==='foreground'&&<SceneTags scene={scene} ms={ms}/>}</div></Sequence>;
 return panelSwap?<>{currentLayer}{oldLayer}</>:<>{oldLayer}{currentLayer}</>;
}
