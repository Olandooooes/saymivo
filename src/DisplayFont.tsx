import {createContext,useEffect} from 'react';
import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
import {displayFontConfig} from './display-fonts.mjs';
export const displayFont='var(--koubo-display-font, PingFang SC, sans-serif)';
const loaded=new Map<string,Promise<void>>();
export const DisplayFontContext=createContext<string|undefined>(undefined);
export function loadDisplayFont(id?:string):Promise<void>{
 const config=displayFontConfig(id);if(!config)return document.fonts.ready.then(()=>{});
 if(!loaded.has(config.id))loaded.set(config.id,(async()=>{const face=new FontFace(config.family,`url(${staticFile('fonts/'+config.file)})`);(document.fonts as FontFaceSet & {add(face:FontFace):void}).add(await face.load());})());
 return loaded.get(config.id)!;
}
export function useDisplayFont(id?:string){
 useEffect(()=>{
  const config=displayFontConfig(id);if(!config)return;
  const handle=delayRender('Load chosen display font: '+config.label);
  loadDisplayFont(id).then(()=>continueRender(handle)).catch(cancelRender);
 },[id]);
}
