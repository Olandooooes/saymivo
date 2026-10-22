// VAD proposes quiet speech gaps; pauseSegments applies the word guards.
export function speechPauseGaps(report){
 if(!Number.isFinite(report?.durationSec)||report.durationSec<=0||!Array.isArray(report.speech)||!report.speech.length)return [];
 if(report.speech.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]<0||r[1]<=r[0]||r[1]>report.durationSec+.01))return [];
 const sorted=report.speech.map(r=>[...r]).sort((a,b)=>a[0]-b[0]),gaps=[];let cursor=0;
 for(const [a,b] of sorted){if(a-cursor>=.65)gaps.push([cursor+.2,a-.2]);cursor=Math.max(cursor,b);}
 if(report.durationSec-cursor>=.65)gaps.push([cursor+.2,report.durationSec]);
 return gaps;
}
