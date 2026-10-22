import {useEffect} from 'react';
import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
import {displayFontConfig} from './display-fonts.mjs';
export const displayFont='var(--koubo-display-font, PingFang SC, sans-serif)';
const loaded=new Map<string,Promise<void>>();
export function useDisplayFont(id?:string){
 useEffect(()=>{
  const config=displayFontConfig(id);if(!config)return;
  const handle=delayRender('Load chosen display font: '+config.label);
  if(!loaded.has(config.id))loaded.set(config.id,(async()=>{const face=new FontFace(config.family,`url(${staticFile('fonts/'+config.file)})`);(document.fonts as FontFaceSet & {add(face:FontFace):void}).add(await face.load());})());
  loaded.get(config.id)!.then(()=>continueRender(handle)).catch(cancelRender);
 },[id]);
}
