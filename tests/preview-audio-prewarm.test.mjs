import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {createPreviewAudioPrewarmController} from '../src/preview-audio-prewarm.mjs';

const doc={baseURI:'http://localhost/preview'},src='derived-audio/original-synthetic.wav';
class AudioFixture extends EventTarget{
 constructor(){super();Object.assign(this,{tagName:'AUDIO',ownerDocument:doc,isConnected:true,src:'http://localhost/'+src,currentSrc:'http://localhost/'+src,duration:3,readyState:4,seeking:false,muted:true,volume:0,playbackRate:1,paused:true,ended:false,error:null,_time:0,playCalls:0,pauseCalls:0,timeWrites:[]});}
 get currentTime(){return this._time;}set currentTime(value){this.timeWrites.push(value);this._time=value;this.seeking=true;this.readyState=1;}
 play(){this.playCalls++;this.paused=false;return new Promise((resolve,reject)=>{this.resolvePlay=resolve;this.rejectPlay=reject;});}
 pause(){this.pauseCalls++;this.paused=true;}
 finishSeek(){this._time=0;this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));}
}
function fixture(changes={},policy={}){
 const a=new AudioFixture(),slot={ownerDocument:doc,isConnected:true};let snapshot={phase:'premount',sequencePremounting:true,rootPlaying:true,rootFrame:30,fromFrame:60,premountFrames:30,fps:30,previewRate:1,segmentId:'synthetic:A',src,durationMs:3000,materialReady:true,gain:0,element:a,slot,...changes},wall=0,id=0;
 const timers=new Map(),controller=createPreviewAudioPrewarmController({getSnapshot:()=>snapshot,minLeadMs:700,maxWarmMs:400,cueSafetyMs:150,now:()=>wall,setTimer:(f,delay)=>{timers.set(++id,{f,at:wall+delay});return id;},clearTimer:n=>timers.delete(n),...policy});
 return {a,slot,controller,get snapshot(){return snapshot;},patch:v=>snapshot={...snapshot,...v},advance(ms,run=true){wall+=ms;if(run)for(const [n,t] of [...timers])if(t.at<=wall){timers.delete(n);t.f();}},timers};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('one real silent play completes only after an actual pause and decoded zero seek; it grants no receipt',async()=>{
 const f=fixture(),p=f.controller.request();assert.equal(f.a.playCalls,1);assert.equal(f.controller.getState().status,'warming');assert.equal(f.controller.request(),p);
 f.a._time=.012;f.a.resolvePlay();await flush();assert.equal(f.controller.getState().status,'resetting');assert.equal(f.a.pauseCalls,1);assert.deepEqual(f.a.timeWrites,[0]);
 assert.equal(f.controller.getState().mediaProof,false);f.a.dispatchEvent(new Event('canplay'));assert.equal(f.controller.getState().status,'resetting','currentTime assignment alone is not a decoded reset');
 f.a.finishSeek();const result=await p;assert.equal(result.status,'warmed');for(const k of ['canApply','uiAccepted','mediaProof'])assert.equal(result[k],false);
 assert.equal(f.a.muted,true);assert.equal(f.a.volume,0);assert.equal(f.a.playbackRate,1);assert.equal(f.a.src,'http://localhost/'+src);assert.equal(f.timers.size,0);
 assert.equal((await f.controller.request()).status,'skipped');assert.equal(f.a.playCalls,1);f.controller.dispose();
});

test('actual phase/ref/source/gain/mute/root-playing guards block without issuing play',async()=>{
 const cases=[{phase:'active'},{sequencePremounting:false},{rootPlaying:false},{rootFrame:60},{rootFrame:-1},{rootFrame:NaN},{fromFrame:Infinity},{premountFrames:0},{previewRate:0},{fps:NaN},{gain:1},{materialReady:false},{segmentId:''},{src:'https://example.test/a.wav'},{durationMs:4000},{element:null},{slot:null}];
 for(const change of cases){const f=fixture(change);assert.equal((await f.controller.request()).status,'blocked');assert.equal(f.a.playCalls,0);}
 for(const change of [{paused:false},{muted:false},{volume:.01},{readyState:1},{isConnected:false},{duration:NaN},{currentSrc:'http://localhost/derived-audio/wrong.wav'},{src:'http://localhost/derived-audio/wrong.wav'},{currentSrc:'https://other.test/'+src}]){const f=fixture();Object.assign(f.a,change);assert.equal((await f.controller.request()).status,'blocked');assert.equal(f.a.playCalls,0);}
});

test('wall lead derives from trusted frame/fps/global preview rate and requires an explicit consistent budget',async()=>{
 for(const changes of [{rootFrame:58},{rootFrame:45},{previewRate:Infinity}]){const f=fixture(changes);assert.equal((await f.controller.request()).status,'blocked');assert.equal(f.a.playCalls,0);}
 const slow=fixture({rootFrame:45,previewRate:.5}),p=slow.controller.request();assert.equal(slow.a.playCalls,1,'15 output frames at .5x provide one wall second');slow.controller.cancel();await p;
 for(const policy of [{minLeadMs:undefined},{maxWarmMs:800},{cueSafetyMs:0},{minLeadMs:100,maxWarmMs:50,cueSafetyMs:20}]){const f=fixture({},policy);assert.equal((await f.controller.request()).status,'blocked');assert.equal(f.a.playCalls,0);}
});

test('a new controller does not retry the same pooled ref/source, while a different source remains independent',async()=>{
 const first=fixture(),p=first.controller.request();first.a.resolvePlay();assert.equal((await p).status,'warmed');first.controller.dispose();
 const second=fixture({element:first.a,slot:first.slot});assert.equal((await second.controller.request()).status,'skipped');assert.equal(first.a.playCalls,1);
 first.a.src=first.a.currentSrc='http://localhost/derived-audio/new.wav';second.patch({src:'derived-audio/new.wav'});const q=second.controller.request();assert.equal(first.a.playCalls,2);second.controller.cancel();await q;
});

test('late promise never pauses, seeks or changes a cue that became active',async()=>{
 const f=fixture(),p=f.controller.request();f.advance(100,false);f.patch({phase:'active',sequencePremounting:false,rootFrame:60,gain:1});f.a._time=.7;f.a.muted=false;f.a.volume=1;
 f.a.resolvePlay();await flush();assert.equal((await p).status,'cancelled');assert.equal(f.a.pauseCalls,0);assert.deepEqual(f.a.timeWrites,[]);assert.equal(f.a.currentTime,.7);assert.equal(f.a.volume,1);
});

test('same pooled element with a changed source/segment or a replaced ref is never touched by the old completion',async()=>{
 for(const mode of ['source','segment','ref']){
  const f=fixture(),p=f.controller.request();f.a._time=.2;
  if(mode==='source'){f.patch({src:'derived-audio/new.wav'});f.a.src=f.a.currentSrc='http://localhost/derived-audio/new.wav';}
  if(mode==='segment')f.patch({segmentId:'new:B'});
  if(mode==='ref')f.patch({element:new AudioFixture()});
  f.a.resolvePlay();await flush();assert.equal((await p).status,'cancelled');assert.equal(f.a.pauseCalls,0);assert.deepEqual(f.a.timeWrites,[]);
 }
});

test('user pause/cleanup can stop only the still-owned silent premount, and a late promise cannot restart it',async()=>{
 const f=fixture(),p=f.controller.request();f.a._time=.05;f.patch({rootPlaying:false});f.controller.reconcile();assert.equal((await p).status,'cancelled');assert.equal(f.a.pauseCalls,1);assert.deepEqual(f.a.timeWrites,[0]);
 const before=f.a.pauseCalls;f.a.resolvePlay();f.a.finishSeek();await flush();assert.equal(f.a.pauseCalls,before);assert.equal((await f.controller.request()).status,'blocked');
 const active=fixture(),pending=active.controller.request();active.patch({phase:'active',sequencePremounting:false,rootFrame:60});active.controller.dispose();await pending;assert.equal(active.a.pauseCalls,0);assert.deepEqual(active.a.timeWrites,[]);
 const rate=fixture(),warming=rate.controller.request();rate.a._time=.02;rate.patch({previewRate:.5});rate.controller.reconcile();assert.equal((await warming).status,'cancelled');assert.equal(rate.a.pauseCalls,1);assert.deepEqual(rate.a.timeWrites,[0]);
});

test('rejection, missing play promise, errors and timeouts never retry or claim reset completion',async()=>{
 for(const mode of ['reject','throw','no-promise','error','timeout','reset-timeout']){
  const f=fixture();if(mode==='throw')f.a.play=()=>{f.a.playCalls++;throw Error('synthetic');};if(mode==='no-promise')f.a.play=()=>{f.a.playCalls++;f.a.paused=false;};
  const p=f.controller.request();
  if(mode==='reject')f.a.rejectPlay(Error('synthetic'));
  if(mode==='error')f.a.dispatchEvent(new Event('error'));
  if(mode==='reset-timeout'){f.a._time=.01;f.a.resolvePlay();await flush();assert.equal(f.controller.getState().status,'resetting');}
  if(mode.includes('timeout'))f.advance(450);
  assert.equal((await p).status,'failed');assert.ok(['skipped','blocked'].includes((await f.controller.request()).status));assert.equal(f.a.playCalls,1);assert.equal(f.timers.size,0);
 }
});

test('a delayed timer cannot use a stale premount frame to pause media beyond the wall cue-safety limit',async()=>{
 const f=fixture(),p=f.controller.request();f.a._time=.4;f.advance(1200);assert.equal((await p).status,'failed');assert.equal(f.a.pauseCalls,0);assert.deepEqual(f.a.timeWrites,[]);
 f.a.resolvePlay();await flush();assert.equal(f.a.pauseCalls,0);
});

test('another play during the reset cannot be reported as a completed paused-zero warmup',async()=>{
 const f=fixture(),p=f.controller.request();f.a._time=.02;f.a.resolvePlay();await flush();assert.equal(f.controller.getState().status,'resetting');
 f.a.paused=false;f.a.finishSeek();assert.equal((await p).status,'failed');assert.equal(f.a.paused,true);assert.equal(f.controller.getState().mediaProof,false);
});

// Installed SDK dependency-aware effect probe: the controller must start after
// the initial child passive effects. A fresh Mixer Context value is not itself
// a reason for the SDK to run its paused-Freeze effect again.
function frozenSdk(media){
 const sdk=fs.readFileSync(new URL('../node_modules/remotion/dist/esm/index.mjs',import.meta.url),'utf8'),extract=(name,next)=>{const a=sdk.indexOf(`var ${name} =`),b=sdk.indexOf(next,a);assert.ok(a>=0&&b>a);return sdk.slice(a,b);};
 const code=[extract('useBufferUntilFirstFrame','// src/media-tag-current-time-timestamp.ts'),extract('useMediaPlayback','// src/use-media-tag.ts')].join('\n'),cells=[],effects=[];let cursor=0,pending=[];
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i])),ref=v=>cells[cursor++]??(cells[cursor-1]={current:v}),memo=(f,d)=>{const i=cursor++,old=cells[i];if(!old||!equal(old.d,d))cells[i]={d,v:f()};return cells[i].v;},effect=(f,d)=>{const i=cursor++,old=effects[i];if(!old||!equal(old.d,d))pending.push({i,f,d});};
 const buffer={buffering:{current:false}},timeline={playbackRate:1},mediaRef={current:media},delayPlayback=()=>{throw Error('no buffering should be required in a loaded frozen audio fixture');};
 const ctx={console,Math,Number,TimelineContext:timeline,BufferingContextReact:buffer,useContext22:v=>v,useCurrentFrame:()=>0,useTimelinePosition:()=>60,usePlayingState:()=>[false],useVideoConfig:()=>({fps:30}),useMediaStartsAt:()=>0,useRef11:ref,useRef9:ref,useCallback10:(f,d)=>memo(()=>f,d),useCallback9:(f,d)=>memo(()=>f,d),useMemo19:memo,useEffect11:effect,useLayoutEffect7:effect,useLogLevel:()=> 'silent',useMountTime:()=>0,useRequestVideoCallbackTime:()=>ref(null),useCurrentTimeOfMediaTagWithUpdateTimeStamp:()=>{const value=ref({time:media.currentTime,lastUpdate:100});value.current.time=media.currentTime;return value;},useMediaBuffering:()=>false,useIsPlayerBuffering:()=>false,useRemotionEnvironment:()=>({isPlayer:true}),useBufferState:()=>({delayPlayback}),getMediaTime:()=>0,seek:({mediaRef,time})=>{mediaRef.currentTime=time;return time;},playbackLogging(){},warnAboutNonSeekableMedia(){},Log:{verbose(){}},playAndHandleNotAllowedError:()=>{throw Error('SDK must not play while Freeze says paused');},isSafariWebkit:()=>false};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ()=>{cursor=0;pending=[];ctx.useMediaPlayback({mediaRef,src:media.src,mediaType:'audio',playbackRate:1,onlyWarnForMediaSeekingError:true,acceptableTimeshift:null,pauseWhenBuffering:true,isPremounting:true,isPostmounting:false,onAutoPlayError:null});for(const {i,f,d} of pending){effects[i]?.cleanup?.();effects[i]={d,cleanup:f()};}};
}
test('actual installed SDK does not re-pause a post-commit premount warmup on readiness-only rerenders',async()=>{
 const f=fixture(),sdkCommit=frozenSdk(f.a);sdkCommit();const p=f.controller.request();assert.equal(f.a.playCalls,1);assert.equal(f.a.pauseCalls,0);
 for(let i=1;i<=20;i++){f.a._time=i/1000;sdkCommit();}assert.equal(f.a.pauseCalls,0);
 f.a.resolvePlay();await flush();assert.equal(f.a.pauseCalls,1,'only the controller pauses after acknowledged play');f.a.finishSeek();assert.equal((await p).status,'warmed');
});
