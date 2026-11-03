import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectStoryboard,storyboardFrameRange} from '../src/storyboard.mjs';
import {fieldRollCompleteCopy,fieldRollBoardIssues as actualIssues,fieldRollBoardReadiness as actualReadiness,fieldRollBoardState,fieldRollElapsedAtFrame,fieldRollMeasurementKey,measureFieldRollBoard} from '../src/field-roll-board.mjs';

const viewport={width:1920,height:1080};
const scene={id:'synthetic-roll',clipId:'voice',src:'clips/synthetic.mp4',startMs:1000,endMs:17000,title:'保留原文',body:'无实测',layout:'slide',nodes:[{id:'category',text:'教程',detail:'完整条件',bullets:['不漏否定']},{id:'language',text:'中'}]};
const config={kind:'field-roll-board',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:1000,endMs:17000},copyWindow:{atMs:0,endMs:4000,rect:{x:.05,y:.2,width:.7,height:.6}},titleRect:{x:.05,y:.04,width:.7,height:.1},speakerRect:{x:.82,y:.33,width:.15,height:.24},cards:[{id:'same-card',rect:{x:.05,y:.2,width:.7,height:.45},enterAtMs:4000,enterMs:400,exitAtMs:14000,exitMs:400,fields:[{id:'category',sourceRef:'node:category:text',label:'Category',from:'教程',to:'Tutorial',rect:{x:.07,y:.29,width:.65,height:.08},labelRect:{x:.07,y:.225,width:.65,height:.05},rollAtMs:7500,cellRollMs:350,staggerMs:30,direction:'up',provenance:{kind:'translation',citation:'Synthetic authored pair, not service execution',fromLanguage:'zh',toLanguage:'en'}},{id:'language',sourceRef:'node:language:text',label:'Language',from:'中',to:'EN',rect:{x:.07,y:.51,width:.15,height:.07},labelRect:{x:.07,y:.42,width:.65,height:.05},rollAtMs:9000,cellRollMs:350,staggerMs:30,direction:'down',provenance:{kind:'format',citation:'Explicit synthetic display-format pair'}}]}]};
const clone=x=>structuredClone(x);
const glyphs=s=>[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(s)].map(x=>x.segment);
const measure=(value,size)=>({width:glyphs(value).length*size*.65,ascent:size*.82,descent:size*.2,left:size*.08,right:glyphs(value).length*size*.65});
const measurement=(s=scene,c=config,v=viewport)=>measureFieldRollBoard(s,c,v,'synthetic-font',measure);
const proofFor=s=>({rawScene:s,clips:[{id:s.clipId,src:s.src,inSec:s.startMs/1000,outSec:s.endMs/1000,speed:1}],fps:30,captions:[]});
const fieldRollBoardIssues=(s,c,v=viewport,p)=>actualIssues(s,c,v,p?{captions:[],...p}:proofFor(s));
const fieldRollBoardReadiness=(s,c,m,v=viewport,p)=>actualReadiness(s,c,m,v,p?{captions:[],...p}:proofFor(s));

