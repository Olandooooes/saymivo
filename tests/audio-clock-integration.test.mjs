import test from 'node:test';
import {synthAudioFixture as setup} from './fixtures/audio-clock-fixture.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dynamicAudioWaveform} from '../server/dynamic-audio-routes.mjs';
import {audioClockVideoCandidates,audioClockEvidenceIssues,audioClockSceneSegments,audioClockProjectSegments,audioClockOwnershipAtFrame,audioClockDecodedReport,verifyAudioClockWav,audioClockDomPlaybackIssues,registerAudioClockMediaElement} from '../src/audio-clock-integration.mjs';
import {dynamicMotionEnvironmentFromState,createSceneDynamicMotionDraft,previewSceneDynamicMotion,audioClockLiveSelectionIssues,validateSavedSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';
import {verifyDynamicMotionsForExport,verifyAudioClockMotionsForSave} from '../server/dynamic-motion-export.mjs';
import {arrangeAudioClockTakes,fetchVideoAudioEvidence,sourceWordTrackFromProject} from '../editor/audio-clock-editor.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {createDynamicLibraryConfig} from '../src/dynamic-motion-library.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone,viewport={width:1920,height:1080},fps=30;
function wav(p){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+p.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(16000,24);h.writeUInt32LE(32000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(p.length,40);return Buffer.concat([h,p]);}
test('explicit project video candidates exclude network/images and do not fabricate new audio sources',()=>{
 const s=setup().state;assert.deepEqual(audioClockVideoCandidates({...s,clips:[...s.clips,{id:'remote',src:'https://invalid/a.mp4'}],brollAssets:[...s.brollAssets,{id:'i',src:'broll-assets/a.png',kind:'image'},{id:'same',src:s.clips[0].src,kind:'video'}]}).map(a=>a.src),['clips/original.mp4','broll-assets/other.mp4']);
});
test('real evidence chain is separate from visual assets; same video different source windows are valid',()=>{
 for(const sameSource of [false,true]){const s=setup({sameSource});assert.deepEqual(audioClockEvidenceIssues(s.state,s.config,s.audioEvidence),[]);assert.equal(validateSavedSceneDynamicMotion(s.saved,s.env).ok,true);assert.deepEqual(s.saved.dynamicMotion.assetIdentities,[]);assert.equal(s.saved.dynamicMotion.audioEvidence.length,2);}
 const s=setup();for(const change of [e=>e[0].sourceIdentity.sha256='c'.repeat(64),e=>e[0].analysis.clock.basis='container-start',e=>e[0].playbackAsset.segmentPcmSha256='fake',e=>e[0].playbackAsset.sourceStartMs=0,e=>e[0].playbackAsset.sampleCount--]){const e=clone(s.audioEvidence);change(e);assert.ok(audioClockEvidenceIssues(s.state,s.config,e).length);}
 assert.ok(audioClockEvidenceIssues({...s.state,brollAssets:[]},s.config,s.audioEvidence).length);
});
test('retained instances/speeds get their own exact output-frame windows and reject cut, gaps, rounding and overlays',()=>{
 for(const speed of [.5,1,2]){const s=setup({speed,duplicate:true}),r=audioClockProjectSegments(s.state.presentation.scenes,s.state.clips,fps,viewport);assert.deepEqual(r.issues,[]);assert.equal(r.segments.length,4);assert.equal(r.segments[2].fromFrame-r.segments[0].fromFrame,Math.round(40/speed*fps));assert.equal(r.segments[0].fromFrame,10/speed*fps);}
 const s=setup(),gap=clone(s.config);gap.takes[1].playAtMs+=1000;assert.ok(audioClockSceneSegments(s.raw,gap,s.state.clips,fps).issues.length);
 const off=clone(s.config);off.takes.forEach(t=>t.playAtMs+=1);off.comparisonWindow.atMs++;off.comparisonWindow.endMs++;assert.ok(audioClockSceneSegments(s.raw,off,s.state.clips,fps).issues.some(i=>i.includes('输出帧')));
 assert.ok(audioClockSceneSegments(s.raw,s.config,[{...s.state.clips[0],inSec:5}],fps).issues.length);
 const ordinary={...s.raw,id:'ordinary',startMs:12000,endMs:20000,dynamicMotion:undefined};assert.ok(audioClockProjectSegments([s.saved,ordinary],s.state.clips,fps).issues.some(i=>i.includes('其他场景覆盖')));assert.ok(audioClockProjectSegments([ordinary,s.saved],s.state.clips,fps).issues.some(i=>i.includes('其他场景覆盖')),'projected chronology determines the same later ordinary owner');
 const second={...s.saved,id:'second',dynamicMotion:{...s.saved.dynamicMotion,config:{...s.config,binding:{...s.config.binding,sceneId:'second'}}}};assert.ok(audioClockProjectSegments([s.saved,second],s.state.clips,fps).issues.length);
});
test('single replacement policy passes original/music outside compare and on stale/error, never silences a whole scene',()=>{
 const s=setup(),segments=audioClockProjectSegments([s.saved],s.state.clips,fps).segments,one=segments[0],ok={key:one.projectionId+':A',status:'ready',actualMediaMs:500};
 for(const f of [0,299,480,1199]){const p=audioClockOwnershipAtFrame(segments,f,{decoded:ok});assert.equal(p.mode,'passthrough');assert.equal(p.forceMuteOriginal,false);assert.equal(p.forceMuteMusic,false);}
 for(const opts of [{evidenceOk:false},{decoded:{...ok,status:'blocked'}},{decoded:{...ok,key:'foreign:A'}},{}]){const p=audioClockOwnershipAtFrame(segments,300,opts);assert.equal(p.replacementGain,0);assert.equal(p.forceMuteOriginal,false);}
 assert.equal(audioClockOwnershipAtFrame(segments,300,{decoded:ok}).replacementGain,1);assert.equal(audioClockOwnershipAtFrame(segments,390,{decoded:ok}).forceMuteOriginal,false,'A report never owns B');assert.equal(audioClockOwnershipAtFrame(segments,390,{renderVerified:true}).forceMuteMusic,true);
});
test('actual decoded report reads currentSrc/currentTime/duration/readyState/rate, rather than returning expected request',()=>{
 const s=setup(),e=s.audioEvidence[0],take=s.config.takes[0],p={playbackAsset:e.playbackAsset,take,projectionId:'s:c',expectedMediaMs:1000,speed:1,fps},actual={currentSrc:'http://localhost/'+e.playbackAsset.src,currentTime:.5,duration:3,playbackRate:1,readyState:2,error:null};assert.deepEqual(audioClockDecodedReport(actual,p),{key:'s:c:A',status:'ready',actualMediaMs:1000});
 const delayed=audioClockDecodedReport({...actual,currentTime:0},p);assert.equal(delayed.status,'waiting');assert.equal(delayed.actualMediaMs,500);for(const change of [{currentSrc:'http://localhost/foreign.wav'},{duration:4},{playbackRate:2},{error:{code:3}}])assert.equal(audioClockDecodedReport({...actual,...change},p).status,'blocked');assert.equal(audioClockDecodedReport(null,p).status,'waiting');
});
test('actual generated WAV header and both file/PCM hashes are required for browser/export receipt',async()=>{
 const s=setup(),e=s.audioEvidence[0],pcm=Buffer.alloc(e.playbackAsset.sampleCount*2),bytes=wav(pcm),asset={...e.playbackAsset,sha256:hash(bytes),segmentPcmSha256:hash(pcm)};assert.deepEqual(await verifyAudioClockWav(bytes,asset),{wavSha256:asset.sha256,segmentPcmSha256:asset.segmentPcmSha256,sampleCount:asset.sampleCount});
 for(const bad of [bytes.subarray(0,-2),Buffer.from(bytes)]){if(bad.length===bytes.length)bad[bad.length-1]=33;await assert.rejects(verifyAudioClockWav(bad,asset));}await assert.rejects(verifyAudioClockWav(bytes,{...asset,segmentPcmSha256:'a'.repeat(64)}));
});
test('font, captions, media list, appearance and wording stale the audio owner using the same current environment',()=>{
 const s=setup();assert.deepEqual(audioClockLiveSelectionIssues(s.state,s.saved),[]);for(const change of [x=>x.presentation.displayFont='douyin',x=>x.captions=[{id:'added'}],x=>x.presentation.speaker={x:5},x=>x.brollAssets=[],x=>x.presentation.scenes[0].body='改了原文']){const state=clone(s.state);change(state);assert.ok(audioClockLiveSelectionIssues(state,state.presentation.scenes[0]).length);}
});
test('save and export rematerialize every current A/B source; replaced source/analysis/playback bytes cannot reuse old evidence',async()=>{
 const s=setup(),inspect=async()=>s.source,materializeAudio=async(src,{startMs})=>{const {takeId,...e}=s.audioEvidence.find(e=>e.sourceIdentity.src===src&&e.analysis.range.startMs===startMs);return e;};await verifyDynamicMotionsForExport(s.state,inspect,{materializeAudio});await verifyAudioClockMotionsForSave(s.state,inspect,{materializeAudio});
 await assert.rejects(verifyDynamicMotionsForExport(s.state,inspect),/重新核对PCM/);
 for(const change of [e=>e.sourceIdentity.sha256='c'.repeat(64),e=>e.analysis.bins[0].rms=0,e=>e.playbackAsset.sha256='d'.repeat(64)])await assert.rejects(verifyDynamicMotionsForExport(s.state,inspect,{materializeAudio:async(...args)=>{const e=clone(await materializeAudio(...args));change(e);return e;}}),/重新预览/);
 const x=clone(s.state);x.presentation.displayFont='douyin';await assert.rejects(verifyAudioClockMotionsForSave(x,inspect,{materializeAudio}),/重新预览/);
 const covered=clone(s.state);covered.presentation.scenes.push({...s.raw,id:'ordinary',startMs:12000,endMs:20000});await assert.rejects(verifyAudioClockMotionsForSave(covered,inspect,{materializeAudio}),/其他场景覆盖/);
});
test('dedicated editor only binds actual selected local analysis receipts and respects abort',async()=>{
 const s=setup(),e=s.audioEvidence[0],fetcher=async(url,opts)=>{assert.equal(opts.method,'POST');assert.match(url,/materialize\?/);const {takeId,...r}=e;return {ok:true,json:async()=>r};};assert.deepEqual(await fetchVideoAudioEvidence(s.state,'A',e.sourceIdentity.src,500,3500,{fetcher}),e);await assert.rejects(fetchVideoAudioEvidence(s.state,'A','https://invalid/a.mp4',0,1,{fetcher}),/本项目/);
 const c=new AbortController();c.abort();await assert.rejects(fetchVideoAudioEvidence(s.state,'A',e.sourceIdentity.src,500,3500,{fetcher,signal:c.signal}));
 const arranged=arrangeAudioClockTakes({...s.config,order:'B-then-A'});assert.equal(arranged.takes[1].playAtMs,10000);assert.equal(arranged.takes[0].playAtMs,13000);assert.equal(arranged.comparisonWindow.endMs,16000);assert.throws(()=>arrangeAudioClockTakes({...s.config,order:undefined}));
});
test('optional word clock only copies exact same-SHA retained source words and keeps English spaces',()=>{
 const s=setup({sameSource:true}),t=s.config.takes[0],clock={sourceSha256:t.source.sha256,timestampBasis:'source-video-presentation-ms'},cap={id:'cap',clipId:'c',audioClock:clock,timingScope:'word',words:[{text:'Hello',startMs:500,endMs:700},{text:'world',startMs:750,endMs:1000},{text:'。',startMs:1000,endMs:1050}]},state={...s.state,captions:[cap,{...cap,id:'duplicate'}]};const track=sourceWordTrackFromProject(state,t);assert.equal(track.text,'Hello world。');assert.equal(track.words.length,3);assert.deepEqual(track.words.map(w=>[w.startUtf16,w.endUtf16]),[[0,5],[6,11],[11,12]]);
 for(const changed of [{...cap,audioClock:{...clock,sourceSha256:'f'.repeat(64)}},{...cap,timingScope:'cue'},{...cap,clipId:'foreign'}])assert.throws(()=>sourceWordTrackFromProject({...state,captions:[changed]},t));assert.throws(()=>sourceWordTrackFromProject({...state,clips:[{...state.clips[0],inSec:3.5}]},t));assert.throws(()=>sourceWordTrackFromProject({...state,captions:[cap,{...cap,id:'overlap',words:[{text:'other',startMs:600,endMs:800}]}]},t));
});
test('library creates incomplete explicit video-AB drafts without inventing source/time/order/provenance',()=>{
 const s=setup(),d=createDynamicLibraryConfig('audio-clock-ab',s.raw,{...viewport,sourceIdentity:s.source});assert.equal(d.config.kind,'audio-clock-ab');assert.equal(d.config.order,undefined);assert.equal(d.config.provenance,undefined);assert.equal(d.config.takes[0].source,undefined);assert.ok(d.requiredData.length);assert.equal(d.config.takes[0].expectedText,'A原声');
});

test('DOM audio receipt rejects native-only flags, foreign Player/clock and any unmuted original/music track',()=>{
 const s=setup(),projection=projectStoryboard([s.raw],s.state.clips,fps)[0],e=s.audioEvidence[0],attrs={'data-audio-owner-mode':'replace','data-audio-original-muted':'true','data-audio-music-muted':'true'},original={muted:true},music={muted:true},audio={currentSrc:'http://localhost/'+e.playbackAsset.src,currentTime:.5,duration:3,playbackRate:1,readyState:2,error:null},active={getAttribute:k=>({'data-audio-replacement-gain':'1','data-audio-playback-projection':projection.id,'data-audio-playback-take':'A'})[k],querySelector:()=>audio,querySelectorAll:()=>[audio]},scope={getAttribute:k=>attrs[k],querySelectorAll:k=>k==='[data-audio-playback-projection]'?[active]:k==='[data-audio-original-track]'?[{querySelectorAll:()=>[original]}]:k==='[data-audio-music-track]'?[{querySelector:()=>music,querySelectorAll:()=>[music]}]:[]},root={closest:()=>scope};
 assert.deepEqual(audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps),[]);audio.currentTime=0;assert.ok(audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps).length);audio.currentTime=.5;original.muted=false;assert.ok(audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps).length);original.muted=true;music.muted=false;assert.ok(audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps).length);music.muted=true;assert.ok(audioClockDomPlaybackIssues({closest:()=>null},s.draft,projection,10500,fps).length);assert.deepEqual(audioClockDomPlaybackIssues({closest:()=>null},s.draft,projection,1000,fps),[],'copy window preserves original and requires no AB decoder');
});


