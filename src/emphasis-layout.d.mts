import type {SceneTag} from './storyboard.mjs';
export function emphasisDisplayText(text:string):string;
export function balancedEmphasisTags(tags:SceneTag[],firstSide?:'left'|'right'):SceneTag[];
export function emphasisGeometry(tag:SceneTag,width:number,height:number,elapsed:number):{right:boolean;span:number;size:number;enter:number;exit:number;opacity:number;x:number;y:number};
export function emphasisLineGeometry(tag:SceneTag,lineIndex:number,lineCount:number,elapsed:number):{opacity:number;y:number};
