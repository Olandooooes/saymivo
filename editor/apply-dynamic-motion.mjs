import {assessSceneDynamicMotion,dynamicMotionEnvironmentFromState,previewSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';

/** Read the current store immediately before committing. The caller's snapshot
 * cannot replace changed clips, presentation settings, or the current scene. */
export function applyDynamicMotionToStore(store,draft,environment,receipt){
 const state=store.getState(),scene=state.presentation?.scenes?.find(scene=>scene.id===draft.sceneId);
 if(!scene)return {ok:false,changed:false,issues:['原场已不存在']};
 const current=dynamicMotionEnvironmentFromState(state,environment),review=assessSceneDynamicMotion(draft,scene,current,receipt);
 if(!review.ok)return {...review,changed:false};
 const saved=previewSceneDynamicMotion(draft),{visualPreset,...rest}=scene,nextScene={...rest,dynamicMotion:saved};
 if(JSON.stringify(nextScene)===JSON.stringify(scene))return {ok:true,changed:false,issues:[]};
 state.setPresentation({...state.presentation,scenes:state.presentation.scenes.map(item=>item===scene?nextScene:item)});
 return {ok:true,changed:true,issues:[]};
}
export function clearDynamicMotionFromStore(store,sceneId){
 const state=store.getState(),scene=state.presentation?.scenes?.find(scene=>scene.id===sceneId);
 if(!scene)return {ok:false,changed:false,issues:['原场已不存在']};
 if(!scene.dynamicMotion)return {ok:true,changed:false,issues:[]};
 const {dynamicMotion,...rest}=scene;
 state.setPresentation({...state.presentation,scenes:state.presentation.scenes.map(item=>item===scene?rest:item)});
 return {ok:true,changed:true,issues:[]};
}
