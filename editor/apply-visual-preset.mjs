import {applyVisualPreset} from '../src/visual-presets.mjs';
export function applyVisualPresetToStore(store,sceneId,id,options={}){
 const state=store.getState(),result=applyVisualPreset(state.presentation,sceneId,id,options);
 if(!result.ok)return result;
 if(JSON.stringify(result.presentation)===JSON.stringify(state.presentation))return {ok:true,changed:false};
 state.setPresentation(result.presentation); // existing store: one history transaction
 return {ok:true,changed:true};
}
