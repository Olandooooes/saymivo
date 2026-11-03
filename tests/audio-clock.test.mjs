import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {dynamicAudioWaveform} from '../server/dynamic-audio-routes.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {audioClockActiveTake,audioClockAnalysisIssues,audioClockControls,audioClockCopy,audioClockFieldPlan,audioClockIssues,audioClockMeasurementKey,audioClockPlaybackRequest,audioClockReadiness,audioClockState} from '../src/audio-clock.mjs';

const viewport={width:1920,height:1080},hash=v=>createHash('sha256').update(v).digest('hex'),full=n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean).join('\n');
const scene={id:'audio-synthetic',clipId:'raw',src:'clips/synthetic.mp4',startMs:1000,endMs:41000,layout:'cards',title:'听真实的A/B片段',body:'不同音量不等于不同准确率。',nodes:[{id:'a',text:'原音片段',detail:'真实录音，不是准确率指标',bullets:['保留限定条件']},{id:'b',text:'对比片段',detail:'作者明确选择的另一段声音'}]};
function makeAnalysis(id,amplitude){
 const pcm=Buffer.alloc(32000);for(let i=0;i<16000;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI/40)*amplitude*32767),i*2);
 const payload={version:1,method:'pcm16-source-zero-waveform-v1',src:'audio/'+id+'.wav',sha256:hash(pcm),sourceClock:'source-zero-ms',clock:{basis:'container-start',sourceOriginSec:0,audioFirstPtsSec:0,audioOffsetMs:0,audioStreamIndex:0,originalChannels:1},...dynamicAudioWaveform(pcm,{startMs:0,endMs:1000,bins:32})};
 return {...payload,analysisSha256:hash(JSON.stringify(payload))};
}
const analyses=[makeAnalysis('a',.8),makeAnalysis('b',.2)];
const config={kind:'audio-clock-ab',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:scene.startMs,endMs:scene.endMs},dataKind:'explicit-audio',provenance:'合成演示：作者明确选择的两段真实PCM，不是ASR准确率实测',audioOwner:{kind:'external-single-track',id:'one-external-owner'},order:'A-then-B',timeScaleMs:1000,copyWindow:{atMs:0,endMs:14000,rect:{x:.04,y:.035,width:.59,height:.79}},comparisonWindow:{atMs:14000,endMs:40000},takes:analyses.map((a,i)=>({id:i?'B':'A',nodeId:i?'b':'a',expectedText:full(scene.nodes[i]),source:{src:a.src,sha256:a.sha256,analysisSha256:a.analysisSha256},startMs:0,endMs:1000,playAtMs:i?20000:15000,labelRect:{x:.04,y:i?.50:.15,width:.59,height:.12},waveRect:{x:.04,y:i?.64:.29,width:.59,height:.07},wordRect:{x:.04,y:i?.73:.38,width:.59,height:.08},wordTrack:{src:a.src,sha256:a.sha256,clock:'source-zero-ms',provenance:'作者提供的逐词时间，未自动识别/评估',text:'Hello 世界。',words:[{id:'hello',text:'Hello',startUtf16:0,endUtf16:5,startMs:0,endMs:500},{id:'world',text:'世界',startUtf16:6,endUtf16:8,startMs:600,endMs:950}]}}))};
const measure=(s,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(s)].reduce((n,{segment})=>n+(/^[il .]$/.test(segment)?.28:/^[A-Za-z]$/.test(segment)?.56:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=config,v=viewport){return {fontKey:'synthetic-variable-width',key:audioClockMeasurementKey(s,c,v,'synthetic-variable-width'),fields:audioClockFieldPlan(s,c).map(f=>({id:f.id,text:f.text,fit:fitMeasuredText(f.text,{width:f.rect.width*v.width*.94,height:f.rect.height*v.height*.88,minFont:v.height*.027,maxFont:v.height*.027,measure,protectedPhrases:f.role==='words'?c.takes.find(t=>t.id===f.takeId).wordTrack.words.map(w=>w.text):[]})}))};}
const runtime=(s=scene,c=config,t=15250)=>({analyses,audioProof:{...audioClockPlaybackRequest(s,c,t),status:'ready',fps:30}});

test('actual PCM amplitudes and common horizontal scale survive without row normalization or fabricated numeric scores',()=>{
 assert.deepEqual(audioClockIssues(scene,config),[]);const m=fixture(),r=runtime(),state=audioClockState(scene,config,15250,m,r);assert.equal(state.status,'ready');assert.equal(state.rows[0].playing,true);assert.equal(state.rows[1].playing,false);assert.equal(state.rows[0].cursor,.25);
 const peak=rows=>Math.max(...rows.waveform.map(b=>b.max));assert.ok(peak(state.rows[0])>3.9*peak(state.rows[1]));assert.equal(state.rows[0].waveform.length,32);assert.equal(state.rows[0].durationFraction,1);assert.equal(state.rows[1].durationFraction,1);
 const actual={...r,audioProof:{...r.audioProof,mediaMs:270}},decoded=audioClockState(scene,config,15250,m,actual);assert.equal(decoded.status,'ready');assert.equal(decoded.rows[0].cursor,.27,'cursor uses the decoded media clock, not an interpolated animation percentage');
 assert.deepEqual(audioClockState(scene,config,15250,m,r),state,'seeking has no wall-clock or prior-frame state');
 const noWords={...config,takes:config.takes.map(({wordTrack,wordRect,...t})=>t)};assert.equal(audioClockReadiness(scene,noWords,15250,fixture(scene,noWords),runtime(scene,noWords)).status,'ready');assert.equal(audioClockState(scene,noWords,15250,fixture(scene,noWords),runtime(scene,noWords)).rows[0].activeWordId,null);
});
test('explicit A/B order controls a single external owner and source time, never creates a second soundtrack',()=>{
 assert.equal(audioClockActiveTake(config,14999),null);assert.equal(audioClockActiveTake(config,15000).id,'A');assert.equal(audioClockActiveTake(config,16000),null);assert.equal(audioClockActiveTake(config,20000).id,'B');
 assert.deepEqual(audioClockPlaybackRequest(scene,config,15250),{ownerId:'one-external-owner',takeId:'A',src:analyses[0].src,sha256:analyses[0].sha256,sourceClock:'source-zero-ms',mediaMs:250,playbackRate:1,sceneSourceMs:16250,activeAudioTracks:1,otherTracksMuted:true});
 const between=audioClockPlaybackRequest(scene,config,18000);assert.equal(between.takeId,null);assert.equal(between.src,scene.src);assert.equal(between.mediaMs,19000);
 const reverse={...config,order:'B-then-A',takes:config.takes.map(t=>({...t,playAtMs:t.id==='B'?15000:20000}))};assert.deepEqual(audioClockIssues(scene,reverse),[]);assert.equal(audioClockPlaybackRequest(scene,reverse,15250).takeId,'B');
 for(const c of [{...config,order:'B-then-A'},{...config,takes:config.takes.map(t=>({...t,playAtMs:15000}))},{...config,audioOwner:{kind:'internal-mix',id:'wrong'}}])assert.ok(audioClockIssues(scene,c).length);
 const r=runtime();for(const change of [{activeAudioTracks:2},{otherTracksMuted:false},{ownerId:'another-owner'},{src:analyses[1].src},{sha256:'b'.repeat(64)},{takeId:'B'},{playbackRate:2},{status:'blocked'}])assert.equal(audioClockReadiness(scene,config,15250,fixture(),{...r,audioProof:{...r.audioProof,...change}}).status,'blocked');
 for(const change of [{status:'waiting'},{mediaMs:900},{sceneSourceMs:1000}])assert.equal(audioClockReadiness(scene,config,15250,fixture(),{...r,audioProof:{...r.audioProof,...change}}).status,'waiting');
 assert.equal(audioClockReadiness(scene,config,15250,fixture(),{analyses}).status,'waiting');
 for(const [time,mediaMs] of [[15000,-20],[15999,1010]]){const r=runtime(scene,config,time);assert.equal(audioClockReadiness(scene,config,time,fixture(),{...r,audioProof:{...r.audioProof,mediaMs}}).status,'waiting','decoder tolerance cannot expose samples outside the authored A/B segment');}
});
test('word cursor accepts only exact original text ranges, explicit source clocks and provenance; gaps and sentence punctuation do not gain guessed timing',()=>{
 const m=fixture();for(const [time,id] of [[15250,'hello'],[15500,null],[15650,'world'],[15950,null]])assert.equal(audioClockState(scene,config,time,m,runtime(scene,config,time)).rows[0].activeWordId,id);
 const take=config.takes[0];for(const wordTrack of [{...take.wordTrack,provenance:''},{...take.wordTrack,clock:'edited-ms'},{...take.wordTrack,sha256:'b'.repeat(64)},{...take.wordTrack,words:[{...take.wordTrack.words[0],text:'Hallo'},take.wordTrack.words[1]]},{...take.wordTrack,words:[take.wordTrack.words[0]]},{...take.wordTrack,words:take.wordTrack.words.map(w=>({...w,endMs:1100}))}])assert.ok(audioClockIssues(scene,{...config,takes:[{...take,wordTrack},config.takes[1]]}).length);
 const emoji={...take.wordTrack,text:'👨‍👩‍👧‍👦',words:[{id:'bad',text:'👨',startUtf16:0,endUtf16:2,startMs:0,endMs:500}]};assert.ok(audioClockIssues(scene,{...config,takes:[{...take,wordTrack:emoji},config.takes[1]]}).includes('word-source-range-time-or-order-invalid'));
});
test('waveform proof binds current src/SHA/PCM clock/sample range and every bin, rather than accepting a decorative waveform',()=>{
 const take=config.takes[0],a=analyses[0];assert.deepEqual(audioClockAnalysisIssues(take,a),[]);
 for(const change of [{sha256:'b'.repeat(64)},{durationMs:999},{sampleCount:0},{sourceClock:'edited-ms'},{method:'fake-wave'},{pcmSha256:'missing'},{range:{...a.range,endSample:15999}},{clock:{...a.clock,audioOffsetMs:500}},{bins:a.bins.slice(1)},{bins:a.bins.map((b,i)=>i?b:{...b,min: -2})},{bins:a.bins.map((b,i)=>i?b:{...b,rms:2})}])assert.ok(audioClockAnalysisIssues(take,{...a,...change}).length);
 const r=runtime();assert.equal(audioClockReadiness(scene,config,15250,fixture(),{...r,analyses:[]}).status,'waiting');assert.equal(audioClockReadiness(scene,config,15250,fixture(),{...r,analyses:[{...a,bins:[]},analyses[1]]}).status,'blocked');
});
test('full source prose and all labels remain measured; overlapping person/subtitle/text or dropped evidence blocks instead of omitting it',()=>{
 const copy=audioClockCopy(scene,config);for(const t of [scene.title,scene.body,...scene.nodes.flatMap(n=>[n.text,n.detail,...(n.bullets??[])]),'Hello 世界。'])assert.ok(copy.includes(t));
 const t=config.takes[0];for(const c of [{...config,copyWindow:undefined},{...config,takes:[{...t,expectedText:t.expectedText.slice(1)},config.takes[1]]},{...config,takes:[{...t,waveRect:t.labelRect},config.takes[1]]},{...config,takes:[{...t,waveRect:{x:.05,y:.80,width:.59,height:.12}},config.takes[1]]}])assert.ok(audioClockIssues(scene,c).length);
 const moving={...scene,window:{x:.70,y:.2,size:.1,keyframes:[{atMs:20000,x:.02,y:.2,size:.1}]}};assert.ok(audioClockIssues(moving,config).some(i=>i.includes('person-path')));
 for(const atMs of [NaN,Infinity,-1,40001])assert.ok(audioClockIssues({...scene,window:{x:.7,y:.2,size:.1,keyframes:[{atMs,x:.7,y:.2,size:.1}]}},config).includes('speaker-keyframe-clock-invalid'));
 assert.ok(audioClockIssues({...scene,media:{src:'broll-assets/proof.png',kind:'image'}},config).includes('existing-evidence-media-requires-a-supported-media-renderer'));
 assert.equal(audioClockReadiness(scene,config,15250,{...fixture(),key:'stale'},runtime()).status,'blocked');
});
test('retained cuts/real speed cannot bypass full original reading, comparison or absolute source identity',()=>{
 for(const speed of [.5,1,2]){const clips=[{id:'all',src:scene.src,inSec:1,outSec:41,speed}],s=projectStoryboard([scene],clips,30)[0],p={rawScene:scene,clips,fps:30},r=runtime(s,config,15250);assert.equal(audioClockReadiness(s,config,15250,fixture(s),r,viewport,p).status,'ready');assert.equal(audioClockState(s,config,15250,fixture(s),r,viewport,p).rows[0].cursor,.25);assert.equal(r.audioProof.playbackRate,speed);}
 const clips=[{id:'short',src:scene.src,inSec:15,outSec:41,speed:1}],s=projectStoryboard([scene],clips,30)[0];assert.equal(audioClockReadiness(s,config,15250,fixture(s),runtime(s),viewport,{rawScene:scene,clips,fps:30}).status,'blocked');
 const movedRaw={...scene,startMs:2000,endMs:42000},cs=[{id:'all',src:scene.src,inSec:0,outSec:42,speed:1}],moved=projectStoryboard([movedRaw],cs,30)[0];assert.ok(audioClockIssues(moved,config,viewport,{rawScene:movedRaw,clips:cs,fps:30}).some(i=>i.includes('projection')));
 for(const time of [-1,40000,NaN,Infinity])assert.equal(audioClockState(scene,config,time,fixture(),runtime()).status,'blocked');
 const fast=[{id:'fast',src:scene.src,inSec:1,outSec:41,speed:10}],f=projectStoryboard([scene],fast,30)[0];assert.equal(audioClockReadiness(f,config,15250,fixture(f),runtime(f),viewport,{rawScene:scene,clips:fast,fps:30}).status,'blocked');
});

// Actual component branches with synthetic metrics/decoder receipts. The route
// tests independently execute real PCM decoding. Neither claims browser pixels.
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactUrl)};export default React;export const useContext=()=>globalThis.__audio.font;export const useCallback=f=>f;export const useState=()=>[globalThis.__audio.reports,()=>{}];export const useLayoutEffect=f=>{f()};`),fakeRender=data(`import React from ${JSON.stringify(reactUrl)};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const useVideoConfig=()=>globalThis.__audio.viewport;export const DisplayFontContext={};export const useMeasuredText=text=>({fit:globalThis.__audio.fits[text]??null,family:'synthetic'});`);
const code=fs.readFileSync(new URL('../src/AudioClockScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender)).replaceAll("'./audio-clock.mjs'",JSON.stringify(new URL('../src/audio-clock.mjs',import.meta.url).href)).replaceAll("'./source-token-transfer.mjs'",JSON.stringify(new URL('../src/source-token-transfer.mjs',import.meta.url).href));
const {AudioClockScene}=await import(data(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(s=scene,c=config,time=15250,{v=viewport,r=runtime(s,c,time),waiting=false,projectionProof}={}){const m=fixture(s,c,v),values=m.fields.map(f=>({...f,fit:waiting?null:f.fit,family:'synthetic'})),readiness=[];globalThis.__audio={font:m.fontKey,viewport:v,reports:{key:m.key,fields:Object.fromEntries(values.map(f=>[f.id,f]))},fits:Object.fromEntries(values.map(f=>[f.text,f.fit]))};try{return {html:renderToStaticMarkup(React.createElement(AudioClockScene,{scene:s,config:c,elapsed:time,runtime:r,projectionProof,onReadiness:v=>readiness.push(v)})),readiness};}finally{delete globalThis.__audio;}}
test('actual renderer draws only PCM-derived waveform and decoder-driven word cursor, with no Audio/video elements',()=>{
 for(const v of [viewport,{width:1080,height:1920}]){const result=render(scene,config,15250,{v});assert.equal(result.readiness.at(-1).status,'ready');assert.ok(result.html.includes('data-audio-pcm-waveform="A"'));assert.ok(result.html.includes('data-audio-pcm-waveform="B"'));assert.ok(result.html.includes('data-audio-decoded-cursor="A"'));assert.ok(!result.html.includes('data-audio-decoded-cursor="B"'));assert.ok(result.html.includes('data-audio-word-cursor="hello"'));assert.ok(!result.html.includes('<audio'));assert.ok(!result.html.includes('<video'));assert.ok(!result.html.includes('准确率：'));
  const copy=render(scene,config,1000,{v}),plain=copy.html.replace(/<[^>]*>/g,'');for(const text of [scene.title,scene.body,...scene.nodes.flatMap(n=>[n.text,n.detail,...(n.bullets??[])])])assert.ok(plain.includes(text));assert.ok(!copy.html.includes('data-audio-pcm-waveform='));
 }
});
test('native readiness resets on missing current decoder, source edits or waiting font; unavailable diagrams never flash',()=>{
 const r=runtime(),bad={...r,audioProof:{...r.audioProof,activeAudioTracks:2}},invalid={...config,order:'B-then-A'},sequence=[render(),render(scene,config,15250,{r:bad}),render(),render(scene,config,15250,{waiting:true}),render(scene,config,15250,{r:{analyses}}),render(scene,invalid)];
 assert.deepEqual(sequence.map(r=>r.readiness.at(-1).status),['ready','blocked','ready','waiting','waiting','blocked']);for(const result of [sequence[1],sequence[3],sequence[4],sequence[5]])assert.ok(!result.html.includes('data-audio-pcm-waveform='));
});
test('controls use supported source-ms seconds UI and explicit readonly real facts, not waveform/ASR generators',()=>{
 assert.equal(audioClockControls.canApply,false);assert.equal(audioClockControls.automaticAllowed,false);const fields=audioClockControls.fields;assert.equal(fields.find(f=>f.key==='order').type,'select');assert.deepEqual(fields.find(f=>f.key==='order').options,['A-then-B','B-then-A']);assert.equal(fields.find(f=>f.key==='timeScaleMs').type,'source-ms');const take=fields.find(f=>f.key==='takes');for(const key of ['source','expectedText','wordTrack'])assert.equal(take.itemFields.find(f=>f.key===key).readonly,true);
});

test('actual long-copy pages and all restored node conditions get their own complete retained reading window',()=>{
 const s={...scene,endMs:601000,body:'不能把没有验证说成已经完成。'.repeat(160)},c={...config,binding:{...config.binding,endMs:s.endMs},copyWindow:{...config.copyWindow,endMs:400000},comparisonWindow:{atMs:400000,endMs:600000},takes:config.takes.map((t,i)=>({...t,playAtMs:i?405000:401000}))},m=fixture(s,c),fit=m.fields[0].fit;assert.ok(fit.pages.length>1);
 for(let page=0;page<fit.pages.length;page++){const time=(page+.5)*400000/fit.pages.length,result=render(s,c,time);assert.equal(result.readiness.at(-1).status,'ready');assert.ok(result.html.includes(`data-audio-text-page="${page}"`));assert.ok(result.html.includes(`data-audio-page="${page}" aria-hidden="false"`));assert.equal((result.html.match(/aria-hidden="false"/g)??[]).length,1);assert.ok(!result.html.includes('data-audio-pcm-waveform='));}
 const clips=[{id:'late',src:s.src,inSec:201,outSec:601,speed:1}],cut=projectStoryboard([s],clips,30)[0],result=render(cut,c,450000,{projectionProof:{rawScene:s,clips,fps:30}});assert.equal(result.readiness.at(-1).status,'blocked');assert.ok(!result.html.includes('data-audio-full-text='));
});
