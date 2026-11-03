import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStoryboard} from '../src/storyboard.mjs';
import {typedDataClockIssues,typedDataClockState,typedDataClockAtOutput,typedDataClockExposure,typedDataClockFormatDuration} from '../src/typed-data-clock.mjs';

// Original synthetic values only. No private source, actual audio or detector is used.
const scene={id:'clock-scene',src:'clips/synthetic-clock.mp4',startMs:10000,endMs:30000,layout:'cards',title:'Explicit synthetic clocks',nodes:[]};
const identity={src:scene.src,sha256:'a'.repeat(64),kind:'video',width:1920,height:1080,durationSec:40};
const context={sourceIdentity:identity};
const provenance={kind:'illustration',note:'Original synthetic timestamps; not tool execution or measured speech.'};
const base={label:'Synthetic data',definition:'Declared source-relative value with no inferred facts.',provenance,window:{startMs:2000,endMs:12000}};
const seconds={kind:'seconds',integerDigits:3,decimals:1,rounding:'floor'};
const elapsed={...base,id:'elapsed',kind:'duration',unit:'ms',value:{basis:'source-elapsed'},format:seconds};
const accelerated={...base,id:'authored-range',kind:'duration',unit:'ms',value:{basis:'explicit-range',fromMs:0,toMs:60000},format:{kind:'mm:ss',minuteDigits:2}};
const events={...base,id:'events',kind:'event-count',unit:'count',initialCount:0,eventDefinition:{name:'Authored markers',criterion:'Count only the explicitly supplied marker IDs when their source timestamp is reached.'},events:[{id:'marker-1',atMs:2000},{id:'marker-2',atMs:4000},{id:'marker-3',atMs:11000}],format:{kind:'integer',integerDigits:2}};
const receipt={...base,id:'receipt',kind:'receipt-duration',unit:'ms',receipt:{basis:'explicit-shared-origin-ms',startMs:(10*60+16)*60000,endMs:(10*60+27)*60000},format:{kind:'mm:ss',minuteDigits:2}};
const config={kind:'typed-data-clock',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:identity.sha256,startMs:scene.startMs,endMs:scene.endMs},tracks:[elapsed,accelerated,events,receipt]};
const clone=v=>structuredClone(v),state=(ms,c=config,s=scene,ctx=context)=>typedDataClockState(s,c,ms,ctx),track=(s,id)=>s.tracks.find(t=>t.id===id);

test('one original source clock drives real elapsed duration, an explicitly authored range, event markers and static receipt separately',()=>{
 assert.deepEqual(typedDataClockIssues(scene,config,context),[]);
 const s=state(7000);assert.equal(s.status,'data-ready');
 assert.equal(track(s,'elapsed').valueMs,5000);assert.equal(track(s,'elapsed').text,'5.0');assert.equal(track(s,'elapsed').displayUnit,'s');
 assert.equal(track(s,'authored-range').valueMs,30000);assert.equal(track(s,'authored-range').text,'00:30');
 assert.equal(track(s,'elapsed').progress,.5);assert.equal(track(s,'authored-range').progress,.5);assert.equal(track(s,'events').progress,.5);
 assert.equal(track(s,'events').count,2);assert.deepEqual(track(s,'events').countedEventIds,['marker-1','marker-2']);
 assert.equal(track(s,'receipt').valueMs,660000);assert.equal(track(s,'receipt').text,'11:00');assert.equal(track(s,'receipt').mode,'static-receipt');assert.equal(track(s,'receipt').progress,null);
 assert.equal(track(state(2000),'receipt').valueMs,track(state(11999),'receipt').valueMs);
 for(const key of ['canApply','uiAccepted','mediaVerified','audioVerified'])assert.equal(s[key],false);
});

test('event counts use exact half-open window boundaries and stable IDs; end holds do not create extra events',()=>{
 assert.equal(track(state(1999),'elapsed').phase,'before');assert.equal(track(state(1999),'events').count,0);
 assert.equal(track(state(2000),'events').count,1);assert.equal(track(state(3999.999),'events').count,1);assert.equal(track(state(4000),'events').count,2);
 assert.equal(track(state(11999),'events').visible,true);assert.equal(track(state(12000),'events').visible,false);assert.equal(track(state(12000),'events').phase,'after');assert.equal(track(state(12000),'events').count,3);
 assert.equal(track(state(18000),'elapsed').valueMs,10000);assert.equal(track(state(18000),'authored-range').valueMs,60000);assert.equal(track(state(18000),'authored-range').text,'01:00');
 for(const t of [-1,20000,Infinity,NaN])assert.equal(state(t).status,'blocked');
});