test('Remotion shared Audio outside composition is checked through actual local ref, not a data marker or serialized proof',()=>{
 const s=setup(),projection=projectStoryboard([s.raw],s.state.clips,fps)[0],doc={},e=s.audioEvidence[0],audio={tagName:'AUDIO',ownerDocument:doc,currentSrc:'http://localhost/'+e.playbackAsset.src,currentTime:.5,duration:3,playbackRate:1,readyState:2,error:null,muted:false},music={tagName:'AUDIO',ownerDocument:doc,muted:true},target={ownerDocument:doc,getAttribute:k=>({'data-audio-replacement-gain':'1','data-audio-playback-projection':projection.id,'data-audio-playback-take':'A'})[k],querySelector:()=>null,querySelectorAll:()=>[]},musicSlot={ownerDocument:doc,querySelector:()=>null,querySelectorAll:()=>[]},scope={getAttribute:k=>({'data-audio-owner-mode':'replace','data-audio-original-muted':'true','data-audio-music-muted':'true'})[k],querySelectorAll:k=>k==='[data-audio-playback-projection]'?[target]:k==='[data-audio-original-track]'?[{querySelectorAll:()=>[{muted:true}]}]:k==='[data-audio-music-track]'?[musicSlot]:[]},root={closest:()=>scope};
 const check=()=>audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps);assert.ok(check().length,'flags without actual media are insufficient');const old=registerAudioClockMediaElement(target,audio),musicCleanup=registerAudioClockMediaElement(musicSlot,music);assert.deepEqual(check(),[]);
 audio.currentTime=0;assert.ok(check().length);audio.currentTime=.5;music.muted=false;assert.ok(check().length);music.muted=true;const replacement={...audio};const newer=registerAudioClockMediaElement(target,replacement);old();assert.deepEqual(check(),[],'old cleanup cannot erase the newer actual ref');newer();assert.ok(check().length);musicCleanup();
 const foreign=registerAudioClockMediaElement(target,{...audio,ownerDocument:{}});assert.ok(check().length,'another document cannot bind this slot');foreign();
});

