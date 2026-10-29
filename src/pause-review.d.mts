import type {Clip} from './timeline';
import type {AutocutPlan} from './apply-autocut-project.mjs';
export type PauseCut={id:string;clipId:string;src:string;startSec:number;endSec:number};
export function pauseCuts(clips:Clip[],plan:AutocutPlan):PauseCut[];
export function selectedPausePlan(clips:Clip[],cuts:PauseCut[],selected:string[]):AutocutPlan;
