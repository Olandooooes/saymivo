import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {funnelTokenPlan,funnelFlowState,funnelFlowIssues,funnelTextReadiness,MAX_FUNNEL_DOTS} from '../src/funnel-flow.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';

const scene={id:'f',clipId:'source',src:'clips/synthetic.mp4',startMs:0,endMs:20000,title:'明确总数和通过数'};
const config={kind:'quantified-funnel-flow',dataKind:'explicit',provenance:'synthetic test counts',totalCount:103,passedCount:17,unitPerDot:10,unit:'次',atMs:1000,emitMs:4000,inletMs:1000,passMs:1200,settleMs:1000};
const sum=(items,key)=>items.reduce((total,item)=>total+item[key],0);

test('token weights preserve all tails, distribute rare passes and split only with conserved integer children',()=>{
 const plan=funnelTokenPlan(config);assert.equal(plan.length,11);assert.equal(plan.at(-1).weight,3);assert.equal(sum(plan,'weight'),103);assert.equal(sum(plan,'passedWeight'),17);assert.equal(sum(plan,'rejectedWeight'),86);
 assert.ok(plan.every(token=>token.weight===token.passedWeight+token.rejectedWeight));assert.equal(plan.filter(token=>token.passedWeight&&token.rejectedWeight).length,1);
 for(let total=0;total<=35;total++)for(let passed=0;passed<=total;passed++)for(const unit of [1,2,7,40]){
  const tokens=funnelTokenPlan({...config,totalCount:total,passedCount:passed,unitPerDot:unit});assert.equal(sum(tokens,'weight'),total);assert.equal(sum(tokens,'passedWeight'),passed);assert.equal(sum(tokens,'rejectedWeight'),total-passed);assert.ok(tokens.every(token=>Number.isInteger(token.weight)&&token.weight>0&&token.weight<=unit));
 }
 const rare=funnelTokenPlan({...config,totalCount:1000,passedCount:100,unitPerDot:10}).filter(token=>token.passedWeight);assert.ok(rare[0].index>0&&rare.at(-1).index>80,'rare passing units are spread through the source emission interval');
 assert.throws(()=>funnelTokenPlan({...config,totalCount:(MAX_FUNNEL_DOTS+1)*10,passedCount:0}),/预算/);
 assert.throws(()=>funnelTokenPlan({...config,totalCount:MAX_FUNNEL_DOTS*10,passedCount:1}),/拆分/,'split fragments also count towards rendering budget');
});

test('every intermediate frame conserves mass and only outlet crossings or settled particles increment final counts',()=>{
 assert.deepEqual(funnelFlowIssues(scene,config),[]);
 const plan=funnelTokenPlan(config),firstPass=plan.find(token=>token.passedWeight),outlet=firstPass.birthMs+config.inletMs+config.passMs;
 const before=funnelFlowState(scene,config,outlet-.01),after=funnelFlowState(scene,config,outlet);
 assert.equal(before.counts.passed,0);assert.equal(after.counts.passed,firstPass.passedWeight);assert.ok(before.particles.some(particle=>particle.phase==='passing'&&particle.y<.97));
 for(let elapsed=0;elapsed<=10000;elapsed+=37){
  const state=funnelFlowState(scene,config,elapsed),c=state.counts;
  assert.equal(c.emitted,c.passed+c.rejected+c.inFlight);assert.equal(c.emitted+c.notEmitted,config.totalCount);
  assert.equal(sum(state.particles.filter(p=>p.phase==='passed'),'weight'),c.passed);assert.equal(sum(state.particles.filter(p=>p.phase==='settled'),'weight'),c.rejected);assert.equal(sum(state.particles.filter(p=>['inlet','passing','settling'].includes(p.phase)),'weight'),c.inFlight);
  assert.ok(state.particles.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Number.isInteger(p.weight)&&p.weight>0));assert.deepEqual(funnelFlowState(scene,config,elapsed),state,'same source time is deterministic');
 }
 const done=funnelFlowState(scene,config,10000);assert.equal(done.phase,'complete');assert.deepEqual(done.counts,{emitted:103,passed:17,rejected:86,inFlight:0,notEmitted:0});assert.equal(done.rate,17/103);assert.equal(done.rateVisible,true);
 const draining=funnelFlowState(scene,config,5000);assert.equal(draining.phase,'draining');assert.ok(draining.counts.inFlight>0);assert.equal(draining.rateVisible,false);
});

