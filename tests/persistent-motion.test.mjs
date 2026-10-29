import test from'node:test';import assert from'node:assert/strict';
import fs from'node:fs';import ts from'typescript';import React from'react';import{renderToStaticMarkup}from'react-dom/server';
import{projectStoryboard}from'../src/storyboard.mjs';import{fitMeasuredText}from'../src/text-fit.mjs';
import{compilePersistentMotion,persistentMotionIssues,persistentMotionKey,persistentMotionReadiness,persistentMotionSample,persistentMotionImageRect,persistentMotionCaptionBands,persistentMotionControls}from'../src/persistent-motion.mjs';
import{dynamicEditorBindSourceEvidence,dynamicEditorConfigValue,dynamicEditorFormValue}from'../editor/dynamic-editor-fields.mjs';
import{createDynamicLibraryConfig,dynamicMotionLibrary}from'../src/dynamic-motion-library.mjs';
import{newControlValue,patchControlRecord}from'../editor/dynamic-control-values.mjs';
import{createSceneDynamicMotionDraft,dynamicMotionEnvironmentFromState,assessSceneDynamicMotion}from'../src/scene-dynamic-motion.mjs';

const full=n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean).join('\n'),clone=structuredClone;
const images=[1,2,3].map(n=>({kind:'image',src:`broll-assets/original-${n}.png`,sha256:String(n).repeat(64),width:640,height:400}));
const nodes=[...images.map((a,i)=>({id:`im${i}`,text:`原图${i+1}`,detail:'需验证',assetSrc:a.src})),...[1,2,3,4,5].map(n=>({id:`n${n}`,text:`核对${n}`,detail:'不等于成功'})),{id:'anchor',text:'资料归档'}];
const raw={id:'synthetic',clipId:'voice',src:'clips/original.mp4',startMs:1000,endMs:241000,title:'原始完整标题',body:'不能把动画当作真实执行。',nodes,layout:'cards',window:{x:.81,y:.42,size:.16}};
const identity={kind:'video',src:raw.src,sha256:'a'.repeat(64),width:1920,height:1080,durationSec:250},v={width:1920,height:1080};
const proof=(s=raw,speed=1,clips=[{id:'voice',src:s.src,inSec:1,outSec:241,speed}])=>({rawScene:s,clips,fps:30});
const projected=(s=raw,p=proof(s))=>projectStoryboard([s],p.clips,p.fps)[0];
function config(){return dynamicEditorBindSourceEvidence({kind:'persistent-entities',clock:'scene-source-relative-ms',binding:{sceneId:raw.id,src:raw.src,sha256:identity.sha256,startMs:raw.startMs,endMs:raw.endMs},provenance:{kind:'illustration',note:'作者明确提供的原创示例，无实际执行结论'},copyWindow:{atMs:0,endMs:60000,rect:{x:.03,y:.03,width:.73,height:.73}},mediaStack:{id:'media',stackRect:{x:.03,y:.1,width:.31,height:.52},anchorRect:{x:.24,y:.12,width:.1,height:.13},anchorNodeId:'anchor',items:images.map((_,i)=>({id:`card${i}`,nodeId:`im${i}`,entryRect:{x:.03,y:.12,width:.31,height:.48},appearAtMs:61000+i*6500,readUntilMs:65000+i*6500,pushEndMs:65700+i*6500})),attachAtMs:81000,attachEndMs:82000},checklist:{id:'tasks',rect:{x:.40,y:.1,width:.34,height:.56},atMs:61000,items:[1,2,3,4,5].map((n,i)=>({id:`task${n}`,nodeId:`n${n}`,doneAtMs:65000+i*1000})),summaryText:'五项核对示例',summaryRect:{x:.40,y:.2,width:.32,height:.18},summaryAtMs:80000,archiveRect:{x:.58,y:.15,width:.16,height:.16},archiveNodeId:'anchor',archiveAtMs:90000,archiveEndMs:91000}},raw,images);}
const measure=(t,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(t)].reduce((n,{segment})=>n+(/^[A-Za-z]$/.test(segment)?.55:1),0)*size,ascent:size*.8,descent:size*.2});
function measured(c=config(),s=raw,p=proof(s),viewport=v){const projection=projected(s,p),compiled=compilePersistentMotion(s,c,identity,images),fontKey='synthetic-variable-width';return{key:persistentMotionKey(s,c,identity,images,viewport,fontKey,projection),fontKey,fields:compiled.fields.map(f=>({id:f.id,text:f.text,family:'synthetic',fit:fitMeasuredText(f.text,{width:f.rect.width*viewport.width,height:f.rect.height*viewport.height,minFont:viewport.height*.026,maxFont:viewport.height*(f.role==='copy'?.06:.04),weight:600,measure})})),media:compiled.media.map(m=>({id:m.id,asset:m.asset,status:'ready'}))};}
function readiness(c=config(),s=raw,p=proof(s),viewport=v,m=measured(c,s,p,viewport)){return persistentMotionReadiness(projected(s,p),s,c,identity,images,viewport,p,m);}
const issue=(c,match,s=raw,p=proof(s),viewport=v)=>assert.ok(persistentMotionIssues(projected(s,p),s,c,identity,images,viewport,p).some(i=>i.includes(match)));

