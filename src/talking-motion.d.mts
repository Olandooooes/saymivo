import type {Caption} from './captions';
import type {Clip} from './timeline';
export type TalkingCue={renderer?:'reference-blue';id:string;kind:'emphasis'|'contrast'|'steps';clipId:string;src:string;startMs:number;endMs:number;items:{text:string;atMs:number}[];reason:string;signature:string;topPct:number;leftPct?:number;widthPct?:number;scale:number;entryMs:number};
export const talkingMotionNames:Record<TalkingCue['kind'],string>;
export function matchTalkingMotion(captions:Caption[],clips:Clip[],options?:{startMs?:number;endMs?:number;fps?:number;limit?:number}):TalkingCue[];
export function projectTalkingMotion(cues:TalkingCue[],captions:Caption[],clips:Clip[],fps?:number):TalkingCue[];
export function projectedTalkingCaptions(captions:Caption[],clips:Clip[],fps?:number):Array<Caption&{at:number;until:number;src:string}>;
export function talkingMotionSignature(captions:Caption[],clipId:string,startMs:number,endMs:number):string;
