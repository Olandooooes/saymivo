import type {StoryScene,SceneNode} from './storyboard.mjs';
type Rect={x:number;y:number;width:number;height:number};
export function orbitGeometry(rect:Rect,elapsed:number,count?:number):{center:{x:number;y:number};radius:number;dots:Array<{id:number;x:number;y:number;r:number;opacity:number}>;media:Rect};
export function unequalGroupGeometry(rect:Rect):{primary:Rect;secondary:Rect};
export function evidenceGroups(scene:StoryScene):{primary:SceneNode[];secondary:SceneNode[]};
