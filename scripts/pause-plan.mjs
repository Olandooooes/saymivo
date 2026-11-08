// Only an obvious drag is shortened. A natural breath, including a filler that
// never became a word, stays. A pause after sentence punctuation can be a
// little shorter than one in the middle of a sentence.
export const PAUSE_MIN_SEC=1.05;
export const PAUSE_BREATH_SEC=0.55;
export const PAUSE_SENTENCE_MIN_SEC=0.85;
export const PAUSE_SENTENCE_BREATH_SEC=0.42;
export const PAUSE_DETECT_SEC=PAUSE_SENTENCE_MIN_SEC;
const SENTENCE_END=/[。！？!?；;]$/u;
export function pausePolicyFor(words,pieceStart){
 const prev=[...words].reverse().find(word=>Number(word?.endMs)/1000<=pieceStart+0.08);
 const text=String(prev?.text??prev?.word??'').trim();
 if(SENTENCE_END.test(text))return {minSec:PAUSE_SENTENCE_MIN_SEC,breathSec:PAUSE_SENTENCE_BREATH_SEC};
 return {minSec:PAUSE_MIN_SEC,breathSec:PAUSE_BREATH_SEC};
}
export function pauseSegments(clip,gaps,words=[],pad=0.15){
 const speech=words.filter(w=>w.endMs>clip.inSec*1000&&w.startMs<clip.outSec*1000).sort((a,b)=>a.startMs-b.startMs);
 const cuts=[];
 for(const [a,b] of gaps){
  let pieces=[[Math.max(clip.inSec,a),Math.min(clip.outSec,b)]].filter(([x,y])=>y>x);
  // A slightly inaccurate boundary must not veto a whole long pause.
  // Subtract every protected word, then shrink only its remaining interior.
  for(const word of speech){
   const left=word.startMs/1000-pad,right=word.endMs/1000+pad;
   pieces=pieces.flatMap(([x,y])=>right<=x||left>=y?[[x,y]]:[[x,Math.min(y,left)],[Math.max(x,right),y]].filter(([u,v])=>v>u));
  }
  for(const [x,y] of pieces){
   const policy=pausePolicyFor(speech,x);
   if(y-x<=policy.minSec)continue;
   const cutA=x+policy.breathSec/2,cutB=y-policy.breathSec/2;
   if(cutB>cutA+.02)cuts.push([cutA,cutB]);
  }
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


// Union protections from independently clocked observations, not just one cue track.
export function protectedPauseWords(...groups){
 const seen=new Set();return groups.flat().filter(w=>{
  if(!Number.isFinite(w?.startMs)||!Number.isFinite(w?.endMs)||w.endMs<=w.startMs)return false;
  const key=`${w.startMs}:${w.endMs}`;if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
}
export function assertPauseWordSafety(clip,segments,words){
 for(const w of words){
  const start=Math.max(clip.inSec,w.startMs/1000),end=Math.min(clip.outSec,w.endMs/1000);
  if(end>start&&!segments.some(s=>s.inSec<=start+1e-8&&s.outSec>=end-1e-8))throw Error('停顿计划触及受保护原声词范围，未应用');
 }
 return segments;
}
