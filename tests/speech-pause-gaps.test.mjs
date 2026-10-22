import test from 'node:test';import assert from 'node:assert/strict';
import {speechPauseGaps} from '../scripts/speech-pause-gaps.mjs';
import {pauseSegments} from '../scripts/pause-plan.mjs';
test('speech activity proposes interior pauses with extra headroom and guards delayed first-word timestamps',()=>{
 const report={durationSec:128,speech:[[3.528,6.552],[7.112,87.768],[100.488,125.56]]};
 const gaps=speechPauseGaps(report);assert(gaps.some(([a,b])=>a>87&&b<101&&b-a>12));
 const segments=pauseSegments({inSec:0,outSec:128},gaps,[{startMs:3730,endMs:6990},{startMs:100390,endMs:125650}]);
 assert(segments[0].inSec<=3.3);assert(segments.at(-1).outSec>=125.65);
});
test('missing, empty or invalid speech activity cannot delete an entire source',()=>{
 for(const report of [null,{durationSec:10,speech:[]},{durationSec:10,speech:[[5,4]]},{durationSec:10,speech:[[0,Infinity]]}])assert.deepEqual(speechPauseGaps(report),[]);
});
