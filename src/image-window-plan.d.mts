import type {StoryScene,SceneMedia} from './storyboard.mjs';
export function localWindowImage(src:unknown):boolean;
export function imageWindowSignature(state:any):string;
export function imageWindowMedia(assets:any[],duration:number,options?:{zoom?:number;transitionMs?:number;switchTimes?:number[]}):SceneMedia;
export function matchImageWindows(state:any,options?:{startMs?:number;endMs?:number;zoom?:number;transitionMs?:number}):{scenes:StoryScene[];issues:string[]};
export function imageSequenceState(media:SceneMedia,elapsed:number):Array<{item:NonNullable<SceneMedia['sequence']>[number];index:number;opacity:number;elapsed:number;shift:number}>;
