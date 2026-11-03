import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {veilStateCopy,veilStateControls,veilStateFieldPlan,veilStateIssues,veilStateMeasurementKey,veilStateObjectPhase,veilStateProtectedRects,veilStateReadiness,veilStateState} from '../src/veil-state.mjs';

const viewport={width:1920,height:1080};
const scene={id:'veil-synthetic',clipId:'source',src:'clips/synthetic.mp4',startMs:1000,endMs:51000,layout:'cards',title:'保留原对象',body:'不能把视觉状态当成账号真实状态。',sourceNote:'作者提供的示意说明',nodes:[{id:'rule',text:'保留规则',detail:'不能省略限制条件',bullets:['先核验来源','English spaces and 👨‍👩‍👧‍👦']},{id:'other',text:'未选中的完整论点',detail:'这句话也必须显示'}]};
const complete=n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean).join('\n');
const config={kind:'veil-state',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:1000,endMs:51000},sourceKind:'illustration',provenance:'合成例：暂时遮蔽，再恢复原对象；不是实际账号状态',copyWindow:{atMs:0,endMs:14000,rect:{x:.04,y:.035,width:.59,height:.79}},objects:[{id:'original-rule',nodeId:'rule',expectedText:complete(scene.nodes[0]),rect:{x:.04,y:.18,width:.59,height:.40},atMs:14000,freezeAtMs:24000,freezeMs:600,releaseAtMs:30000,releaseMs:600,endMs:50000,appearance:{dimOpacity:.4,veilOpacity:.55,blurPxAt1080:8}}]};
const measure=(s,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(s)].reduce((n,{segment})=>n+(/^[il .]$/.test(segment)?.28:/^[A-Za-z]$/.test(segment)?.56:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=config,v=viewport){
 const fields=veilStateFieldPlan(s,c).map(f=>({id:f.id,text:f.text,fit:fitMeasuredText(f.text,{width:f.rect.width*v.width*.94,height:f.rect.height*v.height*.88,minFont:v.height*.027,maxFont:v.height*.027,protectedPhrases:f.text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/g)??[],measure})}));
 return {key:veilStateMeasurementKey(s,c,v,'synthetic-variable-width'),fontKey:'synthetic-variable-width',fields};
}

test('explicit source-time state preserves object identity/text, freezes a page, then removes the whole veil',()=>{
 assert.deepEqual(veilStateIssues(scene,config),[]);const m=fixture();assert.equal(veilStateReadiness(scene,config,m).status,'ready');
 const times=[13999,14000,23999,24000,24300,24600,29999,30000,30300,30600,49999];
 const states=times.map(t=>veilStateState(scene,config,t,m));
 assert.deepEqual(states.map(s=>s.objects[0].phase),['pending','clear','clear','veiling','veiling','frozen','frozen','releasing','releasing','restored','restored']);
 for(const s of states){assert.equal(s.objects[0].id,'original-rule');assert.equal(s.objects[0].nodeId,'rule');assert.equal(s.objects[0].text,complete(scene.nodes[0]));}
 const mid=states[4].objects[0],frozen=states[5].objects[0],restored=states[9].objects[0];
 assert.equal(mid.opacity,.7);assert.equal(mid.blurPxAt1080,4);assert.equal(frozen.frozen,true);assert.equal(frozen.opacity,.4);assert.equal(frozen.veilOpacity,.55);assert.equal(restored.opacity,1);assert.equal(restored.blurPxAt1080,0);assert.equal(restored.veilOpacity,0);
 assert.deepEqual(veilStateState(scene,config,24300,m),states[4],'backward seeking is deterministic, without retained CSS transition state');
 assert.equal(veilStateState(scene,config,2000,m).copy.page.visible,true);assert.equal(veilStateState(scene,config,15000,m).copy.page.visible,false);
 assert.equal(veilStateObjectPhase(config.objects[0],50000).phase,'finished');
});

test('missing release, malformed phase clocks, no-op veils and forged source objects fail closed',()=>{
 const object=config.objects[0],mutations=[
  {...object,releaseAtMs:undefined},{...object,releaseMs:0},{...object,freezeAtMs:NaN},{...object,freezeMs:Infinity},{...object,releaseAtMs:24500},{...object,endMs:30600},{...object,expectedText:'保留规则'},
  {...object,appearance:{dimOpacity:1,veilOpacity:0,blurPxAt1080:0}},{...object,appearance:{...object.appearance,dimOpacity:0}},{...object,appearance:{...object.appearance,veilOpacity:1.1}},{...object,appearance:{...object.appearance,blurPxAt1080:-1}},null
 ];
 for(const object of mutations)assert.ok(veilStateIssues(scene,{...config,objects:[object]}).length);
 for(const c of [{...config,objects:[]},{...config,objects:[object,object]},{...config,sourceKind:'real-account'},{...config,provenance:''},{...config,provenance:42},{...config,copyWindow:undefined},{...config,clock:'edited-ms'},{...config,binding:{...config.binding,sha256:'missing'}}])assert.ok(veilStateIssues(scene,c).length);
 assert.ok(veilStateIssues({...scene,nodes:[scene.nodes[0],scene.nodes[0]]},config).length);
 assert.ok(veilStateIssues({...scene,nodes:[{...scene.nodes[0],bullets:'not-an-array'}]},config).length);
 assert.equal(veilStateReadiness(scene,config,{...fixture(),key:'stale'}).status,'blocked');
 for(const t of [-1,50000,NaN,Infinity])assert.equal(veilStateState(scene,config,t,fixture()).readiness,'blocked');
});

