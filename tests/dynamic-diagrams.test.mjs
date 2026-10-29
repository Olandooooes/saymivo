import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {hubFlowIssues,hubFlowState,sampleFlowPath} from '../src/hub-flow.mjs';
import {regionFocusIssues,regionFocusState} from '../src/region-focus.mjs';
import {orbitFlowState,orbitFlowIssues,bilingualBoardState,bilingualBoardIssues} from '../src/dynamic-mechanisms.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';

const nodes=[{id:'input',text:'真实输入对象'},{id:'hub',text:'中心协作对象'},{id:'one',text:'第一支的完整条件',detail:'这句说明不能因为变暗而消失'},{id:'two',text:'第二支保持工作'},{id:'quote',text:'引用依据',detail:'完整限制条件保留在这里'},{id:'media',text:'后来加入的真实卡',detail:'完整素材说明',bullets:['验证附加条件'],assetSrc:'broll-assets/synthetic.svg'}];
const scene={id:'s',clipId:'source',src:'clips/synthetic.mp4',startMs:0,endMs:16000,title:'按来源呈现关系与完整条件',layout:'route',nodes,media:{src:'broll-assets/synthetic.png',kind:'image',width:1600,height:1000}};
const initialEdges=[{id:'input->hub',from:'input',to:'hub',route:'orthogonal'},{id:'hub->one',from:'hub',to:'one',route:'orthogonal'},{id:'hub->two',from:'hub',to:'two',route:'orthogonal'}];
const config={kind:'hub-branch-flow',hubNodeId:'hub',inputNodeIds:['input'],outputNodeIds:['one','two'],branchesAtMs:300,branchDrawMs:500,nodeStaggerMs:200,flowAtMs:1800,flowMs:1000,particleCount:4,edgeGates:[{edgeId:'hub->one',atMs:4000,enabled:false,drainMs:500}],nodeStates:[{nodeId:'one',atMs:4000,durationMs:600,state:'dim',trend:'down',explicitValue:{from:100,to:40,unit:'次',scale:{min:0,max:100}}}],quotedLineCues:[{nodeId:'quote',provenance:'synthetic authored quote',lines:[{text:'完整限制条件必须保留',atMs:5000,highlightText:'完整限制',highlightAtMs:5600},{text:'第二句另有自己的口述时点',atMs:6000}]}],rearrangements:[{atMs:7000,durationMs:1000,nodes:[{nodeId:'one',rect:{x:.06,y:.64,width:.19,height:.16}},{nodeId:'two',rect:{x:.56,y:.64,width:.19,height:.16}},{nodeId:'media',rect:{x:.30,y:.63,width:.22,height:.17},fromRect:{x:.30,y:.04,width:.22,height:.17},assetNodeId:'media'}],edges:[...initialEdges,{id:'hub->media',from:'hub',to:'media',route:'bezier'}]}]};

test('hub branches draw before staggered output nodes and particles travel along connected paths',()=>{
 assert.deepEqual(hubFlowIssues(scene,config),[]);
 const drawing=hubFlowState(scene,config,550),first=hubFlowState(scene,config,900),all=hubFlowState(scene,config,1500),flow=hubFlowState(scene,config,2500);
 assert.ok(drawing.edges.find(e=>e.id==='hub->one').draw>0);assert.equal(drawing.nodes.find(n=>n.node.id==='one').opacity,0);
 assert.ok(first.nodes.find(n=>n.node.id==='one').opacity>0);assert.equal(first.nodes.find(n=>n.node.id==='two').opacity,0);assert.ok(all.nodes.filter(n=>['one','two'].includes(n.node.id)).every(n=>n.opacity===1));
 const edge=flow.edges.find(e=>e.id==='hub->two');assert.ok(edge.particles.length);const p=edge.particles[0];assert.deepEqual({x:p.x,y:p.y},sampleFlowPath(edge.path,p.progress));assert.deepEqual(sampleFlowPath(edge.path,0),edge.path.points[0]);assert.deepEqual(sampleFlowPath(edge.path,1),edge.path.points.at(-1));
});

