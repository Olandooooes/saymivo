import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {flipBoardPages,flipBoardState,counterState,counterMeasurementSpec,evidenceHandoffState,glassCapsuleState,orbitFlowState,dynamicMechanismIssues,barGroupState,barGroupIssues} from '../src/dynamic-mechanisms.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';

const scene={id:'synthetic',clipId:'source',src:'clips/synthetic.mp4',startMs:0,endMs:12000,layout:'cards',title:'先查证据，再说结论',nodes:[{id:'first',text:'不代表任何软件都能复制',detail:'AI Agent preserves spaces',atMs:0,assetSrc:'broll-assets/synthetic-a.svg'},{id:'second',text:'完整标题与附加条件',bullets:['最后需要验证'],atMs:6000,assetSrc:'broll-assets/synthetic-b.svg'}]};

test('split-flap pages preserve every grapheme and space, roll individual tiles, and hold every full page',()=>{
 const config={kind:'flip-board',columns:12,rows:4},board=flipBoardPages(scene,config);
 assert.equal(board.pages.flatMap(page=>page.lines).map(line=>line.glyphs.join('')).join(''),board.entries.map(entry=>entry.text.replaceAll('\n','')).join(''));
 assert.ok(board.pages.every(page=>page.cells.length<=48));assert.ok(board.pages.length>=2);
 const middle=flipBoardState(scene,config,70);assert.ok(middle.cells.some(cell=>cell.rotationDeg<0&&cell.rotationDeg>-180));assert.ok(middle.cells.some(cell=>!cell.settled));
 const first=flipBoardState(scene,config,0);
 for(let i=0;i<board.pages.length;i++){
  const held=flipBoardState(scene,config,i*first.pageMs+first.fillMs+100);assert.equal(held.pageIndex,i);assert.equal(held.phase,'hold');assert.ok(held.holdMs>=1200);assert.ok(held.cells.every(cell=>cell.settled&&cell.frontGlyph===cell.finalGlyph));assert.equal(held.opacity,1);
 }
 assert.deepEqual(dynamicMechanismIssues(scene,config),[]);assert.ok(dynamicMechanismIssues({...scene,endMs:1400},config).some(issue=>issue.includes('停留')));assert.throws(()=>flipBoardPages(scene,{columns:0}));
 const timed={...config,rows:8,nodeAtMs:{first:0,second:2000}},early=flipBoardState(scene,timed,1500),later=flipBoardState(scene,timed,3500);assert.ok(early.cells.filter(cell=>cell.nodeId==='first').every(cell=>cell.settled));assert.ok(early.cells.filter(cell=>cell.nodeId==='second'&&cell.finalGlyph!==' ').every(cell=>cell.frontGlyph===' '));assert.ok(later.cells.every(cell=>cell.settled));assert.ok(dynamicMechanismIssues(scene,{...timed,nodeAtMs:{second:11500}}).some(issue=>issue.includes('完整停留')));
});

test('explicit counters progress through intermediate values with one stable final/max measurement specification',()=>{
 const config={kind:'number-counter',from:9,to:1332,unit:'万',grouping:true,atMs:500,countMs:2000},states=[500,800,1200,1600,2100,2500,8000].map(time=>counterState(scene,config,time));
 assert.equal(states[0].text,'9');assert.equal(states.at(-1).text,'1,332');assert.ok(states.slice(1,-2).every(s=>s.value>9&&s.value<1332));assert.ok(states.every((s,index)=>!index||s.value>=states[index-1].value));
 for(const state of states)assert.deepEqual(state.measurement,counterMeasurementSpec(config));assert.equal(states.at(-1).measurement.numericSlots,5);assert.equal(states.at(-1).phase,'hold');
 assert.ok(dynamicMechanismIssues(scene,{kind:'number-counter'}).some(issue=>issue.includes('起止')));assert.ok(dynamicMechanismIssues(scene,{kind:'number-counter',from:100,to:1}).some(issue=>issue.includes('下降')));
});

const handoff={kind:'evidence-handoff',cues:[{nodeId:'first',atMs:1000,travelMs:600,holdMs:1300,returnMs:600},{nodeId:'second',atMs:5000,travelMs:600,holdMs:1300,returnMs:600}]};
test('evidence leaves its own row along a growing path while board and person recompose, then returns to overview',()=>{
 assert.deepEqual(dynamicMechanismIssues(scene,handoff),[]);
 const overview=evidenceHandoffState(scene,handoff,0),start=evidenceHandoffState(scene,handoff,1001),travel=evidenceHandoffState(scene,handoff,1300),focus=evidenceHandoffState(scene,handoff,2000),ret=evidenceHandoffState(scene,handoff,3200),returned=evidenceHandoffState(scene,handoff,4000),next=evidenceHandoffState(scene,handoff,5001);
 assert.equal(overview.phase,'overview');assert.equal(travel.phase,'travel');assert.equal(focus.phase,'focus');assert.equal(ret.phase,'return');assert.equal(returned.phase,'overview');
 assert.equal(focus.activeNodeId,'first');assert.equal(next.activeNodeId,'second');assert.notEqual(start.cardRect.x,next.cardRect.x);assert.ok(travel.cardRect.width>start.cardRect.width&&travel.cardRect.width<focus.cardRect.width);
 assert.notDeepEqual(overview.boardRect,focus.boardRect);assert.notDeepEqual(overview.speakerRect,focus.speakerRect);assert.deepEqual(returned.boardRect,overview.boardRect);assert.deepEqual(returned.speakerRect,overview.speakerRect);
 assert.ok(focus.items.every(item=>item.media.src===scene.nodes.find(node=>node.id===item.node.id).assetSrc));
 assert.ok(dynamicMechanismIssues({...scene,nodes:scene.nodes.map(({assetSrc,...node})=>node)},handoff).some(issue=>issue.includes('媒体')));
 assert.ok(dynamicMechanismIssues(scene,{...handoff,cues:[...handoff.cues,{nodeId:'first',atMs:6000}]}).some(issue=>issue.includes('重叠')));
});

