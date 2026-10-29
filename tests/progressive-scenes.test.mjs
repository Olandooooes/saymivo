import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {progressiveUiState,progressiveUiIssues,progressivePageState,taskTracksState,taskTracksIssues,progressiveCompleteCopy} from '../src/progressive-scenes.mjs';

const scene={id:'synthetic',clipId:'voice',src:'clips/synthetic.mp4',startMs:0,endMs:20000,title:'按完整内容建立可复核流程',layout:'route',nodes:[{id:'voice',text:'完整口播稿',detail:'包括限制条件',bullets:['不能擅自省略']},{id:'visual',text:'资料画面'},{id:'edit',text:'人工核对结果'},{id:'image',text:'真实原图槽',detail:'来源说明保留',assetSrc:'broll-assets/synthetic.png'}]};
const ui={kind:'progressive-ui',sourceKind:'illustration',provenance:'original synthetic interface',elements:[{id:'a',nodeId:'voice',role:'field',atMs:0,fillAtMs:300,fillMs:2400,focusAtMs:300,focusMs:900},{id:'b',nodeId:'visual',role:'progress',atMs:3500,fillAtMs:3700,fillMs:1600,focusAtMs:3600,focusMs:1000,from:0,to:1,questionAtMs:5400},{id:'c',nodeId:'image',role:'image',atMs:6000,fillMs:1500}]};
const tracks={kind:'task-tracks',dataKind:'illustration',provenance:'original synthetic task diagram',domain:{start:0,end:10,unit:'相对时间'},rows:[{id:'row1',nodeId:'voice',segments:[{id:'v1',label:'完整录制与必要停顿',from:0,to:3,atMs:500,drawMs:1000}]},{id:'row2',nodeId:'visual',segments:[{id:'b1',label:'检索并核对真实资料',from:3,to:7,atMs:2000,drawMs:1000,fillAtMs:4000,fillMs:1000,questionAtMs:6500}]},{id:'row3',nodeId:'edit',segments:[{id:'e1',label:'整段复核剪口与上下文',from:7,to:10,atMs:5500,drawMs:1000}]}],cursor:{from:0,to:10,atMs:1000,durationMs:8000},calendar:{flipMs:600,values:[{value:5,label:'第五天',atMs:0},{value:14,label:'第十四天回顾',atMs:6000},{value:30,label:'第三十天复盘',atMs:12000}]}};

test('illustrative UI uses independent source onsets for focus, full-copy fill and explicit progress',()=>{
 assert.deepEqual(progressiveUiIssues(scene,ui),[]);const early=progressiveUiState(scene,ui,700),middle=progressiveUiState(scene,ui,4500),late=progressiveUiState(scene,ui,7000);
 assert.ok(early.elements[0].focus>0);assert.equal(early.elements[1].opacity,0);assert.equal(middle.elements[0].focus,0);assert.ok(middle.elements[1].focus>0&&middle.elements[1].value>0&&middle.elements[1].value<1);assert.equal(late.elements[1].value,1);assert.equal(late.elements[1].questionOpacity,1);assert.equal(late.elements[2].node.assetSrc,scene.nodes[3].assetSrc);
 assert.ok(late.elements[0].text.includes(scene.nodes[0].detail)&&late.elements[0].text.includes(scene.nodes[0].bullets[0]));assert.equal(late.automaticAllowed,false);assert.ok(late.disclosure.includes('不是具体产品录屏'));
 assert.ok(progressiveUiIssues(scene,{...ui,sourceKind:'recording'}).length);assert.ok(progressiveUiIssues(scene,{...ui,elements:[{...ui.elements[1],from:undefined}]}).some(issue=>issue.includes('显式')));assert.ok(progressiveUiIssues(scene,{...ui,elements:[{...ui.elements[2],nodeId:'visual'}]}).some(issue=>issue.includes('真实本地素材')));
});

