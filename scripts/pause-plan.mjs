// Preserve low-volume speech whenever cached word timings are available.
export function pauseSegments(clip,gaps,words=[]){
 const speech=words.filter(w=>w.endMs>clip.inSec*1000&&w.startMs<clip.outSec*1000);
 let cursor=clip.inSec;const segments=[];
 for(const [a,b]of gaps){
  const cutA=Math.max(clip.inSec,a+.12),cutB=Math.min(clip.outSec,b-.12);
  if(cutB<=cutA||speech.some(w=>w.startMs/1000-.08<cutB&&w.endMs/1000+.08>cutA))continue;
  if(cutA>cursor+.12)segments.push({inSec:cursor,outSec:cutA});cursor=Math.max(cursor,cutB);
 }
 if(cursor<clip.outSec-.12)segments.push({inSec:cursor,outSec:clip.outSec});
 if(speech.length&&segments.length){
  segments[0].inSec=Math.max(segments[0].inSec,Math.max(clip.inSec,speech[0].startMs/1000-.18));
  segments.at(-1).outSec=Math.min(segments.at(-1).outSec,Math.min(clip.outSec,speech.at(-1).endMs/1000+.3));
 }
 return segments.filter(s=>s.outSec>s.inSec&&(s.outSec-s.inSec>=.35||speech.some(w=>w.startMs/1000<s.outSec&&w.endMs/1000>s.inSec)));
}