test('zero input, no passes, all passes and emission end each have exact terminal accounting',()=>{
 for(const [total,passed] of [[0,0],[1,0],[1,1],[7,3],[103,0],[103,103]]){
  const changed={...config,totalCount:total,passedCount:passed},state=funnelFlowState(scene,changed,15000);assert.equal(state.available,true);assert.equal(state.counts.passed,passed);assert.equal(state.counts.rejected,total-passed);assert.equal(state.counts.inFlight,0);assert.equal(state.counts.emitted,total);assert.equal(state.rateVisible,total>0);assert.equal(state.rate,total?passed/total:null);
 }
 const first=funnelFlowState(scene,config,config.atMs-.01);assert.equal(first.particles.length,0);assert.equal(first.counts.emitted,0);
});

test('inlet paths continue downwards even when the gray heap has filled to its upper row',()=>{
 for(const token of funnelTokenPlan(config)){
  const start=funnelFlowState(scene,config,token.birthMs).particles.find(p=>p.id===token.id),near=funnelFlowState(scene,config,token.birthMs+config.inletMs-.001).particles.find(p=>p.id===token.id);assert.ok(near.y>=start.y,'heap growth cannot make the last inlet particles move upwards');
 }
});

test('unproven/missing values, invalid time, source shortage and unsafe layouts never receive a default funnel',()=>{
 for(const patch of [{totalCount:undefined},{passedCount:undefined},{unitPerDot:undefined},{passedCount:104},{totalCount:1.1},{passedCount:-1},{unit:''},{provenance:''},{dataKind:'guessed'},{inletMs:0},{emitMs:Infinity}]){
  const state=funnelFlowState(scene,{...config,...patch},5000);assert.equal(state.available,false);assert.equal(state.phase,'unavailable');assert.equal(state.particles.length,0);assert.ok(state.issues.length);
 }
 assert.equal(funnelFlowState(scene,config,NaN).available,false);assert.ok(funnelFlowIssues({...scene,endMs:6000},config).some(issue=>issue.includes('终态')));
 assert.ok(funnelFlowIssues(scene,{...config,panelRect:{x:.6,y:.2,width:.3,height:.6}}).some(issue=>issue.includes('安全侧')));
 const moving={...scene,window:{x:.76,y:.46,size:.205,keyframes:[{atMs:5000,x:.10,y:.46,size:.205}]}};assert.ok(funnelFlowIssues(moving,config).some(issue=>issue.includes('安全侧')),'reserve the whole saved person-window path, not just its current position');
 for(const times of [[0,NaN],[0,Infinity],[-1],[scene.endMs+1],[1000,1000]]){const broken={...scene,window:{x:.76,y:.46,size:.205,keyframes:times.map(atMs=>({atMs,x:.76,y:.46,size:.205}))}};assert.equal(funnelFlowState(broken,config,5000).available,false);assert.ok(funnelFlowIssues(broken,config).some(issue=>issue.includes('关键帧时点')));}
});