test('one branch stops spawning and drains, while the other branch continues and the affected card dims',()=>{
 const before=hubFlowState(scene,config,3900),draining=hubFlowState(scene,config,4200),after=hubFlowState(scene,config,4700);
 assert.ok(before.edges.find(e=>e.id==='hub->one').particles.length);assert.equal(draining.edges.find(e=>e.id==='hub->one').enabled,false);assert.ok(draining.edges.find(e=>e.id==='hub->one').particles.every(p=>p.birthMs<4000));assert.ok(draining.edges.find(e=>e.id==='hub->one').particles.length);assert.equal(after.edges.find(e=>e.id==='hub->one').particles.length,0);assert.ok(after.edges.find(e=>e.id==='hub->two').particles.length);
 const lastInFlight=draining.edges.find(e=>e.id==='hub->one').particles.at(-1);assert.ok(lastInFlight.progress>(4200-lastInFlight.birthMs)/config.flowMs,'remaining points move towards the end during the drain interval instead of disappearing in place');
 const middle=draining.nodes.find(n=>n.node.id==='one'),end=after.nodes.find(n=>n.node.id==='one');assert.ok(middle.opacity>.28&&middle.opacity<1);assert.ok(middle.metric.value<100&&middle.metric.value>40);assert.equal(end.metric.value,40);assert.equal(end.metric.fraction,.4);assert.equal(end.trendAngle,90);assert.equal(end.opacity,.28);
});

test('network rearrangement moves stable IDs, introduces only bound real media and preserves ongoing branch clocks',()=>{
 const original=structuredClone(scene),before=hubFlowState(scene,config,6500),middle=hubFlowState(scene,config,7500),end=hubFlowState(scene,config,8500);
 assert.equal(before.nodes.find(n=>n.node.id==='media').opacity,0);const entering=middle.nodes.find(n=>n.node.id==='media');assert.ok(entering.opacity>0&&entering.opacity<1);assert.ok(entering.rect.y>.04&&entering.rect.y<.63);assert.equal(entering.assetSrc,nodes.find(n=>n.id==='media').assetSrc);assert.equal(end.nodes.find(n=>n.node.id==='media').rect.y,.63);
 assert.notEqual(before.nodes.find(n=>n.node.id==='one').rect.x,middle.nodes.find(n=>n.node.id==='one').rect.x);for(const state of [before,middle,end])assert.equal(state.edges.find(e=>e.id==='hub->two').birthAtMs,1800);assert.equal(middle.edges.find(e=>e.id==='hub->media').birthAtMs,7000);assert.deepEqual(scene,original);
});

test('quote lines and literal highlights follow separate original-source cues',()=>{
 const early=hubFlowState(scene,config,5200).nodes.find(n=>n.node.id==='quote'),highlight=hubFlowState(scene,config,5700).nodes.find(n=>n.node.id==='quote'),later=hubFlowState(scene,config,6400).nodes.find(n=>n.node.id==='quote');
 assert.ok(early.quoteLines[0].opacity>0);assert.equal(early.quoteLines[1].opacity,0);assert.equal(early.quoteLines[0].highlighted,false);assert.equal(highlight.quoteLines[0].highlighted,true);assert.equal(later.quoteLines[1].opacity,1);
 assert.ok(hubFlowIssues(scene,{...config,quotedLineCues:[{...config.quotedLineCues[0],lines:[{text:'原句',atMs:100,highlightText:'不存在的字'}]}]}).length);
});

test('graph state rejects ambiguous identity reuse, overlapping transitions and unsupported implicit evidence relay',()=>{
 assert.ok(hubFlowIssues(scene,{...config,rearrangements:[{...config.rearrangements[0],edges:[{...initialEdges[0],to:'two'}]}]}).some(issue=>issue.includes('新边ID')));
 assert.ok(hubFlowIssues(scene,{...config,nodeStates:[...config.nodeStates,{...config.nodeStates[0],atMs:4300}]}).some(issue=>issue.includes('不可重叠')));
 assert.ok(hubFlowIssues(scene,{...config,evidenceRelay:[{nodeId:'media',atMs:9000}]}).some(issue=>issue.includes('尚未接入')));
 assert.ok(hubFlowIssues(scene,{...config,edgeGates:[{edgeId:'hub->one',atMs:15900,enabled:false,drainMs:500}]}).some(issue=>issue.includes('排空')));
});