test('matching the actor to the next live shot precedes graphics exit and preserves a real overlap interval',()=>{
 const config={...handoff,matchToLive:{atMs:7400,durationMs:1000,to:{x:.16,y:0,width:.68,height:1},backgroundDelayMs:250,backgroundFadeMs:450,graphicsDelayMs:350,graphicsFadeMs:450}};
 assert.deepEqual(dynamicMechanismIssues(scene,config),[]);
 const before=evidenceHandoffState(scene,config,7400),early=evidenceHandoffState(scene,config,7550),overlap=evidenceHandoffState(scene,config,7900),done=evidenceHandoffState(scene,config,8500);
 assert.equal(early.backgroundMix,0);assert.notDeepEqual(early.speakerRect,before.speakerRect);assert.equal(early.oldGraphicsOpacity,1);
 assert.ok(overlap.backgroundMix>0&&overlap.backgroundMix<1);assert.ok(overlap.oldGraphicsOpacity>0&&overlap.oldGraphicsOpacity<1);assert.equal(overlap.phase,'match-to-live');assert.equal(done.phase,'live');assert.deepEqual(done.speakerRect,config.matchToLive.to);assert.equal(done.oldGraphicsOpacity,0);assert.equal(done.backgroundMix,1);assert.equal(done.requiresRealCutout,true);
});

test('capsules enter at distinct spoken onsets, retain earlier labels and leave as a group without automatic face approval',()=>{
 const config={kind:'glass-capsules',atMs:[0,2000],endMs:10000,outMs:600},first=glassCapsuleState(scene,config,900),second=glassCapsuleState(scene,config,3000),out=glassCapsuleState(scene,config,9700),gone=glassCapsuleState(scene,config,10000);
 assert.equal(first.items[0].opacity,1);assert.equal(first.items[1].opacity,0);assert.ok(second.items.every(item=>item.opacity===1));assert.ok(out.items.every(item=>item.opacity>0&&item.opacity<1));assert.ok(gone.items.every(item=>item.opacity===0));assert.equal(second.automaticAllowed,false);assert.equal(second.requiresFaceReview,true);assert.ok(second.items.every(item=>item.rect.y+item.rect.height<=.86));
});

test('all standalone mechanisms preserve source phase and duration through trimmed, accelerated projection',()=>{
 const projected=projectStoryboard([scene],[{id:'trim',src:scene.src,inSec:2,outSec:4,speed:2}],30)[0];
 for(const elapsed of [2100,3200,6500]){
  assert.deepEqual(flipBoardState(projected,{kind:'flip-board'},elapsed),flipBoardState(scene,{kind:'flip-board'},elapsed));
  assert.deepEqual(counterState(projected,{kind:'number-counter',from:0,to:10},elapsed),counterState(scene,{kind:'number-counter',from:0,to:10},elapsed));
  assert.deepEqual(evidenceHandoffState(projected,handoff,elapsed),evidenceHandoffState(scene,handoff,elapsed));
 }
});

test('opt-in orbit phases are closed, then open, then a directional point stream; old preset is not changed',()=>{
 const config={kind:'orbit-flow-variant',openAtMs:1000,openMs:500,flowAtMs:1700,flowMs:800},closed=orbitFlowState(config,500),open=orbitFlowState(config,1250),flow=orbitFlowState(config,2000),done=orbitFlowState(config,3000);
 assert.equal(closed.phase,'closed');assert.equal(closed.gapDegrees,0);assert.equal(open.phase,'opening');assert.ok(open.gapDegrees>0&&open.gapDegrees<76);assert.equal(flow.phase,'point-flow');assert.ok(flow.dots.some((dot,index)=>dot.x!==closed.dots[index].x));assert.ok(done.dots.every(dot=>Math.abs(dot.x-.77)<1e-10&&Math.abs(dot.y-.43)<1e-10));
});

