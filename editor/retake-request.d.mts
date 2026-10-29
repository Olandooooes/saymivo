import type {Clip} from '../src/timeline';
import type {RetakeSnapshot} from '../src/retake-plan.mjs';
export function retakeRequest(clips:Clip[],options?:{mode?:'local'|'codex'|'gemini';allowCloudText?:boolean}):{clips:RetakeSnapshot[];mode:'local'|'codex'|'gemini';policy:'conservative';allowCloudText?:true};