test('backward seeking is deterministic and does not accumulate side effects or mutate caller data',()=>{
 const before=JSON.stringify({scene,config,context}),early=state(4000),later=state(16000);
 assert.equal(track(later,'events').count,3);assert.deepEqual(state(4000),early);
 assert.equal(JSON.stringify({scene,config,context}),before);
 const countdown=clone(config);countdown.tracks=[{...accelerated,value:{basis:'explicit-range',fromMs:60000,toMs:0}}];
 assert.equal(track(state(4500,countdown),'authored-range').text,'00:45');assert.equal(track(state(9500,countdown),'authored-range').text,'00:15');
});

test('source cuts, 2x/.5x speed and repeated source instances retain phase instead of restarting counters',()=>{
 const clips=[{id:'prefix',src:'clips/other-synthetic.mp4',inSec:0,outSec:2,speed:1},{id:'fast',src:scene.src,inSec:14,outSec:20,speed:2},{id:'repeat-slow',src:scene.src,inSec:14,outSec:20,speed:.5}],projections=projectStoryboard([scene],clips,30),proof={rawScene:scene,clips,fps:30},ctx={...context,projectionProof:proof};
 const [fast,slow]=projections;
 assert.deepEqual(typedDataClockExposure(fast),{startMs:4000,endMs:10000,speed:2});
 assert.deepEqual(typedDataClockExposure(slow),{startMs:4000,endMs:10000,speed:.5});
 const a=typedDataClockAtOutput(fast,config,2500,ctx),b=typedDataClockAtOutput(slow,config,7000,ctx);
 assert.equal(a.status,'data-ready');assert.equal(a.sourceElapsedMs,5000);assert.deepEqual(a.tracks,b.tracks);assert.equal(track(a,'events').count,2);
 assert.deepEqual(a.tracks,state(5000).tracks);
 assert.equal(typedDataClockAtOutput(fast,config,fast.endMs,ctx).status,'blocked');
 assert.equal(typedDataClockAtOutput(fast,config,fast.startMs-.001,ctx).status,'blocked');
 assert.equal(state(3000,config,fast,ctx).status,'blocked');
 assert.equal(typedDataClockAtOutput({...fast,id:slow.id,clipId:slow.clipId},config,2500,ctx).status,'blocked');
 assert.equal(typedDataClockAtOutput(fast,config,2500,context).status,'blocked');
});

test('absolute source binding and current identity reject whole-scene shifts, changed SHA or forged projections',()=>{
 assert.equal(state(5000,config,{...scene,startMs:11000,endMs:31000}).status,'blocked');
 for(const change of [{sha256:'b'.repeat(64)},{src:'clips/replaced.mp4'},{kind:'image'},{durationSec:29},{width:0}])assert.equal(state(5000,config,scene,{sourceIdentity:{...identity,...change}}).status,'blocked');
 const clips=[{id:'one',src:scene.src,inSec:0,outSec:40,speed:1}],shift={...scene,startMs:11000,endMs:31000},p=projectStoryboard([shift],clips,30)[0];
 assert.equal(typedDataClockAtOutput(p,config,16000,{...context,projectionProof:{rawScene:shift,clips,fps:30}}).status,'blocked');
 const actual=projectStoryboard([scene],clips,30)[0];
 for(const change of [{sourceOffsetMs:1},{phaseStartMs:actual.phaseStartMs+1},{speed:2},{src:'clips/other.mp4'}])assert.equal(typedDataClockAtOutput({...actual,...change},config,16000,{...context,projectionProof:{rawScene:scene,clips,fps:30}}).status,'blocked');
});

