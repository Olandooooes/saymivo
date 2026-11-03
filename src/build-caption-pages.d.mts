import type {Caption,CaptionWord} from './captions';
export function reflowCaptionPages(captions:Caption[],options?:{maxWidth?:number;gapMs?:number;protectedPhrases?:string[]}):Caption[];
export function buildCaptionPages(words:Array<{word:string;clipId:string;srcStartMs:number;srcEndMs:number;spaceBefore?:boolean}>,accentIdx?:number[],topByClip?:Record<string,number>,options?:{maxWidth?:number;gapMs?:number;protectedPhrases?:string[]}):Caption[];
