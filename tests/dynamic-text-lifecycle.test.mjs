import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {hubFlowState} from '../src/hub-flow.mjs';
import {visibleTextClock} from '../src/dynamic-text-clock.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64');
const react=JSON.stringify(import.meta.resolve('react'));
const remotion=moduleUrl(`import React from ${react};let size={width:1920,height:1080};export const setViewport=s=>size=s;export const useVideoConfig=()=>({...size,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const Img=props=>React.createElement('img',props);export const staticFile=s=>s;`);
// Keep the real MeasuredText page selection, opacity, aria-hidden, cues and line
// markup. Only font loading/Canvas hooks use an explicit synthetic metric here.
const measuredSource=fs.readFileSync(new URL('../src/MeasuredText.tsx',import.meta.url),'utf8');
const measure=(text,size)=>({width:Array.from(text).length*size,ascent:size*.8,descent:size*.2});
const measured=moduleUrl(`import React from ${react};import {fitMeasuredText} from ${JSON.stringify(new URL('../src/text-fit.mjs',import.meta.url).href)};export const calls=[];const measure=${measure.toString()};function useMeasuredText(text,width,height,options){return {family:'synthetic',fit:fitMeasuredText(text,{width,height,...options,measure})};}`+measuredSource.slice(measuredSource.indexOf('export function MeasuredText(')).replace('export function MeasuredText(','function MeasuredTextActual(')+`;export const MeasuredText=props=>{calls.push(props);return React.createElement(MeasuredTextActual,props);};`);
const glyph=moduleUrl(`export const useStableGlyphLayout=()=>({fontSize:32,family:'synthetic',advance:32,unitWidth:32,rowHeight:38,unplaceable:false});`);
const media=moduleUrl(`import React from ${react};export const SceneMedia=()=>React.createElement('div');`);
const cache=new Map(),mocks={remotion,'./SourceCopyWindow':moduleUrl(`import React from ${react};export const useDynamicGraphicsVisibility=()=>true;export const SourceCopyWindow=({children})=>React.createElement(React.Fragment,null,children);`),'./MeasuredText':measured,'./StableGlyphLayout':glyph,'./SceneMedia':media};
function compiled(file){const url=new URL(file,import.meta.url);if(cache.has(url.href))return cache.get(url.href);const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{let target=mocks[s];if(!target)target=s.startsWith('.')?(/\.mjs$/.test(s)?new URL(s,url).href:compiled(new URL(s+'.tsx',url).href)):import.meta.resolve(s);return `from ${JSON.stringify(target)}`;});const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;}
const {HubFlowScene,OrbitTransferScene}=await import(compiled('../src/DynamicDiagramScene.tsx'));
const {setViewport}=await import(remotion),{calls,MeasuredText}=await import(measured);
const copy=prefix=>Array.from({length:12},(_,i)=>`${prefix}${i+1}完整限制条件和依据。`).join('');
const nodes=[{id:'input',text:'输入'},{id:'hub',text:'中心'},{id:'output',text:copy('分支')},{id:'later',text:copy('新卡'),detail:copy('附注'),assetSrc:'broll-assets/synthetic.svg'},{id:'quote',text:'引用',detail:'不得略去限定语'}];
const scene={id:'scene',clipId:'source',src:'clips/synthetic.mp4',startMs:0,endMs:30000,title:'完整说明',layout:'route',nodes,media:{src:'broll-assets/synthetic.svg',kind:'image'}};
const config={kind:'hub-branch-flow',hubNodeId:'hub',inputNodeIds:['input'],outputNodeIds:['output'],branchesAtMs:300,branchDrawMs:500,nodeStaggerMs:200,flowAtMs:1800,flowMs:1000,particleCount:4,quotedLineCues:[{nodeId:'quote',provenance:'synthetic',lines:[{text:copy('原句'),atMs:5000}]}],rearrangements:[{atMs:7000,durationMs:1000,nodes:[{nodeId:'output',rect:{x:.05,y:.62,width:.25,height:.17}},{nodeId:'later',rect:{x:.34,y:.62,width:.25,height:.17},fromRect:{x:.34,y:.05,width:.25,height:.17}}],edges:[{id:'in',from:'input',to:'hub',route:'orthogonal'},{id:'out',from:'hub',to:'output',route:'orthogonal'},{id:'new',from:'hub',to:'later',route:'bezier'}]}]};
const fitFor=props=>fitMeasuredText(props.text,{...props,protectedPhrases:(props.cues??[]).map(cue=>cue.text),measure});
// Read actual visible markup, excluding all aria-hidden/opacity:0 ancestors.
function visibleCopy(html){const stack=[],pieces=[];for(const token of html.match(/<[^>]+>|[^<]+/g)??[]){if(token.startsWith('</'))stack.pop();else if(token.startsWith('<')){if(!/^<(?:img|br|input|hr)\b/.test(token))stack.push(/aria-hidden="true"|(?:^|[;:"])opacity:0(?:;|")/.test(token));}else if(!stack.some(Boolean))pieces.push(token.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&#x27;',"'").replaceAll('&quot;','"'));}return pieces.join('');}
function assertVisiblePage(props,page){const fit=fitFor(props);assert.ok(fit.pages.length>1,'fixture must require real pagination');const html=renderToStaticMarkup(React.createElement(MeasuredText,props));assert.equal(visibleCopy(html),fit.pages[page].join(''));return fit.pages.length;}
function renderCall(Component,props,text){calls.length=0;renderToStaticMarkup(React.createElement(Component,props));const call=calls.find(call=>call.text===text);assert.ok(call,`missing rendered text: ${text}`);return {...call};}

test('visibility clocks stay local through gaps and do not spend pages before birth',()=>{
 const windows=[{startMs:800,endMs:5000},{startMs:8000,endMs:12000}];
 assert.deepEqual(visibleTextClock(700,windows),{startMs:800,endMs:5000,elapsed:0,duration:4200,visible:false});
 assert.deepEqual(visibleTextClock(7000,windows),{startMs:8000,endMs:12000,elapsed:0,duration:4000,visible:false});
 assert.equal(visibleTextClock(8050,windows).elapsed,50);assert.equal(visibleTextClock(12000,windows).visible,false);
});

test('late output and rearranged new cards start on page one and expose every complete page in both aspect ratios',()=>{
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  setViewport(viewport);
  for(const [id,text,birth] of [['output',nodes[2].text,800],['later',nodes[3].text,7000],['later',nodes[3].detail,7000]]){
   const render=elapsed=>renderCall(HubFlowScene,{scene,config,elapsed},text);
   const first=render(birth+1);assert.equal(first.elapsed,1);assert.equal(first.duration,scene.endMs-birth);assertVisiblePage(first,0);
   const pages=fitFor(first).pages.length,hold=first.duration/pages;assert.ok(hold>300,'each synthetic page has a nonzero full reading interval');
   for(let page=0;page<pages;page++){
    const elapsed=birth+(page+.5)*hold,node=hubFlowState(scene,config,elapsed,viewport).nodes.find(item=>item.node.id===id);
    assert.ok(node.opacity>0,'page must occur while its owner is visibly in frame');assertVisiblePage(render(elapsed),page);
   }
  }
 }
});

test('continuous moves retain reading phase, reactivation and parent-gated quotes restart only their own lifetime',()=>{
 const before=hubFlowState(scene,config,6500).nodes.find(item=>item.node.id==='output'),during=hubFlowState(scene,config,7500).nodes.find(item=>item.node.id==='output');
 assert.equal(before.textClock.startMs,800);assert.equal(during.textClock.startMs,800);assert.equal(during.textClock.elapsed-before.textClock.elapsed,1000);
 const changed={...config,nodeStates:[{nodeId:'quote',state:'hidden',atMs:0,durationMs:100},{nodeId:'quote',state:'active',atMs:8000,durationMs:500}]};
 const hidden=hubFlowState(scene,changed,6000).nodes.find(item=>item.node.id==='quote'),shown=hubFlowState(scene,changed,8001).nodes.find(item=>item.node.id==='quote');
 assert.equal(hidden.opacity,0);assert.equal(hidden.quoteLines[0].textClock.visible,false);assert.ok(shown.opacity>0);assert.equal(shown.quoteLines[0].textClock.startMs,8000);assert.equal(shown.quoteLines[0].textClock.elapsed,1);
 const call=renderCall(HubFlowScene,{scene,config:changed,elapsed:8001},config.quotedLineCues[0].lines[0].text);assert.equal(call.elapsed,1);assertVisiblePage(call,0);
 const projected=projectStoryboard([scene],[{id:'trim',src:scene.src,inSec:7,outSec:12,speed:2}],30)[0];assert.deepEqual(hubFlowState(projected,config,9000).nodes.map(item=>item.textClock),hubFlowState(scene,config,9000).nodes.map(item=>item.textClock));
});

test('topology birth and a later diagram reveal gate page clocks even when state or quote cues happen earlier',()=>{
 const changed={...config,nodeStates:[{nodeId:'later',state:'active',atMs:2000,durationMs:500}],matchToDiagram:{atMs:9000,durationMs:1000,from:{x:.1,y:0,width:.7,height:1},to:{x:.1,y:.5,width:.2,height:.3}}};
 const before=hubFlowState(scene,changed,3000),revealed=hubFlowState(scene,changed,9001);
 assert.equal(before.nodes.find(item=>item.node.id==='later').opacity,0,'a future topology member cannot leak through an early active event');
 for(const node of revealed.nodes){assert.equal(node.textClock.startMs,9000);assert.equal(node.textClock.elapsed,1);}
 assert.ok(revealed.diagramMix>0);const line=revealed.nodes.find(item=>item.node.id==='quote').quoteLines[0];assert.equal(line.textClock.startMs,9000);assert.equal(line.textClock.elapsed,1);
});

test('orbit replacement uses each item full visible window for both title and conditions, never the whole scene clock',()=>{
 const orbitScene={...scene,endMs:16000,nodes:[{id:'a',text:copy('甲'),detail:copy('甲条件'),focusMs:0},{id:'b',text:copy('乙'),detail:copy('乙条件'),focusMs:8000}]},orbit={kind:'orbit-flow-variant',openAtMs:1000,flowAtMs:2000};
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  setViewport(viewport);
  for(const text of [orbitScene.nodes[1].text,orbitScene.nodes[1].detail]){
   const first=renderCall(OrbitTransferScene,{scene:orbitScene,config:orbit,elapsed:8001},text);assert.equal(first.elapsed,1);assert.equal(first.duration,8000);assertVisiblePage(first,0);
   const pages=fitFor(first).pages.length,hold=8000/pages;assert.ok(hold>300);
   for(let page=0;page<pages;page++)assertVisiblePage(renderCall(OrbitTransferScene,{scene:orbitScene,config:orbit,elapsed:8000+(page+.5)*hold},text),page);
  }
 }
});