test('preview listening multiplier validates actual 0.5/0.75/1 native rates without changing source time or its strict gate',()=>{
 const s=setup(),e=s.audioEvidence[0],p={playbackAsset:e.playbackAsset,take:s.config.takes[0],projectionId:'s:c',expectedMediaMs:1000,speed:1,fps},base={currentSrc:'http://localhost/'+e.playbackAsset.src,currentTime:.5,duration:3,readyState:4,error:null};
 for(const speed of [.5,1,2])for(const previewPlaybackRate of [.5,.75,1]){
  const options={...p,speed,previewPlaybackRate},audio={...base,playbackRate:speed*previewPlaybackRate};
  assert.deepEqual(audioClockDecodedReport(audio,options),{key:'s:c:A',status:'ready',actualMediaMs:1000});
  assert.equal(audioClockDecodedReport({...audio,playbackRate:audio.playbackRate+.1},options).status,'blocked');
  assert.equal(audioClockDecodedReport({...audio,currentTime:.534},options).status,'waiting','34ms remains outside unchanged source-clock gate');
  assert.equal(audioClockDecodedReport({...audio,readyState:1},options).status,'waiting');
 }
 for(const previewPlaybackRate of [0,-.5,NaN,Infinity,null,'0.5'])assert.equal(audioClockDecodedReport({...base,playbackRate:1},{...p,previewPlaybackRate}).status,'blocked');
 assert.equal(audioClockDecodedReport({...base,playbackRate:.5},p).status,'blocked','native rate cannot authorize its own preview multiplier');
 assert.equal(audioClockDecodedReport({...base,playbackRate:1},p).status,'ready','existing 1x callers keep default behavior');
});

