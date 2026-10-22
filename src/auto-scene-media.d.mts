import type {Caption} from './captions';
import type {StoryScene} from './storyboard.mjs';
export type AutomaticSceneAsset={id:string;src:string;kind:'video'|'image';label:string;sourceNote?:string;keywords:string[];continuationKeywords?:string[];width:number;height:number;durationSec?:number;startSec?:number;enabled?:boolean;regions?:{id:string;cue:string;endCue?:string;mode:'highlight'|'spotlight'|'underline';x:number;y:number;w:number;h:number}[];cameraHints?:{cue:string;scale:number;x:number;y:number}[]};
export function bindAutomaticSceneMedia(scenes:StoryScene[],assets:AutomaticSceneAsset[],captions?:Caption[]):{scenes:StoryScene[];report:Record<string,unknown>[]};