test('source clock, weighted events and reading windows survive trimmed, accelerated and repeated projections',()=>{
 for(const speed of [.5,1,2]){
  const projected=projectStoryboard([scene],[{id:'cut',src:scene.src,inSec:4,outSec:9,speed}],30)[0];
  assert.deepEqual(funnelFlowState(projected,config,6500),funnelFlowState(scene,config,6500));
 }
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  const state=funnelFlowState(scene,config,5000,viewport),g=state.geometry;assert.equal(state.available,true);assert.ok(g.panel.x+g.panel.width<g.speaker.x);assert.ok(g.panel.y+g.panel.height<=.80);assert.ok(g.body.y+g.body.height<=g.panel.y+g.panel.height+1e-9);
 }
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64');
const react=JSON.stringify(import.meta.resolve('react'));
// Execute only the readiness effect bodies; this is a synthetic component
// wiring test, not a browser/real-font acceptance test.
const effectReact=moduleUrl(`import * as React from ${react};export default React.default;export const useLayoutEffect=effect=>effect();`);
const remotion=moduleUrl(`import React from ${react};let size={width:1920,height:1080};export const setViewport=s=>size=s;export const useVideoConfig=()=>({...size,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);`);
const text=moduleUrl(`import {fitMeasuredText} from ${JSON.stringify(new URL('../src/text-fit.mjs',import.meta.url).href)};let mode='ready';export const setMeasureMode=value=>mode=value;export const calls=[];export const measure=(value,size)=>({width:Array.from(value).length*size,ascent:size*.8,descent:size*.2});export const useMeasuredText=(value,width,height,options)=>{const fit=fitMeasuredText(value,{width,height,...options,measure});if(mode==='tiny')fit.unplaceable=true;calls.push({text:value,fit,width,height});return {fit:mode==='waiting'?null:fit,family:'synthetic'};};`);
const glyph=moduleUrl(`export const calls=[];export const useStableGlyphLayout=props=>{calls.push(props);return {fontSize:props.minFont,family:'synthetic',advance:props.minFont*.56,unitWidth:props.unit?props.minFont*.7:0,rowHeight:props.minFont*1.2,unplaceable:props.slots*props.minFont*.56+(props.unit?props.minFont*.7:0)>props.width||props.minFont*1.2>props.height};};`);
const cache=new Map(),mocks={react:effectReact,remotion,'./MeasuredText':text,'./StableGlyphLayout':glyph};
function compiled(file){const url=new URL(file,import.meta.url);if(cache.has(url.href))return cache.get(url.href);const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{let target=mocks[s];if(!target)target=s.startsWith('.')?(/\.mjs$/.test(s)?new URL(s,url).href:compiled(new URL(s+'.tsx',url).href)):import.meta.resolve(s);return `from ${JSON.stringify(target)}`;});const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;}
const {FunnelFlowScene}=await import(compiled('../src/FunnelFlowScene.tsx')),{setViewport}=await import(remotion),{setMeasureMode,calls:measureCalls}=await import(text),{calls:glyphCalls}=await import(glyph);
const renderSpeaker=({elapsed})=>React.createElement('div',{'data-synthetic-source-time':elapsed});
const render=(s,c,elapsed,speaker=renderSpeaker)=>renderToStaticMarkup(React.createElement(FunnelFlowScene,{scene:s,config:c,elapsed,renderSpeaker:speaker}));
function visibleCopy(html){const stack=[],pieces=[];for(const token of html.match(/<[^>]+>|[^<]+/g)??[]){if(token.startsWith('</'))stack.pop();else if(token.startsWith('<')){if(!token.endsWith('/>')&&!/^<(?:img|br|input|hr)\b/.test(token))stack.push(/aria-hidden="true"|(?:^|[;:"])opacity:0(?:;|")/.test(token));}else if(!stack.some(Boolean))pieces.push(token.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));}return pieces.join('');}

test('renderer shows gray sediment, blue throughput and exact outlet counters, with stable maximum-number measurement',()=>{
 setMeasureMode('ready');setViewport({width:1920,height:1080});glyphCalls.length=0;
 const moving=render(scene,config,4000),first=structuredClone(glyphCalls);glyphCalls.length=0;const done=render(scene,config,10000);assert.deepEqual(glyphCalls,first,'moving values never enter the measurement key');
 assert.ok(moving.includes('data-layout-status="ready"')&&moving.includes('data-particle-phase="settled"'));assert.ok(moving.includes('data-funnel-count="passed" data-value="0"'));
 assert.ok(done.includes('data-funnel-count="passed" data-value="17"')&&done.includes('data-particle-phase="passed"')&&done.includes('data-particle-phase="settled"'));assert.ok(done.includes('data-funnel-final-rate="true" aria-hidden="false"'));
 assert.ok(!moving.includes('概念示意')&&!moving.includes('口述整理'));assert.ok(render(scene,config,5000,null).includes('real-source-speaker-renderer-required'));
});

