import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {audioClockDecodedReport,audioClockProjectSegments} from '../src/audio-clock-integration.mjs';
import {synthAudioFixture} from './fixtures/audio-clock-fixture.mjs';

// Execute the actual installed SDK's correction/buffering effect bodies. The
// hook scheduler and media are synthetic: this is neither a browser decoder nor
// proof that changing a correction threshold fixes an actual playback session.
const sdk=fs.readFileSync(new URL('../node_modules/remotion/dist/esm/index.mjs',import.meta.url),'utf8');
function extract(name,next){
 const start=sdk.indexOf(`var ${name} =`),end=sdk.indexOf(next,start);
 assert.ok(start>=0&&end>start,`installed SDK ${name} body must be available`);
 return sdk.slice(start,end);
}
const bodies=[extract('useBufferUntilFirstFrame','// src/media-tag-current-time-timestamp.ts'),extract('useMediaPlayback','// src/use-media-tag.ts')].join('\n');

function correction(deltaMs,acceptableTimeshift,mediaType){
 const events=[],refs=[],effects=[];let cursor=0,blocks=0;
 const media={_time:1+deltaMs/1000,readyState:4,HAVE_FUTURE_DATA:3,paused:false,ended:false,duration:3,src:'synthetic-local-source',playbackRate:1,listeners:new Map(),
  addEventListener(type,cb){const listeners=this.listeners.get(type)??new Set();listeners.add(cb);this.listeners.set(type,listeners);},removeEventListener(type,cb){this.listeners.get(type)?.delete(cb);},
  requestVideoFrameCallback(cb){this.frameCallback=cb;return 1;},
  pause(){this.paused=true;events.push('native-pause');for(const cb of [...(this.listeners.get('pause')??[])])cb();},
  get currentTime(){return this._time;},set currentTime(value){this._time=value;this.readyState=1;events.push('seek');}};
 const mediaRef={current:media},buffer={buffering:{current:false}},timeline={playbackRate:1};
 const useRef=value=>refs[cursor++]??(refs[cursor-1]={current:value}),effect=fn=>effects.push(fn);
 const context={console,Math,Number,TimelineContext:timeline,BufferingContextReact:buffer,
  useContext22:value=>value,useCurrentFrame:()=>30,useTimelinePosition:()=>30,usePlayingState:()=>[true],useVideoConfig:()=>({fps:30}),useMediaStartsAt:()=>0,
  useRef11:useRef,useRef9:useRef,useCallback10:fn=>fn,useCallback9:fn=>fn,useMemo19:fn=>fn(),useEffect11:effect,useLayoutEffect7:effect,
  useLogLevel:()=> 'silent',useMountTime:()=>0,useRequestVideoCallbackTime:()=>({current:null}),useCurrentTimeOfMediaTagWithUpdateTimeStamp:()=>({current:{time:media.currentTime,lastUpdate:100}}),
  useMediaBuffering:()=>false,useIsPlayerBuffering:()=>false,useRemotionEnvironment:()=>({isPlayer:true}),
  useBufferState:()=>({delayPlayback:()=>{blocks++;buffer.buffering.current=true;events.push('buffer-enter');let active=true;return {unblock:()=>{if(active){active=false;blocks--;buffer.buffering.current=blocks>0;events.push('buffer-exit');}}};}}),
  getMediaTime:({frame,fps})=>frame/fps,seek:({mediaRef,time})=>{mediaRef.currentTime=time;return time;},playbackLogging:()=>{},warnAboutNonSeekableMedia:()=>{},Log:{verbose:()=>{}},playAndHandleNotAllowedError:()=>{},isSafariWebkit:()=>false};
 vm.createContext(context);vm.runInContext(bodies,context);
 context.useMediaPlayback({mediaRef,src:media.src,mediaType,playbackRate:1,onlyWarnForMediaSeekingError:true,acceptableTimeshift,pauseWhenBuffering:true,isPremounting:false,isPostmounting:false,onAutoPlayError:null});
 for(const fn of effects)fn();
 const beforeCanPlay={currentTime:media.currentTime,readyState:media.readyState,buffering:buffer.buffering.current,events:[...events]};
 media.readyState=4;for(const cb of [...(media.listeners.get('canplay')??[])])cb();
 return {beforeCanPlay,afterCanPlay:{buffering:buffer.buffering.current,events:[...events]}};
}

