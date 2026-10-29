import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {pairedCompleteCopy,pairedRelationsIssues,pairedRelationsFieldPlan,pairedRelationsMeasurementKey,pairedRelationsReadiness,pairedRelationsState,pairedRelationsPage,pairedSweptOverlap,pairedRelationsControls} from '../src/paired-relations.mjs';
const viewport={width:1920,height:1080};
const scene={id:'synthetic-pair',src:'clips/synthetic.mp4',clipId:'voice',startMs:1000,endMs:19000,layout:'slide',title:'保持对象身份',body:'完整解释与否定都保留。',nodes:[{id:'request',text:'AI Agent',detail:'保留原句',bullets:['不是实测']},{id:'result',text:'相应处理',detail:'需要核验'},{id:'context',text:'额外条件也不删除'}]};
const left={x:.06,y:.3,width:.23,height:.25},right={x:.4,y:.3,width:.23,height:.25};
const config={kind:'paired-relations',variant:'correspondence',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:1000,endMs:19000},sides:{a:{nodeId:'request',rect:left},b:{nodeId:'result',rect:right}},relation:{type:'correspondence',provenance:'合成口述明确说两者对应，不推断真实运行'},copyWindow:{atMs:0,endMs:5000,rect:{x:.05,y:.08,width:.64,height:.68}},graphicWindow:{atMs:5000,endMs:18000},titleRect:{x:.05,y:.04,width:.64,height:.1},speakerRect:{x:.78,y:.5,width:.18,height:.32},phases:[{id:'focus-a',atMs:7500,moveMs:800,holdMs:2400,positions:{a:{...left,x:.08},b:{...right,x:.42}},active:'a'},{id:'focus-b',atMs:11700,moveMs:900,holdMs:2600,positions:{a:left,b:right},active:'b'}]};
const clone=value=>structuredClone(value),measure=(text,size)=>({width:Array.from(text).reduce((n,c)=>n+(/[A-Za-z ]/.test(c)?.5:1),0)*size,ascent:size*.82,descent:size*.2});
function measured(s=scene,c=config){const fontKey='synthetic-loaded-font';return {key:pairedRelationsMeasurementKey(s,c,viewport,fontKey),fontKey,fields:pairedRelationsFieldPlan(s,c).map(field=>({id:field.id,text:field.text,fit:fitMeasuredText(field.text,{width:field.rect.width*viewport.width,height:field.rect.height*viewport.height,minFont:26,maxFont:45,measure})}))};}