test('final DOM gate uses current actual-slot preview rate, never a copied attribute or stale registration',()=>{
 const s=setup(),projection=projectStoryboard([s.raw],s.state.clips,fps)[0],doc={},e=s.audioEvidence[0],audio={tagName:'AUDIO',ownerDocument:doc,currentSrc:'http://localhost/'+e.playbackAsset.src,currentTime:.5,duration:3,playbackRate:.5,readyState:4,error:null,muted:true},target={ownerDocument:doc,getAttribute:k=>({'data-audio-replacement-gain':'1','data-audio-playback-projection':projection.id,'data-audio-playback-take':'A','data-preview-rate':'.5'})[k],querySelector:()=>audio},scope={getAttribute:k=>({'data-audio-owner-mode':'replace','data-audio-original-muted':'true','data-audio-music-muted':'true','data-preview-rate':'.5'})[k],querySelectorAll:k=>k==='[data-audio-playback-projection]'?[target]:k==='[data-audio-original-track]'?[{querySelectorAll:()=>[{muted:true}]}]:[]},root={closest:()=>scope},check=()=>audioClockDomPlaybackIssues(root,s.draft,projection,10500,fps);
 assert.ok(check().length,'copied DOM preview-rate cannot bless native .5');
 const old=registerAudioClockMediaElement(target,audio,.5);assert.deepEqual(check(),[]);
 audio.playbackRate=.75;assert.ok(check().length,'native change waits for trusted context update');
 const current=registerAudioClockMediaElement(target,audio,.75);old();assert.deepEqual(check(),[],'old cleanup leaves current rate/ref binding');
 for(const invalid of [0,-1,NaN,Infinity,null]){const release=registerAudioClockMediaElement(target,audio,invalid);assert.ok(check().length);release();}
 current();assert.ok(check().length,'released slot cannot recover the previous context rate from native metadata');
});
