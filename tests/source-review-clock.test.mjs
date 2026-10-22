import test from 'node:test';import assert from 'node:assert/strict';
import {sourceCaptionClock,reviewClockMatches} from '../src/source-review-clock.mjs';
const clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:'a'.repeat(64),wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
const project=clocks=>({clips:[{id:'a1',src:'clips/a.mp4'},{id:'a2',src:'clips/a.mp4'},{id:'b',src:'clips/b.mp4'}],captions:clocks.map((audioClock,i)=>({clipId:i%2?'a2':'a1',...(audioClock===undefined?{}:{audioClock})})).concat({clipId:'b',audioClock:{...clock,wavSha256:'c'.repeat(64)}})});
test('clock identity ignores receipt diagnostics but requires the complete source-zero protocol',()=>{
 assert.equal(reviewClockMatches(undefined,undefined),true);
 assert.equal(reviewClockMatches(clock,{...clock,sourcePath:'/other/computer/take.mp4',expectedLeadingPaddingSamples:8000}),true);
 for(const [key,value] of Object.entries({version:'legacy',timestampBasis:'audio-first-sample-ms',sourceSha256:'c'.repeat(64),wavSha256:'c'.repeat(64),sampleRate:48000,channels:2,sampleWidthBytes:4}))assert.equal(reviewClockMatches(clock,{...clock,[key]:value}),false,key);
 for(const invalid of [null,{},[],{...clock,sourceSha256:'short'},{...clock,wavSha256:undefined},{...clock,sampleRate:1},{...clock,channels:2},{...clock,sampleWidthBytes:4}]){
  assert.equal(reviewClockMatches(invalid,invalid),false);
  assert.equal(reviewClockMatches(undefined,invalid),false);
 }
});
test('all same-source captions must share a complete clock; mixed or partial sources are invalid rather than legacy',()=>{
 assert.equal(sourceCaptionClock(project([]),'clips/a.mp4'),undefined);
 assert.equal(sourceCaptionClock(project([undefined,undefined]),'clips/a.mp4'),undefined);
 const p=project([clock,{...clock,sourcePath:'another path'}]),resolved=sourceCaptionClock(p,'clips/a.mp4');
 assert.deepEqual(resolved,clock);assert.notEqual(resolved,p.captions[0].audioClock);
 for(const clocks of [[clock,undefined],[undefined,clock],[clock,{...clock,wavSha256:'c'.repeat(64)}],[{}],[null]]){
  assert.equal(sourceCaptionClock(project(clocks),'clips/a.mp4'),null);
  assert.equal(reviewClockMatches(undefined,sourceCaptionClock(project(clocks),'clips/a.mp4')),false);
 }
});
