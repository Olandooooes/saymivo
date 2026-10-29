import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {synthAudioFixture,synthAudioBytes} from './fixtures/audio-clock-fixture.mjs';

// Execute the actual owner/child component bodies and installed Freeze with
// dependency-aware synthetic hooks/native media. No browser decoder, sound,
// next-play latency or complete-session acceptance is claimed by this suite.
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const react=url(`export const createContext=v=>({Provider:'provider',_currentValue:v});export const useContext=c=>c._currentValue;export const useRef=v=>globalThis.__prewarmLife.ref(v);export const useState=v=>globalThis.__prewarmLife.state(v);export const useMemo=(f,d)=>globalThis.__prewarmLife.memo(f,d);export const useCallback=(f,d)=>globalThis.__prewarmLife.memo(()=>f,d);export const useEffect=(f,d)=>globalThis.__prewarmLife.effect(f,d,false);export const useLayoutEffect=(f,d)=>globalThis.__prewarmLife.effect(f,d,true);export default {createElement:(type,props,...children)=>({type,props:{...props,children}})};`);
const remotion=url(`export const Internals={TimelineContext:{get _currentValue(){return globalThis.__prewarmLife.timeline;}},SequenceContext:{get _currentValue(){return globalThis.__prewarmLife.sequence;}}};export const Audio=()=>null,Sequence=()=>null,AbsoluteFill=()=>null;export const staticFile=s=>'/'+s;export const useCurrentFrame=()=>globalThis.__prewarmLife.frame;export const useVideoConfig=()=>({id:'synthetic',fps:30,width:1920,height:1080});export const getRemotionEnvironment=()=>({isRendering:globalThis.__prewarmLife.rendering});export const delayRender=()=>1,continueRender=()=>{},cancelRender=e=>{throw e;};`);
const source=new URL('../src/AudioClockPlayback.tsx',import.meta.url);
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(name==='react'?react:name==='remotion'?remotion:name.startsWith('.')?new URL(name,source).href:import.meta.resolve(name))}`);
const {AudioClockPlayback}=await import(url(compiled));
const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class Host{
 constructor(){this.cells=[];this.effects=[];this.pending=[];this.cursor=0;this.frame=270;this.rendering=false;this.sequence=null;this.timeline={frame:{synthetic:270},rootId:'synthetic',playing:true,imperativePlaying:{current:true},playbackRate:1};}
 ref(v){const i=this.cursor++;return this.cells[i]??(this.cells[i]={current:v});}
 state(v){const i=this.cursor++;if(!(i in this.cells))this.cells[i]=typeof v==='function'?v():v;return [this.cells[i],v=>this.cells[i]=typeof v==='function'?v(this.cells[i]):v];}
 memo(f,d){const i=this.cursor++,old=this.cells[i];if(!old||!equal(old.d,d))this.cells[i]={d,v:f()};return this.cells[i].v;}
 effect(f,d,layout){const i=this.cursor++,old=this.effects[i];if(!old||!equal(old.d,d))this.pending.push({i,f,d,layout});}
 render(Component,props,commit,beforePassive){globalThis.__prewarmLife=this;this.cursor=0;this.pending=[];this.tree=Component(props);commit?.(this.tree);for(const layout of [true,false]){if(!layout)beforePassive?.();for(const {i,f,d} of this.pending.filter(e=>e.layout===layout)){this.effects[i]?.cleanup?.();this.effects[i]={d,f,layout,cleanup:f()};}}return this.tree;}
 replayEffects(){for(const e of this.effects)e?.cleanup?.();for(const layout of [true,false])for(const e of this.effects)if(e?.layout===layout)e.cleanup=e.f();}
 async settle(Component,props){for(let n=0;n<30;n++){this.render(Component,props);await new Promise(setImmediate);if(this.cells.some(v=>v?.status==='ready'&&Array.isArray(v.items)))return this.render(Component,props);}throw Error('actual owner synthetic material load did not complete');}
 dispose(){for(const e of this.effects)e?.cleanup?.();}
}
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.props?.children??[]).flatMap(x=>Array.isArray(x)?x.flatMap(walk):walk(x))];
const props=s=>({scenes:s.state.presentation.scenes,clips:s.state.clips,brollAssets:s.state.brollAssets,validationState:s.state,children:'original'});
function fetching(s){return async address=>{
 const entry=s.audioEvidence.find(e=>address==='/' +e.playbackAsset.src);
 if(entry)return {ok:true,arrayBuffer:async()=>synthAudioBytes(entry)};
 if(address.startsWith('/api/dynamic-asset?'))return {ok:true,json:async()=>s.source};
 const q=new URL(address,'http://localhost'),e=s.audioEvidence.find(e=>e.sourceIdentity.src===q.searchParams.get('src')&&e.analysis.range.startMs===Number(q.searchParams.get('startMs'))),{takeId,...value}=e;
 return {ok:true,json:async()=>value};
};}
// Installed SDK body supplies the frozen child Timeline values, including both
// playing:false and a distinct imperativePlaying ref. The owner retains its
// unfrozen actual frame and playing ref.
function frozenChild(root,from){
 const context={exports:{},require:name=>{
  if(name==='react')return {useContext:c=>c.value,useMemo:f=>f()};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};
  if(name.endsWith('TimelineContext.js'))return {TimelineContext:{value:root.timeline}};
  if(name.endsWith('SequenceContext.js'))return {SequenceContext:{value:null}};
  if(name.endsWith('use-current-frame.js'))return {useCurrentFrame:()=>root.frame};
  if(name.endsWith('use-video-config.js'))return {useVideoConfig:()=>({id:'synthetic'})};
  throw Error(name);
 }};
 vm.runInNewContext(fs.readFileSync(new URL('../node_modules/remotion/dist/cjs/freeze.js',import.meta.url),'utf8'),context);
 return context.exports.Freeze({frame:from,active:true,children:null}).props.value;
}
class Media extends EventTarget{
 constructor(asset){super();this.asset=asset;Object.assign(this,{tagName:'AUDIO',ownerDocument:{baseURI:'http://localhost/preview'},isConnected:true,src:'http://localhost/'+asset.src,currentSrc:'http://localhost/'+asset.src,duration:asset.durationMs/1000,readyState:4,seeking:false,error:null,paused:true,ended:false,muted:true,volume:0,playbackRate:1,_time:0,plays:0,pauses:0,writes:[],sdkCommitted:false});}
 get currentTime(){return this._time;}set currentTime(t){this.writes.push(t);this._time=t;this.seeking=true;this.readyState=1;}
 play(){assert.equal(this.sdkCommitted,true,'prewarm must follow child SDK passive commit');this.plays++;this.paused=false;return new Promise((resolve,reject)=>{this.resolvePlay=resolve;this.rejectPlay=reject;});}
 pause(){this.pauses++;this.paused=true;}
 seeked(){this._time=0;this.seeking=false;this.readyState=4;this.dispatchEvent(new Event('seeked'));}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
async function fixture({rendering=false,previewRate=1}={}){
 const originalFetch=globalThis.fetch,s=synthAudioFixture(),owner=new Host(),child=new Host();owner.rendering=rendering;owner.timeline.playbackRate=previewRate;globalThis.fetch=fetching(s);
 const tree=await owner.settle(AudioClockPlayback,props(s)),node=walk(tree).find(n=>n.props.segment?.takeId==='A'),audio=new Media(s.audioEvidence[0].playbackAsset),slot={ownerDocument:audio.ownerDocument,isConnected:true};
 child.frame=0;child.rendering=rendering;child.sequence={premounting:true};child.timeline=frozenChild(owner,node.props.segment.fromFrame);
 const commit=t=>{t.props.ref.current=slot;walk(t).find(n=>n.props.src).props.ref.current=audio;};
 const render=(p=node.props)=>child.render(node.type,p,commit,()=>{audio.sdkCommitted=true;});
 const close=()=>{child.dispose();owner.dispose();globalThis.fetch=originalFetch;delete globalThis.__prewarmLife;};
 return {s,owner,child,node,audio,slot,render,close,ownerProps:props(s)};
}

test('actual component uses unfrozen root and own forwarded slot; one post-SDK warm survives frame/report updates',async()=>{
 const f=await fixture();try{
  assert.equal(f.child.timeline.playing,false);assert.equal(f.child.timeline.imperativePlaying.current,false);assert.equal(f.node.props.rootClock.current.timeline.playing,true);
  const before=JSON.stringify([f.s.config,f.s.state.clips,f.s.audioEvidence]);let tree=f.render();assert.equal(f.audio.plays,0,'initial setup must finish before attempting');await flush();assert.equal(f.audio.plays,1);
  const audioProps=walk(tree).find(n=>n.props.src).props;assert.equal(audioProps.volume,0);assert.equal(audioProps.muted,true);assert.equal(audioProps.pauseWhenBuffering,true);assert.equal(audioProps.acceptableTimeShiftInSeconds,undefined);assert.equal(audioProps.playbackRate,1);
  f.audio._time=.01;f.audio.resolvePlay();await flush();assert.equal(f.audio.pauses,1);assert.deepEqual(f.audio.writes,[0]);f.audio.seeked();await flush();
  for(let frame=271;frame<=278;frame++){f.owner.frame=frame;f.owner.render(AudioClockPlayback,f.ownerProps);tree=f.render();}
  assert.equal(tree.props['data-audio-prewarm-status'],'warmed');assert.equal(f.audio.plays,1);assert.equal(f.audio.pauses,1);assert.equal(f.node.props.rootClock.current.frame,278);
  assert.equal(f.owner.tree.props.value.forceMuteOriginal,false,'warming an inactive slot never authorizes replacement');assert.equal(JSON.stringify([f.s.config,f.s.state.clips,f.s.audioEvidence]),before);
 }finally{f.close();}
});

test('late pending play cannot pause or zero a now-active comparison even if replacement remains silent',async()=>{
 const f=await fixture();try{
  f.render();await flush();assert.equal(f.audio.plays,1);f.audio._time=.2;
  f.owner.frame=300;f.owner.render(AudioClockPlayback,f.ownerProps);f.child.sequence={premounting:false};f.child.timeline=f.owner.timeline;f.render();
  f.audio.resolvePlay();await flush();assert.equal(f.audio.pauses,0);assert.deepEqual(f.audio.writes,[]);assert.equal(f.audio.currentTime,.2);
  assert.equal(f.render().props['data-audio-prewarm-status'],'cancelled');assert.equal(f.owner.tree.props.value.forceMuteOriginal,false);
 }finally{f.close();}
});

test('live root imperative pause stops only the still-owned silent premount; late completion and close are inert',async()=>{
 const f=await fixture();try{
  f.render();await flush();f.audio._time=.01;f.owner.timeline.imperativePlaying.current=false;
  f.audio.dispatchEvent(new Event('loadeddata'));assert.equal(f.audio.pauses,1);assert.deepEqual(f.audio.writes,[0]);
  const pauses=f.audio.pauses;f.audio.resolvePlay();await flush();f.close();f.audio.seeked();assert.equal(f.audio.pauses,pauses);
 }finally{f.close();}
});

test('insufficient actual wall lead blocks at 1x while half speed derives its own lead; export never warms',async()=>{
 const late=await fixture();try{late.owner.frame=288;late.owner.render(AudioClockPlayback,late.ownerProps);late.render();await flush();assert.equal(late.audio.plays,0);assert.equal(late.render().props['data-audio-prewarm-status'],'blocked');}finally{late.close();}
 const slow=await fixture({previewRate:.5});try{slow.owner.frame=285;slow.owner.render(AudioClockPlayback,slow.ownerProps);slow.render();await flush();assert.equal(slow.audio.plays,1,'15 actual frames at .5x leave 1000ms rather than frozen child 0ms');slow.audio.resolvePlay();await flush();assert.equal(slow.render().props['data-audio-prewarm-status'],'warmed');}finally{slow.close();}
 const offline=await fixture({rendering:true});try{const tree=offline.render();assert.equal(offline.audio.plays,0);assert.equal(tree.props['data-audio-prewarm-status'],undefined);const p=walk(tree).find(n=>n.props.src).props;assert.equal(p.src,'/'+offline.s.audioEvidence[0].playbackAsset.src);assert.equal(p.playbackRate,1);}finally{offline.close();}
});

test('late actual load/ref reuse is guarded by current own source and cannot inherit a successful warm',async()=>{
 const f=await fixture();try{
  f.audio.readyState=1;f.render();await flush();assert.equal(f.audio.plays,0);f.audio.readyState=4;f.audio.dispatchEvent(new Event('loadeddata'));assert.equal(f.audio.plays,1);
  f.audio.src=f.audio.currentSrc='http://localhost/derived-audio/different.wav';f.audio.resolvePlay();await flush();assert.equal(f.audio.pauses,0);assert.deepEqual(f.audio.writes,[]);assert.equal(f.render().props['data-audio-prewarm-status'],'cancelled');
 }finally{f.close();}
});

test('StrictMode effect replay leaves only the current controller eligible for its single native attempt',async()=>{
 const f=await fixture();try{
  f.render();assert.equal(f.audio.plays,0);f.child.replayEffects();await flush();assert.equal(f.audio.plays,1,'discarded setup never consumes the native source attempt');
  f.audio.resolvePlay();await flush();assert.equal(f.render().props['data-audio-prewarm-status'],'warmed');assert.equal(f.audio.plays,1);
 }finally{f.close();}
 const closed=await fixture();try{closed.render();closed.close();await flush();assert.equal(closed.audio.plays,0,'microtask after close cannot start an orphaned audio slot');}finally{closed.close();}
});
