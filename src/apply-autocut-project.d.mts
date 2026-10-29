import type {RetakeProject} from './retake-plan.mjs';
export type AutocutPlan={id:string;segments:{inSec:number;outSec:number}[]}[];
export function applyAutocutProject<T extends RetakeProject>(project:T,plan:AutocutPlan,fps?:number):T;
