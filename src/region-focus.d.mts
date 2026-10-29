import type {StoryScene,SceneMedia} from './storyboard.mjs';
import type {StageRect,ScreenshotFocusConfig} from './dynamic-mechanisms.mjs';
export function regionFocusMedia(scene:StoryScene,config:ScreenshotFocusConfig):SceneMedia|null;
export function regionFocusState(scene:StoryScene,config:ScreenshotFocusConfig,elapsed:number,viewport?:{width:number;height:number}):{media:SceneMedia|null;assetRect:StageRect;contentRect:StageRect;origin:StageRect;focusRect:StageRect;phase:string;progress:number;assetDimOpacity:number;cropOpacity:number;explanationRect:StageRect;explanationLines:{text:string;atMs:number;highlightText?:string;highlightAtMs?:number;opacity:number}[]};
export function regionFocusIssues(scene:StoryScene,config:ScreenshotFocusConfig):string[];
