import type {SceneTag} from './storyboard.mjs';
export function tagAnimationEnvelope(tag:Pick<SceneTag,'atMs'|'endMs'|'animation'>,elapsed:number,kind?:'kinetic'|'label'):{enter:number;exit:number;opacity:number;inMs:number;outMs:number};
export function kineticWholeLineEnvelope(tag:Pick<SceneTag,'atMs'|'endMs'|'animation'|'lineAtMs'>,elapsed:number):{enter:number;exit:number;opacity:number;inMs:number;outMs:number;y:number};
export function tagContextEnvelope(tag:Pick<SceneTag,'atMs'|'endMs'|'contextAtMs'>,elapsed:number):{enabled:boolean;progress:number;fillOpacity:number;outlineOpacity:number;underlineOpacity:number};
export function tagLineEnvelope(tag:Pick<SceneTag,'atMs'|'endMs'|'animation'|'lineAtMs'>,lineIndex:number,lineCount:number,elapsed:number):{opacity:number;y:number};
