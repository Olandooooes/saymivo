import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {pathRunnerCopy,pathRunnerExposure,pathRunnerMeasurementKey,pathRunnerIssues,pathRunnerFieldPlan,pathRunnerReadiness,pathRunnerState,pathRunnerSample,pathRunnerBezier,pathRunnerSegmentEnvelope,pathRunnerTraceState,pathRunnerBoundaryPoints,pathRunnerTextReadiness,pathRunnerControls} from '../src/path-runner.mjs';

const viewport={width:1920,height:1080};
const scene={id:'source-loop',clipId:'raw',src:'clips/synthetic.mp4',startMs:1000,endMs:41000,layout:'speaker',title:'完整标题与 AI Agent',body:'不能保证所有任务每次成功。',nodes:[{id:'research',text:'先调研',detail:'保留完整条件',bullets:['先核验来源']},{id:'test',text:'再验证',detail:'不等于已经成功',bullets:['保留英文 spaces and emoji 👨‍👩‍👧‍👦']} ]};
const binding={sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:1000,endMs:41000};
const proof={kind:'same-source-video',src:binding.src,sha256:binding.sha256,startMs:binding.startMs,endMs:binding.endMs};
const a={x:.25,y:.35},b={x:.45,y:.35};
const closed={kind:'closed-loop-runner',clock:'scene-source-relative-seconds',binding,copyWindow:{startSec:0,endSec:12,rect:{x:.04,y:.05,width:.64,height:.72}},graphicWindow:{startSec:12,endSec:40},speakerRect:{x:.78,y:.40,width:.18,height:.30},runStartSec:14,runner:{label:'Agent',width:.08,height:.06,trail:{sampleSec:.1,lifetimeSec:2,maxPoints:20}},path:{laps:2,segments:[{id:'outward',from:a,control1:{x:.25,y:.16},control2:{x:.45,y:.16},to:b,durationSec:4},{id:'return',from:b,control1:{x:.45,y:.55},control2:{x:.25,y:.55},to:a,durationSec:4}]},stages:[{id:'stage-research',nodeId:'research',segmentId:'outward',rect:{x:.04,y:.10,width:.12,height:.12}},{id:'stage-test',nodeId:'test',segmentId:'return',rect:{x:.54,y:.60,width:.14,height:.12}}]};
const bounded={...closed,kind:'bounded-agent-runner',runStartSec:16,boundary:{rect:{x:.20,y:.20,width:.42,height:.40},startSec:12,drawSec:2},rules:[{id:'rule-research',nodeId:'research',atSec:14.2,rect:{x:.04,y:.10,width:.12,height:.12}},{id:'rule-test',nodeId:'test',atSec:15,rect:{x:.65,y:.20,width:.12,height:.14}}],path:{laps:1,segments:[{id:'first',from:{x:.30,y:.32},control1:{x:.34,y:.25},control2:{x:.50,y:.30},to:{x:.50,y:.40},durationSec:5},{id:'second',from:{x:.50,y:.40},control1:{x:.50,y:.50},control2:{x:.35,y:.50},to:{x:.40,y:.50},durationSec:5}]}};
delete bounded.stages;
const measure=(text,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].reduce((sum,{segment})=>sum+(/^[il .]$/.test(segment)?.28:/^[A-Za-z]$/.test(segment)?.56:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=closed,v=viewport){
 const fields=pathRunnerFieldPlan(s,c).map(f=>({id:f.id,text:f.text,fit:fitMeasuredText(f.text,{width:f.rect.width*v.width*.94,height:f.rect.height*v.height*.88,minFont:v.height*.027,maxFont:v.height*.027,measure})}));
 return {fontKey:'synthetic-variable-width',key:pathRunnerMeasurementKey(s,c,v,'synthetic-variable-width'),fields};
}

test('closed loop has actual continuous cubic movement, stable stages and deterministic lap feedback',()=>{
 assert.deepEqual(pathRunnerIssues(scene,closed),[]);const m=fixture();assert.equal(pathRunnerReadiness(scene,closed,m,proof).status,'ready');
 const first=pathRunnerState(scene,closed,14000,m,proof),middle=pathRunnerState(scene,closed,16000,m,proof),next=pathRunnerState(scene,closed,18000,m,proof),lap=pathRunnerState(scene,closed,22000,m,proof),last=pathRunnerState(scene,closed,30000,m,proof);
 assert.equal(first.activeStageId,'stage-research');assert.equal(next.activeStageId,'stage-test');assert.equal(lap.activeStageId,'stage-research');assert.equal(lap.lap,1);assert.equal(last.runner.phase,'hold');assert.deepEqual({x:last.runner.x,y:last.runner.y},a);
 assert.notEqual(middle.runner.y,first.runner.y);assert.equal(first.fields.filter(f=>f.role==='stage').length,2);assert.equal(next.fields.filter(f=>f.role==='stage').length,2);
 assert.deepEqual(pathRunnerState(scene,closed,16000,m,proof),middle,'backward seek recomputes source phase without lingering DOM state');
 const s={...scene,nodes:[...scene.nodes,{id:'version',text:'明确版本 2',detail:'仅作者提供的版本说明'}]},c={...closed,feedback:[{id:'feedback-v2',nodeId:'version',atSec:30,rect:{x:.54,y:.23,width:.14,height:.15}}]};
 assert.equal(pathRunnerReadiness(s,c,fixture(s,c),proof).status,'ready');assert.ok(pathRunnerState(s,c,31000,fixture(s,c),proof).fields.find(f=>f.id==='feedback-v2').clock.visible);assert.ok(pathRunnerCopy(s,c).includes('仅作者提供的版本说明'));
});

test('bounded boundary traces top-right down-left-up-right, rules follow closure, Agent never bounces',()=>{
 assert.deepEqual(pathRunnerIssues(scene,bounded),[]);const corners=pathRunnerBoundaryPoints(bounded.boundary.rect);
 assert.deepEqual(corners,[{x:.62,y:.2},{x:.62,y:.6000000000000001},{x:.2,y:.6000000000000001},{x:.2,y:.2},{x:.62,y:.2}]);
 const early=pathRunnerTraceState(bounded,12.1);assert.equal(early.points[1].x,.62);assert.ok(early.points[1].y>.2);assert.deepEqual(pathRunnerTraceState(bounded,14).points,corners);
 const m=fixture(scene,bounded),pre=pathRunnerState(scene,bounded,13999,m,proof),rules=pathRunnerState(scene,bounded,15500,m,proof),run=pathRunnerState(scene,bounded,18000,m,proof);
 assert.equal(pre.runner,null);assert.ok(pre.fields.filter(f=>f.role==='rule').every(f=>!f.clock.visible));assert.ok(rules.fields.filter(f=>f.role==='rule').every(f=>f.clock.visible));assert.equal(rules.runner,null);assert.equal(run.runner.phase,'moving');
 for(let t=16;t<=26;t+=.025){const sample=pathRunnerSample(bounded,t),segments=bounded.path.segments,segment=segments[sample.segmentIndex];assert.deepEqual(sample.point,pathRunnerBezier(segment,sample.progress));const r=bounded.boundary.rect;assert.ok(sample.point.x-bounded.runner.width/2>=r.x-1e-8&&sample.point.x+bounded.runner.width/2<=r.x+r.width+1e-8);assert.ok(sample.point.y-bounded.runner.height/2>=r.y-1e-8&&sample.point.y+bounded.runner.height/2<=r.y+r.height+1e-8);}
});

test('missing proof, identity/source clock edits and malformed paths block instead of inventing a return',()=>{
 const mutations=[{...closed,path:{...closed.path,segments:[closed.path.segments[0]]}},{...closed,path:{...closed.path,segments:[closed.path.segments[0],{...closed.path.segments[1],from:{x:.8,y:.3}}]}},{...closed,path:{...closed.path,laps:0}},{...closed,path:{...closed.path,segments:[null]}},{...closed,stages:[null]},{...closed,runStartSec:NaN},{...closed,runner:{...closed.runner,trail:{sampleSec:.001,lifetimeSec:20,maxPoints:999}}},{...closed,binding:{...binding,sha256:'missing'}},{...closed,clock:'timeline-seconds'},{...bounded,rules:bounded.rules.map(r=>({...r,atSec:13}))}];
 for(const c of mutations)assert.ok(pathRunnerIssues(scene,c).length);
 const m=fixture();assert.equal(pathRunnerReadiness(scene,closed,m,undefined).status,'blocked');assert.equal(pathRunnerReadiness(scene,closed,m,{...proof,src:'clips/other.mp4'}).status,'blocked');
 assert.ok(pathRunnerIssues({...scene,startMs:2000,endMs:42000},closed).includes('raw-source-identity-or-clock-mismatch'));
 assert.equal(pathRunnerReadiness(scene,closed,{...m,key:'old'},proof).status,'blocked');assert.equal(pathRunnerReadiness(scene,closed,{...m,fontKey:'other-font'},proof).status,'blocked');assert.equal(pathRunnerState(scene,closed,NaN,m,proof).readiness,'blocked');
 for(const elapsed of [-1,40000,Infinity])assert.equal(pathRunnerState(scene,closed,elapsed,m,proof).readiness,'blocked');
 assert.ok(pathRunnerIssues({...scene,nodes:[scene.nodes[0],scene.nodes[0]]},closed).includes('source-node-ids-must-be-stable-and-unique'));
});

test('the full runner/blue-tail hull avoids every label, subtitle region and moving speaker envelope',()=>{
 for(const segment of closed.path.segments){const envelope=pathRunnerSegmentEnvelope(segment,closed.runner);for(let p=0;p<=1;p+=.01){const q=pathRunnerBezier(segment,p);assert.ok(q.x-closed.runner.width/2>=envelope.x-1e-8&&q.x+closed.runner.width/2<=envelope.x+envelope.width+1e-8);assert.ok(q.y-closed.runner.height/2>=envelope.y-1e-8&&q.y+closed.runner.height/2<=envelope.y+envelope.height+1e-8);}}
 const face={...closed,protectedAreas:[{rect:{x:.3,y:.2,width:.1,height:.1}}]};assert.ok(pathRunnerIssues(scene,face).includes('runner-or-trail-crosses-speaker-path'));
 const label={...closed,stages:closed.stages.map((s,i)=>i?s:{...s,rect:{x:.3,y:.2,width:.1,height:.1}})};assert.ok(pathRunnerIssues(scene,label).includes('runner-or-trail-covers-persistent-label'));
 const out={...closed,path:{...closed.path,segments:closed.path.segments.map((s,i)=>i?s:{...s,control1:{x:.25,y:.01}})}};assert.ok(pathRunnerIssues(scene,out).includes('whole-runner-motion-envelope-outside-safe-area'));
 const escape={...bounded,path:{...bounded.path,segments:bounded.path.segments.map((s,i)=>i?s:{...s,control1:{x:.12,y:.25}})}};assert.ok(pathRunnerIssues(scene,escape).includes('agent-and-blue-trail-must-remain-inside-explicit-boundary'));
 const moving={...scene,window:{x:.80,y:.2,size:.10,keyframes:[{atMs:20000,x:.1,y:.2,size:.10}]}};assert.ok(pathRunnerIssues(moving,closed).some(i=>i.includes('speaker')||i.includes('protected')));
 for(const atMs of [NaN,Infinity,-1,40001])assert.ok(pathRunnerIssues({...scene,window:{x:.8,y:.2,size:.1,keyframes:[{atMs,x:.8,y:.2,size:.1}]}},closed).includes('speaker-keyframe-clock-invalid'));
});

test('all source title/body/node text/detail/bullets are rendered by a measured complete copy plane',()=>{
 const copy=pathRunnerCopy(scene,closed);for(const value of [scene.title,scene.body,...scene.nodes.flatMap(n=>[n.text,n.detail,...n.bullets])])assert.ok(copy.includes(value));
 assert.ok(copy.includes('spaces and emoji 👨‍👩‍👧‍👦'));const plan=pathRunnerFieldPlan(scene,closed);assert.equal(plan.find(f=>f.role==='copy').text,copy);
 const missing={...closed,copyWindow:undefined};assert.ok(pathRunnerIssues(scene,missing).includes('complete-source-copy-window-required'));
 assert.ok(pathRunnerIssues(scene,{...closed,copyWindow:{...closed.copyWindow,endSec:14}}).includes('copy-and-motion-must-use-separate-windows'));
 assert.ok(pathRunnerIssues(scene,{...closed,copyWindow:{...closed.copyWindow,rect:closed.speakerRect}}).includes('complete-text-overlaps-speaker-or-protected-area'));
 assert.ok(pathRunnerIssues({...scene,media:{src:'broll-assets/proof.png'}},closed).includes('existing-media-requires-a-separate-supported-renderer'));
});

test('every real-font page has independent retained/speed-adjusted reading time; no hidden pages or last-frame flash credit',()=>{
 const text='不能遗漏完整限制条件。'.repeat(40),fit=fitMeasuredText(text,{width:180,height:100,minFont:32,maxFont:32,measure}),field={startSec:0,endSec:120};assert.ok(fit.pages.length>1);
 assert.equal(pathRunnerTextReadiness(text,fit,field,{startMs:0,endMs:120000,speed:1}).status,'ready');
 assert.equal(pathRunnerTextReadiness(text,fit,field,{startMs:20000,endMs:120000,speed:1}).status,'blocked');assert.equal(pathRunnerTextReadiness(text,fit,field,{startMs:0,endMs:120000,speed:20}).status,'blocked');
 assert.equal(pathRunnerTextReadiness(text,{...fit,pages:[['漏句']]},field,{startMs:0,endMs:120000,speed:1}).status,'blocked');
 const m=fixture();assert.equal(pathRunnerReadiness(scene,closed,{...m,fields:m.fields.map(f=>f.id==='source-copy'?{...f,fit:null}:f)},proof).status,'waiting');
 const tiny={...closed,copyWindow:{...closed.copyWindow,rect:{x:.04,y:.05,width:.01,height:.01}}};assert.equal(pathRunnerReadiness(scene,tiny,fixture(scene,tiny),proof).status,'blocked');
});

test('retained clips keep original source phase across speeds but missing copy exposure blocks the entire diagram',()=>{
 const m=fixture(),baseline=pathRunnerSample(closed,16);
 for(const speed of [.5,1,2]){const clips=[{id:'all',src:scene.src,inSec:1,outSec:41,speed}],projection=projectStoryboard([scene],clips,30)[0],pm=fixture(projection),origin={rawScene:scene,clips,fps:30},state=pathRunnerState(projection,closed,16000,pm,proof,viewport,origin);assert.equal(pm.key,m.key);assert.equal(state.readiness,'ready');assert.deepEqual({x:state.runner.x,y:state.runner.y},baseline.point);assert.equal(state.activeStageId,'stage-research');}
 const clips=[{id:'short',src:scene.src,inSec:15,outSec:20,speed:2}],short=projectStoryboard([scene],clips,30)[0],origin={rawScene:scene,clips,fps:30};assert.equal(pathRunnerExposure(short).startMs,14000);assert.equal(pathRunnerReadiness(short,closed,fixture(short),proof,viewport,origin).status,'blocked');assert.equal(pathRunnerState(short,closed,16000,fixture(short),proof,viewport,origin).runner,null);
 assert.ok(pathRunnerIssues({...short,sourceOffsetMs:1000},closed).includes('retained-source-offset-mismatch'));
});

test('blue points are deterministic past samples, remain bounded, expire, and never exceed the explicit budget',()=>{
 const m=fixture(scene,bounded);for(let elapsed=16000;elapsed<40000;elapsed+=73){const state=pathRunnerState(scene,bounded,elapsed,m,proof);assert.ok(state.trail.length<=20);for(const point of state.trail){assert.ok(point.opacity>=0&&point.opacity<=1);const i=Number(point.id.slice(6));assert.deepEqual({x:point.x,y:point.y},pathRunnerSample(bounded,bounded.runStartSec+i*.1).point);}}
 assert.equal(pathRunnerState(scene,bounded,29000,m,proof).trail.length,0);assert.deepEqual(pathRunnerState(scene,bounded,18500,m,proof).trail,pathRunnerState(scene,bounded,18500,m,proof).trail);
});

test('editable controls use explicit seconds, stable source IDs and authored data only',()=>{
 assert.equal(pathRunnerControls.length,2);for(const control of pathRunnerControls){assert.equal(control.canApply,false);assert.equal(control.uiAccepted,false);assert.equal(control.automaticAllowed,false);assert.equal(control.fields.find(f=>f.key==='clock').fixed,'scene-source-relative-seconds');assert.equal(control.fields.find(f=>f.key==='binding').readonly,true);assert.equal(control.fields.find(f=>f.key==='path').fields.find(f=>f.key==='segments').preserveId,true);}
});

// The actual React branches below use synthetic metrics only. They prove
// visibility/clock gating, not real browser font pixels or facial edge quality.
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactUrl)};export default React;export const useContext=()=>globalThis.__pathRunner.font;export const useCallback=f=>f;export const useState=()=>[globalThis.__pathRunner.reports,()=>{}];export const useLayoutEffect=f=>{f()};`);
const fakeRender=data(`import React from ${JSON.stringify(reactUrl)};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const useVideoConfig=()=>globalThis.__pathRunner.viewport;export const DisplayFontContext={};export const useMeasuredText=text=>({fit:globalThis.__pathRunner.fits[text]??null,family:'synthetic'});`);
const code=fs.readFileSync(new URL('../src/PathRunnerScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender)).replaceAll("'./path-runner.mjs'",JSON.stringify(new URL('../src/path-runner.mjs',import.meta.url).href)).replaceAll("'./dynamic-mechanisms.mjs'",JSON.stringify(new URL('../src/dynamic-mechanisms.mjs',import.meta.url).href));
const {PathRunnerScene}=await import(data(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(s=scene,c=closed,time=16000,{v=viewport,waiting=false,speaker=true,speakerProof=proof,speakerOutput='video',projectionProof}={}){
 const m=fixture(s,c,v),reports={key:m.key,fields:Object.fromEntries(m.fields.map(f=>[f.id,{...f,fit:waiting?null:f.fit,family:'synthetic'}]))},readiness=[],speakerCalls=[];
 globalThis.__pathRunner={font:m.fontKey,viewport:v,reports,fits:Object.fromEntries(m.fields.map(f=>[f.text,waiting?null:f.fit]))};
 try{return {html:renderToStaticMarkup(React.createElement(PathRunnerScene,{scene:s,config:c,elapsed:time,speakerProof,projectionProof,renderSpeaker:speaker?p=>{speakerCalls.push(p);return speakerOutput==='video'?React.createElement('video',{'data-actual-source':c.binding.src}):speakerOutput;}:undefined,onReadiness:r=>readiness.push(r)})),readiness,speakerCalls};}finally{delete globalThis.__pathRunner;}
}
test('actual renderer shows complete copy and persistent IDs, uses actual-source speaker slot, and forbids waiting/invalid diagram flashes',()=>{
 const copy=render(scene,closed,2000);assert.ok(copy.html.includes('data-layout-status="ready"'));for(const text of [scene.title,scene.body,...scene.nodes.flatMap(n=>[n.text,n.detail,...n.bullets])])assert.ok(copy.html.includes(text));assert.ok(!copy.html.includes('data-path-diagram='));
 const graph=render();assert.ok(graph.html.includes('data-path-diagram="true"'));assert.ok(graph.html.includes('data-path-persistent-object="stage-research"'));assert.ok(graph.html.includes('data-stage-active="true"'));assert.ok(graph.html.includes('data-path-real-speaker="true"'));assert.equal(graph.speakerCalls[0].sourceMs,17000);assert.equal(graph.speakerCalls[0].elapsed,16000);
 for(const result of [render(scene,closed,16000,{waiting:true}),render(scene,closed,16000,{speaker:false}),render(scene,{...closed,runStartSec:39},16000),render(scene,closed,16000,{speakerProof:{...proof,src:'clips/foreign.mp4'}})]){assert.ok(!result.html.includes('data-path-diagram='));assert.ok(!result.html.includes('data-path-runner='));assert.ok(result.readiness.some(r=>r.status!=='ready'));}
 assert.ok(render(scene,closed,16000,{waiting:true}).html.includes('data-path-real-speaker="true"'),'font waiting retains real speaker');
 const sequence=[render(),render(scene,closed,16000,{speaker:false}),render(),render(scene,closed,16000,{waiting:true})];assert.deepEqual(sequence.map(r=>r.readiness.at(-1).status),['ready','blocked','ready','waiting'],'stale ready cannot survive a changed source/render capability');
});

test('the actual bounded renderer uses the yellow trace, blue sample trail and all text in wide and portrait previews',()=>{
 for(const v of [viewport,{width:1080,height:1920}]){const c={...bounded,runner:{...bounded.runner,width:.16}},m=fixture(scene,c,v);assert.equal(pathRunnerReadiness(scene,c,m,proof,v).status,'ready');const r=render(scene,c,18000,{v});assert.ok(r.html.includes('data-clockwise-yellow-boundary="true"'));assert.ok(r.html.includes('data-path-trail='));assert.ok(r.html.includes('data-path-persistent-object="rule-research"'));}
});

test('the actual renderer advances every complete large-copy page at its own source exposure',()=>{
 const s={...scene,endMs:601000,body:'限定范围不能省略，先核验来源再讨论结果。'.repeat(220)},c={...closed,binding:{...binding,endMs:601000},copyWindow:{...closed.copyWindow,endSec:400},graphicWindow:{startSec:400,endSec:600},runStartSec:402},p={...proof,endMs:601000},m=fixture(s,c),copy=m.fields.find(f=>f.id==='source-copy');assert.ok(copy.fit.pages.length>1);assert.equal(pathRunnerReadiness(s,c,m,p).status,'ready');
 for(let i=0;i<copy.fit.pages.length;i++){const r=render(s,c,(i+.5)*400000/copy.fit.pages.length,{speakerProof:p});assert.ok(r.html.includes(`data-path-copy-page="${i}"`));assert.ok(r.html.includes(`data-path-text-page="${i}" aria-hidden="false"`));assert.equal((r.html.match(/aria-hidden="false"/g)??[]).length,1);assert.ok(!r.html.includes('data-path-diagram='));}
 const clips=[{id:'last-only',src:s.src,inSec:301,outSec:401,speed:1}],short=projectStoryboard([s],clips,30)[0],blocked=render(short,c,350000,{speakerProof:p,projectionProof:{rawScene:s,clips,fps:30}});assert.ok(!blocked.html.includes('data-path-copy-field='));assert.ok(blocked.readiness.some(r=>r.status==='blocked'));
});

test('projected copies cannot bypass absolute source identity after the raw scene moves by one second',()=>{
 const clips=[{id:'entire',src:scene.src,inSec:0,outSec:50,speed:1}],original=projectStoryboard([scene],clips,30)[0],movedRaw={...scene,startMs:2000,endMs:42000},moved=projectStoryboard([movedRaw],clips,30)[0],oldMeasurement=fixture(original),origin={rawScene:scene,clips,fps:30};
 assert.equal(pathRunnerMeasurementKey(original,closed,viewport,oldMeasurement.fontKey),pathRunnerMeasurementKey(moved,closed,viewport,oldMeasurement.fontKey),'geometry cache identity alone cannot establish absolute origin');
 assert.ok(pathRunnerIssues(movedRaw,closed).includes('raw-source-identity-or-clock-mismatch'));
 assert.equal(pathRunnerReadiness(original,closed,oldMeasurement,proof,viewport,origin).status,'ready');
 assert.equal(pathRunnerReadiness(moved,closed,oldMeasurement,proof,viewport).status,'blocked');
 assert.ok(pathRunnerIssues(moved,closed,viewport,origin).includes('projection-no-longer-matches-bound-absolute-source-scene'));
 assert.equal(pathRunnerState(moved,closed,16000,oldMeasurement,proof,viewport,origin).runner,null);
 assert.equal(pathRunnerReadiness(moved,closed,oldMeasurement,proof,viewport,{rawScene:movedRaw,clips,fps:30}).status,'blocked');
 assert.ok(pathRunnerIssues(original,closed,viewport,{...origin,clips:clips.map(c=>({...c,speed:2}))}).length);
 assert.ok(!render(moved,closed,16000,{projectionProof:origin}).html.includes('data-path-diagram='));
});

test('an empty real-speaker callback clears old readiness and never leaves a ready wrapper or diagram',()=>{
 const empty=[null,false,[],React.createElement(React.Fragment,null),React.createElement('div',null)];
 for(const speakerOutput of empty){const result=render(scene,closed,16000,{speakerOutput});assert.equal(result.speakerCalls.length,1);assert.equal(result.readiness.at(-1).status,'blocked');assert.ok(!result.html.includes('data-path-diagram='));assert.ok(!result.html.includes('data-path-real-speaker='));}
 const sequence=[render(),render(scene,closed,16000,{speakerOutput:null}),render()];assert.deepEqual(sequence.map(r=>r.readiness.at(-1).status),['ready','blocked','ready']);
});