test('stable board preserves complete source inventory and supplied pairs without translating or counting',()=>{
 const before=clone(scene),saved=clone(config);
 assert.deepEqual(fieldRollBoardIssues(scene,config),[]);
 const ready=fieldRollBoardReadiness(scene,config,measurement());assert.equal(ready.status,'ready',ready.issues.join(';'));
 const copy=fieldRollCompleteCopy(scene);for(const value of ['保留原文','无实测','教程','完整条件','不漏否定','中'])assert.ok(copy.includes(value));
 for(const elapsed of [0,4500,7600,10000,14300])fieldRollBoardState(scene,config,elapsed);
 assert.deepEqual(scene,before);assert.deepEqual(config,saved);
});
test('glyphs slide in individual masks while the same card and other fields remain stable',()=>{
 const old=fieldRollBoardState(scene,config,7400),mid=fieldRollBoardState(scene,config,7675),done=fieldRollBoardState(scene,config,8100);
 for(const state of [old,mid,done])assert.equal(state.cards[0].id,'same-card');
 assert.deepEqual(old.cards[0].rect,mid.cards[0].rect);assert.equal(old.cards[0].fields[0].readableValue,'教程');
 const f=mid.cards[0].fields[0];assert.equal(f.phase,'rolling');assert.equal(f.completeReadable,false);assert.equal(f.readableValue,null);assert.ok(f.cells[0].fromY<0&&f.cells[0].fromY>-1);assert.ok(f.cells[0].toY>0&&f.cells[0].toY<1);assert.notEqual(f.cells[0].progress,f.cells[1].progress);
 assert.equal(mid.cards[0].fields[1].readableValue,'中');assert.equal(done.cards[0].fields[0].readableValue,'Tutorial');assert.equal(done.cards[0].fields[0].completeReadable,true);
 const down=fieldRollBoardState(scene,config,9175).cards[0].fields[1];assert.ok(down.cells[0].fromY>0&&down.cells[0].toY<0);
});
test('full old/new read holds exclude card entry, glyph motion and card exit',()=>{
 assert.equal(fieldRollBoardState(scene,config,4200).cards[0].fields[0].completeReadable,false);
 assert.equal(fieldRollBoardState(scene,config,4400).cards[0].fields[0].completeReadable,true);
 assert.equal(fieldRollBoardState(scene,config,8000).cards[0].fields[0].completeReadable,false);
 assert.equal(fieldRollBoardState(scene,config,8060).cards[0].fields[0].completeReadable,true);
 assert.equal(fieldRollBoardState(scene,config,14100).cards[0].fields[0].completeReadable,false);
 assert.equal(fieldRollBoardState(scene,config,14400).cards[0].visible,false);
});
test('grapheme slots preserve combining marks, ZWJ emoji, spaces and unequal lengths without slicing UTF-16',()=>{
 const s=clone(scene),c=clone(config);s.nodes[0].text='a\u0301 👩🏽‍💻';c.cards[0].fields[0].from=s.nodes[0].text;c.cards[0].fields[0].to='👩🏽‍💻 no';
 const before=fieldRollBoardState(s,c,7000).cards[0].fields[0],after=fieldRollBoardState(s,c,8500).cards[0].fields[0];
 assert.equal(before.cells.map(x=>x.from).join(''),s.nodes[0].text);assert.equal(after.cells.map(x=>x.to).join(''),'👩🏽‍💻 no');assert.equal(before.cells[0].from,'a\u0301');assert.ok(before.cells.some(x=>x.from==='👩🏽‍💻'));assert.ok(before.cells.some(x=>x.from===' '));
 assert.equal(measurement(s,c).fields[0].slots,4);assert.deepEqual(fieldRollBoardIssues(s,c),[]);
});
test('missing source, changed original value, invented intermediate data and absent provenance block',()=>{
 for(const edit of [c=>{c.cards[0].fields[0].sourceRef='missing';},c=>{c.cards[0].fields[0].from='截短';},c=>{c.cards[0].fields[0].provenance.citation='';},c=>{c.cards[0].fields[0].provenance.toLanguage='zh';},c=>{c.cards[0].fields[0].intermediateValues=['FR','DE'];},c=>{c.cards[0].fields[0].counter={from:0,to:100};},c=>{c.cards[0].fields[1].id='category';}]){const c=clone(config);edit(c);assert.ok(fieldRollBoardIssues(scene,c).length);}
 const c=clone(config);c.cards[0].fields[0].to='A\nB';assert.ok(fieldRollBoardIssues(scene,c).some(i=>i.includes('full-original')));
});
test('all glyphs including ink overhang, ascent/descent and field text must be measured under current font',()=>{
 assert.equal(fieldRollBoardReadiness(scene,config,null).status,'waiting');
 const complete=measurement();assert.equal(fieldRollBoardReadiness(scene,config,complete).status,'ready');
 const missing=clone(complete);missing.fields[0].metrics.pop();assert.equal(fieldRollBoardReadiness(scene,config,missing).status,'blocked');
 const unmeasured=clone(complete);unmeasured.fields.pop();assert.equal(fieldRollBoardReadiness(scene,config,unmeasured).status,'waiting');
 const stale=clone(complete);stale.fontKey='changed';assert.equal(fieldRollBoardReadiness(scene,config,stale).status,'blocked');
 const lost=clone(complete);lost.texts[0].fit.pages=[['保留']];assert.equal(fieldRollBoardReadiness(scene,config,lost).status,'blocked');
 assert.throws(()=>measureFieldRollBoard(scene,config,viewport,'font',()=>({width:10,ascent:10,descent:2})),/complete-glyph-metrics/);
 const ink=measureFieldRollBoard(scene,config,viewport,'ink-font',(s,size)=>({...measure(s,size),left:size*.7,right:size*1.1}));
 assert.ok(ink.fields[0].advance>=ink.fields[0].fontSize*1.8+1.99);
 const bad=clone(ink);bad.fields[0].advance=bad.fields[0].fontSize*.7;assert.equal(fieldRollBoardReadiness(scene,config,bad).status,'blocked');
});
test('long final strings block at minimum measured capacity rather than truncate or shrink endlessly',()=>{
 const c=clone(config);c.cards[0].fields[0].to='W'.repeat(100);const m=measurement(scene,c);
 assert.equal(m.fields[0].to.length,100);assert.equal(m.fields[0].unplaceable,true);assert.equal(fieldRollBoardReadiness(scene,c,m).status,'blocked');
 const c2=clone(config);c2.cards[0].fields[0].rollAtMs=4800;assert.ok(fieldRollBoardReadiness(scene,c2,measurement(scene,c2)).issues.some(i=>i.includes('reading-time-insufficient')));
});
test('source bounds and per-instance speed govern reading time, not preview playback or a frame accumulator',()=>{
 const clips=[{id:'first',src:scene.src,inSec:1,outSec:17,speed:1},{id:'again',src:scene.src,inSec:1,outSec:17,speed:1}],proof={rawScene:scene,clips,fps:30},instances=projectStoryboard([scene],clips,30);
 assert.equal(instances.length,2);
 for(const p of instances){assert.deepEqual(fieldRollBoardIssues(p,config,viewport,proof),[]);assert.equal(fieldRollBoardReadiness(p,config,measurement(p),viewport,proof).status,'ready');const r=storyboardFrameRange(p,30);assert.equal(fieldRollElapsedAtFrame(p,r.from+225,30),7500);assert.deepEqual(fieldRollBoardState(p,config,fieldRollElapsedAtFrame(p,r.from+225,30)),fieldRollBoardState(p,config,7500));}
 const forged={...instances[0],id:instances[1].id,clipId:instances[1].clipId};assert.ok(fieldRollBoardIssues(forged,config,viewport,proof).some(i=>i.includes('projection-mismatch')));
 for(const speed of [.5,2]){const cs=[{id:'cut',src:scene.src,inSec:7,outSec:16,speed}],p=projectStoryboard([scene],cs,30)[0],r=storyboardFrameRange(p,30);assert.equal(fieldRollElapsedAtFrame(p,r.from,30),6000);assert.equal(fieldRollElapsedAtFrame(p,r.from+30,30),6000+1000*speed);assert.equal(fieldRollBoardReadiness(p,config,measurement(p),viewport,{rawScene:scene,clips:cs,fps:30}).status,'blocked');}
 const fastClips=[{id:'fast',src:scene.src,inSec:1,outSec:17,speed:5}],fast=projectStoryboard([scene],fastClips,30)[0];assert.equal(fieldRollBoardReadiness(fast,config,measurement(fast),viewport,{rawScene:scene,clips:fastClips,fps:30}).status,'blocked');
 const start=storyboardFrameRange(instances[0],30).from;assert.throws(()=>fieldRollElapsedAtFrame(instances[0],start-1,30),/outside-retained/);assert.equal(fieldRollElapsedAtFrame(instances[0],start+225,30),7500);assert.equal(fieldRollElapsedAtFrame(instances[0],start+10,30),1000/3);
});
test('caption band, complete person path and cross-field/card overlaps refuse unsafe layout',()=>{
 for(const edit of [c=>{c.speakerRect.x=.7;},c=>{c.cards[0].rect.y=.7;},c=>{c.cards[0].fields[0].labelRect.y=.3;},c=>{c.protectedAreas=[{rect:{x:.1,y:.25,width:.1,height:.1}}];},c=>{c.cards[0].fields[1].rect={...c.cards[0].fields[0].rect};}]){const c=clone(config);edit(c);assert.ok(fieldRollBoardIssues(scene,c).length);}
 const moving={...scene,window:{x:.82,y:.33,size:.1,keyframes:[{atMs:7000,x:.01,y:.33,size:.1}]}};assert.ok(fieldRollBoardIssues(moving,config).some(i=>i.includes('person-or-subtitle')));
 const media={...scene,media:{src:'broll-assets/synthetic.png',kind:'image'}};assert.ok(fieldRollBoardIssues(media,config).some(i=>i.includes('cannot-discard-existing-media')));
});
test('live caption inventory is explicit and actual placed/held caption bands block even after glyphs were measured',()=>{
 assert.ok(actualIssues(scene,config,viewport).some(i=>i.includes('projection-required')));
 const p=proofFor(scene);delete p.captions;assert.ok(actualIssues(scene,config,viewport,p).includes('field-roll-explicit-current-caption-inventory-required'));
 p.captions=[{clipId:'voice',startMs:9000,endMs:10000,topPct:90,holdMs:700}];assert.deepEqual(actualIssues(scene,config,viewport,p),[]);
 p.captions[0].topPct=50;assert.ok(actualIssues(scene,config,viewport,p).includes('field-roll-text-crosses-person-or-subtitle-envelope'));assert.equal(actualReadiness(scene,config,measurement(),viewport,p).status,'blocked');
 p.captions=[{startMs:8000,endMs:9000,topPct:50,holdMs:700}];assert.ok(actualIssues(scene,config,viewport,p).some(i=>i.includes('subtitle-envelope')),'legacy cues are output clock');
 p.captions=[{clipId:'absent',startMs:8000,endMs:9000,topPct:90}];assert.ok(actualIssues(scene,config,viewport,p).includes('field-roll-explicit-current-caption-inventory-required'));
});
test('portrait measures its real output capacity and fractional source starts use actual first composition frame',()=>{
 const portrait={width:1080,height:1920};assert.equal(fieldRollBoardReadiness(scene,config,measurement(scene,config,portrait),portrait).status,'ready');
 const s={...scene,startMs:1000.5,endMs:17000.5},c=clone(config);c.binding.startMs=s.startMs;c.binding.endMs=s.endMs;
 const clips=[{id:'lead',src:'clips/other.mp4',inSec:0,outSec:.05,speed:1},{id:'voice',src:s.src,inSec:1.0005,outSec:17.0005,speed:1}],p=projectStoryboard([s],clips,30)[0],r=storyboardFrameRange(p,30);
 assert.equal(r.from,2);assert.ok(Math.abs(fieldRollElapsedAtFrame(p,r.from,30))<1e-8);assert.ok(Math.abs(fieldRollElapsedAtFrame(p,r.from+225,30)-7500)<1e-8);assert.deepEqual(actualIssues(p,c,viewport,{rawScene:s,clips,fps:30,captions:[]}),[]);
});
test('key excludes elapsed seek but changes for complete content, source SHA, font, geometry and timing',()=>{
 const before=fieldRollMeasurementKey(scene,config,viewport,'font');
 for(const [s,c,v,f] of [[{...scene,body:'改动原文'},config,viewport,'font'],[scene,{...config,binding:{...config.binding,sha256:'b'.repeat(64)}},viewport,'font'],[scene,config,{width:1080,height:1920},'font'],[scene,config,viewport,'new-font']])assert.notEqual(fieldRollMeasurementKey(s,c,v,f),before);
 const c=clone(config);c.cards[0].fields[0].rollAtMs+=100;assert.notEqual(fieldRollMeasurementKey(scene,c,viewport,'font'),before);
});

