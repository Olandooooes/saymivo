import type {RetakeProject,RetakeAnalysis,RetakeOptions,RetakeResult} from '../src/retake-plan.mjs';
export type RetakeStoreState=RetakeProject&{past:RetakeProject[];future:RetakeProject[];meta:{fps:number;durationInFrames:number;width:number;height:number}|null;currentFrame:number;selectedId:string|null;selectedClipId:string|null};
export function applyRetakePlanToStore<T extends RetakeStoreState>(store:{setState:(updater:(state:T)=>Partial<T>|T)=>void},analysis:RetakeAnalysis,options?:RetakeOptions):RetakeResult;
