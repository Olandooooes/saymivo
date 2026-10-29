export type TextVisibilityWindow={startMs:number;endMs:number};
export type VisibleTextClock=TextVisibilityWindow&{elapsed:number;duration:number;visible:boolean};
export function visibleTextClock(elapsed:number,windows:TextVisibilityWindow[]):VisibleTextClock;