test('horizontal and vertical default graph layouts stay in the safe canvas and retain full text',()=>{
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  assert.deepEqual(hubFlowIssues(scene,config,viewport),[]);const state=hubFlowState(scene,config,7500,viewport);
  assert.equal(state.nodes.map(n=>n.node.text).join(''),nodes.map(n=>n.text).join(''));assert.ok(state.nodes.every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=1.001&&n.rect.y+n.rect.height<=.86));
 }
 const projected=projectStoryboard([scene],[{id:'trim',src:scene.src,inSec:4,outSec:8,speed:2}],30)[0];assert.deepEqual(hubFlowState(projected,config,6000),hubFlowState(scene,config,6000));
});

const roi={kind:'screenshot-region-focus',sourceKind:'screenshot',provenance:'synthetic source only',sourceWidth:1600,sourceHeight:1000,focusRegion:{x:800,y:500,width:400,height:100},regionUnits:'source-pixels',maskScope:'asset-only',atMs:1000,expandMs:800,holdMs:3000,returnMs:800,focusRect:{x:.15,y:.34,width:.64,height:.18},dimOpacity:.65,explanationCues:[{nodeId:'quote',provenance:'synthetic',lines:[{text:'第一行完整说明',atMs:2200},{text:'第二行另有口述时点',atMs:3000}]}]};
test('ROI is a separate plane derived from precise source bounds, while the original screenshot stays fixed',()=>{
 assert.deepEqual(regionFocusIssues(scene,roi),[]);
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  const before=regionFocusState(scene,roi,500,viewport),travel=regionFocusState(scene,roi,1400,viewport),focus=regionFocusState(scene,roi,2500,viewport),returned=regionFocusState(scene,roi,7000,viewport);
  assert.deepEqual(before.contentRect,travel.contentRect);assert.deepEqual(travel.contentRect,focus.contentRect);assert.notDeepEqual(travel.focusRect,before.focusRect);assert.equal(before.assetDimOpacity,0);assert.ok(travel.assetDimOpacity>0&&travel.assetDimOpacity<.65);assert.equal(focus.assetDimOpacity,.65);assert.equal(returned.assetDimOpacity,0);assert.equal(returned.cropOpacity,0);
  const ratio=focus.focusRect.width*viewport.width/(focus.focusRect.height*viewport.height);assert.ok(Math.abs(ratio-4)<1e-9);assert.equal(focus.explanationLines[1].opacity,0);
 }
 assert.ok(regionFocusIssues(scene,{...roi,focusRegion:{...roi.focusRegion,x:1590}}).length);assert.ok(regionFocusIssues(scene,{...roi,maskScope:'whole-canvas'}).length);assert.ok(regionFocusIssues(scene,{...roi,sourceWidth:1920}).some(issue=>issue.includes('不一致')));
 assert.ok(regionFocusIssues(scene,{...roi,explanationCues:[{nodeId:'quote',provenance:'',lines:[{text:'完整原句',atMs:2200,highlightText:'原句',highlightAtMs:2100}]}]}).some(issue=>issue.includes('来源')));
 assert.ok(regionFocusIssues(scene,{...roi,explanationCues:[{nodeId:'quote',provenance:'synthetic',lines:[{text:'完整原句',atMs:2200,highlightText:'原句',highlightAtMs:2100}]}]}).some(issue=>issue.includes('高亮时点')));
});

test('orbit gathers into a circular area in either aspect ratio, opens and transfers particles to real media',()=>{
 const config={kind:'orbit-flow-variant',gatherAtMs:0,gatherMs:1000,openAtMs:1500,openMs:500,flowAtMs:2200,flowMs:900,center:{x:.5,y:.35},radius:.23,target:{x:.7,y:.65}};
 assert.deepEqual(orbitFlowIssues(scene,config),[]);
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  const start=orbitFlowState({...config,viewport},0),gathered=orbitFlowState({...config,viewport},1300),opening=orbitFlowState({...config,viewport},1750),done=orbitFlowState({...config,viewport},3500);
  assert.equal(start.phase,'gathering');assert.equal(gathered.phase,'closed');assert.ok(gathered.dots.every(dot=>Math.hypot((dot.x-.5)*viewport.width,(dot.y-.35)*viewport.height)<=.23*Math.min(viewport.width,viewport.height)));assert.equal(opening.phase,'opening');assert.ok(done.dots.every(dot=>Math.abs(dot.x-.7)<1e-10&&Math.abs(dot.y-.65)<1e-10));
 }
});