test('formats have explicit digit budgets, exact time formatting and overflow rejection rather than truncation',()=>{
 assert.equal(typedDataClockFormatDuration(59999,{kind:'mm:ss',minuteDigits:2}).text,'00:59');
 assert.equal(typedDataClockFormatDuration(60000,{kind:'mm:ss',minuteDigits:2}).text,'01:00');
 assert.equal(typedDataClockFormatDuration(5999999,{kind:'mm:ss',minuteDigits:2}).text,'99:59');
 assert.equal(typedDataClockFormatDuration(6000000,{kind:'mm:ss',minuteDigits:2}).text,null);
 const fmt={kind:'seconds',integerDigits:1,decimals:2,rounding:'floor'};
 assert.equal(typedDataClockFormatDuration(9995,fmt).text,'9.99');assert.equal(typedDataClockFormatDuration(9995,{...fmt,rounding:'nearest'}).text,null);
 assert.equal(typedDataClockFormatDuration(1234,fmt).text,'1.23');assert.equal(typedDataClockFormatDuration(5,fmt).maximumText,typedDataClockFormatDuration(9995,fmt).maximumText);
 for(const value of [NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])assert.equal(typedDataClockFormatDuration(value,fmt).text,null);
 for(const format of [null,{kind:'mm:ss',minuteDigits:0},{kind:'mm:ss',minuteDigits:Infinity},{kind:'seconds',integerDigits:1,decimals:4,rounding:'floor'},{kind:'seconds',integerDigits:1,decimals:1}])assert.equal(typedDataClockFormatDuration(1000,format).text,null);
 const overflow=clone(config);overflow.tracks[2].format.integerDigits=1;overflow.tracks[2].initialCount=9;assert.equal(state(5000,overflow).status,'blocked');
});

test('negative, duplicate, non-finite, missing or out-of-scene data blocks and never derives facts from an audio or word field',()=>{
 const changes=[c=>delete c.tracks,c=>c.tracks.push(c.tracks[0]),c=>delete c.tracks[0].provenance,c=>delete c.tracks[2].eventDefinition,c=>delete c.tracks[2].initialCount,c=>delete c.tracks[2].events,c=>c.tracks[2].events.push({id:'same-time',atMs:4000}),c=>c.tracks[2].events.push({id:'marker-1',atMs:11500}),c=>c.tracks[2].events.reverse(),c=>c.tracks[2].events.push({id:'at-end',atMs:12000}),c=>c.tracks[2].events=[null,{id:'marker',atMs:4000}],c=>c.tracks[0].window=undefined,c=>c.binding.sha256=3,c=>c.tracks=[null]];
 for(const n of [-1,NaN,Infinity,20001])changes.push(c=>c.tracks[0].window.endMs=n);
 for(const n of [-1,NaN,Infinity])changes.push(c=>c.tracks[2].events[0].atMs=n);
 for(const change of changes){const c=clone(config);change(c);assert.equal(state(5000,c).status,'blocked');assert.deepEqual(state(5000,c).tracks,[]);}
 const noExplicitEvents=clone(config);delete noExplicitEvents.tracks[2].events;noExplicitEvents.tracks[2].audioSrc='clips/has-audio.mp4';noExplicitEvents.tracks[2].words=[{text:'pause',startMs:4000}];assert.equal(state(5000,noExplicitEvents).status,'blocked');
 const noEvents=clone(config);noEvents.tracks[2].events=[];assert.equal(track(state(5000,noEvents),'events').count,0);
 const override=clone(config);override.tracks[0].value.fromMs=900000;assert.equal(state(5000,override).status,'blocked');
});

test('a static receipt requires explicit ordered values on one basis and never guesses midnight rollover or a live duration',()=>{
 for(const r of [{basis:'time-of-day',startMs:23*3600000,endMs:3600000},{basis:'explicit-shared-origin-ms',startMs:10000,endMs:9999},{basis:'explicit-shared-origin-ms',startMs:0,endMs:Infinity},{basis:'explicit-shared-origin-ms',startMs:.5,endMs:1000}]){
  const c=clone(config);c.tracks[3].receipt=r;assert.equal(state(7000,c).status,'blocked');
 }
 for(const ms of [0,2000,7000,16000]){const t=track(state(ms),'receipt');assert.equal(t.text,'11:00');assert.equal(t.progress,null);assert.equal(t.receipt.basis,'explicit-shared-origin-ms');}
});