// Execute the actual independent drawing under synthetic metrics. No font or
// browser pixel acceptance is implied; no current app imports this component.
const url=new URL('../src/FieldRollBoardScene.tsx',import.meta.url),react=JSON.stringify(import.meta.resolve('react'));
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const remotion=moduleUrl(`import React from ${react};export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const cancelRender=()=>{};export const continueRender=()=>{};export const delayRender=()=>1;`);
const font=moduleUrl(`import React from ${react};export const DisplayFontContext=React.createContext('none');export const loadDisplayFont=()=>Promise.resolve();`);
const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='remotion'?remotion:s==='./DisplayFont'?font:s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
const {FieldRollBoardGraphics,FieldRollBoardScene}=await import(moduleUrl(source));
const drawing=elapsed=>renderToStaticMarkup(React.createElement(FieldRollBoardGraphics,{scene,config,elapsed,measurement:measurement(),family:'Synthetic'}));
test('actual JSX keeps whole source-copy, stable fields, literal cells and clipping; never rotates the whole card or adds sound',()=>{
 const copy=drawing(1000);for(const value of ['保留原文','完整条件','不漏否定'])assert.ok(copy.includes(value));assert.ok(copy.includes('data-field-roll-complete-source-copy="true"'));
 const before=drawing(7400),moving=drawing(7675),after=drawing(8100);for(const html of [before,moving,after]){assert.ok(html.includes('data-field-roll-card="same-card"'));assert.ok(html.includes('data-field-roll-id="category"'));assert.ok(html.includes('overflow:hidden'));assert.ok(!html.includes('rotateX')&&!html.includes('rotateY')&&!html.includes('<audio')&&!html.includes('<video'));}
 assert.ok(moving.includes('data-field-roll-phase="rolling"'));assert.ok(moving.includes('data-field-roll-complete-readable="false"'));assert.ok(!moving.includes('data-field-roll-readable-value="Tutorial"'));assert.ok(after.includes('data-field-roll-readable-value="Tutorial"'));
});
test('native component blocks absent/foreign/empty source slots and waits for actual font measurements',()=>{
 const proof={kind:'same-source-video',...config.binding};
 for(const extra of [{},{speakerProof:{...proof,sha256:'b'.repeat(64)},renderSpeaker:()=>React.createElement('video')},{speakerProof:proof,renderSpeaker:()=>null}])assert.ok(renderToStaticMarkup(React.createElement(FieldRollBoardScene,{scene,config,elapsed:7400,...extra})).includes('data-field-roll-status="blocked"'));
 const waiting=renderToStaticMarkup(React.createElement(FieldRollBoardScene,{scene,config,elapsed:7400,projectionProof:proofFor(scene),speakerProof:proof,renderSpeaker:()=>React.createElement('video',{'data-test-real-source':'true'})}));assert.ok(waiting.includes('data-field-roll-status="waiting"'));assert.ok(waiting.includes('data-test-real-source'));assert.ok(!waiting.includes('data-field-roll-card="same-card"'));
});

