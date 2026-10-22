import type {Caption} from './captions';import type {Clip} from './timeline';
export function easeOut(t:number):number;
export function sceneEnvelope(ms:number,start:number,end:number,pace?:string):{enter:number;exit:number};
export function activeScene(captions:Caption[],ms:number,clipId?:string):Caption|undefined;
export function referencePlan(captions:Caption[],clips:Clip[]):Caption[];
export function projectScenes(captions:Caption[],clips:Clip[],fps?:number):Caption[];
export function headlineLines(text:string,limit?:number):string[];

export function readableSubtitle(words:Array<string|{text:string}>):string;
