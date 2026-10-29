import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectStoryboard} from '../src/storyboard.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {fullFrameHandoffCopy,fullFrameHandoffExposure,fullFrameHandoffMeasurementKey,fullFrameHandoffProjectionIssues,fullFrameHandoffProtectedRects,fullFrameHandoffIssues,fullFrameHandoffTextReadiness,fullFrameHandoffReadiness,fullFrameHandoffPhase,fullFrameHandoffState,fullFrameHandoffControls} from '../src/full-frame-handoff.mjs';

const wide={width:1920,height:1080},portrait={width:1080,height:1920},fontKey='synthetic-variable-width';
const raw={id:'handoff',clipId:'original',src:'clips/synthetic.mp4',startMs:1000,endMs:61000,title:'先检查完整原文',body:'这里保留明确的限定条件，而不是新的拍摄机位。',nodes:[{id:'n1',text:'同一原片',detail:'声音由原轨持有',bullets:['不能省略的限制','English spaces 👨‍👩‍👧‍👦']}]};
const clips=[{id:'original',src:raw.src,inSec:1,outSec:61,speed:1}],origin={rawScene:raw,clips,fps:30},scene=projectStoryboard([raw],clips,30)[0];
const binding={sceneId:raw.id,src:raw.src,sha256:'a'.repeat(64),width:1920,height:1080,durationSec:70,startMs:raw.startMs,endMs:raw.endMs};
const config={kind:'full-frame-blur-zoom',clock:'scene-source-relative-ms',binding,target:{kind:'source-video'},transition:{atMs:25000,peakMs:26000,endMs:27000,clearHoldMs:2000,peakScale:1.15,maxBlurPx:24,origin:{x:.48,y:.42}},copyWindow:{atMs:0,endMs:20000,rect:{x:.05,y:.05,width:.64,height:.65}},speakerRect:{x:.77,y:.12,width:.18,height:.22}};
const proof=(elapsed,changes={})=>({kind:'same-source-video',...binding,status:'ready',sourceMs:binding.startMs+elapsed,fps:30,muted:true,audioOwner:'external-single-track',preservesFraming:true,...changes});
const measure=(text,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].reduce((sum,{segment})=>sum+(/^[il .]$/.test(segment)?.28:/^[A-Za-z]$/.test(segment)?.56:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=config,v=wide){const text=fullFrameHandoffCopy(s,c);return {key:fullFrameHandoffMeasurementKey(s,c,v,fontKey),fontKey,text,fit:fitMeasuredText(text,{width:c.copyWindow.rect.width*v.width*.94,height:c.copyWindow.rect.height*v.height*.90,minFont:v.height*.029,maxFont:v.height*.065,measure})};}

test('the whole-frame original transition has real intermediate blur/scale and deterministic source phases',()=>{
 assert.deepEqual(fullFrameHandoffIssues(scene,config,wide,origin),[]);
 const before=fullFrameHandoffPhase(config,24000),inward=fullFrameHandoffPhase(config,25500),peak=fullFrameHandoffPhase(config,26000),resolve=fullFrameHandoffPhase(config,26500),after=fullFrameHandoffPhase(config,27000);
 assert.deepEqual([before.phase,inward.phase,peak.phase,resolve.phase,after.phase],['clear-before','blur-zoom-in','resolve','resolve','clear-after']);
 assert.equal(before.blurPx,0);assert.equal(after.scale,1);assert.equal(peak.scale,1.15);assert.equal(peak.blurPx,24);assert.ok(inward.blurPx>0&&inward.blurPx<24);assert.ok(inward.scale>1&&inward.scale<1.15);assert.deepEqual(inward.amount,resolve.amount);
 const m=fixture(),middle=fullFrameHandoffState(scene,config,25500,m,proof(25500),undefined,wide,origin);assert.equal(middle.status,'ready');assert.equal(middle.sourceMs,26500);assert.equal(middle.mediaVisible,true);assert.equal(middle.copy.visible,false);assert.equal(middle.canApply,false);
 assert.deepEqual(fullFrameHandoffState(scene,config,25500,m,proof(25500),undefined,wide,origin),middle,'backward seeks never retain a completed phase');
});

test('raw absolute source, SHA and recomputed retained instances cannot be replaced by geometry keys',()=>{
 for(const speed of [.5,1,2]){const cs=[{...clips[0],speed}],s=projectStoryboard([raw],cs,30)[0],o={rawScene:raw,clips:cs,fps:30},state=fullFrameHandoffState(s,config,25500,fixture(s),proof(25500),undefined,wide,o);assert.equal(state.status,'ready');assert.equal(state.motion.scale,1.075);assert.equal(state.sourceMs,26500);}
 assert.ok(fullFrameHandoffProjectionIssues(scene,config).length);assert.ok(fullFrameHandoffIssues(raw,config,wide,origin).includes('actual-retained-projection-required'));
 const moved={...raw,startMs:2000,endMs:62000},s=projectStoryboard([moved],clips,30)[0];assert.ok(fullFrameHandoffProjectionIssues(s,config,{rawScene:moved,clips,fps:30}).length);
 const cutClips=[{...clips[0],inSec:25,outSec:30,speed:1}],cut=projectStoryboard([raw],cutClips,30)[0],o={rawScene:raw,clips:cutClips,fps:30};assert.equal(fullFrameHandoffExposure(cut).startMs,24000);assert.equal(fullFrameHandoffState(cut,config,25500,fixture(cut),proof(25500),undefined,wide,o).status,'blocked','missing full-copy exposure blocks instead of restarting at zero');
 const p=proof(25500);for(const edit of [{sha256:'b'.repeat(64)},{src:'clips/other.mp4'},{sourceMs:1000},{muted:false},{audioOwner:'new-track'},{preservesFraming:false},{width:1}])assert.equal(fullFrameHandoffReadiness(scene,config,25500,fixture(),{...p,...edit},undefined,wide,origin).status,'blocked');
 assert.equal(fullFrameHandoffReadiness(scene,config,25500,{...fixture(),fontKey:'changed'},p,undefined,wide,origin).status,'blocked');
});

test('full title/body/node detail and conditions occupy measured readable pages, never a footer or hidden string inventory',()=>{
 for(const value of [raw.title,raw.body,...raw.nodes.flatMap(n=>[n.text,n.detail,...n.bullets])])assert.ok(fullFrameHandoffCopy(scene,config).includes(value));
 const body='保留全部限定条件，不能把没有验证说成已经完成。'.repeat(160),r={...raw,endMs:601000,body},cs=[{...clips[0],outSec:601}],s=projectStoryboard([r],cs,30)[0],c={...config,binding:{...binding,endMs:r.endMs,durationSec:700},copyWindow:{...config.copyWindow,endMs:500000},transition:{...config.transition,atMs:550000,peakMs:551000,endMs:552000}},o={rawScene:r,clips:cs,fps:30},p=elapsed=>proof(elapsed,{endMs:r.endMs}),m=fixture(s,c);
 assert.ok(m.fit.pages.length>1);assert.equal(fullFrameHandoffReadiness(s,c,1000,m,p(1000),undefined,wide,o).status,'ready');
 for(let i=0;i<m.fit.pages.length;i++){const elapsed=(i+.5)*500000/m.fit.pages.length,state=fullFrameHandoffState(s,c,elapsed,m,p(elapsed),undefined,wide,o);assert.equal(state.copy.index,i);assert.deepEqual(state.copy.lines,m.fit.pages[i]);assert.equal(state.copy.visible,true);}
 assert.equal(fullFrameHandoffTextReadiness(m.text,m.fit,c.copyWindow,{startMs:100000,endMs:600000,speed:1}).status,'blocked');assert.equal(fullFrameHandoffTextReadiness(m.text,m.fit,c.copyWindow,{startMs:0,endMs:600000,speed:50}).status,'blocked');
 assert.equal(fullFrameHandoffTextReadiness(m.text,{...m.fit,pages:[['少了一句']]},c.copyWindow,{startMs:0,endMs:600000,speed:1}).status,'blocked');
 assert.equal(fullFrameHandoffReadiness(scene,config,1000,{...fixture(),fit:null},proof(1000),undefined,wide,origin).status,'waiting');
});

test('the explicit real image keeps its own identity and dimensions; omitted evidence or a video pretending to be an image blocks',()=>{
 const image={src:'broll-assets/authored.png',sha256:'b'.repeat(64),width:1600,height:900,kind:'image'},r={...raw,media:{src:image.src,kind:'image'}},s=projectStoryboard([r],clips,30)[0],c={...config,target:{kind:'scene-image',identity:image}},o={rawScene:r,clips,fps:30},a={...image,status:'ready'};
 assert.deepEqual(fullFrameHandoffIssues(s,c,wide,o),[]);assert.equal(fullFrameHandoffReadiness(s,c,25500,fixture(s,c),proof(25500),a,wide,o).status,'ready');
 assert.equal(fullFrameHandoffReadiness(s,c,25500,fixture(s,c),proof(25500),{...a,status:'waiting'},wide,o).status,'waiting');
 for(const edit of [{width:1920},{src:'broll-assets/other.png'},{sha256:'c'.repeat(64)},{kind:'video'},{status:'blocked'}])assert.equal(fullFrameHandoffReadiness(s,c,25500,fixture(s,c),proof(25500),{...a,...edit},wide,o).status,'blocked');
 assert.ok(fullFrameHandoffIssues(s,config,wide,o).includes('source-video-target-would-omit-existing-evidence-media'));
 const extra={...r,nodes:[...r.nodes,{id:'extra',text:'另一份证据',assetSrc:'broll-assets/extra.png'}]},es=projectStoryboard([extra],clips,30)[0];assert.ok(fullFrameHandoffIssues(es,c,wide,{...o,rawScene:extra}).length);
});

test('copy is separate from real motion and avoids subtitles, explicit clear speaker, and every saved moving-person keyframe',()=>{
 for(const v of [wide,portrait])assert.equal(fullFrameHandoffReadiness(scene,config,25500,fixture(scene,config,v),proof(25500),undefined,v,origin).status,'ready');
 for(const copyWindow of [{...config.copyWindow,endMs:25501},{...config.copyWindow,rect:config.speakerRect},{...config.copyWindow,rect:{x:.05,y:.75,width:.64,height:.2}}])assert.ok(fullFrameHandoffIssues(scene,{...config,copyWindow},wide,origin).length);
 const r={...raw,window:{x:.78,y:.12,size:.12,keyframes:[{atMs:40000,x:.2,y:.1,size:.12}]}},s=projectStoryboard([r],clips,30)[0],o={...origin,rawScene:r};assert.ok(fullFrameHandoffProtectedRects(s,config,wide).length>=3);assert.ok(fullFrameHandoffIssues(s,config,wide,o).includes('complete-copy-overlaps-speaker-path-or-protected-area'));
 for(const atMs of [NaN,-1,60001]){const rr={...r,window:{...r.window,keyframes:[{atMs,x:.78,y:.1,size:.1}]}},ss=projectStoryboard([rr],clips,30)[0];assert.ok(fullFrameHandoffIssues(ss,config,wide,{...origin,rawScene:rr}).includes('speaker-keyframe-clock-invalid'));}
 for(const t of [{...config.transition,peakScale:1},{...config.transition,maxBlurPx:0},{...config.transition,peakMs:24900},{...config.transition,clearHoldMs:0}])assert.ok(fullFrameHandoffIssues(scene,{...config,transition:t},wide,origin).length);
 for(const elapsed of [-1,60000,NaN,Infinity])assert.equal(fullFrameHandoffState(scene,config,elapsed,fixture(),proof(elapsed),undefined,wide,origin).status,'blocked');
});

// Actual component branches with synthetic font/decode reports only. This is
// not a screenshot, video decoder, or browser-pixel acceptance test.
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactURL=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactURL)};export default React;export const useContext=()=>globalThis.__handoff.fontKey;export const useCallback=f=>f;export const useState=initial=>[initial.reports!==undefined?globalThis.__handoff.slots:globalThis.__handoff.decoded,()=>{}];export const useLayoutEffect=f=>{f()};`);
const fakeRender=data(`import React from ${JSON.stringify(reactURL)};export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const Img=props=>React.createElement('img',props);export const staticFile=x=>'/'+x;export const useVideoConfig=()=>globalThis.__handoff.viewport;export const DisplayFontContext={};export const useMeasuredText=()=>({fit:globalThis.__handoff.fit,family:'synthetic'});`);
const code=fs.readFileSync(new URL('../src/FullFrameHandoffScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender)).replaceAll("'./full-frame-handoff.mjs'",JSON.stringify(new URL('../src/full-frame-handoff.mjs',import.meta.url).href));
const {FullFrameHandoffScene}=await import(data(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(s=scene,c=config,elapsed=25500,{v=wide,o=origin,waitingFont=false,source=proof(elapsed),speaker=true,empty=false,assetIdentity,decodedStatus='ready',slotStatus='ready',slotSourceMs=source.sourceMs,staleSlots=false}={}){
 const m=fixture(s,c,v),sourceKey=JSON.stringify([c.binding,s,c.target,c.speakerRect,v.width,v.height]),slot={status:slotStatus,src:c.binding.src,sha256:c.binding.sha256,width:c.binding.width,height:c.binding.height,sourceMs:slotSourceMs,muted:true},reports=[],calls=[];
 globalThis.__handoff={fontKey,viewport:v,fit:waitingFont?null:m.fit,decoded:{key:JSON.stringify(assetIdentity),status:decodedStatus},slots:{key:staleSlots?'old':sourceKey,reports:{speaker:slot,'full-frame':slot}}};
 try{return {html:renderToStaticMarkup(React.createElement(FullFrameHandoffScene,{scene:s,config:c,elapsed,sourceProof:source,assetIdentity,projectionProof:o,renderSpeaker:speaker?request=>{calls.push(request);return empty?null:React.createElement('video',{src:'/'+c.binding.src,muted:request.muted,'data-fixture-source-ms':request.sourceMs});}:undefined,onReadiness:value=>reports.push(value)})),reports,calls,m};}finally{delete globalThis.__handoff;}
}

test('the actual source wrapper blurs/scales the entire current video, keeps a clear source window, and adds no sound track',()=>{
 const r=render();assert.equal(r.reports.at(-1).status,'ready');assert.ok(r.html.includes('data-full-frame-phase="blur-zoom-in"'));assert.ok(r.html.includes('filter:blur(12px)'));assert.ok(r.html.includes('scale:1.075'));assert.ok(r.html.includes('data-handoff-clear-speaker="true"'));assert.equal((r.html.match(/<video/g)??[]).length,2);assert.equal((r.html.match(/ muted=""/g)??[]).length,2);assert.ok(!r.html.includes('<audio'));
 assert.deepEqual(r.calls.map(c=>[c.slotId,c.sourceMs,c.elapsed,c.muted,c.volume,c.preserveFraming]),[['speaker',26500,25500,true,0,true],['full-frame',26500,25500,true,0,true]]);
 const reading=render(scene,config,1000);assert.ok(reading.html.includes('data-full-frame-copy="true"'));assert.equal(reading.m.fit.pages.length,1);const copyText=reading.html.replace(/<[^>]*>/g,'');for(const value of [raw.title,raw.body,...raw.nodes.flatMap(n=>[n.text,n.detail,...n.bullets])])assert.ok(copyText.includes(value));
 for(const r of [render(scene,config,25500,{waitingFont:true}),render(scene,config,25500,{slotStatus:'waiting'}),render(scene,config,25500,{slotSourceMs:1000}),render(scene,config,25500,{staleSlots:true})]){assert.equal(r.reports.at(-1).status,'waiting');assert.ok(!r.html.includes('data-full-frame-phase='));assert.ok(!r.html.includes('data-full-frame-copy='));assert.ok(r.html.includes('data-handoff-clear-speaker="true"'));}
});

test('invalid/null/current proof reset cannot leave an old ready transition',()=>{
 const sequence=[render(),render(scene,config,25500,{empty:true}),render(),render(scene,config,25500,{waitingFont:true}),render(scene,config,25500,{speaker:false}),render(scene,config,25500,{source:proof(25500,{src:'clips/foreign.mp4'})})];
 assert.deepEqual(sequence.map(r=>r.reports.at(-1).status),['ready','blocked','ready','waiting','blocked','blocked']);
 for(const r of [sequence[1],sequence[4],sequence[5]])assert.ok(!r.html.includes('data-full-frame-phase='));
 assert.equal(render(scene,config,25500,{slotStatus:'blocked'}).reports.at(-1).status,'blocked');
});

test('the actual image branch contains the full real image and no fake video screenshot; both layouts use actual current decode gating',()=>{
 const image={src:'broll-assets/authored.png',sha256:'b'.repeat(64),width:1600,height:900,kind:'image'},r={...raw,media:{src:image.src,kind:'image'}},s=projectStoryboard([r],clips,30)[0],c={...config,target:{kind:'scene-image',identity:image}},o={rawScene:r,clips,fps:30};
 for(const v of [wide,portrait]){const result=render(s,c,25500,{v,o,assetIdentity:image});assert.equal(result.reports.at(-1).status,'ready');assert.ok(result.html.includes('data-handoff-real-image="true"'));assert.ok(result.html.includes('src="/broll-assets/authored.png"'));assert.ok(result.html.includes('object-fit:contain'));assert.equal(result.calls.length,1);assert.equal((result.html.match(/<video/g)??[]).length,1);}
 for(const status of ['waiting','blocked']){const result=render(s,c,25500,{o,assetIdentity:image,decodedStatus:status});assert.equal(result.reports.at(-1).status,status);assert.ok(!result.html.includes('data-full-frame-phase='));}
 assert.equal(render(s,c,25500,{o,assetIdentity:{...image,width:1920}}).reports.at(-1).status,'blocked');
});

test('actual copy-page selection advances through every long page while media phase remains original, controls expose all editable times',()=>{
 const r={...raw,endMs:601000,body:'完整条件和否定不能删掉。'.repeat(200)},cs=[{...clips[0],outSec:601}],s=projectStoryboard([r],cs,30)[0],c={...config,binding:{...binding,endMs:r.endMs,durationSec:700},copyWindow:{...config.copyWindow,endMs:500000},transition:{...config.transition,atMs:550000,peakMs:551000,endMs:552000}},o={rawScene:r,clips:cs,fps:30},m=fixture(s,c);
 assert.ok(m.fit.pages.length>1);for(let page=0;page<m.fit.pages.length;page++){const elapsed=(page+.5)*500000/m.fit.pages.length,result=render(s,c,elapsed,{o,source:proof(elapsed,{endMs:r.endMs})});assert.equal(result.reports.at(-1).status,'ready');assert.ok(result.html.includes(`data-full-frame-copy-page="${page}"`));assert.ok(result.html.includes(`data-handoff-text-page="${page}" aria-hidden="false"`));assert.equal((result.html.match(/aria-hidden="false"/g)??[]).length,1);assert.ok(result.html.includes('data-full-frame-phase="clear-before"'));}
 assert.equal(fullFrameHandoffControls.canApply,false);assert.equal(fullFrameHandoffControls.automaticAllowed,false);assert.ok(fullFrameHandoffControls.fields.find(f=>f.key==='binding').readonly);assert.ok(fullFrameHandoffControls.fields.find(f=>f.key==='transition').fields.find(f=>f.key==='peakMs'));assert.ok(!render().html.includes('概念示意'));
});
