import type {StoryScene} from '../src/storyboard.mjs';
import type {PersonMatte} from '../src/person-matte.mjs';
export type MatteSceneSnapshot=Pick<StoryScene,'id'|'clipId'|'src'|'startMs'|'endMs'>;
export function matteSceneSnapshot(scene:StoryScene):MatteSceneSnapshot;
export function sameMatteScene(a:MatteSceneSnapshot,b:MatteSceneSnapshot):boolean;
export function validateMatteBinding(matte:PersonMatte|undefined,original:MatteSceneSnapshot,current:MatteSceneSnapshot):{ok:true;matte:PersonMatte}|{ok:false;error:string};
