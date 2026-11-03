import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {sourceTokenSources,sourceTokenAdditionalCopy,sourceTokenGraphemes,sourceTokenLineRanges,sourceTokenRangeLocation,sourceTokenTransferIssues,sourceTokenTransferKey,sourceTokenExposure,sourceTokenTransferState,sourceTokenMeasurementReadiness,sourceTokenMotionEnvelope,sourceTokenBezier,sourceTokenPageState,sourceTokenTextReadiness,sourceTokenTransferControls} from '../src/source-token-transfer.mjs';

const viewport={width:1920,height:1080};
const scene={id:'source-scene',clipId:'original',src:'clips/synthetic.mp4',startMs:1000,endMs:31000,layout:'speaker',title:'',nodes:[{id:'sentence',text:'不能保证每次成功。',detail:'先核验来源',bullets:['限定范围仍保留']} ]};
const full=scene.nodes[0].text+'\n'+scene.nodes[0].detail+'\n'+scene.nodes[0].bullets[0];
const config={kind:'source-token-transfer',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,durationMs:30000},sources:[{id:'source-one',nodeId:'sentence',expectedText:full,rect:{x:.06,y:.16,width:.53,height:.28},atMs:1000}],tokens:[{id:'negation-token',sourceId:'source-one',nodeId:'sentence',range:{start:0,end:4},text:'不能保证',targetRect:{x:.16,y:.60,width:.22,height:.08},departAtMs:6000,arriveAtMs:7500,control1:{x:.18,y:.36},control2:{x:.25,y:.53}}]};
// Synthetic variable-width metrics test the measurement contract; these are
// intentionally not represented as actual browser-font pixel verification.
const measure=(text,size)=>({width:sourceTokenGraphemes(text).reduce((sum,piece)=>sum+(/^[il .]$/.test(piece.text)?.28:/^[A-Za-z]$/.test(piece.text)?.56:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=config,v=viewport){
 const sources=sourceTokenSources(s,c).map(source=>({id:source.id,text:source.text,fit:fitMeasuredText(source.text,{width:source.rect.width*v.width,height:source.rect.height*v.height,minFont:30,maxFont:30,measure,protectedPhrases:c.tokens.filter(token=>token.sourceId===source.id).map(token=>token.text)})}));
 const targets=c.tokens.map(token=>({id:token.id,text:token.text,fit:fitMeasuredText(token.text,{width:token.targetRect.width*v.width*.92,height:token.targetRect.height*v.height*.84,minFont:32,maxFont:32,measure,protectedPhrases:[token.text]})}));
 const anchors=c.tokens.flatMap(token=>{
  const source=c.sources.find(source=>source.id===token.sourceId),fit=sources.find(source=>source.id===token.sourceId)?.fit,location=fit?sourceTokenRangeLocation(source.expectedText,fit.lines,token.range):null;if(!location)return [];
  return [{id:token.id,sourceId:source.id,nodeId:source.nodeId,range:token.range,text:token.text,fontSize:fit.fontSize,rect:{x:source.rect.x+measure(fit.lines[location.lineIndex].slice(0,location.startUtf16),fit.fontSize).width/v.width,y:source.rect.y+location.lineIndex*fit.rowHeight/v.height,width:measure(token.text,fit.fontSize).width/v.width,height:fit.fontSize/v.height}}];
 });
 const copyText=sourceTokenAdditionalCopy(s).map(item=>item.text).join('\n'),copy=copyText&&c.copyWindow?{text:copyText,fit:fitMeasuredText(copyText,{width:c.copyWindow.rect.width*v.width,height:c.copyWindow.rect.height*v.height,minFont:30,maxFont:30,measure})}:undefined;
 return {key:sourceTokenTransferKey(s,c,v,'synthetic-variable-width-font'),fontKey:'synthetic-variable-width-font',sources,targets,anchors,copy};
}

test('explicit grapheme selection preserves emoji clusters, spaces, punctuation and all original conditions',()=>{
 assert.deepEqual(sourceTokenTransferIssues(scene,config),[]);assert.equal(sourceTokenSources(scene,config)[0].text,full);
 const text='不👨‍👩‍👧‍👦 e\u0301 AV，仍保留',pieces=sourceTokenGraphemes(text);assert.equal(pieces[1].text,'👨‍👩‍👧‍👦');assert.equal(pieces[3].text,'e\u0301');
 const location=sourceTokenRangeLocation(text,[text],{start:1,end:4});assert.equal(location.text,'👨‍👩‍👧‍👦 e\u0301');assert.equal(location.startUtf16,1);assert.ok(location.endUtf16>4,'DOM offsets are UTF-16, not grapheme indices');
 assert.equal(sourceTokenRangeLocation('不能保证每次成功。',['不能保证','每次成功。'],{start:2,end:6}),null,'a line-spanning phrase is rejected rather than launched from an invented single-line origin');
 assert.equal(sourceTokenLineRanges('完整\n\n原句',['完整','','原句']).at(-1).startUtf16,4);assert.equal(sourceTokenLineRanges('full sentence',['full sente']),null);
});

test('wrong source, altered labels/ranges, missing conditions and duplicated stable IDs are blocked',()=>{
 const mutations=[
  {...config,binding:{...config.binding,src:'clips/other.mp4'}},
  {...config,clock:'timeline-ms'},
  {...config,sources:[{...config.sources[0],expectedText:scene.nodes[0].text}]},
  {...config,sources:[]},
  {...config,tokens:[{...config.tokens[0],text:'保证成功'}]},
  {...config,tokens:[{...config.tokens[0],range:{start:-1,end:4}}]},
  {...config,tokens:[{...config.tokens[0],range:{start:0,end:999}}]},
  {...config,tokens:[{...config.tokens[0],range:{start:1.5,end:4}}]},
  {...config,tokens:[{...config.tokens[0],nodeId:'another-node'}]},
  {...config,tokens:[config.tokens[0],config.tokens[0]]},
  {...config,tokens:[{...config.tokens[0],departAtMs:NaN}]},
 ];
 for(const c of mutations)assert.ok(sourceTokenTransferIssues(scene,c).length);
 assert.ok(sourceTokenTransferIssues({...scene,media:{src:'broll-assets/proof.png'}},config).includes('this-text-only-mechanism-does-not-display-existing-media'));
 assert.ok(sourceTokenTransferIssues({...scene,body:'标题和正文也必须完整读到'},config).includes('complete-title-body-readable-window-required'));
 assert.equal(sourceTokenTransferState(scene,config,4000,null).readiness,'waiting');
});

test('actual measured origin, explicit curve and persistent destination have distinct intermediate states without deleting original text',()=>{
 const measured=fixture();assert.equal(sourceTokenMeasurementReadiness(scene,config,measured).status,'ready');
 const before=sourceTokenTransferState(scene,config,5999,measured),start=sourceTokenTransferState(scene,config,6000,measured),middle=sourceTokenTransferState(scene,config,6750,measured),landed=sourceTokenTransferState(scene,config,7500,measured),late=sourceTokenTransferState(scene,config,29000,measured);
 assert.equal(before.tokens[0].visible,false);assert.equal(start.tokens[0].phase,'flying');assert.deepEqual(start.tokens[0].rect,measured.anchors[0].rect);assert.equal(middle.tokens[0].progress,.5);
 assert.notDeepEqual(middle.tokens[0].rect,start.tokens[0].rect);assert.notDeepEqual(middle.tokens[0].rect,landed.tokens[0].rect);assert.equal(landed.tokens[0].phase,'settled');assert.deepEqual(landed.tokens[0].rect,config.tokens[0].targetRect);assert.deepEqual(late.tokens[0].rect,landed.tokens[0].rect);
 for(const state of [before,start,middle,landed,late]){assert.equal(state.sources[0].text,full);assert.equal(state.sources[0].visible,true);assert.equal(state.canApply,false);assert.equal(state.needsFaceReview,true);}
 assert.equal(sourceTokenTransferState(scene,config,30000,measured).sources[0].visible,false);assert.equal(sourceTokenTransferState(scene,config,30000,measured).tokens[0].visible,false);
 assert.deepEqual(sourceTokenTransferState(scene,config,6750,measured),middle,'seeking backwards does not leave old cumulative DOM state');
});

test('the complete expanding label curve stays inside its exact envelope, and face paths block it',()=>{
 const measured=fixture(),token=config.tokens[0],origin=measured.anchors[0].rect,envelope=sourceTokenMotionEnvelope(token,origin);
 for(let p=0;p<=1;p+=.005){const a={x:origin.x+origin.width/2,y:origin.y+origin.height/2},b={x:token.targetRect.x+token.targetRect.width/2,y:token.targetRect.y+token.targetRect.height/2},point=sourceTokenBezier(a,token.control1,token.control2,b,p),w=origin.width+(token.targetRect.width-origin.width)*p,h=origin.height+(token.targetRect.height-origin.height)*p;assert.ok(point.x-w/2>=envelope.x-1e-8&&point.x+w/2<=envelope.x+envelope.width+1e-8);assert.ok(point.y-h/2>=envelope.y-1e-8&&point.y+h/2<=envelope.y+envelope.height+1e-8);}
 const unsafe={...config,tokens:[{...token,control1:{x:0,y:0},control2:{x:0,y:0}}]};assert.ok(sourceTokenMeasurementReadiness(scene,unsafe,fixture(scene,unsafe)).issues.includes('token-motion-envelope-outside-safe-area'));
 const face={...config,protectedAreas:[{rect:{x:.14,y:.45,width:.08,height:.08}}]};assert.ok(sourceTokenMeasurementReadiness(scene,face,fixture(scene,face)).issues.includes('token-motion-crosses-protected-person-path'));
 const moving={...scene,window:{x:.76,y:.50,size:.12,keyframes:[{atMs:20000,x:0,y:.50,size:.12}]}};assert.ok(sourceTokenMeasurementReadiness(moving,config,fixture(moving)).issues.some(issue=>issue.includes('person-path')),'reserve the complete keyframed speaker path');
 for(const atMs of [NaN,Infinity,-1,30001])assert.ok(sourceTokenTransferIssues({...scene,window:{x:.76,y:.3,size:.12,keyframes:[{atMs,x:.76,y:.3,size:.12}]}},config).includes('speaker-keyframe-clock-invalid'));
});

test('font/wording/layout changes invalidate anchors, and waiting or synthetic malformed glyph boxes never count as ready',()=>{
 const measured=fixture();assert.equal(sourceTokenMeasurementReadiness(scene,config,null).status,'waiting');
 for(const patch of [{fontKey:'different-font'}, {key:'old'}, {issues:['dom-range-unavailable']}])assert.equal(sourceTokenMeasurementReadiness(scene,config,{...measured,...patch}).status,'blocked');
 assert.equal(sourceTokenMeasurementReadiness(scene,config,{...measured,anchors:[]}).status,'waiting');
 for(const patch of [{text:'成功'},{nodeId:'other'},{range:{start:1,end:5}},{fontSize:999},{rect:{x:.7,y:.2,width:.1,height:.1}}])assert.equal(sourceTokenMeasurementReadiness(scene,config,{...measured,anchors:[{...measured.anchors[0],...patch}]}).status,'blocked');
 assert.equal(sourceTokenMeasurementReadiness(scene,config,{...measured,sources:measured.sources.map(source=>({...source,fit:null}))}).status,'waiting');
 assert.equal(sourceTokenTransferState(scene,config,NaN,measured).readiness,'blocked');
});

test('a flying tag cannot cross simultaneously readable full copy, an old settled label or another flying tag',()=>{
 const c={...config,tokens:[{...config.tokens[0],targetRect:{x:.65,y:.50,width:.20,height:.08},control1:{x:.3,y:.82},control2:{x:.5,y:.82}}]},rich={...scene,title:'完整正文须保持可读'};
 const copy={...c,copyWindow:{atMs:0,endMs:30000,rect:{x:.10,y:.68,width:.50,height:.12}}};assert.deepEqual(sourceTokenTransferIssues(rich,copy),[]);assert.ok(sourceTokenMeasurementReadiness(rich,copy,fixture(rich,copy)).issues.includes('token-motion-covers-readable-scene-copy'));
 const second={...c.tokens[0],id:'old-label',range:{start:4,end:6},text:'每次',targetRect:{x:.30,y:.67,width:.12,height:.06},departAtMs:2000,arriveAtMs:3000,control1:{x:.15,y:.5},control2:{x:.2,y:.6}},two={...c,tokens:[...c.tokens,second]};assert.deepEqual(sourceTokenTransferIssues(scene,two),[]);assert.ok(sourceTokenMeasurementReadiness(scene,two,fixture(scene,two)).issues.includes('token-motion-covers-already-settled-label'));
 const simultaneous={...two,tokens:[two.tokens[0],{...second,departAtMs:6000,arriveAtMs:7500}]};assert.ok(sourceTokenMeasurementReadiness(scene,simultaneous,fixture(scene,simultaneous)).issues.includes('simultaneous-token-motion-envelopes-overlap'));
 const priorCopy={...copy,copyWindow:{...copy.copyWindow,endMs:5000}};assert.equal(sourceTokenMeasurementReadiness(rich,priorCopy,fixture(rich,priorCopy)).status,'ready','the same path after the copy window closes is not a simultaneous collision');
});

test('source phases survive retained projections at multiple speeds while insufficient real exposure is rejected',()=>{
 const measured=fixture(),baseline=sourceTokenTransferState(scene,config,6750,measured);
 for(const speed of [.5,1,2]){
  const projection=projectStoryboard([scene],[{id:'retained',src:scene.src,inSec:5,outSec:20,speed}],30)[0],m=fixture(projection);
  assert.equal(sourceTokenTransferKey(projection,config,viewport,m.fontKey),measured.key);assert.equal(sourceTokenExposure(projection).startMs,4000);assert.equal(sourceTokenTransferState(projection,config,6750,m).tokens[0].progress,baseline.tokens[0].progress);
 }
 const short=projectStoryboard([scene],[{id:'short',src:scene.src,inSec:7,outSec:7.3,speed:2}],30)[0];assert.equal(sourceTokenMeasurementReadiness(short,config,fixture(short)).status,'blocked');
 assert.ok(sourceTokenTransferIssues({...scene,phaseStartMs:0,phaseEndMs:undefined},config).includes('source-clock-invalid'));
 assert.ok(sourceTokenTransferIssues({...scene,speed:0},config).includes('source-clock-invalid'));
});

test('both aspect ratios retain complete large source text; tiny source/label boxes block instead of truncating',()=>{
 for(const v of [viewport,{width:1080,height:1920}]){const m=fixture(scene,config,v),state=sourceTokenTransferState(scene,config,8000,m,v);assert.equal(state.readiness,'ready');assert.equal(state.sources[0].text,full);assert.equal(m.sources[0].fit.pages.length,1);assert.equal(m.targets[0].fit.pages.length,1);}
 const tiny={...config,sources:[{...config.sources[0],rect:{x:.06,y:.16,width:.04,height:.04}}]};assert.equal(sourceTokenMeasurementReadiness(scene,tiny,fixture(scene,tiny)).status,'blocked');
 const narrow={...config,tokens:[{...config.tokens[0],targetRect:{x:.16,y:.60,width:.015,height:.01}}]};assert.equal(sourceTokenMeasurementReadiness(scene,narrow,fixture(scene,narrow)).status,'blocked');
});

test('every additional full title/body page receives its own real retained reading window, never hidden-DOM credit',()=>{
 const longScene={...scene,startMs:0,endMs:300000,title:'完整标题',body:'不能遗漏的完整正文及限制。'.repeat(100)},c={...config,binding:{...config.binding,durationMs:300000},sources:[{...config.sources[0],atMs:200000}],tokens:[{...config.tokens[0],departAtMs:210000,arriveAtMs:212000}],copyWindow:{atMs:0,endMs:180000,rect:{x:.06,y:.1,width:.7,height:.6}}},m=fixture(longScene,c),text=m.copy.text,fit=m.copy.fit;
 assert.ok(fit.pages.length>1);assert.equal(sourceTokenMeasurementReadiness(longScene,c,m).status,'ready');const visible=[];
 for(let index=0;index<fit.pages.length;index++){const page=sourceTokenPageState(fit.pages,(index+.5)*180000/fit.pages.length,c.copyWindow);assert.equal(page.visible,true);assert.equal(page.index,index);visible.push(page.lines.join(''));}
 assert.equal(visible.join(''),text.replaceAll('\n',''));assert.equal(sourceTokenPageState(fit.pages,180000,c.copyWindow).visible,false);
 const exposure={startMs:100000,endMs:180000,speed:1};assert.equal(sourceTokenTextReadiness(text,fit,c.copyWindow,exposure).status,'blocked','a cut-away first page is not rescued by later hidden pages');
 assert.equal(sourceTokenTextReadiness(text,fit,c.copyWindow,{startMs:0,endMs:180000,speed:8}).status,'blocked');
});

test('the independent control contract keeps source wording and stable IDs immutable and exposes explicit ranges/paths',()=>{
 assert.equal(sourceTokenTransferControls.automaticAllowed,false);assert.equal(sourceTokenTransferControls.uiAccepted,false);const sources=sourceTokenTransferControls.fields.find(field=>field.key==='sources'),tokens=sourceTokenTransferControls.fields.find(field=>field.key==='tokens');
 assert.equal(sources.itemFields.find(field=>field.key==='expectedText').readonly,true);assert.equal(tokens.itemFields.find(field=>field.key==='text').readonly,true);assert.equal(tokens.itemFields.find(field=>field.key==='id').readonly,true);assert.ok(tokens.itemFields.some(field=>field.key==='range'));assert.ok(tokens.itemFields.some(field=>field.key==='control2'));
});

// Offline adapter contract only: execute the exported DOM-Range bridge with
// supplied rectangles, not a headless browser or invented real-font evidence.
const sourceUrl=new URL('../src/source-token-transfer.mjs',import.meta.url).href;
const dataUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const noopUrl=dataUrl("export const AbsoluteFill=()=>null;export const useVideoConfig=()=>({width:1920,height:1080});export const DisplayFontContext={};export const useMeasuredText=()=>({fit:null,family:'synthetic'});");
const raw=fs.readFileSync(new URL('../src/SourceTokenTransferScene.tsx',import.meta.url),'utf8').replaceAll("'./source-token-transfer.mjs'",JSON.stringify(sourceUrl)).replaceAll("'./DisplayFont'",JSON.stringify(noopUrl)).replaceAll("'./MeasuredText'",JSON.stringify(noopUrl)).replaceAll("'remotion'",JSON.stringify(noopUrl)).replaceAll("'react'",JSON.stringify(new URL('../node_modules/react/index.js',import.meta.url).href));
const compiled=ts.transpileModule(raw,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText;
const {measureSourceTokenDomAnchors}=await import(dataUrl(compiled));
test('DOM Range bridge uses exact UTF-16 selection and actual measured rectangles under Player CSS scaling',()=>{
 const text='不👨‍👩‍👧‍👦 e\u0301不会改写',s={...config.sources[0],expectedText:text},t={...config.tokens[0],range:{start:1,end:4},text:'👨‍👩‍👧‍👦 e\u0301'},fit={fontSize:42,lines:[text]},calls=[],box={left:320,top:200,width:95,height:23},node={nodeType:3,textContent:text},elements=[{firstChild:node,getBoundingClientRect:()=>({left:160,top:180,right:560,bottom:205})}];
 const createRange=()=>({setStart:(n,index)=>calls.push(['start',n,index]),setEnd:(n,index)=>calls.push(['end',n,index]),getClientRects:()=>[box],getBoundingClientRect:()=>box,detach:()=>calls.push(['detach'])});
 const [anchor]=measureSourceTokenDomAnchors(s,[t],fit,elements,{left:100,top:50,width:960,height:540},createRange);assert.equal(calls[0][2],1);assert.equal(calls[1][2],text.indexOf('不会'));assert.equal(anchor.rect.x,220/960);assert.equal(anchor.rect.width,95/960);assert.equal(anchor.fontSize,42);assert.equal(anchor.text,t.text);
 assert.throws(()=>measureSourceTokenDomAnchors(s,[t],fit,elements,{left:0,top:0,width:0,height:0},createRange),/bounds/);
 const two=()=>({...createRange(),getClientRects:()=>[box,box]});assert.throws(()=>measureSourceTokenDomAnchors(s,[t],fit,elements,{left:0,top:0,width:1920,height:1080},two),/one-real-glyph-range/);
 assert.throws(()=>measureSourceTokenDomAnchors(s,[t],fit,[{...elements[0],firstChild:{nodeType:3,textContent:'错误原文'}}],{left:100,top:50,width:960,height:540},createRange),/complete-source-text-mismatch/);
 assert.throws(()=>measureSourceTokenDomAnchors(s,[t],fit,[{...elements[0],getBoundingClientRect:()=>({left:160,top:180,right:900,bottom:205})}],{left:100,top:50,width:960,height:540},createRange),/exceeds-rectangle/);
});

const actualReactUrl=new URL('../node_modules/react/index.js',import.meta.url).href;
const reactFixtureUrl=dataUrl(`import React from ${JSON.stringify(actualReactUrl)};export default React;export const useContext=()=>globalThis.__sourceTokenSsr.fontKey;export const useRef=()=>({current:null});export const useState=()=>[globalThis.__sourceTokenSsr.reports,()=>{}];export const useCallback=value=>value;export const useLayoutEffect=()=>{};`);
const renderFixtureUrl=dataUrl(`import React from ${JSON.stringify(actualReactUrl)};export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const useVideoConfig=()=>globalThis.__sourceTokenSsr.viewport;export const DisplayFontContext={};export const useMeasuredText=(text)=>({fit:globalThis.__sourceTokenSsr.fits[text]??null,family:'synthetic-test-family'});`);
const renderRaw=fs.readFileSync(new URL('../src/SourceTokenTransferScene.tsx',import.meta.url),'utf8').replaceAll("'./source-token-transfer.mjs'",JSON.stringify(sourceUrl)).replaceAll("'./DisplayFont'",JSON.stringify(renderFixtureUrl)).replaceAll("'./MeasuredText'",JSON.stringify(renderFixtureUrl)).replaceAll("'remotion'",JSON.stringify(renderFixtureUrl)).replaceAll("'react'",JSON.stringify(reactFixtureUrl));
const {SourceTokenTransferScene}=await import(dataUrl(ts.transpileModule(renderRaw,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function renderSynthetic(s,c,time,v=viewport){
 const m=fixture(s,c,v),sources=m.sources.map(source=>({...source,family:'synthetic-test-family',anchors:m.anchors.filter(anchor=>anchor.sourceId===source.id)})),targets=m.targets.map(target=>({...target,family:'synthetic-test-family'})),copy=m.copy?{...m.copy,id:'scene-copy',family:'synthetic-test-family'}:null;
 globalThis.__sourceTokenSsr={fontKey:m.fontKey,viewport:v,reports:{key:m.key,source:Object.fromEntries(sources.map(source=>[source.id,source])),target:Object.fromEntries(targets.map(target=>[target.id,target])),copy:copy?{'scene-copy':copy}:{}},fits:Object.fromEntries([...sources,...targets,...(copy?[copy]:[])].map(item=>[item.text,item.fit]))};
 try{return renderToStaticMarkup(React.createElement(SourceTokenTransferScene,{scene:s,config:c,elapsed:time}));}finally{delete globalThis.__sourceTokenSsr;}
}
test('actual renderer branches show full persistent source and the complete moving/settled label in wide and portrait frames',()=>{
 for(const v of [viewport,{width:1080,height:1920}])for(const time of [5999,6000,6750,7500,29000]){
  const html=renderSynthetic(scene,config,time,v);assert.ok(html.includes('data-layout-status="ready"'));
  const source=html.match(/data-persistent-source="source-one"[\s\S]*?(?=<div data-source-token=)/)?.[0];assert.ok(source?.includes('opacity:1'));assert.ok(source.includes('不能保证每次成功。'));assert.ok(source.includes('先核验来源'));assert.ok(source.includes('限定范围仍保留'));
  const token=html.match(/data-source-token="negation-token"[^>]*>不能保证<\/div>/)?.[0];assert.ok(token);assert.ok(token.includes(time<6000?'opacity:0':'opacity:1'));assert.ok(token.includes(time<6000?'data-token-phase="pending"':time<7500?'data-token-phase="flying"':'data-token-phase="settled"'));
 }
 const blocked=renderSynthetic(scene,{...config,tokens:[{...config.tokens[0],text:'保证成功'}]},6750);assert.ok(blocked.includes('data-layout-status="blocked"'));assert.ok(!blocked.includes('data-source-token='));
});