test('installed SDK defaults avoid extra 50/90ms correction seeks while the former one-frame override seeks and buffers video',()=>{
 for(const mediaType of ['video','audio'])for(const deltaMs of [24.908,50,90]){
  const strict=correction(deltaMs,1/30,mediaType),normal=correction(deltaMs,null,mediaType);
  assert.deepEqual(normal.beforeCanPlay.events,[],'SDK default correction must not seek these small native offsets');assert.equal(normal.beforeCanPlay.readyState,4);assert.equal(normal.beforeCanPlay.buffering,false);
  if(deltaMs<1000/30)assert.deepEqual(strict.beforeCanPlay.events,[]);
  else{
   assert.equal(strict.beforeCanPlay.currentTime,1);assert.equal(strict.beforeCanPlay.readyState,1);
   assert.deepEqual(strict.beforeCanPlay.events,mediaType==='video'?['seek','buffer-enter']:['seek']);
   assert.equal(strict.beforeCanPlay.buffering,mediaType==='video');
   assert.equal(strict.afterCanPlay.buffering,false);
  }
 }
});

const take={id:'A',startMs:500,endMs:3500},asset={src:'derived-audio/original-synthetic.wav',durationMs:3000},request={playbackAsset:asset,take,projectionId:'synthetic:retained',expectedMediaMs:1500,speed:1,previewPlaybackRate:1,fps:30};
function actualReport(deltaMs,{readyState=4,currentTime=1+deltaMs/1000}={}){
 return audioClockDecodedReport({currentSrc:'http://localhost/'+asset.src,src:'http://localhost/'+asset.src,duration:3,currentTime,readyState,playbackRate:1,error:null},request);
}
test('actual independent decoder proof still rejects 34/50/90ms offsets, undecoded frames and the exact source end',()=>{
 assert.equal(actualReport(33).status,'ready');
 for(const deltaMs of [34,50,90,-34,-50,-90])assert.equal(actualReport(deltaMs).status,'waiting');
 assert.equal(actualReport(0,{readyState:1}).status,'waiting');assert.equal(actualReport(0,{readyState:0}).status,'waiting');
 assert.equal(actualReport(0,{currentTime:3}).status,'waiting','take.endMs is excluded even if the media reached it');
 assert.equal(actualReport(0,{currentTime:-.001}).status,'waiting','values before the take cannot be accepted');
 assert.equal(request.expectedMediaMs,1500);assert.deepEqual(take,{id:'A',startMs:500,endMs:3500});
});

test('SDK correction experiments do not shift source windows, zero-based WAV mapping or A/B segment boundaries',()=>{
 for(const speed of [.5,1,2]){
  const s=synthAudioFixture({speed}),before=JSON.stringify({config:s.config,clips:s.state.clips}),viewport={width:1920,height:1080};
  const first=audioClockProjectSegments(s.state.presentation.scenes,s.state.clips,30,viewport);assert.deepEqual(first.issues,[]);
  assert.deepEqual(first.segments.map(p=>[p.fromFrame,p.endFrame]),[[300/speed,390/speed],[390/speed,480/speed]]);
  assert.deepEqual(first.segments.map(p=>[p.sourceStartMs,p.sourceEndMs]),[[500,3500],[500,3500]]);
  for(const deltaMs of [50,90])for(const mediaType of ['video','audio']){correction(deltaMs,1/30,mediaType);correction(deltaMs,null,mediaType);}
  assert.deepEqual(audioClockProjectSegments(s.state.presentation.scenes,s.state.clips,30,viewport),first);
  assert.equal(JSON.stringify({config:s.config,clips:s.state.clips}),before);
 }
});
