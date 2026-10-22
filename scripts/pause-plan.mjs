// Preserve low-volume speech whenever cached word timings are available.
export function pauseSegments(clip,gaps,words=[]){
 const speech=words.filter(w=>w.endMs>clip.inSec*1000&&w.startMs<clip.outSec*1000).sort((a,b)=>a.startMs-b.startMs);
 const cuts=[];
 for(const [a,b] of gaps){
  let safe=[[Math.max(clip.inSec,a+.12),Math.min(clip.outSec,b-.12)]];
  // A slightly inaccurate boundary must not veto a whole long pause.
  // Subtract every protected word, then cut only its remaining interior.
  for(const word of speech){
   const left=word.startMs/1000-.15,right=word.endMs/1000+.15;
   safe=safe.flatMap(([x,y])=>right<=x||left>=y?[[x,y]]:[[x,Math.min(y,left)],[Math.max(x,right),y]].filter(([u,v])=>v>u));
  }
  cuts.push(...safe.filter(([x,y])=>y-x>=.4));
 }
 cuts.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const cut of cuts){const last=merged.at(-1);if(last&&cut[0]<=last[1])last[1]=Math.max(last[1],cut[1]);else merged.push([...cut]);}
 let cursor=clip.inSec;const segments=[];
 for(const [a,b] of merged){if(a>cursor+.12)segments.push({inSec:cursor,outSec:a});cursor=Math.max(cursor,b);}
 if(cursor<clip.outSec-.12)segments.push({inSec:cursor,outSec:clip.outSec});
 if(speech.length&&segments.length){
  segments[0].inSec=Math.max(segments[0].inSec,Math.max(clip.inSec,speech[0].startMs/1000-.45));
  segments.at(-1).outSec=Math.min(segments.at(-1).outSec,Math.min(clip.outSec,speech.at(-1).endMs/1000+.45));
 }
 return segments.filter(s=>s.outSec>s.inSec&&(s.outSec-s.inSec>=.35||speech.some(w=>w.startMs/1000<s.outSec&&w.endMs/1000>s.inSec)));
}
