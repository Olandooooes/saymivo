import type {Presentation} from '../src/presentation.mjs';
import type {DynamicMotionState,SceneDynamicMotionDraft,DynamicMotionEnvironment,DynamicMotionRenderReceipt} from '../src/scene-dynamic-motion.mjs';
type Store={getState:()=>DynamicMotionState&{setPresentation:(presentation:Presentation)=>void}};
type Result={ok:boolean;changed:boolean;issues:string[]};
export function applyDynamicMotionToStore(store:Store,draft:SceneDynamicMotionDraft,environment:DynamicMotionEnvironment,receipt?:DynamicMotionRenderReceipt):Result;
export function clearDynamicMotionFromStore(store:Store,sceneId:string):Result;