test('bar-group variant shares an explicit zero-based scale, grows sequentially and refuses invented or incomparable data',()=>{
 const config={kind:'bar-group-variant',scale:{min:0,max:2000},unit:'次',items:[{nodeId:'first',from:0,to:1500,atMs:500,countMs:1500},{nodeId:'second',from:0,to:600,atMs:2500,countMs:1500}]};
 assert.deepEqual(barGroupIssues(scene,config),[]);const middle=barGroupState(scene,config,1000),later=barGroupState(scene,config,3500),done=barGroupState(scene,config,5000);assert.ok(middle.items[0].fraction>0);assert.equal(middle.items[1].fraction,0);assert.equal(later.items[0].fraction,.75);assert.ok(later.items[1].fraction>0&&later.items[1].fraction<.3);assert.equal(done.items[1].fraction,.3);assert.equal(done.items[0].label,scene.nodes[0].text);
 assert.ok(barGroupIssues(scene,{...config,scale:undefined}).length);assert.ok(barGroupIssues(scene,{...config,items:[{nodeId:'first',to:1500}]}).length);
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64');
const react=JSON.stringify(import.meta.resolve('react'));
const fakeGlyph=moduleUrl(`export const calls=[];export const useStableGlyphLayout=props=>{calls.push(props);return {fontSize:90,family:'sans-serif',advance:60,unitWidth:130,rowHeight:110,unplaceable:false};};`);
const fakeMeasured=moduleUrl(`import React from ${react};export const calls=[];export const MeasuredText=props=>{calls.push(props);return React.createElement('div',{'data-complete-text':props.text},props.text);};`);
const remotion=moduleUrl(`import React from ${react};export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const staticFile=s=>s;export const Img=props=>React.createElement('img',props);`);
const sceneMedia=moduleUrl(`import React from ${react};export const SceneMedia=props=>React.createElement('div',{'data-real-media':props.scene.media.src});`);
const rendererUrl=new URL('../src/DynamicMechanismScene.tsx',import.meta.url),mocks={remotion,'./StableGlyphLayout':fakeGlyph,'./SourceCopyWindow':moduleUrl(`import React from ${react};export const useDynamicGraphicsVisibility=()=>true;export const SourceCopyWindow=({children})=>React.createElement(React.Fragment,null,children);`),'./MeasuredText':fakeMeasured,'./SceneMedia':sceneMedia,'./DynamicDiagramScene':moduleUrl('export const OrbitTransferScene=()=>null;export const BarGroupScene=()=>null;export const HubFlowScene=()=>null;'),'./ScreenshotFocusScene':moduleUrl('export const ScreenshotFocusScene=()=>null;'),'./BilingualBoardScene':moduleUrl('export const BilingualBoardScene=()=>null;')};
const rendererSource=ts.transpileModule(fs.readFileSync(rendererUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(mocks[s]??(s.startsWith('.')?new URL(s,rendererUrl).href:import.meta.resolve(s)))}`);
const renderer=await import('data:text/javascript;base64,'+Buffer.from(rendererSource).toString('base64'));

test('counter rendering never sends per-frame value text to a measuring hook or blanks intermediate digits',async()=>{
 const {calls}=await import(fakeGlyph),config={kind:'number-counter',from:0,to:1332,unit:'万',countMs:2200};calls.length=0;
 const htmls=[200,500,900,1500,2400,6000].map(elapsed=>renderToStaticMarkup(React.createElement(renderer.NumberCounterScene,{scene,config,elapsed})));
 assert.ok(htmls.every(html=>html.includes('data-counter-value=')&&html.includes('万')));for(const call of calls)assert.deepEqual(call,calls[0]);assert.ok(htmls[0]!==htmls[2]);assert.deepEqual(calls[0].samples,counterMeasurementSpec(config).samples);
});

test('handoff scales a stable whole card and board, keeping text local; matched live transition requires actual cutout capability',async()=>{
 const {calls}=await import(fakeMeasured),measures=[];
 for(const elapsed of [1100,1400,2200]){calls.length=0;const html=renderToStaticMarkup(React.createElement(renderer.EvidenceHandoffScene,{scene,config:handoff,elapsed}));assert.ok(html.includes('data-handoff-board')&&html.includes('data-focus-evidence="first"')&&html.includes('data-real-media="broll-assets/synthetic-a.svg"'));measures.push(calls.map(call=>({text:call.text,width:call.width,height:call.height})));}
 assert.deepEqual(measures[0],measures[1]);assert.deepEqual(measures[1],measures[2]);
 const config={...handoff,matchToLive:{atMs:7400,to:{x:.1,y:0,width:.8,height:1}}};
 const missing=renderToStaticMarkup(React.createElement(renderer.DynamicMechanismScene,{scene,config,elapsed:7900}));assert.ok(missing.includes('real-cutout-and-live-background-required'));
 const complete=renderToStaticMarkup(React.createElement(renderer.DynamicMechanismScene,{scene,config,elapsed:7900,hasRealCutout:true,liveBackground:React.createElement('div',{'data-synthetic-live':'true'}),renderSpeaker:()=>React.createElement('div',{'data-synthetic-cutout':'true'})}));assert.ok(complete.includes('data-synthetic-live')&&complete.includes('data-handoff-speaker="real-cutout"'));
});
