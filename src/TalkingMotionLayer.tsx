import React from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';
import {SceneTags} from './StoryboardLayer';
import {useDisplayFont} from './DisplayFont';
import {displayFontFamily} from './display-fonts.mjs';
import {emphasisThemeVars} from './emphasis-theme.mjs';
import {blueTalkingTags} from './talking-blue.mjs';
import {projectTalkingMotion,type TalkingCue} from './talking-motion.mjs';
import type {Caption} from './captions';
import type {Clip} from './timeline';
// Adapter only: the actual typography and every animation are the approved
// SceneTags renderer used by the earlier blue-font project, not a new card UI.
export const TalkingMotionBlue:React.FC<{cue:TalkingCue;ms:number}>=({cue,ms})=>{
 useDisplayFont('source-han');
 const scene={id:cue.id,clipId:cue.clipId,src:cue.src,startMs:cue.startMs,endMs:cue.endMs,layout:'speaker' as const,title:'',tagTreatment:'kinetic' as const,tags:blueTalkingTags(cue)};
 return <div data-talking-motion={cue.kind} data-talking-renderer="reference-blue-scene-tags" style={{position:'absolute',inset:0,...emphasisThemeVars('tech-indigo'),'--koubo-display-font':displayFontFamily('source-han')} as React.CSSProperties}><SceneTags scene={scene} ms={ms}/></div>;
};
export const TalkingMotionLayer:React.FC<{cues:TalkingCue[];captions:Caption[];clips:Clip[];accentColor?:string}>=({cues,captions,clips})=>{
 const frame=useCurrentFrame(),{fps}=useVideoConfig(),ms=frame/fps*1000;
 const active=projectTalkingMotion(cues,captions,clips,fps).find(c=>ms>=c.startMs&&ms<c.endMs);
 return active?<TalkingMotionBlue cue={active} ms={ms}/>:null;
};