test('one registered kind exposes two optional structured recipes and binds actual current images/full node text',()=>{
 const entry=dynamicMotionLibrary.find(e=>e.id==='persistent-entities');assert.ok(entry);assert.equal(dynamicMotionLibrary.filter(e=>e.kind==='persistent-entities').length,1);
 assert.ok(entry.fields.find(f=>f.key==='mediaStack'&&f.type==='record'));assert.ok(entry.fields.find(f=>f.key==='checklist'&&f.type==='record'));
 const generated=createDynamicLibraryConfig(entry.id,raw,{...v,sourceIdentity:identity});assert.equal(generated.config.provenance.note,'');assert.ok(generated.requiredData.includes('provenance.note'));
 const bound=dynamicEditorBindSourceEvidence(generated.config,raw,images);assert.equal(bound.mediaStack.items[1].assetIdentity.sha256,images[1].sha256);assert.equal(bound.mediaStack.items[1].expectedText,full(nodes[1]));
 const c=config(),fields=entry.fields,form=dynamicEditorFormValue(fields,c),round=dynamicEditorConfigValue(fields,form);assert.deepEqual(round,c);
 let n=0;const added=newControlValue(fields.find(f=>f.key==='checklist'),{newId:()=>`new-${++n}`,scene:raw});assert.ok(added.id);assert.deepEqual(added.items,[]);assert.equal(added.summaryAtMs,undefined,'no hidden fact or time is invented by adding a record');
});

test('source/image selection edits and deletion atomically clear stale derived identity without changing stable instance IDs',()=>{
 const c=config(),old=JSON.stringify(c);c.mediaStack.items[0].nodeId='im1';let next=dynamicEditorBindSourceEvidence(c,raw,images);
 assert.equal(next.mediaStack.items[0].id,'card0');assert.equal(next.mediaStack.items[0].assetIdentity.src,images[1].src);assert.equal(next.mediaStack.items[0].expectedText,full(nodes[1]));
 const changed={...raw,nodes:raw.nodes.map(n=>n.id==='n1'?{...n,detail:'新增完整限制 👨‍👩‍👧‍👦'}:n)};next=dynamicEditorBindSourceEvidence(c,changed,images);assert.ok(next.checklist.items[0].expectedText.endsWith('👨‍👩‍👧‍👦'));
 next=dynamicEditorBindSourceEvidence(c,{...raw,nodes:raw.nodes.filter(n=>n.id!=='im1')},images);assert.equal(next.mediaStack.items[0].assetIdentity,undefined);assert.equal(next.mediaStack.items[0].expectedText,undefined);
 next=dynamicEditorBindSourceEvidence(config(),raw,[]);assert.equal(next.mediaStack.items[0].assetIdentity,undefined);assert.notEqual(JSON.stringify(c),old);assert.equal(c.mediaStack.items[0].assetIdentity.src,images[0].src,'binder did not mutate the input identity');
});