test('complete-copy is actual full prose, including unselected nodes; existing assets cannot silently disappear',()=>{
 const copy=veilStateCopy(scene,config),all=[scene.title,scene.body,scene.sourceNote,...scene.nodes.flatMap(n=>[n.text,n.detail,...(n.bullets??[])])];
 for(const t of all)assert.ok(copy.includes(t));assert.equal(veilStateFieldPlan(scene,config)[0].text,copy);
 const fields=veilStateFieldPlan(scene,config);assert.equal(fields[1].text,complete(scene.nodes[0]));assert.deepEqual(fields[1].windows,[{atMs:14000,endMs:24000},{atMs:30600,endMs:50000}]);
 for(const s of [{...scene,media:{src:'broll-assets/real.png',kind:'image'}},{...scene,nodes:scene.nodes.map((n,i)=>i?n:{...n,assetSrc:'broll-assets/real.png'})}])assert.ok(veilStateIssues(s,config).includes('existing-media-requires-a-supported-media-renderer'));
 assert.ok(veilStateIssues(scene,{...config,copyWindow:{...config.copyWindow,endMs:15000}}).includes('complete-source-copy-must-finish-before-object-actions'));
});

test('default inset and every authored speaker pose/hull, subtitle band and other objects are protected',()=>{
 assert.equal(veilStateReadiness(scene,config,fixture()).status,'ready');assert.ok(veilStateProtectedRects(scene,config,viewport).length>=2);
 const defaultInset=veilStateProtectedRects(scene,config,viewport)[0],o=config.objects[0];
 assert.ok(veilStateIssues(scene,{...config,objects:[{...o,rect:defaultInset}]}).some(s=>s.includes('overlaps-person')));
 const moving={...scene,window:{x:.70,y:.2,size:.12,keyframes:[{atMs:27000,x:.02,y:.2,size:.12}]}};
 assert.ok(veilStateIssues(moving,config).some(s=>s.includes('overlaps-person')));
 for(const atMs of [NaN,Infinity,-1,50001])assert.ok(veilStateIssues({...scene,window:{x:.7,y:.2,size:.1,keyframes:[{x:.7,y:.2,size:.1,atMs}]}},config).includes('speaker-keyframe-clock-invalid'));
 assert.ok(veilStateIssues({...scene,window:{x:.7,y:.2,size:.1,keyframes:{}}},config).includes('speaker-keyframe-list-invalid'));
 const badY={...o,rect:{...o.rect,y:.75}};assert.ok(veilStateIssues(scene,{...config,objects:[badY]}).length);
 const second={...o,id:'second-object',nodeId:'other',expectedText:complete(scene.nodes[1])};assert.ok(veilStateIssues(scene,{...config,objects:[o,second]}).includes('simultaneous-object-envelopes-must-not-overlap'));
 assert.ok(veilStateIssues(scene,{...config,protectedAreas:[{rect:o.rect}]}).some(s=>s.includes('overlaps-person')));
 const speakerScene={...scene,layout:'speaker'};assert.ok(veilStateIssues(speakerScene,config).some(s=>s.includes('overlaps-person')||s.includes('unknown-person')));
});