test('explicit pair keeps full title/body/all original node text, details, bullets and English spaces',()=>{
 const before=clone(scene),state=pairedRelationsState(scene,config,7900),copy=pairedCompleteCopy(scene);
 for(const text of [scene.title,scene.body,...scene.nodes.flatMap(n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean))])assert.ok(copy.includes(text));
 assert.deepEqual(state.objects.map(o=>[o.side,o.nodeId,o.text]),[['a','request','AI Agent\n保留原句\n不是实测'],['b','result','相应处理\n需要核验']]);
 assert.deepEqual(scene,before);assert.deepEqual(pairedRelationsIssues(scene,config,viewport),[]);assert.equal(pairedRelationsReadiness(scene,config,measured(),viewport).status,'ready');
});
test('correspondence and horizontal alternation retain roles through movement and show explicit phase identity',()=>{
 const c=clone(config);c.variant='horizontal-alternate';assert.deepEqual(pairedRelationsIssues(scene,c,viewport),[]);
 const before=pairedRelationsState(scene,c,7400),moving=pairedRelationsState(scene,c,7900),holding=pairedRelationsState(scene,c,8400),later=pairedRelationsState(scene,c,12300);
 assert.equal(before.phase,'overview');assert.equal(moving.phaseId,'focus-a');assert.equal(moving.phase,'moving');assert.ok(moving.objects[0].rect.x>left.x&&moving.objects[0].rect.x<.08);assert.equal(holding.phase,'holding');assert.equal(holding.objects[0].rect.x,.08);assert.equal(later.phaseId,'focus-b');assert.equal(later.objects[1].active,true);
 for(const state of [before,moving,holding,later])assert.deepEqual(state.objects.map(o=>o.nodeId),['request','result']);
 const invalid=clone(c);invalid.phases[1].active='a';assert.ok(pairedRelationsIssues(scene,invalid).some(x=>x.includes('alternates-focus')));
 invalid.phases[1].active='b';invalid.phases[1].positions.a.y=.31;assert.ok(pairedRelationsIssues(scene,invalid).some(x=>x.includes('identity-size-lane')));
});
test('explicit bidirectional phase direction produces symbolic pulses, never a count/value guess',()=>{
 const c=clone(config);c.variant='bidirectional';c.relation.type='bidirectional';c.phases[0].flow='both';c.phases[1].flow='b-to-a';
 assert.deepEqual(pairedRelationsIssues(scene,c),[]);assert.deepEqual(pairedRelationsState(scene,c,7900).pulses.map(p=>p.direction),['a-to-b','b-to-a']);assert.deepEqual(pairedRelationsState(scene,c,12100).pulses.map(p=>p.direction),['b-to-a']);assert.deepEqual(pairedRelationsState(scene,c,9000).pulses,[]);
 const noDirection=clone(c);delete noDirection.phases[1].flow;assert.ok(pairedRelationsIssues(scene,noDirection).some(x=>x.includes('direction-required')));
 const fake=clone(config);fake.phases[0].flow='both';assert.ok(pairedRelationsIssues(scene,fake).some(x=>x.includes('only-for-explicit')));
});
test('continuous collision solver catches crossings with safe endpoints and permits parallel motion',()=>{
 const a={x:0,y:.2,width:.1,height:.1},b={x:.7,y:.2,width:.1,height:.1};assert.equal(pairedSweptOverlap(a,b,b,a),true);
 assert.equal(pairedSweptOverlap(a,{...a,x:.5},b,{...b,x:1.2}),false);
 const c=clone(config);c.phases[0].positions={a:right,b:left};assert.ok(pairedRelationsIssues(scene,c).includes('paired-objects-overlap-during-motion'));
});
test('full person path, subtitles, overlapping label/title and existing media block the composition',()=>{
 const cases=[s=>({...s,window:{x:.01,y:.4,size:.12,keyframes:[{atMs:10000,x:.85,y:.4,size:.12}]}}),s=>({...s,media:{src:'broll-assets/evidence.png',kind:'image'}}),s=>({...s,nodes:s.nodes.map((n,i)=>i? n:{...n,assetSrc:'broll-assets/evidence.png'})})];
 for(const change of cases)assert.ok(pairedRelationsIssues(change(scene),config).length);
 for(const edit of [c=>{c.phases[0].positions.a.y=.8;},c=>{c.copyWindow.rect.x=.75;},c=>{c.titleRect.y=.31;},c=>{c.relation.label={nodeId:'context',rect:{x:.07,y:.32,width:.15,height:.1}};}]){const c=clone(config);edit(c);assert.ok(pairedRelationsIssues(scene,c).length);}
 const unbound=clone(config);unbound.sides.b.nodeId='missing';assert.ok(pairedRelationsIssues(scene,unbound).some(x=>x.includes('original-node')));
 const inferred=clone(config);inferred.relation.provenance='';assert.ok(pairedRelationsIssues(scene,inferred).some(x=>x.includes('provenance')));
});
test('copy cannot cover native motion and ordered stages must include visible complete holds',()=>{
 for(const edit of [c=>{c.copyWindow.endMs=8000;},c=>{c.phases[0].atMs=5300;},c=>{c.phases[1].atMs=9000;},c=>{c.phases[1].holdMs=500;},c=>{c.phases[0].positions.b=null;}]){const c=clone(config);edit(c);assert.ok(pairedRelationsIssues(scene,c).length);}
 assert.equal(pairedRelationsState(scene,config,2000).copyVisible,true);assert.equal(pairedRelationsState(scene,config,2000).graphicVisible,false);assert.equal(pairedRelationsState(scene,config,5500).graphicVisible,true);assert.equal(pairedRelationsState(scene,config,18000).graphicVisible,false);
});
test('all real measured native fields are required and missing/truncated/stale text never reports ready',()=>{
 assert.equal(pairedRelationsReadiness(scene,config,null).status,'waiting');
 const missing=measured();missing.fields=missing.fields.filter(f=>f.id!=='paired-side-b');assert.equal(pairedRelationsReadiness(scene,config,missing).status,'waiting');
 const loss=measured();loss.fields.find(f=>f.id==='paired-side-a').fit.pages=[['AIAgent']];assert.equal(pairedRelationsReadiness(scene,config,loss).status,'blocked');
 const stale=measured();stale.fontKey='changed';assert.equal(pairedRelationsReadiness(scene,config,stale).status,'blocked');
 const words=clone(scene);words.nodes[0].bullets=['已经成功'];assert.equal(pairedRelationsReadiness(words,config,measured()).status,'blocked');
 const fit=measured().fields[0].fit;assert.ok(pairedRelationsPage(fit,1000,config.copyWindow).lines.length);assert.equal(pairedRelationsPage({pages:[['first'],['last']]},999999,{atMs:0,endMs:1000}).index,1);
});
test('long measured pages require complete reading in each stable phase rather than truncating the tail',()=>{
 const long=clone(scene);long.nodes[0].text='完整条件不删除且每一页都必须能读完。'.repeat(12);const m=measured(long);assert.ok(m.fields.find(f=>f.id==='paired-side-a').fit.pages.length>1);assert.ok(pairedCompleteCopy(long).includes(long.nodes[0].text));assert.equal(pairedRelationsReadiness(long,config,m).status,'blocked');
});
test('raw source proof and each retained instance are checked independently at cut/speed clocks',()=>{
 const clips=[{id:'first',src:scene.src,inSec:1,outSec:19,speed:1},{id:'again',src:scene.src,inSec:1,outSec:19,speed:1}],proof={rawScene:scene,clips,fps:30},projected=projectStoryboard([scene],clips,30);
 for(const p of projected){assert.deepEqual(pairedRelationsIssues(p,config,viewport,proof),[]);assert.equal(pairedRelationsReadiness(p,config,measured(p),viewport,proof).status,'ready');}
 assert.ok(pairedRelationsIssues({...projected[0],id:projected[1].id,clipId:projected[1].clipId},config,viewport,proof).includes('paired-source-projection-mismatch'));
 const fastClips=[{id:'fast',src:scene.src,inSec:1,outSec:19,speed:3}],fast=projectStoryboard([scene],fastClips,30)[0];assert.equal(pairedRelationsReadiness(fast,config,measured(fast),viewport,{rawScene:scene,clips:fastClips,fps:30}).status,'blocked');
 const cutClips=[{id:'cut',src:scene.src,inSec:8,outSec:19,speed:1}],cut=projectStoryboard([scene],cutClips,30)[0];assert.equal(pairedRelationsReadiness(cut,config,measured(cut),viewport,{rawScene:scene,clips:cutClips,fps:30}).status,'blocked');assert.ok(pairedRelationsIssues(cut,config).includes('paired-verified-raw-source-projection-required'));
});
test('the isolated editable contract has all three variants and invents no runtime values',()=>{
 assert.deepEqual(pairedRelationsControls.map(c=>c.variant),['correspondence','horizontal-alternate','bidirectional']);for(const c of pairedRelationsControls){assert.equal(c.automaticAllowed,false);assert.equal(c.uiAccepted,false);assert.ok(c.fields.some(f=>f.key==='phases'));}
});

