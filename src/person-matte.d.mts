export type PersonMatte={prefix:string;sourceStartMs:number;fps:number;count:number;timesMs?:number[]};
export function personMatteFrame(matte:PersonMatte|undefined,sourceMs:number):{index:number;src:string}|null;
