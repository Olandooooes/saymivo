// Source-scene milliseconds. Keep pagination inside the object's actual visible
// lifetime, rather than spending its reading budget before it enters the frame.
export function visibleTextClock(elapsed,windows){
 const valid=windows.filter(window=>Number.isFinite(window.startMs)&&Number.isFinite(window.endMs)&&window.endMs>window.startMs).sort((a,b)=>a.startMs-b.startMs);
 const window=valid.find(window=>elapsed<window.endMs)??valid.at(-1);
 if(!window)return {startMs:0,endMs:0,elapsed:0,duration:1,visible:false};
 return {...window,elapsed:Math.max(0,Math.min(window.endMs-window.startMs,elapsed-window.startMs)),duration:window.endMs-window.startMs,visible:elapsed>=window.startMs&&elapsed<window.endMs};
}