const url=new URL('../src/PairedRelationsScene.tsx',import.meta.url),react=JSON.stringify(import.meta.resolve('react')),stub='data:text/javascript;base64,'+Buffer.from(`import React from ${react};export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);`).toString('base64'),fontStub='data:text/javascript,import React from '+react+';export const DisplayFontContext=React.createContext("synthetic-loaded-font");',textStub='data:text/javascript,export const useMeasuredText=()=>({fit:null,family:"Synthetic"});';
const transformed=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='remotion'?stub:s==='./DisplayFont'?fontStub:s==='./MeasuredText'?textStub:s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
const {PairedRelationsGraphics,PairedRelationsScene}=await import('data:text/javascript;base64,'+Buffer.from(transformed).toString('base64'));
const drawing=(elapsed,c=config)=>renderToStaticMarkup(React.createElement(PairedRelationsGraphics,{scene,config:c,elapsed,measured:Object.fromEntries(measured(scene,c).fields.map(f=>[f.id,{...f,family:'Synthetic'}]))}));
test('the actual drawing uses source-copy and native measured fields, with stable roles and explicit directional phases',()=>{
 const intro=drawing(2000);assert.ok(intro.includes('data-paired-complete-source-copy="true"'));for(const text of ['AI Agent','不是实测','额外条件也不删除'])assert.ok(intro.includes(text));assert.ok(!intro.includes('data-paired-side="a"'));
 const moving=drawing(7900);assert.ok(moving.includes('data-paired-phase="focus-a"'));assert.ok(moving.includes('data-paired-side="a" data-original-node="request"'));assert.ok(moving.includes('data-paired-side="b" data-original-node="result"'));assert.ok(moving.includes('data-paired-motion="moving"'));assert.ok(!moving.includes('data-paired-complete-source-copy'));
 const c=clone(config);c.variant='bidirectional';c.relation.type='bidirectional';c.phases.forEach(p=>p.flow='both');const bidirectional=drawing(7900,c);assert.ok(bidirectional.includes('data-paired-direction="a-to-b"'));assert.ok(bidirectional.includes('data-paired-direction="b-to-a"'));
});
test('the mounted component refuses absent, foreign and empty real-speaker slots',()=>{
 const base={scene,config,elapsed:2000},proof={kind:'same-source-video',src:scene.src,sha256:config.binding.sha256,startMs:1000,endMs:19000};
 for(const extra of [{},{speakerProof:{...proof,sha256:'b'.repeat(64)},renderSpeaker:()=>React.createElement('video')},{speakerProof:proof,renderSpeaker:()=>null}])assert.ok(renderToStaticMarkup(React.createElement(PairedRelationsScene,{...base,...extra})).includes('data-layout-status="blocked"'));
});

