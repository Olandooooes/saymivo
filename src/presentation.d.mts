import type {Caption} from './captions';import type {Clip} from './timeline';
export type Chapter={id:string;clipId:string;src?:string;startMs:number;title:string};
export type Presentation={theme:'classic'|'knowledge';format:'portrait'|'landscape';title?:string;style?:'clean'|'reference';motionPace?:'calm'|'balanced'|'brisk';chapters:Chapter[]};
export function presentationSize(p?:Presentation):{width:number;height:number};
export function knowledgePlan(captions:Caption[],clips:Clip[],options?:{format?:string;title?:string;style?:string;motionPace?:string}):{captions:Caption[];presentation:Presentation};
export function projectChapters(chapters:Chapter[]|undefined,clips:Clip[],fps?:number):Array<Chapter&{at:number}>;
export function speakerBox(layout:string,width:number,height:number):{left:number;top:number;width:number;height:number;radius:number};
