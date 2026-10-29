import type {StoryScene} from './storyboard.mjs';
export type DynamicLibraryIdentity={src:string;sha256:string;width:number;height:number;kind:'image'|'video';durationSec?:number};
export type DynamicLibraryEnvironment={width:number;height:number;sourceIdentity?:DynamicLibraryIdentity;assetIdentity?:DynamicLibraryIdentity};
/** Incomplete factual values remain undefined. Never render a draft with unresolved requiredData as accepted. */
export type DynamicLibraryDraft={config:Record<string,any>;requiredData:string[];issues:string[]};
export type DynamicLibraryEntry={id:string;kind:string;variant?:string;name:string;purpose:string;fields:any[];requiredData:string[];stage:'experimental-independent';uiAccepted:false;automaticAllowed:false;constructor:(scene:StoryScene,environment:DynamicLibraryEnvironment)=>DynamicLibraryDraft};
export const dynamicMotionLibrary:readonly DynamicLibraryEntry[];
export function createDynamicLibraryConfig(id:string,scene:StoryScene,environment:DynamicLibraryEnvironment):DynamicLibraryDraft;