test('both recipes compile into one reducer with persistent old cards, explicit five done states and all-member archive',()=>{
 const c=config();assert.deepEqual(persistentMotionIssues(projected(),raw,c,identity,images,v,proof()),[]);assert.equal(readiness(c).status,'ready');
 const pre=persistentMotionSample(projected(),raw,c,identity,images,66000),end=persistentMotionSample(projected(),raw,c,identity,images,100000);
 assert.equal(pre.entities.card0.active,true);assert.equal(pre.entities.card1.active,false);assert.equal(end.entities.card0.owner.containerId,'media:stack');assert.equal(end.containers['media:stack'].owner.containerId,'media:anchor');
 assert.equal(end.entities['tasks:summary'].summary.members.length,5);assert.equal(end.entities['tasks:summary'].summary.completion,'all-done');assert.equal(end.entities['tasks:summary'].owner.containerId,'tasks:archive');
 assert.equal(end.entities.task1.active,true);assert.equal(end.entities.task1.text,'核对1\n不等于成功');assert.deepEqual(persistentMotionSample(projected(),raw,c,identity,images,66000),pre);
});

test('the actual image subrectangle is continuous at reading→push, between pushes, and whole-stack attach',()=>{
 const c=config(),sample=(id,t)=>persistentMotionImageRect(persistentMotionSample(projected(),raw,c,identity,images,t).entities[id].worldPose);
 for(const boundary of [65000,65500,65700,81000,82000]){const a=sample('card0',boundary-.001),b=sample('card0',boundary),d=sample('card0',boundary+.001);for(const k of ['x','y','width','height']){assert.ok(Math.abs(a[k]-b[k])<.00001,k+' entering '+boundary);assert.ok(Math.abs(d[k]-b[k])<.00001,k+' leaving '+boundary);}}
 const origin=sample('card0',65000),middle=sample('card0',65250),slot=sample('card0',65500);for(const key of ['x','y','width','height'])assert.ok(Math.abs(middle[key]-(origin[key]+slot[key])/2)<1e-8);
 assert.notDeepEqual(sample('card0',81500),sample('card0',82000));assert.equal(sample('card0',65000).height,c.mediaStack.items[0].entryRect.height*.65);
});

test('raw absolute source, same actual projection, selected full text and every source asset are hard gates',()=>{
 const c=config(),moved={...raw,startMs:2000,endMs:242000};issue(c,'raw-source-binding',moved,proof(moved,1,[{id:'voice',src:raw.src,inSec:2,outSec:242,speed:1}]));
 const wrong=clone(c);wrong.mediaStack.items[0].assetIdentity.sha256='f'.repeat(64);issue(wrong,'verified-current-source-image');
 const omitted=clone(c);omitted.mediaStack.items.pop();issue(omitted,'未保留的实际资料');
 const dropped=clone(c);dropped.checklist.items[0].expectedText='核对1';issue(dropped,'完整原文已变化');
 const projection={...projected(),sourceOffsetMs:1000};assert.ok(persistentMotionIssues(projection,raw,c,identity,images,v,proof()).some(i=>i.includes('投影不再匹配')));
 assert.equal(readiness(c,raw,proof(),v,{...measured(c),key:'stale'}).status,'waiting');
});

test('font/page reports, real image load and actual retained speed exposure gate readiness; late pages start at object birth',()=>{
 const c=config(),m=measured(c),missing={...m,fields:m.fields.filter(f=>f.id!=='summary:tasks')};assert.equal(readiness(c,raw,proof(),v,missing).status,'waiting');
 const bad={...m,media:m.media.map((a,i)=>i?a:{...a,status:'error'})};assert.equal(readiness(c,raw,proof(),v,bad).status,'blocked');
 const noFont={...m,fields:m.fields.map(f=>({...f,fit:null}))};assert.equal(readiness(c,raw,proof(),v,noFont).status,'waiting');
 for(const speed of [.5,1,2])assert.equal(readiness(c,raw,proof(raw,speed)).status,'ready');
 const cut=proof(raw,1,[{id:'voice',src:raw.src,inSec:30,outSec:241,speed:1}]);assert.equal(readiness(c,raw,cut).status,'blocked','a cut cannot restart copy at zero');
 const fast=proof(raw,20);assert.equal(readiness(c,raw,fast).status,'blocked');
 const short=clone(c);short.mediaStack.items[0].readUntilMs=short.mediaStack.items[0].appearAtMs+300;assert.equal(readiness(short).status,'blocked');
 const long=clone(c);long.checklist.summaryText='不能遗漏限定条件和完整原句。'.repeat(60);assert.equal(readiness(long).status,'blocked','more actual pages need more source time rather than truncation');
});