test('each complete measured writing page has its own final hold and never measures a changing prefix',()=>{
 const pages=[['完整第一行','以及限制条件'],['完整第二页尾句']],first=progressivePageState(pages,1800,4000),second=progressivePageState(pages,3100,4000),end=progressivePageState(pages,5000,4000);
 assert.equal(first.pageIndex,0);assert.equal(first.phase,'hold');assert.equal(first.revealedGlyphs,[...pages[0].join('')].length);assert.equal(second.pageIndex,1);assert.ok(second.revealedGlyphs>0);assert.equal(end.revealedGlyphs,[...pages[1].join('')].length);assert.equal(progressivePageState(pages,-1,4000).revealedGlyphs,0);assert.equal(progressivePageState(pages,0,1000).insufficientDuration,true);
});

test('task tracks share an explicit time domain, draw before fill, move a real intermediate cursor and flip explicit calendar values',()=>{
 assert.deepEqual(taskTracksIssues(scene,tracks),[]);const draw=taskTracksState(scene,tracks,1000),fill=taskTracksState(scene,tracks,4500),flip=taskTracksState(scene,tracks,6300),end=taskTracksState(scene,tracks,14000);
 assert.ok(draw.rows[0].segments[0].draw>0&&draw.rows[0].segments[0].draw<1);assert.equal(draw.rows[1].segments[0].opacity,0);assert.equal(fill.rows[1].segments[0].draw,1);assert.ok(fill.rows[1].segments[0].fill>0&&fill.rows[1].segments[0].fill<1);assert.ok(fill.cursor.value>0&&fill.cursor.value<10);assert.equal(fill.rows[1].segments[0].x,.3);assert.equal(fill.rows[1].segments[0].width,.4);
 assert.equal(flip.calendar.prior.value,5);assert.equal(flip.calendar.current.value,14);assert.ok(flip.calendar.rotationDeg<0&&flip.calendar.rotationDeg>-180);assert.equal(end.calendar.current.value,30);assert.equal(end.calendar.rotationDeg,-180);assert.equal(end.rows[1].segments[0].questionOpacity,1);assert.ok(end.disclosure.includes('不是实测工时'));
 assert.ok(taskTracksIssues(scene,{...tracks,domain:{...tracks.domain,end:0}}).length);assert.ok(taskTracksIssues(scene,{...tracks,rows:[{...tracks.rows[0],segments:[{...tracks.rows[0].segments[0],to:11}]}]}).length);assert.ok(taskTracksIssues(scene,{...tracks,calendar:{values:[{value:14,label:'明示值',atMs:100},{value:5,label:'回顾',atMs:50}]}}).length);
});

