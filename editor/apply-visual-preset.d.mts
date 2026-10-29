import type {Presentation} from '../src/presentation.mjs';import type {VisualPresetId} from '../src/visual-presets.mjs';
export function applyVisualPresetToStore(store:{getState:()=>{presentation:Presentation;setPresentation:(p:Presentation)=>void}},sceneId:string,id:VisualPresetId|null,options?:{side?:'left'|'right';primaryNodeIds?:string[]}):{ok:true;changed:boolean}|{ok:false;error:string};
