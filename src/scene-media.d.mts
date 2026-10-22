import type {SceneMedia,SceneHighlight,SceneCursorPoint} from './storyboard.mjs';
export function fittedMediaRect(mediaWidth:number|undefined,mediaHeight:number|undefined,panelWidth:number,panelHeight:number,fit?:'contain'|'cover'):{left:number;top:number;width:number;height:number};
export function sampleMediaCamera(media?:SceneMedia,ms?:number):{x:number;y:number;scale:number};
export function sampleMediaCursor(points?:SceneCursorPoint[],ms?:number):{x:number;y:number;clickAge:number|null;clickX?:number;clickY?:number}|null;
export function activeHighlights(regions?:SceneHighlight[],ms?:number):SceneHighlight[];
export function sampleFocusRegions(regions?:SceneHighlight[],ms?:number,transitionMs?:number):SceneHighlight[];
