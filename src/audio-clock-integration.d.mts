import type {StoryScene} from './storyboard.mjs';import type {Clip} from './timeline';import type {AudioClockConfig,AudioClockAnalysis,AudioClockTake} from './audio-clock.mjs';
export type AudioClockPlaybackAsset={src:string;sha256:string;kind:'audio';segmentPcmSha256:string;sourceSha256:string;analysisSha256:string;sourceStartMs:number;sourceEndMs:number;sampleCount:number;sampleRate:16000;channels:1;durationMs:number};
export type AudioClockEvidence={takeId:'A'|'B';sourceIdentity:{src:string;sha256:string;kind:'video';width:number;height:number;durationSec:number};analysis:AudioClockAnalysis;playbackAsset:AudioClockPlaybackAsset};
export type AudioClockSegment={sceneId:string;projectionId:string;takeId:'A'|'B';fromFrame:number;endFrame:number;sourceStartMs:number;sourceEndMs:number;speed:number;src:string;sha256:string};
export type AudioClockActualReport={key:string;status:'waiting'|'blocked'|'ready';actualMediaMs:number};
export type AudioClockOwnership={mode:'passthrough'|'replace';status:'passthrough'|'waiting'|'blocked'|'ready';issues:string[];forceMuteOriginal:boolean;forceMuteMusic:boolean;replacementGain:number;activeSegment:AudioClockSegment|null};
export function audioClockVideoCandidates(state:{clips?:{id:string;src:string;label?:string}[];brollAssets?:{id:string;src:string;kind:string;label?:string}[];contextSnapshot?:any}):{src:string;label:string;origin:string}[];
export function audioClockEvidenceIssues(state:any,config:AudioClockConfig,evidence:AudioClockEvidence[]|undefined):string[];
export function audioClockSceneSegments(raw:StoryScene,config:AudioClockConfig,clips:Clip[],fps:number,viewport?:{width:number;height:number}):{issues:string[];segments:AudioClockSegment[]};
export function audioClockProjectSegments(scenes:StoryScene[],clips:Clip[],fps:number,viewport?:{width:number;height:number}):{issues:string[];segments:AudioClockSegment[]};
export function audioClockOwnershipAtFrame(segments:AudioClockSegment[],frame:number,options?:{evidenceOk?:boolean;decoded?:AudioClockActualReport;renderVerified?:boolean}):AudioClockOwnership;
export function audioClockDecodedReport(audio:HTMLMediaElement|null,options:{playbackAsset:AudioClockPlaybackAsset;take:AudioClockTake;projectionId:string;expectedMediaMs:number;speed:number;previewPlaybackRate?:number;fps:number}):AudioClockActualReport;
export function verifyAudioClockWav(bytes:ArrayBuffer|Uint8Array,asset:AudioClockPlaybackAsset):Promise<{wavSha256:string;segmentPcmSha256:string;sampleCount:number}>;

export function audioClockDomPlaybackIssues(root:HTMLElement,draft:any,projection:StoryScene,sourceMs:number,fps:number):string[];

export function registerAudioClockMediaElement(slot:HTMLElement|null,audio:HTMLAudioElement|null,previewPlaybackRate?:number):()=>void;
