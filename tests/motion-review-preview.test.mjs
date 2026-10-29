import test from'node:test';import assert from'node:assert/strict';
import{prepareMotionReviewPreview,motionReviewPlaybackCommand,observeMotionReviewPlayback}from'../editor/motion-review-preview-model.mjs';import{conditionalViewFixture}from'./fixtures/conditional-set-view-fixture.mjs';
function fixture(){const{config,context:x}=conditionalViewFixture();return{entryId:'conditional-set',name:'作者明确集合示意',status:'configured',issues:[],scene:x.rawScene,config,clips:x.clips,sourceIdentity:x.sourceIdentity,assetIdentities:[],meta:{fps:30,width:1920,height:1080,durationInFrames:7200},presentation:{format:'landscape'},provenance:'原创参数示例，不是参考原工程'};}
test('review prepares the actual saved-preview path without mutating a fixture or granting apply authority',()=>{const f=fixture(),before=structuredClone(f),m=prepareMotionReviewPreview(f);assert.equal(m.status,'prepared');assert.equal(m.inputProps.presentation.scenes[0].dynamicMotion.config.kind,'conditional-set');assert.equal(m.inputProps.clips,f.clips);assert.equal(Math.abs(m.window.inFrame),0);assert.equal(m.window.outFrame,7199);assert.equal(m.fps,30);assert.deepEqual(f,before);assert.equal(m.receipt,undefined);assert.equal(m.apply,undefined);});
test('unavailable sources, wrong variants, actual caption conflicts and missing data remain explicit instead of producing a fake animation',()=>{const a=fixture();a.status='unavailable';a.issues=['缺少当前RGBA序列'];assert.ok(prepareMotionReviewPreview(a).issues.includes('缺少当前RGBA序列'));const b=fixture();b.config.variant='not-a-variant';assert.equal(prepareMotionReviewPreview(b).status,'unavailable');const c=fixture();c.captions=[{clipId:'voice',startMs:70000,endMs:75000,topPct:82}];assert.equal(prepareMotionReviewPreview(c).status,'blocked');const d=fixture();d.config.gates=[];assert.equal(prepareMotionReviewPreview(d).status,'blocked');assert.equal(prepareMotionReviewPreview(undefined).status,'unavailable');});

// The real wrapper uses this event adapter. This fixture models only the
// installed PlayerRef interface; it cannot assert browser media/UI acceptance.
class ReviewPlayer{
 constructor(){this.frame=91;this.playing=false;this.muted=true;this.listeners=new Map();this.calls=[];}
 addEventListener(name,fn){const set=this.listeners.get(name)??new Set();set.add(fn);this.listeners.set(name,set);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 event(name,detail){for(const fn of this.listeners.get(name)??[])fn({detail});}
 getCurrentFrame(){return this.frame;}isPlaying(){return this.playing;}isMuted(){return this.muted;}
 play(){this.calls.push(['play']);this.playing=true;this.event('play');}
 pause(){this.calls.push(['pause']);this.playing=false;this.event('pause');}
 seekTo(frame){this.calls.push(['seekTo',frame]);this.frame=frame;this.event('seeked',{frame});}
}
test('parent play/pause/replay uses actual Player APIs, preserves frame/source data and consumes one unique command once',()=>{
 const f=fixture(),before=structuredClone(f),p=new ReviewPlayer(),states=[],rates=[],observer=observeMotionReviewPlayback(p,{entryId:f.entryId,key:'draft-A',fps:30,inFrame:30,outFrame:629,onState:s=>states.push(s),onRate:r=>rates.push(r)});
 assert.equal(states.at(-1).frame,91);assert.equal(states.at(-1).currentTimeSec,91/30);assert.equal(states.at(-1).muted,true);assert.equal(states.at(-1).playing,false);
 assert.equal(observer.command({id:1,action:'play',rate:.5}).ok,true);assert.deepEqual(rates,[.5]);assert.equal(states.at(-1).rate,1,'requested rate is not reported as native rate until the actual ratechange');
 p.event('ratechange',{playbackRate:.5});assert.equal(states.at(-1).rate,.5);assert.equal(states.at(-1).playing,true);assert.equal(states.at(-1).lastCommandId,1);
 const n=p.calls.length;assert.equal(observer.command({id:1,action:'play',rate:.5}).duplicate,true);assert.equal(p.calls.length,n);
 p.frame=105;p.event('frameupdate',{frame:999});assert.equal(states.at(-1).frame,105,'frame comes from the current PlayerRef, never guessed from a timer/payload');
 observer.command({id:2,action:'pause'});assert.equal(states.at(-1).playing,false);assert.equal(states.at(-1).frame,105);
 observer.command({id:3,action:'replay',rate:.75});assert.deepEqual(p.calls.slice(-3),[['pause'],['seekTo',30],['play']]);assert.equal(states.at(-1).frame,30);assert.equal(states.at(-1).muted,true);assert.deepEqual(f,before);
 assert.equal(states.at(-1).receipt,undefined);assert.equal(states.at(-1).canApply,undefined);observer.dispose();
});
test('buffering/mute/error and actual native rates are observable; invalid commands cannot partially control playback and disposal removes old reports',()=>{
 const p=new ReviewPlayer(),states=[],rates=[],observer=observeMotionReviewPlayback(p,{entryId:'current',key:'current-key',fps:30,inFrame:0,outFrame:299,onState:s=>states.push(s),onRate:r=>rates.push(r)});
 for(const rate of [.5,.75,1]){observer.command({id:rate,action:'pause',rate});p.event('ratechange',{playbackRate:rate});assert.equal(states.at(-1).rate,rate);}
 for(const invalid of [{id:NaN,action:'play'},{id:5,action:'seek'},{id:6,action:'play',rate:0},{id:7,action:'play',rate:Infinity}]){const n=p.calls.length,r=rates.length;assert.equal(observer.command(invalid).ok,false);assert.equal(p.calls.length,n);assert.equal(rates.length,r);assert.ok(states.at(-1).issues.length);}
 p.event('waiting');assert.equal(states.at(-1).waiting,true);p.event('resume');assert.equal(states.at(-1).waiting,false);
 p.muted=false;p.event('mutechange',{isMuted:false});assert.equal(states.at(-1).muted,false);p.event('error',{error:Error('实际解码失败')});assert.ok(states.at(-1).issues.includes('实际解码失败'));
 const n=states.length;observer.dispose();p.frame=250;p.event('frameupdate',{frame:250});p.event('play');assert.equal(states.length,n);assert.equal([...p.listeners.values()].reduce((sum,set)=>sum+set.size,0),0);assert.equal(observer.command({id:9,action:'play'}).ok,false);
 assert.equal(motionReviewPlaybackCommand({id:10,action:'replay',rate:1}).ok,true);
});
