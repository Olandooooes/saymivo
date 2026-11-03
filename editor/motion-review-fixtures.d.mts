import type{StoryScene}from'../src/storyboard.mjs';
import type{Clip}from'../src/timeline';
import type{DynamicLibraryIdentity}from'../src/dynamic-motion-library.mjs';
export type MotionReviewFixture={entryId:string;name:string;status:'configured'|'unavailable';issues:string[];provenance:string;canApply:false;uiAccepted:false;validationScope:'authored-data-and-static-contract-only';scene?:StoryScene;config?:Record<string,any>;clips?:Clip[];sourceIdentity?:DynamicLibraryIdentity;assetIdentities?:DynamicLibraryIdentity[];meta?:{fps:number;width:number;height:number;durationInFrames:number};presentation?:{format:'landscape';theme:'knowledge'};accentColor?:string;captions?:any[];brolls?:any[];brollAssets?:any[];music?:null;sourceComparison?:{src:string;startMs:number;endMs:number};notes?:string[]};
export type MotionReviewFixtureCatalog={version:1;sourceIdentity?:DynamicLibraryIdentity;assetIdentities:DynamicLibraryIdentity[];fixtures:MotionReviewFixture[];summary:{total:number;configured:number;unavailable:number};uiAccepted:false;loadErrors?:{src:string;message:string}[]};
export const motionReviewSourceRequests:Readonly<{sourceSrc:string;imageSrcs:string[]}>;
export function createMotionReviewFixtures(options?:{sourceIdentity?:DynamicLibraryIdentity;assetIdentities?:DynamicLibraryIdentity[];sourceStartSec?:number;width?:number;height?:number}):MotionReviewFixtureCatalog;
export function loadMotionReviewFixtures(options?:{fetcher?:typeof fetch;signal?:AbortSignal;sourceSrc?:string;imageSrcs?:string[];sourceStartSec?:number}):Promise<MotionReviewFixtureCatalog>;
