import type {Caption} from './captions';
export type CaptionTimingReview={id:string;anchor:{startMs:number;endMs:number;text:string};range:{startMs:number;endMs:number};holdMs?:number};
export function validCaptionTimingReview(review:unknown):boolean;
export function applyCaptionTimingReviews(captions:Caption[],reviews?:CaptionTimingReview[],options?:{sourceDurationMs?:number;clipRanges?:Record<string,{startMs:number;endMs:number}>}):{captions:Caption[];report:Array<{id?:string;captionId?:string;status:string;reason?:string}>};