test('complete title/body/node conditions use a separate large reading lifetime; every page is actually visible in both aspect ratios',()=>{
 const long=prefix=>Array.from({length:40},(_,i)=>`${prefix}${i+1}条完整限制条件。`).join('');
 const rich={...scene,endMs:300000,title:'完整标题不能改写',body:long('正文'),nodes:[{id:'one',text:long('对象'),detail:long('依据'),bullets:[long('否定条件')]}]},c={...config,atMs:230000,copyWindow:{atMs:5000,durationMs:220000},annotation:'作者可编辑的完整标注'};
 assert.ok(funnelFlowIssues(rich,config).some(issue=>issue.includes('大字阅读')));assert.deepEqual(funnelFlowIssues(rich,c),[]);
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  setViewport(viewport);measureCalls.length=0;const first=render(rich,c,5001),full=funnelFlowState(rich,c,5001,viewport).geometry.copyText,measured=measureCalls.find(call=>call.text===full);
  assert.ok(first.includes('data-layout-status="ready"')&&first.includes('data-funnel-complete-copy="true"'));assert.ok(measured.fit.fontSize>=viewport.height*.032,'full copy stays large rather than becoming a small footer');assert.ok(measured.fit.pages.length>1);
  const pages=measured.fit.pages,pageMs=c.copyWindow.durationMs/pages.length;assert.ok(pageMs>=1200);assert.equal(visibleCopy(first),pages[0].join(''));
  const visible=[];for(let page=0;page<pages.length;page++){const html=render(rich,c,c.copyWindow.atMs+(page+.5)*pageMs);assert.equal(visibleCopy(html),pages[page].join(''));visible.push(visibleCopy(html));}
  assert.equal(visible.join(''),full.replaceAll('\n',''),'actual visible pages preserve all body/details/bullets, not merely their hidden DOM');
 }
});

test('font loading, unplaceable text, missing reading time and numeric boxes block the standalone preview',()=>{
 setViewport({width:1920,height:1080});setMeasureMode('waiting');assert.ok(render(scene,config,5000).includes('data-layout-status="waiting"'));setMeasureMode('tiny');assert.ok(render(scene,config,5000).includes('data-layout-status="blocked"'));setMeasureMode('ready');
 const rich={...scene,body:'完整限制条件必须保留。'.repeat(80)},c={...config,atMs:4000,copyWindow:{atMs:0,durationMs:3000}};assert.ok(render(rich,c,1000).includes('data-layout-status="blocked"'),'a checked layout cannot override an unreadable whole-body window');
 assert.equal(funnelTextReadiness('完整内容',{unplaceable:true,pages:[['完整内容']]},{duration:10000}).ready,false);
 const clock={startMs:0,endMs:8000,elapsed:0,duration:8000,visible:true},fit={unplaceable:false,pages:[['第一页'],['第二页']]};assert.equal(funnelTextReadiness('第一页第二页',fit,clock,{speed:2,startMs:0,endMs:8000}).ready,true);assert.equal(funnelTextReadiness('第一页第二页',fit,clock,{speed:4,startMs:0,endMs:8000}).ready,false);assert.equal(funnelTextReadiness('第一页第二页',fit,clock,{speed:1,startMs:4000,endMs:8000}).ready,false,'a trimmed-away page is not accepted just because it still exists in the layout');
 assert.ok(funnelFlowIssues(scene,{...config,copyWindow:{atMs:2000,durationMs:1000}}).some(issue=>issue.includes('分段呈现')));
 setViewport({width:1080,height:1920});const narrow={...config,panelRect:{x:.05,y:.13,width:.24,height:.64},totalCount:1000000000,passedCount:170000000,unitPerDot:10000000};assert.ok(render(scene,narrow,5000).includes('data-layout-status="blocked"'),'actual maximum glyph boxes are verified before rendering the chart');
});

test('a later invalid configuration or missing real speaker actively clears an earlier ready report',()=>{
 setViewport({width:1920,height:1080});setMeasureMode('ready');const reports=[],onReadiness=report=>reports.push(report),show=(c,speaker=renderSpeaker)=>renderToStaticMarkup(React.createElement(FunnelFlowScene,{scene,config:c,elapsed:5000,renderSpeaker:speaker,onReadiness}));
 show(config);assert.equal(reports.at(-1).status,'ready');show({...config,passedCount:undefined});assert.equal(reports.at(-1).status,'blocked');assert.ok(reports.at(-1).issues.some(issue=>issue.includes('总数')));
 show(config);assert.equal(reports.at(-1).status,'ready');show(config,null);assert.equal(reports.at(-1).status,'blocked');assert.ok(reports.at(-1).issues.includes('real-source-speaker-renderer-required'));assert.equal(reports.at(-1).canApply,false);
});
