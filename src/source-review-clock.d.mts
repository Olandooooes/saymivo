export type SourceReviewClock={version:string;timestampBasis:string;sourceSha256:string;wavSha256:string;sampleRate:number;channels:number;sampleWidthBytes:number;[key:string]:unknown};
export function reviewClockMatches(a:unknown,b:unknown):boolean;
// undefined is an entirely legacy source; null means mixed or invalid clocks.
export function sourceCaptionClock(project:{clips:readonly {id:string;src:string}[];captions:readonly {clipId?:string;audioClock?:unknown}[]},src:string):SourceReviewClock|null|undefined;
