import {tagAnimationEnvelope,tagLineEnvelope} from './tag-animation.mjs';
// Reserve the centre for the speaker. Coordinates remain editable in the project.
export function emphasisDisplayText(text){
 const comparison=text.match(/^((?:当代|现代|新一代)的)([\u4e00-\u9fff]{2,6})$/);
 return comparison?`${comparison[1]}\n${comparison[2]}`:text;
}
export function balancedEmphasisTags(tags, firstSide='left') {
 return tags.map((tag,i)=>{
  const right=(i%2===0)===(firstSide==='right');
  return {...tag,text:emphasisDisplayText(tag.text),x:right?.69:.04,y:i<2?.12:.43,scale:1};
 });
}
export function emphasisGeometry(tag,width,height,elapsed) {
 const right=tag.x>=.5,span=Math.max(.08,Math.min(tag.width??.32,.96-tag.x));
 const units=Math.max(1,...tag.text.split('\n').map(line=>Array.from(line).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.6:1.02),0)));
 const size=Math.min(height*.16*(tag.scale??1),width*span/units);
 const {enter,exit,opacity}=tagAnimationEnvelope(tag,elapsed);
 return {right,span,size,enter,exit,opacity,x:(right?1:-1)*((1-enter)*48+(1-exit)*32),y:(1-enter)*14-(1-exit)*10};
}
// Multiline questions unfold in reading order within the existing source window.
// Single-line emphasis retains its original whole-word motion.
export function emphasisLineGeometry(tag,lineIndex,lineCount,elapsed){
 return tagLineEnvelope(tag,lineIndex,lineCount,elapsed);
}