test('whole source phase is retained and cannot be relocated by an equal-duration same-src projection',()=>{
 const clips=[{id:'all',src:scene.src,inSec:1,outSec:51,speed:1}],projection=projectStoryboard([scene],clips,30)[0],proof={rawScene:scene,clips,fps:30};
 assert.equal(veilStateReadiness(projection,config,fixture(projection),viewport,proof).status,'ready');
 const state=veilStateState(projection,config,26000,fixture(projection),viewport,proof);assert.equal(state.objects[0].phase,'frozen');
 assert.equal(veilStateReadiness(projection,config,fixture(projection)).status,'blocked');
 const movedRaw={...scene,startMs:2000,endMs:52000},moved=projectStoryboard([movedRaw],[{...clips[0],outSec:52}],30)[0];
 assert.ok(veilStateIssues(moved,config,viewport,proof).some(i=>i.includes('projection')));assert.equal(veilStateReadiness(moved,config,fixture(projection),viewport,{rawScene:movedRaw,clips,fps:30}).status,'blocked');
 const trimmedClips=[{id:'later',src:scene.src,inSec:15,outSec:51,speed:1}],trimmed=projectStoryboard([scene],trimmedClips,30)[0],trimmedProof={rawScene:scene,clips:trimmedClips,fps:30};
 assert.equal(veilStateReadiness(trimmed,config,fixture(trimmed),viewport,trimmedProof).status,'blocked');assert.deepEqual(veilStateState(trimmed,config,26000,fixture(trimmed),viewport,trimmedProof).objects,[]);
 const faster=[{...clips[0],speed:20}],fp=projectStoryboard([scene],faster,30)[0];assert.equal(veilStateReadiness(fp,config,fixture(fp),viewport,{rawScene:scene,clips:faster,fps:30}).status,'blocked');
 assert.ok(veilStateIssues({...projection,sourceOffsetMs:123},config,viewport,proof).includes('retained-source-offset-mismatch'));
});

test('every measured page must survive independently both before veiling and after full restoration',()=>{
 const s={...scene,endMs:501000,nodes:[{id:'rule',text:'完整规则不能省略任何限制。'.repeat(45),detail:'不是实际账号被冻结。',bullets:['解除后还要完整阅读。']}]},o=config.objects[0],c={...config,binding:{...config.binding,endMs:s.endMs},copyWindow:{...config.copyWindow,endMs:200000},objects:[{...o,expectedText:complete(s.nodes[0]),atMs:200000,freezeAtMs:300000,releaseAtMs:350000,endMs:500000}]},m=fixture(s,c),fit=m.fields.find(f=>f.id===o.id).fit;
 assert.ok(fit.pages.length>1);assert.equal(veilStateReadiness(s,c,m).status,'ready');
 const frozen=veilStateState(s,c,320000,m).objects[0];assert.equal(frozen.page.index,fit.pages.length-1);
 for(let page=0;page<fit.pages.length;page++){
  const pre=200000+(page+.5)*100000/fit.pages.length,post=350600+(page+.5)*149400/fit.pages.length;
  assert.equal(veilStateState(s,c,pre,m).objects[0].page.index,page);assert.equal(veilStateState(s,c,post,m).objects[0].page.index,page);
 }
 for(const change of [{freezeAtMs:201000},{endMs:351600}]){
  const bad={...c,objects:c.objects.map(o=>({...o,...change}))};assert.equal(veilStateReadiness(s,bad,fixture(s,bad)).status,'blocked');
 }
 const omitted={...m,fields:m.fields.map(f=>f.id===o.id?{...f,fit:{...f.fit,pages:[['完整规则']]}}:f)};assert.equal(veilStateReadiness(s,c,omitted).status,'blocked');
 const waiting={...m,fields:m.fields.map(f=>({...f,fit:null}))};assert.equal(veilStateReadiness(s,c,waiting).status,'waiting');
});

test('structured controls retain stable IDs, exact original text, explicit state timings and bounded appearance',()=>{
 assert.equal(veilStateControls.canApply,false);assert.equal(veilStateControls.automaticAllowed,false);assert.equal(veilStateControls.uiAccepted,false);
 assert.equal(veilStateControls.fields.find(f=>f.key==='binding').readonly,true);assert.equal(veilStateControls.fields.find(f=>f.key==='clock').fixed,'scene-source-relative-ms');
 const list=veilStateControls.fields.find(f=>f.key==='objects');assert.equal(list.preserveId,true);assert.equal(list.itemFields.find(f=>f.key==='expectedText').readonly,true);assert.equal(list.itemFields.find(f=>f.key==='id').readonly,true);
 for(const name of ['atMs','endMs','freezeAtMs','freezeMs','releaseAtMs','releaseMs'])assert.equal(list.itemFields.find(f=>f.key===name).type,'source-ms');
 assert.equal(list.itemFields.find(f=>f.key==='appearance').fields.find(f=>f.key==='veilOpacity').max,.9);
});

