import type{StoryScene}from'../src/storyboard.mjs';import type{DynamicMatteEvidence}from'../src/dynamic-matte.mjs';
export function fetchDynamicMatteEvidence(scene:StoryScene,config:any,sourceIdentity:any,options?:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<DynamicMatteEvidence|undefined>;