test('whole groups respect every person keyframe/caption band and combination needs disjoint historical envelopes',()=>{
 const c=config(),cross={...raw,window:{...raw.window,keyframes:[{atMs:120000,x:.05,y:.1,size:.2}]}};issue(c,'人物',cross,proof(cross));
 const captions={...proof(),captions:[{clipId:'voice',startMs:1000,endMs:240000,topPct:50}]};issue(c,'保护区',raw,captions);
 const overlapped=clone(c);overlapped.checklist.rect.x=.15;issue(overlapped,'两组持久对象');
 const late=clone(overlapped);late.checklist.atMs=100000;late.checklist.items.forEach((x,i)=>x.doneAtMs=102000+i*1000);late.checklist.summaryAtMs=115000;late.checklist.archiveAtMs=125000;late.checklist.archiveEndMs=126000;issue(late,'两组持久对象',raw,proof());
 const portrait={width:1080,height:1920};assert.equal(readiness(c,raw,proof(),portrait).status,'ready');
 const overflow=clone(c);overflow.mediaStack.anchorRect.y=.81;assert.ok(persistentMotionIssues(projected(),raw,overflow,identity,images,v,proof()).length);
});

test('newkind uses existing opaque receipt and does not expose a save bypass',()=>{
 const c=config(),state={clips:proof().clips,presentation:{format:'16:9',displayFont:'none',scenes:[raw]},captions:[],brolls:[],music:null,meta:{fps:30,width:1920,height:1080,durationInFrames:7200}},env=dynamicMotionEnvironmentFromState(state,{sourceIdentity:identity,assets:images,font:{status:'ready'}}),draft=createSceneDynamicMotionDraft(raw,c,env);
 assert.equal(assessSceneDynamicMotion(draft,raw,env).canApply,false);assert.equal(assessSceneDynamicMotion(draft,raw,env,{draftKey:'copied'}).canApply,false);
 const changed={...raw,title:'原文已改变'};assert.equal(assessSceneDynamicMotion(draft,changed,env).canApply,false);
});

