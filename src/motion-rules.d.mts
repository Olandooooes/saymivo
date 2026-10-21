import type {Caption} from './captions';
import type {Clip} from './timeline';
import type {MotionKind} from './motion-plan';
export function captionText(c:Caption):string;
export function suggestMotion(text:string):MotionKind;
export function planMotions(caps:Caption[],clips:Clip[],strength:number,overrides?:Record<string,MotionKind>):{captions:Caption[];clips:Clip[]};
