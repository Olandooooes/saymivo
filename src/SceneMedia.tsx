import {imageSequenceState} from './image-window-plan.mjs';
import React,{useId} from 'react';
import {Freeze,Img,OffthreadVideo,Video,Sequence,staticFile,useVideoConfig,getRemotionEnvironment} from 'remotion';
import type {StoryScene} from './storyboard.mjs';
import {fittedMediaRect,sampleMediaWindow,sampleMediaCamera,sampleMediaCursor,activeHighlights,sampleFocusRegions} from './scene-media.mjs';
import {easeOut} from './reference-motion.mjs';
function OneSceneMedia({scene,elapsed,width,height,windowElapsed}:{scene:StoryScene;elapsed:number;width:number;height:number;windowElapsed?:number}){
 const {fps}=useVideoConfig(),media=scene.media!,maskId=useId().replace(/[^a-zA-Z0-9]/g,'');
 const windowBox=sampleMediaWindow(media,windowElapsed??elapsed);
 const rect=fittedMediaRect(media.width,media.height,width*windowBox.width,height*windowBox.height,media.fit),camera=sampleMediaCamera(media,elapsed),cursor=sampleMediaCursor(media.cursor,elapsed);
 const regions=activeHighlights(scene.highlights,elapsed),focus=sampleFocusRegions((scene.highlights??[]).filter(r=>r.mode==='spotlight'||(!r.mode&&scene.layout==='spotlight')),elapsed);
 const Media=getRemotionEnvironment().isRendering?OffthreadVideo:Video;
 const video=<Media src={staticFile(media.src)} trimBefore={media.freezeAtSec===undefined?Math.round((media.startSec??0)*fps):0} playbackRate={media.freezeAtSec===undefined?(media.rate??1)*(scene.speed??1):1} muted style={{width:'100%',height:'100%',objectFit:'fill'}}/>;
 return <div data-media-window={scene.id} style={{position:'absolute',...(media.windowKeyframes?.length?{left:windowBox.x*width,top:windowBox.y*height,width:windowBox.width*width,height:windowBox.height*height,borderRadius:16,boxShadow:'0 12px 34px #08132b33',transformOrigin:'top left'}:{inset:0}),overflow:'hidden',background:media.kind==='video'?'#101216':'#e7e5df'}}>
  <div data-media-plane={scene.id} style={{position:'absolute',...rect,transform:`translate(${camera.x}%,${camera.y}%) scale(${camera.scale})`,transformOrigin:'center'}}>
   {media.kind==='image'?<Img src={staticFile(media.src)} style={{width:'100%',height:'100%'}}/>:media.freezeAtSec!==undefined?<Freeze frame={Math.round(media.freezeAtSec*fps)}>{video}</Freeze>:<Sequence from={Math.round(((scene.phaseStartMs??scene.startMs)-scene.startMs)/1000*fps)} premountFor={fps}>{video}</Sequence>}
   <svg data-annotations={scene.id} viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible'}}>
    {focus.length>0&&<><defs><mask id={'focus-'+maskId}><rect width="1000" height="1000" fill="white"/>{focus.map(r=><rect key={r.id} x={r.x*1000-6} y={r.y*1000-5} width={r.w*1000+12} height={r.h*1000+10} rx="10" fill="black"/>)}</mask></defs><rect width="1000" height="1000" fill="#101116" fillOpacity=".48" mask={`url(#focus-${maskId})`}/></>}
    {regions.map(original=>{const r=focus.find(f=>f.id===original.id)??original;const progress=easeOut((elapsed-r.atMs)/380),color=r.color??'#efff24',mode=r.mode??(scene.layout==='spotlight'?'spotlight':'highlight');return <g key={r.id} opacity={progress}>
     {mode==='spotlight'?<rect x={r.x*1000-5} y={r.y*1000-4} width={r.w*1000+10} height={r.h*1000+8} rx="8" fill="none" stroke="#fff" strokeWidth="5"/>:mode==='underline'?<rect x={r.x*1000} y={(r.y+r.h*.88)*1000} width={r.w*1000*progress} height={Math.max(2,r.h*1000*.12)} fill={color}/>:<rect x={r.x*1000} y={r.y*1000} width={r.w*1000*progress} height={r.h*1000} rx="3" fill={mode==='selection'?'#8ac8ff':color} fillOpacity={mode==='selection'?.58:.45}/>}
    </g>;})}
    {cursor?.clickAge!==null&&cursor?.clickAge!==undefined&&<circle cx={(cursor.clickX??cursor.x)*1000} cy={(cursor.clickY??cursor.y)*1000} r={10+cursor.clickAge/16} fill="none" stroke="#e99c37" strokeWidth="4" opacity={1-cursor.clickAge/600}/>}
   </svg>
   {cursor&&<svg data-cursor="illustrative" width="32" height="42" viewBox="0 0 30 40" style={{position:'absolute',left:`${cursor.x*100}%`,top:`${cursor.y*100}%`,filter:'drop-shadow(1px 2px 2px #0008)',overflow:'visible'}}><path d="M2 2L24 23L15 24L22 36L16 39L10 27L2 34Z" fill="#17191c" stroke="white" strokeWidth="2"/></svg>}
  </div>
 </div>;
}

// One reusable outer window, with independently timed image cameras and overlap
// during handoff. Existing single-image/video scenes retain their exact branch.
export function SceneMedia(props:{scene:StoryScene;elapsed:number;width:number;height:number}){
 const {scene,elapsed,width,height}=props,media=scene.media!;
 if(!media.sequence?.length)return <OneSceneMedia {...props}/>;
 return <div data-image-window-sequence={scene.id} style={{position:'absolute',inset:0}}>{imageSequenceState(media,elapsed).map(({item,index,opacity,elapsed:local,shift})=><div key={item.id} data-window-image={item.id} data-window-index={index} style={{position:'absolute',inset:0,opacity,transform:`translateX(${shift*width}px)`}}><OneSceneMedia scene={{...scene,media:{...media,...item,kind:'image',sequence:undefined}}} elapsed={local} windowElapsed={elapsed} width={width} height={height}/></div>)}</div>;
}
