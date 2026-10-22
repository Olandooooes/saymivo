export type OverviewComparison={before:{src:string;label:string;atMs:number};after:{src:string;label:string;atMs:number};steps:{id:string;text:string;atMs:number}[]};
export function overviewComparisonIssues(value:unknown,durationMs:number):string[];
export function createOverviewComparison(beforeSrc:string,afterSrc:string,durationMs?:number):OverviewComparison;
