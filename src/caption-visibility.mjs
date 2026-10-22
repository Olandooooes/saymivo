// Times are projected timeline milliseconds. A hold never crosses the next cue
// or a clip boundary; absolute rounding avoids adding two half-frame errors.
export function captionVisibility(caption,nextStart=Infinity,fps=30){
 if(!Number.isFinite(fps)||fps<=0)throw Error('Invalid frame rate');
 const hold=Number.isFinite(caption.holdMs)?Math.max(0,Math.min(1000,caption.holdMs)):700;
 const visibleEndMs=Math.min(nextStart,caption.endMs+hold,caption.holdMaxMs??Infinity);
 const from=Math.round(caption.startMs*fps/1000),end=Math.round(visibleEndMs*fps/1000);
 return {from,durationInFrames:Math.max(0,end-from),visibleEndMs,holdMs:hold};
}
