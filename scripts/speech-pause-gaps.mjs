// VAD proposes quiet speech gaps; pauseSegments applies the word guards.
import {PAUSE_DETECT_SEC} from './pause-plan.mjs';
export function speechPauseGaps(report){
 if(!Number.isFinite(report?.durationSec)||report.durationSec<=0||!Array.isArray(report.speech)||!report.speech.length)return [];
 if(report.speech.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]<0||r[1]<=r[0]||r[1]>report.durationSec+.01))return [];
 const sorted=report.speech.map(r=>[...r]).sort((a,b)=>a[0]-b[0]),gaps=[];let cursor=0;
 // A natural breath stays. The floor matches the shortest pause we might shrink.
 // A 20ms inset only keeps the reported edge off the speech boundary.
 for(const [a,b] of sorted){if(a-cursor>=PAUSE_DETECT_SEC)gaps.push([cursor+.02,a-.02]);cursor=Math.max(cursor,b);}
 if(report.durationSec-cursor>=PAUSE_DETECT_SEC)gaps.push([cursor+.02,report.durationSec]);
 return gaps;
}
