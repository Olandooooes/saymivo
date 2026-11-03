import {applyRetakePlan} from '../src/retake-plan.mjs';

// Zustand-compatible, one atomic undo step for the entire selected batch.
// Kept separate from store.ts until the editor feature is explicitly integrated.
export function applyRetakePlanToStore(store,analysis,options={}){
 let result;
 store.setState(state=>{
  result=applyRetakePlan(state,analysis,{...options,fps:state.meta?.fps??30});
  if(!result.ok||!result.changed)return state;
  const snapshot={clips:state.clips,captions:state.captions,brolls:state.brolls,
   presentation:state.presentation,music:state.music,accentColor:state.accentColor};
  const frames=result.project.clips.reduce((n,c)=>n+Math.max(1,Math.round((c.outSec-c.inSec)/(c.speed??1)*(state.meta?.fps??30))),0);
  return {...result.project,past:[...state.past,snapshot].slice(-100),future:[],
   meta:state.meta?{...state.meta,durationInFrames:frames}:state.meta,
   currentFrame:Math.max(0,Math.min(state.currentFrame??0,frames-1)),selectedId:null,selectedClipId:null};
 });
 return result;
}
