import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {synthAudioFixture,synthAudioBytes} from './fixtures/audio-clock-fixture.mjs';
// Real composition owner and editor event/effect bodies, synthetic hooks/media
// callback fixtures only. No browser audio, UI or listening claim.
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const fakeReact=url(`export const createContext=v=>({Provider:'provider',_currentValue:v});export const useContext=c=>c._currentValue;export const useRef=v=>globalThis.__audioLife.ref(v);export const useState=v=>globalThis.__audioLife.state(v);export const useMemo=(f,d)=>globalThis.__audioLife.memo(f,d);export const useCallback=(f,d)=>globalThis.__audioLife.memo(()=>f,d);export const useEffect=(f,d)=>globalThis.__audioLife.effect(f,d);export const useLayoutEffect=useEffect;export default {createElement:(type,props,...children)=>({type,props:{...props,children}})};`);
const remotion=url(`export const Internals={TimelineContext:{get _currentValue(){return {playbackRate:globalThis.__audioLife.previewRate??1,playing:false,imperativePlaying:{current:false}};}},SequenceContext:{_currentValue:null}};export const Audio=()=>null,AbsoluteFill=()=>null,Sequence=()=>null;export const staticFile=s=>'/'+s;export const useCurrentFrame=()=>globalThis.__audioLife.frame;export const useVideoConfig=()=>({fps:30,width:1920,height:1080});export const getRemotionEnvironment=()=>({isRendering:globalThis.__audioLife.rendering});export const delayRender=()=>{globalThis.__audioLife.delays++;return globalThis.__audioLife.delays;};export const continueRender=()=>globalThis.__audioLife.continues++;export const cancelRender=e=>globalThis.__audioLife.cancels.push(e.message);`);
function compiled(file){const u=new URL(file,import.meta.url);return url(ts.transpileModule(fs.readFileSync(u,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(name==='react'?fakeReact:name==='remotion'?remotion:name==='./DynamicParameterFields'?url('export const DynamicParameterFields=()=>null;'):name.startsWith('.')?new URL(name,u).href:import.meta.resolve(name))}`));}
const {AudioClockPlayback}=await import(compiled('../src/AudioClockPlayback.tsx')),{AudioClockFields}=await import(compiled('../editor/AudioClockFields.tsx'));
const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
class Host{
 constructor(){this.values=[];this.effects=[];this.cursor=0;this.pending=[];this.frame=315;this.rendering=false;this.delays=0;this.continues=0;this.cancels=[];this.writes=0;}
 state(v){const i=this.cursor++;if(!(i in this.values))this.values[i]=typeof v==='function'?v():v;return [this.values[i],v=>{this.values[i]=typeof v==='function'?v(this.values[i]):v;this.writes++;}];}
 ref(v){const i=this.cursor++;return this.values[i]??(this.values[i]={current:v});}
 memo(f,d){const i=this.cursor++,old=this.values[i];if(!old||!equal(old.d,d))this.values[i]={d,v:f()};return this.values[i].v;}
 effect(f,d){const i=this.cursor++,old=this.effects[i];if(!old||!equal(old.d,d))this.pending.push({i,f,d});}
 render(Component,props,commit){globalThis.__audioLife=this;this.cursor=0;this.pending=[];this.tree=Component(props);commit?.(this.tree);for(const {i,f,d} of this.pending){this.effects[i]?.cleanup?.();this.effects[i]={d,cleanup:f()};}return this.tree;}
 async settle(Component,props){const until=Date.now()+5000;while(Date.now()<until){this.render(Component,props);await new Promise(setImmediate);if(this.values.some(v=>Array.isArray(v?.items)&&['ready','blocked'].includes(v.status)))return this.render(Component,props);}throw Error('synthetic owner asynchronous materials did not settle');}
 dispose(){for(const e of this.effects)e?.cleanup?.();}
}
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.props?.children??[]).flatMap(x=>Array.isArray(x)?x.flatMap(walk):walk(x))];
const response=value=>({ok:true,json:async()=>value}),props=s=>({scenes:s.state.presentation.scenes,clips:s.state.clips,brollAssets:s.state.brollAssets,validationState:s.state,children:'original'});
function fetching(s,{bad=false}={}){return async address=>{if(address.startsWith('/api/dynamic-asset?'))return response(s.source);if(address.startsWith('/api/dynamic-audio/materialize?')){const u=new URL(address,'http://localhost'),entry=s.audioEvidence.find(e=>e.sourceIdentity.src===u.searchParams.get('src')&&e.analysis.range.startMs===Number(u.searchParams.get('startMs'))),{takeId,...e}=entry;return response(e);}const entry=s.audioEvidence.find(e=>'/'+e.playbackAsset.src===address);const b=synthAudioBytes(entry);if(bad)b[b.length-1]^=1;return {ok:true,arrayBuffer:async()=>b};};}
function report(h,tree,s){const id=walk(tree).find(n=>typeof n.type==='function'&&n.type.name==='DecodedSegment')?.props.segment.projectionId;assert.ok(id);tree.props.value.reportSpeaker(id,{status:'ready',src:s.source.src,sha256:s.source.sha256,width:1920,height:1080,sourceMs:10500,muted:true});const p=walk(tree).find(n=>n.props.segment?.takeId==='A');p.props.onReport({key:id+':A',status:'ready',actualMediaMs:1000});return id;}

test('actual owner waits for independent decoder/speaker callbacks, replaces only compare and restores settings immediately on stale/outside',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),h=new Host();globalThis.fetch=fetching(s);try{let tree=await h.settle(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,false);const id=report(h,tree,s);tree=h.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,true);assert.equal(tree.props.value.forceMuteMusic,true);assert.equal(tree.props.value.runtimeFor(id,10500).audioProof.mediaMs,1000);
 h.frame=480;tree=h.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,false);assert.equal(tree.props.value.forceMuteMusic,false);
 h.frame=315;const stale=structuredClone(s);stale.state.presentation.displayFont='douyin';tree=h.render(AudioClockPlayback,props(stale));assert.equal(tree.props.value.forceMuteOriginal,false);assert.equal(tree.props.value.runtimeFor(id,10500).audioProof,undefined);await h.settle(AudioClockPlayback,props(stale));assert.equal(h.tree.props.value.forceMuteOriginal,false);
 }finally{h.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});
test('unmount/changed source cancels pending real-material responses and never binds an old ready item',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),h=new Host();let release,signal;globalThis.fetch=(address,o)=>{signal=o.signal;return new Promise(resolve=>release=resolve);};try{h.render(AudioClockPlayback,props(s));const before=h.writes;h.dispose();assert.equal(signal.aborted,true);release(response(s.source));await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(h.writes,before);assert.equal(h.tree.props.value.forceMuteOriginal,false);}finally{globalThis.fetch=previous;delete globalThis.__audioLife;}
});
test('offline render uses verified actual WAV PCM samples, no API/request decoder proof, and cancels mismatched bytes',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),h=new Host();h.rendering=true;const calls=[];globalThis.fetch=(...args)=>{calls.push(args[0]);assert.ok(!args[0].startsWith('/api/'),'offline bundle has no API');return fetching(s)(...args);};try{const tree=await h.settle(AudioClockPlayback,props(s)),id=walk(tree).find(n=>n.props.segment?.takeId==='A').props.segment.projectionId,r=tree.props.value.runtimeFor(id,10500);assert.equal(tree.props.value.forceMuteOriginal,true);assert.equal(r.audioProof,undefined);assert.equal(r.renderProof.sampleOffset,8000);assert.equal(r.renderProof.segmentPcmSha256,s.audioEvidence[0].playbackAsset.segmentPcmSha256);assert.equal(h.delays,1);assert.equal(h.continues,1);assert.equal(calls.length,2);assert.deepEqual(h.cancels,[]);h.dispose();
 const bad=new Host();bad.rendering=true;globalThis.fetch=fetching(s,{bad:true});await bad.settle(AudioClockPlayback,props(s));assert.equal(bad.tree.props.value.forceMuteOriginal,false);assert.equal(bad.cancels.length,1);assert.equal(bad.continues,1);bad.dispose();
 }finally{h.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});
test('actual source-field lifecycle cancels on exit/edit and only completed current analysis updates the draft',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),h=new Host(),changes=[],pending=[];let release;globalThis.fetch=()=>new Promise(resolve=>release=resolve);const p={config:s.config,evidence:s.audioEvidence,state:s.state,onChange:(...args)=>changes.push(args),onPending:v=>pending.push(v)};
 try{const tree=h.render(AudioClockFields,p),button=walk(tree).find(n=>n.type==='button'&&n.props.children[0]==='分析并绑定A实际音轨'),request=button.props.onClick();assert.equal(pending.at(-1),true);const input=walk(tree).find(n=>n.props['aria-label']==='A源起点秒');input.props.onChange({target:{value:'1'}});assert.equal(pending.at(-1),false);const {takeId,...result}=s.audioEvidence[0];release(response(result));await request;assert.equal(changes.length,1,'only explicit input invalidation, no late analysis bind');assert.equal(changes[0][0].takes[0].source,undefined);h.dispose();
 const good=new Host();globalThis.fetch=fetching(s);const t=good.render(AudioClockFields,p),start=walk(t).find(n=>n.type==='button'&&n.props.children[0]==='分析并绑定A实际音轨');await start.props.onClick();assert.equal(changes.length,2);assert.deepEqual(changes[1][1][0],s.audioEvidence[0]);assert.equal(pending.at(-1),false);good.dispose();
 }finally{h.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});

test('forwarded shared Audio reads late native decode/seek events while muted, retains strict clock and detaches replaced elements',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),owner=new Host(),child=new Host(),reports=[];globalThis.fetch=fetching(s);
 const doc={},slot={ownerDocument:doc},media=()=>Object.assign(new EventTarget(),{tagName:'AUDIO',ownerDocument:doc,currentSrc:'http://localhost/'+s.audioEvidence[0].playbackAsset.src,currentTime:0,duration:3,playbackRate:1,readyState:0,error:null,muted:true});
 try{
  const tree=await owner.settle(AudioClockPlayback,props(s)),node=walk(tree).find(n=>n.props.segment?.takeId==='A');assert.ok(node);child.frame=15;
  const p={...node.props,gain:0,onReport:r=>reports.push(r)},audio=media(),commit=tree=>{tree.props.ref.current=slot;walk(tree).find(n=>n.props.src).props.ref.current=audio;};
  let rendered=child.render(node.type,p,commit),audioProps=walk(rendered).find(n=>n.props.src).props;
  assert.equal(audioProps.muted,true);assert.equal(audioProps.acceptableTimeShiftInSeconds,undefined,'SDK correction uses normal tolerance; evidence precision is independently one frame');assert.equal(reports.at(-1).status,'waiting');
  // Pool audio lives outside this tree. No React onLoadedData callback exists.
  assert.equal(audioProps.onLoadedData,undefined);audio.readyState=4;audio.currentTime=.5;audio.dispatchEvent(new Event('loadeddata'));
  assert.equal(reports.at(-1).status,'ready');assert.equal(reports.at(-1).actualMediaMs,1000);
  const stable=reports.length;audio.currentTime=.51;child.render(node.type,p,commit);assert.equal(reports.length,stable,'readiness-only rerender does not resample advancing time into a layout-update feedback loop');
  // A small clock offset cannot supply missing decoded data. SDK correction
  // and proof precision are separate; the real proof gate stays one frame.
  audio.currentTime=.524908;audio.readyState=1;audio.dispatchEvent(new Event('seeking'));assert.equal(reports.at(-1).status,'waiting');
  audio.readyState=4;audio.dispatchEvent(new Event('canplay'));assert.equal(reports.at(-1).status,'ready');assert.ok(Math.abs(reports.at(-1).actualMediaMs-1024.908)<1e-8);
  audio.currentTime=.534;audio.dispatchEvent(new Event('timeupdate'));assert.equal(reports.at(-1).status,'waiting','34ms is still outside the unchanged 33.43ms gate');
  audio.currentTime=.533;audio.dispatchEvent(new Event('seeked'));assert.equal(reports.at(-1).status,'ready');
  child.frame=30;child.render(node.type,p,commit);assert.equal(reports.at(-1).status,'waiting','new output frame never inherits the old audio clock');
  audio.currentTime=1;audio.dispatchEvent(new Event('seeked'));assert.equal(reports.at(-1).actualMediaMs,1500);assert.equal(reports.at(-1).status,'ready');
  const replacement=media();child.render(node.type,{...p,gain:1},tree=>{tree.props.ref.current=slot;walk(tree).find(n=>n.props.src).props.ref.current=replacement;});const count=reports.length;
  audio.error={code:3};audio.dispatchEvent(new Event('error'));assert.equal(reports.length,count,'released pool element cannot overwrite current readiness');
  replacement.error={code:3};replacement.dispatchEvent(new Event('error'));assert.equal(reports.at(-1).status,'blocked');
  child.dispose();const stopped=reports.length;replacement.error=null;replacement.readyState=4;replacement.currentTime=1;replacement.dispatchEvent(new Event('canplay'));assert.equal(reports.length,stopped);
  const offline=new Host();offline.rendering=true;const exported=offline.render(node.type,p,commit);assert.equal(walk(exported).find(n=>n.props.src).props.acceptableTimeShiftInSeconds,undefined,'offline PCM render path receives no preview correction');offline.dispose();
 }finally{child.dispose();owner.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});

test('real child consumes trusted Timeline preview rate while owner proof retains clip speed and source time',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),owner=new Host(),child=new Host(),doc={},slot={ownerDocument:doc};globalThis.fetch=fetching(s);
 const audio=Object.assign(new EventTarget(),{tagName:'AUDIO',ownerDocument:doc,currentSrc:'http://localhost/'+s.audioEvidence[0].playbackAsset.src,currentTime:.5,duration:3,playbackRate:.5,readyState:4,error:null,muted:true});
 try{
  let tree=await owner.settle(AudioClockPlayback,props(s));const node=walk(tree).find(n=>n.props.segment?.takeId==='A'),id=node.props.segment.projectionId;
  tree.props.value.reportSpeaker(id,{status:'ready',src:s.source.src,sha256:s.source.sha256,width:1920,height:1080,sourceMs:10500,muted:true});
  child.frame=15;child.previewRate=.5;
  const commit=t=>{t.props.ref.current=slot;walk(t).find(n=>n.props.src).props.ref.current=audio;};
  const rendered=child.render(node.type,node.props,commit),audioProps=walk(rendered).find(n=>n.props.src).props;
  assert.equal(audioProps.playbackRate,1,'Remotion receives the unchanged clip rate and multiplies Timeline itself');
  assert.equal(audioProps.acceptableTimeShiftInSeconds,undefined,'SDK correction uses normal tolerance; evidence precision is independently one frame');
  tree=owner.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,true);
  assert.equal(tree.props.value.runtimeFor(id,10500).audioProof.playbackRate,1,'proof remains source-speed semantic, never native wall-clock .5');
  assert.equal(tree.props.value.runtimeFor(id,10500).audioProof.mediaMs,1000);
  child.previewRate=.75;child.render(node.type,node.props,commit);tree=owner.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,false,'rate change cannot inherit old .5 readiness');
  audio.playbackRate=.75;audio.dispatchEvent(new Event('ratechange'));tree=owner.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,true);
  child.previewRate=NaN;child.render(node.type,node.props,commit);tree=owner.render(AudioClockPlayback,props(s));assert.equal(tree.props.value.forceMuteOriginal,false);
 }finally{child.dispose();owner.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});

test('ordinary scenes at half preview rate keep original audio policy and mount no comparison tracks',async()=>{
 const previous=globalThis.fetch,s=synthAudioFixture(),h=new Host(),ordinary=structuredClone(s);ordinary.state.presentation.scenes=[ordinary.raw];h.previewRate=.5;const calls=[];globalThis.fetch=async url=>{calls.push(url);throw Error('ordinary scenes must not request AB media');};
 try{const tree=await h.settle(AudioClockPlayback,props(ordinary));assert.equal(tree.props.value.forceMuteOriginal,false);assert.equal(tree.props.value.forceMuteMusic,false);assert.equal(walk(tree).some(n=>n.props.segment),false);assert.deepEqual(calls,[]);}finally{h.dispose();globalThis.fetch=previous;delete globalThis.__audioLife;}
});