// These execute the actual component branches with synthetic metrics. They do
// not claim browser font pixels, compositor blur or human face review.
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactUrl)};export default React;export const useContext=()=>globalThis.__veil.font;export const useCallback=f=>f;export const useState=()=>[globalThis.__veil.reports,()=>{}];export const useLayoutEffect=f=>{f()};`);
const fakeRender=data(`import React from ${JSON.stringify(reactUrl)};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const useVideoConfig=()=>globalThis.__veil.viewport;export const DisplayFontContext={};export const useMeasuredText=text=>({fit:globalThis.__veil.fits[text]??null,family:'synthetic'});`);
const code=fs.readFileSync(new URL('../src/VeilStateScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender)).replaceAll("'./veil-state.mjs'",JSON.stringify(new URL('../src/veil-state.mjs',import.meta.url).href));
const {VeilStateScene}=await import(data(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(s=scene,c=config,time=26000,{v=viewport,waiting=false,projectionProof}={}){
 const m=fixture(s,c,v),reports={key:m.key,fields:Object.fromEntries(m.fields.map(f=>[f.id,{...f,fit:waiting?null:f.fit,family:'synthetic'}]))},readiness=[];
 globalThis.__veil={font:m.fontKey,viewport:v,reports,fits:Object.fromEntries(m.fields.map(f=>[f.text,waiting?null:f.fit]))};
 try{return {html:renderToStaticMarkup(React.createElement(VeilStateScene,{scene:s,config:c,elapsed:time,projectionProof,onReadiness:r=>readiness.push(r)})),readiness};}finally{delete globalThis.__veil;}
}
test('actual renderer keeps complete source copy and persistent object output across wide/portrait freeze and release',()=>{
 for(const v of [viewport,{width:1080,height:1920}]){
  const copy=render(scene,config,2000,{v});assert.equal(copy.readiness.at(-1).status,'ready');assert.ok(copy.html.includes('data-veil-source-copy="true"'));
  const displayed=copy.html.replace(/<[^>]*>/g,'');for(const t of [scene.title,scene.body,scene.nodes[1].text,scene.nodes[1].detail])assert.ok(displayed.includes(t));assert.ok(!copy.html.includes('data-veil-object='));
  const pre=render(scene,config,20000,{v}),frozen=render(scene,config,26000,{v}),post=render(scene,config,33000,{v});
  for(const r of [pre,frozen,post]){assert.ok(r.html.includes('data-veil-object="original-rule"'));assert.ok(r.html.includes('data-source-node="rule"'));assert.ok(r.html.includes('data-veil-complete-text="original-rule"'));assert.equal(r.readiness.at(-1).status,'ready');}
  assert.ok(frozen.html.includes('data-veil-phase="frozen"'));assert.ok(frozen.html.includes(`blur(${8*v.height/1080}px)`));assert.ok(post.html.includes('data-veil-phase="restored"'));assert.ok(post.html.includes('filter:blur(0px)'));assert.ok(!frozen.html.includes('账号已冻结'),'no invented status label');
 }
});
test('actual native readiness clears on changed source/config/font and never flashes an unavailable graphic',()=>{
 const invalid={...config,objects:config.objects.map(o=>({...o,releaseAtMs:24500}))};
 const sequence=[render(),render(scene,invalid),render(),render(scene,config,26000,{waiting:true})];assert.deepEqual(sequence.map(r=>r.readiness.at(-1).status),['ready','blocked','ready','waiting']);
 for(const r of [sequence[1],sequence[3],render(scene,config,-1)]){assert.ok(!r.html.includes('data-veil-object='));assert.ok(!r.html.includes('data-veil-source-copy='));assert.ok(r.readiness.at(-1).status!=='ready');}
 const movedRaw={...scene,startMs:2000,endMs:52000},clips=[{id:'all',src:scene.src,inSec:0,outSec:52,speed:1}],moved=projectStoryboard([movedRaw],clips,30)[0],r=render(moved,config,26000,{projectionProof:{rawScene:scene,clips,fps:30}});assert.equal(r.readiness.at(-1).status,'blocked');assert.ok(!r.html.includes('data-veil-object='));
});

test('actual renderer displays each measured long-object page before and after, while frozen page stays fixed',()=>{
 const s={...scene,endMs:501000,nodes:[{id:'rule',text:'完整规则不能省略任何限制。'.repeat(45),detail:'不是实际账号被冻结。',bullets:['解除后还要完整阅读。']}]},c={...config,binding:{...config.binding,endMs:s.endMs},copyWindow:{...config.copyWindow,endMs:200000},objects:config.objects.map(o=>({...o,expectedText:complete(s.nodes[0]),atMs:200000,freezeAtMs:300000,releaseAtMs:350000,endMs:500000}))},m=fixture(s,c),fit=m.fields.find(f=>f.id==='original-rule').fit;
 assert.ok(fit.pages.length>1);
 for(let page=0;page<fit.pages.length;page++)for(const t of [200000+(page+.5)*100000/fit.pages.length,350600+(page+.5)*149400/fit.pages.length]){
  const result=render(s,c,t);assert.equal(result.readiness.at(-1).status,'ready');assert.ok(result.html.includes(`data-veil-page="${page}"`));assert.ok(result.html.includes(`data-veil-text-page="${page}" aria-hidden="false"`));assert.equal((result.html.match(/aria-hidden="false"/g)??[]).length,1);
 }
 for(const t of [300600,320000,350000,350599]){const result=render(s,c,t);assert.ok(result.html.includes(`data-veil-page="${fit.pages.length-1}"`));}
});
