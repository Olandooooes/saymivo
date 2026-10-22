import React from 'react';
export const sceneIcons=['search','document','tools','shield','check','edit','layers','star','like','coin'] as const;
export type SceneIconName=typeof sceneIcons[number];
const paths:Record<SceneIconName,string[]>={
 search:['M15.5 15.5L22 22','M18 10A8 8 0 1 1 2 10A8 8 0 0 1 18 10'],
 document:['M5 2H15L20 7V22H5Z','M15 2V8H20','M8 12H16M8 16H16'],
 tools:['M14 3A6 6 0 0 0 7 10L2 18L6 22L14 15A6 6 0 0 0 21 8L17 12L12 7L16 3Z'],
 shield:['M12 2L21 6V12C21 17 17 21 12 23C7 21 3 17 3 12V6Z','M7 12L10.5 15.5L17 9'],
 check:['M3 12L9 18L22 5'],
 edit:['M3 17L16 4L21 9L8 22H3Z','M14 6L19 11'],
 layers:['M2 7L12 2L22 7L12 12Z','M2 12L12 17L22 12M2 17L12 22L22 17'],
 star:['M12 2L15 8.5L22 9.5L17 14.5L18.2 22L12 18.4L5.8 22L7 14.5L2 9.5L9 8.5Z'],
 like:['M8 10L12 2C15 2 15 5 14 9H21L20 21H8Z','M3 10H7V21H3Z'],
 coin:['M22 12A10 10 0 1 1 2 12A10 10 0 0 1 22 12','M15 7H10A3 3 0 0 0 10 12H14A3 3 0 0 1 14 17H8M12 4V20']
};
export function SceneIcon({name='document',size=48,color='currentColor',glow=false,drawProgress}:{name?:SceneIconName;size?:number;color?:string;glow?:boolean;drawProgress?:number}){
 return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" style={{flexShrink:0,color,filter:glow?`drop-shadow(0 0 5px ${color}) drop-shadow(0 0 12px ${color})`:undefined,overflow:'visible'}} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{(paths[name]??paths.document).map((d,i)=><path key={i} d={d} pathLength={drawProgress===undefined?undefined:1} strokeDasharray={drawProgress===undefined?undefined:1} strokeDashoffset={drawProgress===undefined?undefined:1-Math.max(0,Math.min(1,drawProgress))}/>)}</svg>;
}