const longScene={...scene,endMs:60000,nodes:[{id:'first',text:'完整原文和否定条件必须保留。'.repeat(8),detail:'附加说明也保留'},{id:'second',text:'未转换的原项保留全部'}]},translation={kind:'bilingual-board-transition',provenance:'explicit synthetic bilingual copy',pairs:[{nodeId:'first',fromText:'完整原文和否定条件必须保留。'.repeat(8),toText:'Keep the complete original conditions and qualifiers. '.repeat(8),fromLanguage:'中',toLanguage:'EN',atMs:20000,rollMs:1000}]};
test('bilingual cards retain every original item and both complete texts, with an actual rolling middle state',()=>{
 assert.deepEqual(bilingualBoardIssues(longScene,translation),[]);const before=bilingualBoardState(longScene,translation,15000),middle=bilingualBoardState(longScene,translation,20500),after=bilingualBoardState(longScene,translation,25000);
 assert.equal(before.items[0].phase,'original');assert.ok(middle.items[0].rotationDeg<0&&middle.items[0].rotationDeg>-180);assert.equal(after.items[0].phase,'translated');assert.equal(after.items[0].toText,translation.pairs[0].toText);assert.equal(after.items[0].fromText,longScene.nodes[0].text);assert.equal(after.items[1].fromText,longScene.nodes[1].text);assert.equal(after.items[1].phase,'original');
 assert.ok(bilingualBoardIssues(longScene,{...translation,pairs:[{...translation.pairs[0],fromText:'截短'}]}).length);assert.ok(bilingualBoardIssues({...longScene,endMs:6000},{...translation,pairs:[{...translation.pairs[0],atMs:1000}]}).some(issue=>issue.includes('完整长文')));
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64'),react=JSON.stringify(import.meta.resolve('react'));
const remotion=moduleUrl(`import React from ${react};let size={width:1920,height:1080};export const setViewport=s=>size=s;export const useVideoConfig=()=>({...size,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const imageCalls=[];export const Img=props=>{imageCalls.push(props);return React.createElement('img',props);};export const staticFile=s=>s;export const errors=[];export const cancelRender=e=>errors.push(e);`);
const measured=moduleUrl(`import React from ${react};export const calls=[];export const MeasuredText=props=>{calls.push(props);return React.createElement('div',{'data-complete-text':props.text},props.text);};`);
const glyph=moduleUrl(`export const calls=[];export const useStableGlyphLayout=props=>{calls.push(props);return {fontSize:32,family:'sans-serif',advance:22,unitWidth:40,rowHeight:38,unplaceable:false};};`);
const media=moduleUrl(`import React from ${react};export const SceneMedia=props=>React.createElement('div',{'data-bound-media':props.scene.media.src});`);
const cache=new Map(),mocks={remotion,'./SourceCopyWindow':moduleUrl(`import React from ${react};export const useDynamicGraphicsVisibility=()=>true;export const SourceCopyWindow=({children})=>React.createElement(React.Fragment,null,children);`),'./MeasuredText':measured,'./StableGlyphLayout':glyph,'./SceneMedia':media};
function compiled(file){const url=new URL(file,import.meta.url);if(cache.has(url.href))return cache.get(url.href);const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{let target=mocks[s];if(!target){if(s.startsWith('.')){target=/\.mjs$/.test(s)?new URL(s,url).href:compiled(new URL(s+'.tsx',url).href);}else target=import.meta.resolve(s);}return `from ${JSON.stringify(target)}`;});const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;}
const diagrams=await import(compiled('../src/DynamicDiagramScene.tsx')),focusRenderer=await import(compiled('../src/ScreenshotFocusScene.tsx')),bilingual=await import(compiled('../src/BilingualBoardScene.tsx')),fullRenderer=await import(compiled('../src/DynamicMechanismScene.tsx'));
const {setViewport,imageCalls,errors}=await import(remotion),{calls:measureCalls}=await import(measured),{calls:glyphCalls}=await import(glyph);

test('hub rendering preserves long details, quote words and stable measuring rectangles during real rearrangement',()=>{
 setViewport({width:1920,height:1080});const samples=[];
 for(const elapsed of [3500,4300,7500,8500]){measureCalls.length=0;const html=renderToStaticMarkup(React.createElement(diagrams.HubFlowScene,{scene,config,elapsed}));assert.ok(html.includes(nodes[2].detail)&&html.includes(nodes[5].detail)&&html.includes(nodes[5].bullets[0]));assert.ok(html.includes('data-quote-line'));samples.push(measureCalls.map(call=>[call.text,call.width,call.height]));}
 assert.deepEqual(samples[0],samples[1]);assert.deepEqual(samples[1],samples[2]);assert.deepEqual(samples[2],samples[3]);
});

test('all new renderers preserve complete long text in horizontal and vertical frames, without per-frame counter measurement',()=>{
 const bars={kind:'bar-group-variant',scale:{min:0,max:2000},unit:'次',items:[{nodeId:'one',from:0,to:1500,atMs:500,countMs:1000},{nodeId:'two',from:0,to:600,atMs:2500,countMs:1000}]};
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  setViewport(viewport);for(const Component of [diagrams.BarGroupScene,bilingual.BilingualBoardScene]){measureCalls.length=0;glyphCalls.length=0;const props=Component===diagrams.BarGroupScene?{scene,config:bars}:{scene:longScene,config:translation},first=renderToStaticMarkup(React.createElement(Component,{...props,elapsed:1000})),firstMetrics=structuredClone(glyphCalls);glyphCalls.length=0;const later=renderToStaticMarkup(React.createElement(Component,{...props,elapsed:20500}));assert.ok(first&&later);assert.deepEqual(glyphCalls,firstMetrics);if(Component===bilingual.BilingualBoardScene){assert.ok(later.includes(translation.pairs[0].fromText)&&later.includes(translation.pairs[0].toText)&&later.includes(longScene.nodes[1].text));}assert.ok(measureCalls.every(call=>call.width>0&&call.height>0));}
 }
});

