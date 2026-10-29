export type PersonMatte={prefix:string;sourceStartMs:number;fps:number;count:number;timesMs?:number[];src?:string;sourceSha256?:string;width?:number;height?:number;endMs?:number};
export function personMatteFrame(matte:PersonMatte|undefined,sourceMs:number):{index:number;src:string}|null;