// Drive the actual component and report lifecycle; replace only browser font
// measurement with explicit synthetic metrics. This is not real-font UI QA.
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64'),reactRuntime=import.meta.resolve('react');
const hookedReact=data(`import React from ${JSON.stringify(reactRuntime)};export default React;export const useContext=()=>globalThis.__paired.font;export const useId=()=>"synthetic-pair-id";export const useCallback=f=>f;export const useState=()=>[globalThis.__paired.reports,()=>{}];export const useLayoutEffect=f=>{f()};`);
const hookedCommon=data(`import React from ${JSON.stringify(reactRuntime)};export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const DisplayFontContext={};export const useMeasuredText=text=>({fit:globalThis.__paired.fits[text]??null,family:'Synthetic'});`);
const nativeSource=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='react'?hookedReact:['remotion','./DisplayFont','./MeasuredText'].includes(s)?hookedCommon:new URL(s,url).href)}`);
const {PairedRelationsScene:NativePaired}=await import(data(nativeSource));
function renderNative(s,c,elapsed,{waiting=false,stale=false}={}){
 const m=measured(s,c),reports={key:stale?'old':m.key,fields:Object.fromEntries(m.fields.map(f=>[f.id,{...f,fit:waiting?null:f.fit,family:'Synthetic'}]))},readiness=[];
 globalThis.__paired={font:m.fontKey,reports,fits:Object.fromEntries(m.fields.map(f=>[f.text,waiting?null:f.fit]))};
 try{return {html:renderToStaticMarkup(React.createElement(NativePaired,{scene:s,config:c,elapsed,speakerProof:{kind:'same-source-video',src:c.binding.src,sha256:c.binding.sha256,startMs:c.binding.startMs,endMs:c.binding.endMs},renderSpeaker:()=>React.createElement('video',{'data-synthetic-real-source':'true'}),onReadiness:r=>readiness.push(r)})),readiness};}finally{delete globalThis.__paired;}
}
test('actual native readiness waits for all current fits and resets before showing a stale relation',()=>{
 const ready=renderNative(scene,config,7900),waiting=renderNative(scene,config,7900,{waiting:true}),stale=renderNative(scene,config,7900,{stale:true});assert.equal(ready.readiness.at(-1).status,'ready');assert.ok(ready.html.includes('data-paired-motion="moving"'));for(const r of [waiting,stale]){assert.equal(r.readiness.at(-1).status,'waiting');assert.ok(!r.html.includes('data-paired-side='));assert.ok(r.html.includes('data-paired-real-speaker="true"'));}assert.equal(renderNative(scene,config,7900).readiness.at(-1).status,'ready');
 const invalid=clone(config);invalid.relation.provenance=42;assert.ok(pairedRelationsIssues(scene,invalid).length);assert.ok(pairedRelationsIssues({...scene,nodes:[{id:'bad',text:null}]},config).length);
});
test('actual source-copy and late stable phases expose every full measured page on their own local clocks',()=>{
 const s=clone(scene);s.endMs=901000;s.body=scene.body.repeat(120);s.nodes[0].detail='完整条件必须逐页保留而不是提前跳到尾页。'.repeat(12);
 const c=clone(config);c.binding.endMs=s.endMs;c.copyWindow.endMs=250000;c.graphicWindow={atMs:250000,endMs:900000};c.phases[0]={...c.phases[0],atMs:340000,moveMs:1000,holdMs:200000};c.phases[1]={...c.phases[1],atMs:650000,moveMs:1000,holdMs:200000};
 const m=measured(s,c),copy=m.fields.find(f=>f.id==='paired-complete-copy'),a=m.fields.find(f=>f.id==='paired-side-a'),lastWindow=pairedRelationsFieldPlan(s,c).find(f=>f.id==='paired-side-a').windows.at(-1);assert.ok(copy.fit.pages.length>1&&a.fit.pages.length>1);assert.equal(pairedRelationsReadiness(s,c,m).status,'ready');
 for(let i=0;i<copy.fit.pages.length;i++){const r=renderNative(s,c,(i+.5)*c.copyWindow.endMs/copy.fit.pages.length);assert.equal(r.readiness.at(-1).status,'ready');assert.ok(r.html.includes(`data-paired-page="${i}"`));assert.equal((r.html.match(/aria-hidden="false"/g)??[]).length,1);}
 for(let i=0;i<a.fit.pages.length;i++){const r=renderNative(s,c,lastWindow.atMs+(i+.5)*(lastWindow.endMs-lastWindow.atMs)/a.fit.pages.length),part=r.html.split('data-paired-field="paired-side-a"')[1]?.split('data-paired-side="b"')[0];assert.equal(r.readiness.at(-1).status,'ready');assert.ok(part.includes(`data-paired-page="${i}"`));assert.ok(part.includes('aria-hidden="false"'));}
});