// Execute actual TSX branches with explicit synthetic font reports. This proves
// native visibility/gating, not a browser pixel/decoder/font/opaque receipt.
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactUrl)};export default React;export const useCallback=f=>f;export const useContext=()=>globalThis.__persistent.font;export const useState=()=>[globalThis.__persistent.reports,()=>{}];export const useRef=()=>({current:null});export const useLayoutEffect=f=>f();`);
const fakeRender=data(`import React from ${JSON.stringify(reactUrl)};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const Img=({children,...p})=>React.createElement('img',p,children);export const staticFile=s=>'/'+s;export const useVideoConfig=()=>globalThis.__persistent.viewport;export const DisplayFontContext={};export const useMeasuredText=()=>({fit:null,family:'synthetic'});`);
let source=fs.readFileSync(new URL('../src/PersistentEntitiesScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender));
for(const name of ['persistent-motion','source-token-transfer'])source=source.replaceAll(`'./${name}.mjs'`,JSON.stringify(new URL(`../src/${name}.mjs`,import.meta.url).href));
const{PersistentEntitiesScene}=await import(data(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(time,{c=config(),ready=true,stale=false,s=raw,p=proof(s),viewport=v}={}){let m;try{m=measured(c,s,p,viewport);}catch{m=measured();}const reports={key:stale?'previous-draft':m.key,fields:Object.fromEntries(m.fields.map(f=>[f.id,{...f,fit:ready?f.fit:null}])),media:Object.fromEntries(m.media.map(a=>[a.id,a]))},callbacks=[];globalThis.__persistent={font:m.fontKey,reports,viewport};try{return{html:renderToStaticMarkup(React.createElement(PersistentEntitiesScene,{scene:projected(s,p),rawScene:s,config:c,elapsed:time,identity,assets:images,projectionProof:p,onReadiness:r=>callbacks.push(r)})),callbacks};}finally{delete globalThis.__persistent;}}
test('actual one renderer shows original copy, persistent images, task statuses, members and moving summary while waiting never flashes old content',()=>{
 const copy=render(1000);assert.ok(copy.html.includes('不能把动画当作真实执行'));assert.equal(copy.callbacks.at(-1).status,'ready');
 const working=render(68000);assert.ok(working.html.includes('data-persistent-task-status="done"'));assert.ok(working.html.includes('data-persistent-task-status="pending"'));assert.ok(working.html.includes('original-1.png'));assert.ok(working.html.includes('不等于成功'));
 const archived=render(100000);assert.ok(archived.html.includes('data-member-count="5"'));assert.ok(archived.html.includes('data-summary-snapshot-at="80000"'));assert.ok(archived.html.includes('五项核对示例'));
 const moving=render(90500);assert.ok(moving.html.includes('五项核对示例'),'same complete summary text remains on its moving carrier');
 const waiting=render(68000,{ready:false});assert.equal(waiting.callbacks.at(-1).status,'waiting');assert.ok(!waiting.html.includes('data-persistent-task-status'));assert.ok(!waiting.html.includes('data-persistent-field='));
 const old=render(68000,{stale:true});assert.equal(old.callbacks.at(-1).status,'waiting');assert.ok(!old.html.includes('data-persistent-field='));
 const c=config();c.provenance.note='';const blocked=render(68000,{c});assert.equal(blocked.callbacks.at(-1).status,'blocked');assert.ok(!blocked.html.includes('data-persistent-field='));
});

test('late multipage summary starts with visible page zero, holds all pages, and archive restarts its own readable window',()=>{
 const c=config();c.checklist.summaryText='保留完整条件，不得冒充真实执行。'.repeat(8);c.checklist.archiveAtMs=115000;c.checklist.archiveEndMs=116000;
 const m=measured(c),fit=m.fields.find(f=>f.id==='summary:tasks').fit;assert.ok(fit.pages.length>1);assert.equal(readiness(c).status,'ready');
 const first=render(c.checklist.summaryAtMs,{c}),last=render(c.checklist.archiveAtMs-1,{c}),archived=render(c.checklist.archiveEndMs,{c});
 assert.ok(first.html.includes('data-persistent-field="summary:tasks" data-persistent-page="0"'));assert.ok(last.html.includes(`data-persistent-field="summary:tasks" data-persistent-page="${fit.pages.length-1}"`));assert.ok(archived.html.includes('data-persistent-field="archived:tasks" data-persistent-page="0"'));
});

test('caption protection agrees with real projectCaptions for 2x hold, clip clamps, preceding clips and legacy output cues',async()=>{
 const compile=s=>data(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText);
 const timeline=compile(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
 const captionsCode=fs.readFileSync(new URL('../src/captions.ts',import.meta.url),'utf8').replaceAll("'./timeline'",JSON.stringify(timeline));
 const{projectCaptions}=await import(compile(captionsCode));
 const s={...raw,startMs:10000,endMs:60000},clips=[{id:'voice',src:s.src,inSec:0,outSec:70,speed:2}],p={rawScene:s,clips,fps:30},projection=projected(s,p),caps=[{id:'hold',clipId:'voice',startMs:8500,endMs:9000,holdMs:700,topPct:50,words:[]},{id:'legacy',startMs:8500,endMs:9000,holdMs:700,topPct:50,words:[]}];
 const actual=projectCaptions(caps,clips,30),overlapping=actual.filter(c=>c.startMs<projection.endMs&&Math.min(c.endMs+c.holdMs,c.holdMaxMs??Infinity)>projection.startMs);assert.equal(overlapping.length,2);
 assert.equal(persistentMotionCaptionBands(projection,{...p,captions:caps}).length,2,'2x hold overlaps the scene and legacy captions stay in output time');
 const shiftedClips=[{id:'other',src:'clips/other.mp4',inSec:0,outSec:7.13,speed:1},...clips],shifted={...p,clips:shiftedClips},shiftedScene=projected(s,shifted);assert.equal(persistentMotionCaptionBands(shiftedScene,{...shifted,captions:caps}).length,1,'only source-bound hold follows the owner, legacy stays at its old output position');
 const following={...p,clips:[{id:'voice',src:s.src,inSec:0,outSec:10,speed:2},{id:'next',src:s.src,inSec:10,outSec:60,speed:2}]},next=projectStoryboard([s],following.clips,30).find(x=>x.clipId==='next');assert.equal(persistentMotionCaptionBands(next,{...following,captions:[caps[0]]}).length,0,'caption hold cannot bleed across its owner out point');
});