const hookedReact=moduleUrl(`import React from ${react};export default React;export const useContext=()=>globalThis.__fieldRoll.font;export const useState=()=>[globalThis.__fieldRoll.measurement,value=>globalThis.__fieldRoll.sets.push(value)];export const useLayoutEffect=callback=>globalThis.__fieldRoll.effects.push(callback);`);
const hookedFont=moduleUrl(`export const DisplayFontContext={};export const loadDisplayFont=()=>globalThis.__fieldRoll.fontPromise;`);
const nativeSource=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='react'?hookedReact:s==='remotion'?remotion:s==='./DisplayFont'?hookedFont:s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
const {FieldRollBoardScene:NativeFieldRoll}=await import(moduleUrl(nativeSource));
test('real component measurement waits for font promise, measures all glyph ink, rejects stale font paint and ignores obsolete completion',async()=>{
 const originalDocument=globalThis.document,seen=[];let resolveFont;
 const fontPromise=new Promise(resolve=>{resolveFont=resolve;});
 globalThis.__fieldRoll={font:'none',measurement:null,sets:[],effects:[],fontPromise};
 globalThis.document={createElement:()=>({getContext:()=>({font:'',measureText:value=>{seen.push(value);return {width:glyphs(value).length*20,actualBoundingBoxAscent:20,actualBoundingBoxDescent:5,actualBoundingBoxLeft:3,actualBoundingBoxRight:glyphs(value).length*20+2};}})})};
 const props={scene,config,elapsed:7400,projectionProof:proofFor(scene),speakerProof:{kind:'same-source-video',...config.binding},renderSpeaker:()=>React.createElement('video'),onReadiness:r=>globalThis.__fieldRoll.readiness.push(r)};
 globalThis.__fieldRoll.readiness=[];
 try{
  const waiting=renderToStaticMarkup(React.createElement(NativeFieldRoll,props));assert.ok(waiting.includes('data-field-roll-status="waiting"'));
  const cleanups=globalThis.__fieldRoll.effects.splice(0).map(effect=>effect());assert.equal(seen.length,0,'no Canvas measurement before loaded font resolves');
  resolveFont();await Promise.resolve();await Promise.resolve();
  const measured=globalThis.__fieldRoll.sets.at(-1);assert.ok(measured);for(const g of new Set(glyphs('教程Tutorial中EN')))assert.ok(seen.includes(g),g);
  assert.equal(measured.fields[0].metrics.find(g=>g.glyph==='T').left,3);assert.ok(measured.fields[0].advance>=25);
  globalThis.__fieldRoll.measurement=measured;globalThis.__fieldRoll.readiness=[];globalThis.__fieldRoll.effects=[];
  const ready=renderToStaticMarkup(React.createElement(NativeFieldRoll,props));assert.ok(ready.includes('data-field-roll-status="ready"'));assert.ok(ready.includes('data-field-roll-card="same-card"'));
  const readyCleanups=globalThis.__fieldRoll.effects.splice(0).map(effect=>effect());assert.equal(globalThis.__fieldRoll.readiness.at(-1).status,'ready');assert.equal(globalThis.__fieldRoll.readiness.at(-1).canApply,false,'native readiness never substitutes for parent session receipt');readyCleanups.forEach(cleanup=>{if(typeof cleanup==='function')cleanup();});
  globalThis.__fieldRoll.font='different-font';globalThis.__fieldRoll.effects=[];
  const changed=renderToStaticMarkup(React.createElement(NativeFieldRoll,props));assert.ok(changed.includes('data-field-roll-status="waiting"'));assert.ok(!changed.includes('data-field-roll-card="same-card"'));
  cleanups.forEach(cleanup=>{if(typeof cleanup==='function')cleanup();});
  let obsoleteResolve;globalThis.__fieldRoll.fontPromise=new Promise(resolve=>{obsoleteResolve=resolve;});globalThis.__fieldRoll.effects=[];globalThis.__fieldRoll.sets=[];
  renderToStaticMarkup(React.createElement(NativeFieldRoll,props));const obsoleteCleanups=globalThis.__fieldRoll.effects.splice(0).map(effect=>effect());obsoleteCleanups.forEach(cleanup=>{if(typeof cleanup==='function')cleanup();});obsoleteResolve();await Promise.resolve();await Promise.resolve();assert.equal(globalThis.__fieldRoll.sets.length,0,'late font completion cannot publish after cleanup');
 }finally{globalThis.document=originalDocument;delete globalThis.__fieldRoll;}
});
