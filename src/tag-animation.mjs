const ease=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
const finite=(value,fallback)=>Number.isFinite(value)?Math.max(0,value):fallback;
// Authored durations belong to the existing tag window; they never move speech
// cues. Unspecified values reproduce each established renderer's timing.
export function tagAnimationEnvelope(tag,elapsed,kind='kinetic'){
 const duration=Math.max(0,tag.endMs-tag.atMs),a=tag.animation??{},kinetic=kind==='kinetic';
 const authoredIn=finite(a.inMs,kinetic?380:280),authoredOut=finite(a.outMs,kinetic?260:200);
 const inMs=kinetic||a.inMs!==undefined?Math.min(authoredIn,duration*.35):authoredIn;
 const outMs=kinetic||a.outMs!==undefined?Math.min(authoredOut,duration*.3):authoredOut;
 const inside=elapsed>=tag.atMs&&elapsed<tag.endMs;
 const enter=inMs===0?(elapsed>=tag.atMs?1:0):ease((elapsed-tag.atMs)/inMs);
 const exit=outMs===0?(elapsed<tag.endMs?1:0):kinetic?1-ease((elapsed-(tag.endMs-outMs))/outMs):ease((tag.endMs-elapsed)/outMs);
 return {enter,exit,opacity:inside?enter*exit:0,inMs,outMs};
}
// A single kinetic line has one visibility envelope for all its glyphs. Its
// parent owns this fade/move; child text must not apply a second entrance.
export function kineticWholeLineEnvelope(tag,elapsed){
 const atMs=tag.lineAtMs?.length===1&&Number.isFinite(tag.lineAtMs[0])?Math.max(tag.atMs,tag.lineAtMs[0]):tag.atMs;
 const animation={...tag.animation,inMs:finite(tag.animation?.inMs,260),outMs:finite(tag.animation?.outMs,160)};
 const motion=tagAnimationEnvelope({...tag,atMs,animation},elapsed);
 return {...motion,y:(1-motion.enter)*10};
}
// Context changes only the text's treatment. Entry/exit envelopes and source
// coordinates remain owned by the original tag, so a held comparison never
// restarts its entrance or creates a second copy on the timeline.
export function tagContextEnvelope(tag,elapsed){
 const enabled=Number.isFinite(tag.contextAtMs)&&tag.contextAtMs>=tag.atMs&&tag.contextAtMs<tag.endMs;
 if(!enabled)return {enabled:false,progress:0,fillOpacity:1,outlineOpacity:0,underlineOpacity:1};
 const progress=ease((elapsed-tag.contextAtMs)/280),visible=elapsed>=tag.atMs&&elapsed<tag.endMs;
 return {enabled:true,progress,fillOpacity:visible?1-progress:0,outlineOpacity:visible?.32*progress:0,underlineOpacity:visible?1-progress:0};
}
export function tagLineEnvelope(tag,lineIndex,lineCount,elapsed){
 if(Array.isArray(tag.lineAtMs)&&tag.lineAtMs.length===lineCount&&Number.isFinite(tag.lineAtMs[lineIndex])){
  const {opacity}=tagAnimationEnvelope({...tag,atMs:Math.max(tag.atMs,tag.lineAtMs[lineIndex])},elapsed);
  return {opacity,y:0};
 }
 if(lineCount<=1)return {opacity:1,y:0};
 const duration=Math.max(0,tag.endMs-tag.atMs),delay=Math.min(finite(tag.animation?.lineDelayMs,85),duration*.12/Math.max(1,lineCount-1))*lineIndex;
 const inMs=Math.min(finite(tag.animation?.inMs,260),duration*.3),local=elapsed-tag.atMs-delay;
 const enter=inMs===0?(local>=0?1:0):ease(local/inMs);
 return {opacity:enter,y:(1-enter)*18};
}
