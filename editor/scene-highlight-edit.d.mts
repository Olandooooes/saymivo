import type {StoryScene} from '../src/storyboard.mjs';
export function sceneHighlightBoxPatch(scene:StoryScene,id:string,box:{x:number;y:number;w:number;h:number}):Partial<StoryScene>|null;
export function sceneHighlightColorPatch(scene:StoryScene,id:string,color:string):Partial<StoryScene>|null;
export function sceneHighlightPreviewSecond(scene:StoryScene,id:string):number;