test('horizontal/vertical layouts preserve all source copy and source phase after trimming and acceleration',()=>{
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
  assert.deepEqual(progressiveUiIssues(scene,ui,viewport),[]);for(const element of progressiveUiState(scene,ui,8000,viewport).elements)assert.ok(element.rect.x>=0&&element.rect.x+element.rect.width<=1&&element.rect.y+element.rect.height<=.86);
  const state=taskTracksState(scene,tracks,7000,viewport);assert.ok(state.rows.every(row=>row.rect.y+row.rect.height<=.86));assert.ok(state.rows[0].text.includes(scene.nodes[0].bullets[0]));
 }
 const projected=projectStoryboard([scene],[{id:'trim',src:scene.src,inSec:4,outSec:8,speed:2}],30)[0];assert.deepEqual(progressiveUiState(projected,ui,5000),progressiveUiState(scene,ui,5000));assert.deepEqual(taskTracksState(projected,tracks,5000),taskTracksState(scene,tracks,5000));
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64'),react=JSON.stringify(import.meta.resolve('react'));
const remotion=moduleUrl(`import React from ${react};let size={width:1920,height:1080};export const setViewport=s=>size=s;export const useVideoConfig=()=>size;export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const Img=p=>React.createElement('img',p);export const staticFile=s=>s;`);
const measured=moduleUrl(`import React from ${react};import {fitMeasuredText} from ${JSON.stringify(new URL('../src/text-fit.mjs',import.meta.url).href)};export const calls=[];export const MeasuredText=p=>{calls.push(p);return React.createElement('div',{'data-measured-full':p.text},p.text);};export const useMeasuredText=(text,width,height,options)=>{calls.push({text,width,height,...options});return {family:'synthetic',fit:fitMeasuredText(text,{width,height,...options,measure:(t,size)=>({width:[...t].length*size*.52,ascent:size*.8,descent:size*.2})})};};`);
const numeric=moduleUrl(`import React from ${react};export const calls=[];export const useStableGlyphLayout=()=>null;export const DisplayFontContext=React.createContext(undefined);export const StableNumberText=p=>{calls.push(p);return React.createElement('div',{'data-stable-number':p.text},p.text);};`);
const compiledCache=new Map();function compiled(file){const url=new URL(file,import.meta.url);if(compiledCache.has(url.href))return compiledCache.get(url.href);const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(({react:import.meta.resolve('react'),remotion,'./MeasuredText':measured,'./StableNumberText':numeric,'./StableGlyphLayout':numeric,'./DisplayFont':numeric,'./ProgressiveUiScene':file.includes('TaskTracks')?compiled('../src/ProgressiveUiScene.tsx'):undefined})[s]??new URL(s,url).href)}`);const output='data:text/javascript;base64,'+Buffer.from(source).toString('base64');compiledCache.set(url.href,output);return output;}
const {ProgressiveUiScene,RevealedMeasuredText}=await import(compiled('../src/ProgressiveUiScene.tsx')),{TaskTracksScene}=await import(compiled('../src/TaskTracksScene.tsx')),{setViewport}=await import(remotion),{calls:measureCalls}=await import(measured),{calls:numberCalls}=await import(numeric);

test('progressive text renders every full grapheme and keeps final text/geometry measurement stable while writing',()=>{
 const text='完整原句保留 spaces，不省略否定条件。'.repeat(10),samples=[];
 for(const elapsed of [0,1200,6000]){measureCalls.length=0;const html=renderToStaticMarkup(React.createElement(RevealedMeasuredText,{text,width:600,height:90,elapsed,writeMs:8000,minFont:25,maxFont:50}));samples.push(structuredClone(measureCalls));assert.ok(html.includes('data-full-glyph="不"')&&html.includes('data-full-glyph=" "'));assert.equal([...html.matchAll(/data-full-glyph="([^"]*)"/g)].map(match=>match[1]).join(''),text);const fit=fitMeasuredText(text,{width:600,height:90,minFont:25,maxFont:50,measure:(t,size)=>({width:[...t].length*size*.52,ascent:size*.8,descent:size*.2})});assert.ok(fit.pages.length>1);assert.ok(html.includes('data-writing-page='));}
 assert.deepEqual(samples[0],samples[1]);assert.deepEqual(samples[1],samples[2]);
});

test('legacy renderer calls without explicit complete-copy windows block instead of crediting hidden source strings',()=>{
 setViewport({width:1920,height:1080});for(const [Component,config] of [[ProgressiveUiScene,ui],[TaskTracksScene,tracks]]){const html=renderToStaticMarkup(React.createElement(Component,{scene,config,elapsed:7000}));assert.ok(html.includes('data-layout-status="blocked"'));assert.ok(html.includes('需要显式完整原文阅读窗口'));assert.ok(!html.includes('data-ui-element=')&&!html.includes('data-task-segment='));}
});

test('annotations are editable complete copy while illustration metadata does not become a fixed production label',()=>{
 const note='这一行由作者按内容决定是否保留';for(const config of [ui,tracks]){const plain=progressiveCompleteCopy(scene,config),explicit=progressiveCompleteCopy(scene,{...config,annotation:note});assert.ok(explicit.includes(note));assert.ok(!plain.includes('概念示意')&&!plain.includes('口述整理')&&!plain.includes('非实际运行')&&!plain.includes('非实测工时'));}
});