test('ROI render masks only its actual asset, uses an independent crop and rejects mismatched decoded dimensions',()=>{
 setViewport({width:1920,height:1080});imageCalls.length=0;errors.length=0;const html=renderToStaticMarkup(React.createElement(focusRenderer.ScreenshotFocusScene,{scene,config:roi,elapsed:2500}));assert.ok(html.includes('data-mask-scope="asset-only"')&&html.includes('data-independent-roi="true"'));assert.ok(html.includes('left:-')&&html.includes('data-roi-explanation="1"'));assert.ok(!html.includes('filter:brightness'));
 const source=imageCalls.find(call=>call.onLoad);source.onLoad({currentTarget:{naturalWidth:1600,naturalHeight:1000}});assert.equal(errors.length,0);source.onLoad({currentTarget:{naturalWidth:1920,naturalHeight:1080}});assert.equal(errors.length,1);
});

test('standalone dispatcher routes all five new mechanisms and refuses a missing real cutout transition',()=>{
 setViewport({width:1920,height:1080});const cases=[{scene,config},{scene,config:{kind:'orbit-flow-variant',gatherAtMs:0,gatherMs:600,openAtMs:1200,openMs:500,flowAtMs:2000,flowMs:800}},{scene,config:{kind:'bar-group-variant',scale:{min:0,max:100},items:[{nodeId:'one',from:0,to:80,atMs:500,countMs:800},{nodeId:'two',from:0,to:50,atMs:1800,countMs:800}]}},{scene,config:roi},{scene:longScene,config:translation}];
 for(const entry of cases){const html=renderToStaticMarkup(React.createElement(fullRenderer.DynamicMechanismScene,{...entry,elapsed:3000}));assert.ok(html.includes('data-dynamic-mechanism='),entry.config.kind);}
 const missing=renderToStaticMarkup(React.createElement(fullRenderer.DynamicMechanismScene,{scene,config:{...config,matchToDiagram:{atMs:0,durationMs:1000,from:{x:.1,y:0,width:.8,height:1},to:{x:.03,y:.48,width:.2,height:.36}}},elapsed:500}));assert.ok(missing.includes('real-cutout-and-live-background-required'));
});
