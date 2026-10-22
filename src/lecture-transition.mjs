const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{const x=clamp(t);return x*x*(3-2*x);};
const defaults={rotateY:-1.5,rotateZ:-.3,perspective:2400};
export function closingTextTransition(previousLayout,currentLayout,progress){
 const separate=Boolean(previousLayout&&!['speaker','headline','chapter','outro'].includes(previousLayout)&&currentLayout==='outro');
 const weights=lectureTransition(progress);
 return {separate,outgoing:separate?weights.outgoing:1,incoming:separate?weights.incoming:1};
}
// Keep a single opaque page while replacing its contents in two phases.
// These weights deliberately never expose two sets of readable text together.
export function lectureTransition(progress,from={},to={}){
 const t=clamp(progress),pose={};
 for(const key of Object.keys(defaults)){
  const a=from[key]??defaults[key],b=to[key]??defaults[key];
  pose[key]=a+(b-a)*smooth(t);
 }
 return {outgoing:1-smooth(t*2),incoming:smooth(t*2-1),pose};
}

export function withLecturePageTransitions(scenes){
 const panel=s=>s&&!['speaker','headline','chapter','outro'].includes(s.layout);
 return scenes.map((scene,index)=>{
  const before=scenes[index-1];
  return scene.transitionMs===undefined&&panel(before)&&panel(scene)&&
   before.src===scene.src&&before.clipId===scene.clipId&&Math.abs(before.endMs-scene.startMs)<40
   ?{...scene,transitionMs:400}:scene;
 });
}
