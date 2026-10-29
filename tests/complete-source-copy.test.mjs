import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {dynamicMechanismIssues} from '../src/dynamic-mechanisms.mjs';
import {completeSourceCopyInventory,completeSourceCopyText,completeSourceCopyIssues,completeSourceCopyReadiness,nativeCriticalEntry,nativeLayoutPlan,updateNativeLayoutReports} from '../src/complete-source-copy.mjs';

const scene={id:'s',src:'clips/synthetic.mp4',clipId:'c',startMs:0,endMs:90000,layout:'speaker',title:'TITLE完整标题',body:'BODY不能省略限制',nodes:['a','b','c','d'].map(id=>({id,text:`完整${id}对象`,detail:`DETAIL${id}条件`,bullets:[`BULLET${id}否定`],assetSrc:`broll-assets/${id}.png` })),media:{src:'broll-assets/proof.png',kind:'image',width:1000,height:800}};
const window={atMs:0,endMs:20000,rect:{x:.05,y:.10,width:.65,height:.62},speakerRect:{x:.79,y:.48,width:.14,height:.24}};
const configs=[
 {kind:'flip-board',atMs:25000,rows:6,columns:20},
 {kind:'number-counter',from:0,to:17,atMs:25000,countMs:2000},
 {kind:'evidence-handoff',speakerRect:window.speakerRect,cues:scene.nodes.map((node,index)=>({nodeId:node.id,atMs:25000+index*12000,travelMs:500,holdMs:8000,returnMs:500}))},
 {kind:'glass-capsules',atMs:[25000,30000,35000,40000]},
 {kind:'orbit-flow-variant',gatherAtMs:25000,gatherMs:1000,openAtMs:28000,flowAtMs:30000},
 {kind:'bar-group-variant',scale:{min:0,max:100},items:[{nodeId:'a',from:0,to:50,atMs:25000,countMs:2000},{nodeId:'b',from:0,to:70,atMs:29000,countMs:2000}]},
 {kind:'hub-branch-flow',hubNodeId:'b',inputNodeIds:['a'],outputNodeIds:['c'],branchesAtMs:28000,branchDrawMs:600,nodeStaggerMs:300,flowAtMs:30000,flowMs:2000,particleCount:5,nodeStates:[{nodeId:'c',atMs:40000,durationMs:1000,state:'dim',explicitValue:{from:10,to:2,unit:'次',scale:{min:0,max:10}}}],matchToDiagram:{atMs:25000,durationMs:1000,from:window.speakerRect,to:{x:.05,y:.55,width:.15,height:.27}}},
 {kind:'screenshot-region-focus',sourceKind:'screenshot',provenance:'synthetic test',sourceWidth:1000,sourceHeight:800,regionUnits:'source-pixels',maskScope:'asset-only',focusRegion:{x:200,y:100,width:200,height:100},atMs:25000,expandMs:600,holdMs:10000,returnMs:600,dimOpacity:.5,focusRect:{x:.05,y:.4,width:.3,height:.15},explanationCues:[{nodeId:'a',provenance:'synthetic exact cue',lines:[{text:'附加解释句，原节点仍完整保留',atMs:26000}]}]},
 {kind:'bilingual-board-transition',provenance:'explicit synthetic pair',pairs:scene.nodes.map((node,index)=>({nodeId:node.id,fromText:node.text,toText:'Complete '+node.id,fromLanguage:'中文',toLanguage:'English',atMs:25000+index*1000,rollMs:600}))},
].map(config=>({...config,sourceCopyWindow:window}));
const viewport={width:1920,height:1080},measure=(text,size)=>({width:[...text].reduce((sum,glyph)=>sum+(/[A-Za-z0-9 ]/.test(glyph)?.52:1),0)*size,ascent:size*.8,descent:size*.2});
const fitFor=(s,c,v=viewport)=>fitMeasuredText(completeSourceCopyText(s),{width:c.sourceCopyWindow.rect.width*v.width,height:c.sourceCopyWindow.rect.height*v.height,minFont:v.height*.032,maxFont:v.height*.067,protectedPhrases:completeSourceCopyText(s).match(/[A-Za-z][A-Za-z0-9'-]*/g)??[],measure});

test('renderer-owned inventory always includes title/body and every original node condition, regardless of native membership',()=>{
 const inventory=completeSourceCopyInventory(scene);assert.equal(inventory.length,14);assert.ok(inventory.some(field=>field.id==='body'));for(const id of ['a','b','c','d'])for(const suffix of ['text','detail','bullet:0'])assert.ok(inventory.some(field=>field.id===`node:${id}:${suffix}`));
 for(const config of configs){assert.deepEqual(dynamicMechanismIssues(scene,config,viewport),[],config.kind);assert.deepEqual(completeSourceCopyIssues(scene,config),[],config.kind);assert.equal(completeSourceCopyReadiness(scene,config,fitFor(scene,config)).status,'ready',config.kind);assert.ok(completeSourceCopyIssues(scene,{...config,sourceCopyWindow:undefined}).includes('explicit-complete-source-copy-window-required'));}
});

test('all actual entry/cue/line/pair gates reserve motion and required source overview; names or later focus do not hide earlier animation',()=>{
 for(const config of configs){const critical=nativeCriticalEntry(scene,config);assert.equal(critical.atMs,25000,config.kind);assert.ok(completeSourceCopyIssues(scene,{...config,sourceCopyWindow:{...window,endMs:25001}}).includes('copy-window-hides-native-motion-or-needed-overview'));}
 const cases=[
  {...configs[2],cues:[{...configs[2].cues[0],atMs:10000}]},
  {...configs[3],atMs:[5000,30000,35000,40000]},
  {...configs[4],gatherAtMs:5000},
  {...configs[5],items:configs[5].items.map((item,index)=>index?item:{...item,atMs:5000})},
  {...configs[6],matchToDiagram:undefined},
  {...configs[7],explanationCues:[{nodeId:'a',provenance:'test',lines:[{text:'早入说明',atMs:5000}]}]},
  {...configs[8],pairs:configs[8].pairs.map((pair,index)=>index?pair:{...pair,atMs:5000})},
 ];
 for(const config of cases)assert.ok(completeSourceCopyIssues(scene,config).includes('copy-window-hides-native-motion-or-needed-overview'),config.kind);
 const earlyCamera={...scene,media:{...scene.media,camera:[{atMs:1000,scale:1,x:0,y:0},{atMs:5000,scale:1.2,x:3,y:0}]}};assert.equal(nativeCriticalEntry(earlyCamera,configs[2]).atMs,1000);
 assert.equal(nativeCriticalEntry({...scene,media:{...scene.media,kind:'video'}},configs[4]).atMs,0,'a playing source video cannot be silently hidden as a static overview');
 const noOverview={...configs[7],sourceCopyWindow:{...window,endMs:24500}};assert.ok(completeSourceCopyIssues(scene,noOverview).includes('copy-window-hides-native-motion-or-needed-overview'),'full source screenshot needs an actual clean overview after copy and before the ROI expansion');
});

test('full copy must have real retained speed-adjusted pages, and person motion intersects only the simultaneous copy interval',()=>{
 const config=configs[0],fit=fitFor(scene,config);assert.equal(completeSourceCopyReadiness(scene,config,null).status,'waiting');assert.equal(completeSourceCopyReadiness(scene,config,{...fit,unplaceable:true}).status,'blocked');
 const cut=projectStoryboard([scene],[{id:'tail',src:scene.src,inSec:30,outSec:60,speed:1}],30)[0];assert.equal(completeSourceCopyReadiness(cut,config,fit).status,'blocked','later hidden inventory does not replace a removed introduction');
 const fast=projectStoryboard([scene],[{id:'fast',src:scene.src,inSec:0,outSec:90,speed:20}],30)[0];assert.equal(completeSourceCopyReadiness(fast,config,fit).status,'blocked');
 const crossing={...scene,window:{x:.79,y:.48,size:.14,keyframes:[{atMs:10000,x:.15,y:.48,size:.14}]}};assert.ok(completeSourceCopyIssues(crossing,config).includes('complete-copy-crosses-real-person-path'));
 const after={...scene,window:{x:.79,y:.48,size:.14,keyframes:[{atMs:21000,x:.79,y:.48,size:.14},{atMs:50000,x:.15,y:.48,size:.14}]}};assert.deepEqual(completeSourceCopyIssues(after,config),[],'a future person move after the complete window is not falsely treated as simultaneous');
});

const moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText).toString('base64'),reactUrl=import.meta.resolve('react');
const common=moduleUrl(`import React from ${JSON.stringify(reactUrl)};import {fitMeasuredText} from ${JSON.stringify(new URL('../src/text-fit.mjs',import.meta.url).href)};export const calls=[];export const glyphCalls=[];export const DisplayFontContext=React.createContext('synthetic-display');export const TextLayoutReportContext=React.createContext(null);const measure=${measure.toString()};export const useMeasuredText=(text,width,height,options)=>({family:'synthetic',fit:globalThis.__completeSourceTest?.fontWaiting?null:fitMeasuredText(text,{width,height,...options,measure})});export const MeasuredText=props=>{calls.push(props);return React.createElement('div',{'data-native-text':props.text},props.text);};export const useStableGlyphLayout=props=>{glyphCalls.push(props);return {fontSize:40,family:'synthetic',advance:25,unitWidth:40,rowHeight:45,unplaceable:false};};export const SceneMedia=()=>React.createElement('div',{'data-native-real-media':'true'});export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const Img=props=>React.createElement('img',props);export const staticFile=value=>value;export const cancelRender=error=>{throw error};export const useVideoConfig=()=>globalThis.__completeSourceTest?.viewport??{width:1920,height:1080};`);
const fixtureReact=moduleUrl(`import React from ${JSON.stringify(reactUrl)};export default React;export const createContext=React.createContext;export const useContext=React.useContext;export const useCallback=value=>value;export const useLayoutEffect=effect=>effect();export const useState=()=>[globalThis.__completeSourceTest?.nativeState??{signature:'',reports:[]},()=>{}];`);
const cache=new Map(),mocks={remotion:common,'./MeasuredText':common,'./StableGlyphLayout':common,'./SceneMedia':common,'./DisplayFont':common};
function compiled(file){const url=new URL(file,import.meta.url);if(cache.has(url.href))return cache.get(url.href);const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{let target=mocks[s];if(s==='react')target=/\/(?:SourceCopyWindow|DynamicMechanismScene)\.tsx$/.test(url.pathname)?fixtureReact:reactUrl;if(!target)target=s.startsWith('.')?(/\.mjs$/.test(s)?new URL(s,url).href:compiled(new URL(s+'.tsx',url).href)):import.meta.resolve(s);return `from ${JSON.stringify(target)}`;});const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;}
const native=await import(compiled('../src/DynamicMechanismScene.tsx')),diagrams=await import(compiled('../src/DynamicDiagramScene.tsx')),roi=await import(compiled('../src/ScreenshotFocusScene.tsx')),bilingual=await import(compiled('../src/BilingualBoardScene.tsx')),{calls,glyphCalls}=await import(common);
const leafByKind={'flip-board':native.FlipBoardScene,'number-counter':native.NumberCounterScene,'evidence-handoff':native.EvidenceHandoffScene,'glass-capsules':native.GlassCapsulesScene,'orbit-flow-variant':diagrams.OrbitTransferScene,'bar-group-variant':diagrams.BarGroupScene,'hub-branch-flow':diagrams.HubFlowScene,'screenshot-region-focus':roi.ScreenshotFocusScene,'bilingual-board-transition':bilingual.BilingualBoardScene};
const speaker=props=>React.createElement('div',{'data-actual-source-speaker':props.elapsed}),live=React.createElement('div',{'data-real-live-background':'true'});
function setup(s,c,time,v=viewport,options={}){const plan=nativeLayoutPlan(s,c,time,v),signature=JSON.stringify([s,c,v.width,v.height,'synthetic-display']);globalThis.__completeSourceTest={viewport:v,fontWaiting:options.fontWaiting,nativeState:{signature:options.stale?'stale':signature,reports:Array.from({length:options.reportCount??plan.count},(_,i)=>({key:'synthetic-font-key',instanceId:'synthetic-'+i,pages:1,fontSize:40,unplaceable:!!options.badNative}))}};}
function render(s,c,time,v=viewport,options={}){setup(s,c,time,v,options);calls.length=0;glyphCalls.length=0;try{return renderToStaticMarkup(React.createElement(native.DynamicMechanismScene,{scene:s,config:c,elapsed:time,renderSpeaker:options.noSpeaker?undefined:speaker,hasRealCutout:true,liveBackground:live,speakerRenderedExternally:options.speakerRenderedExternally,onReadiness:options.onReadiness}));}finally{delete globalThis.__completeSourceTest;}}

test('native layout census matches actual hook paths for every kind, including invisible and late metric layers',()=>{
 for(const config of configs)for(const time of [0,35000,45000]){
  setup(scene,config,time);calls.length=0;glyphCalls.length=0;renderToStaticMarkup(React.createElement(leafByKind[config.kind],{scene,config,elapsed:time,renderSpeaker:speaker,hasRealCutout:true,liveBackground:live}));
  assert.equal(calls.length+glyphCalls.length,nativeLayoutPlan(scene,config,time).count,config.kind+' '+time);delete globalThis.__completeSourceTest;
 }
});

test('long full body is actually visible one complete page at a time, including spaces and negation in portrait and landscape',()=>{
 const rich={...scene,endMs:1200000,body:'不能把部分案例说成全部能力。 Full source text remains complete. '.repeat(70)},config={...configs[1],atMs:650000,sourceCopyWindow:{...window,endMs:600000}};
 for(const v of [viewport,{width:1080,height:1920}]){
  const fit=fitFor(rich,config,v);assert.ok(fit.pages.length>1);const readiness=completeSourceCopyReadiness(rich,config,fit,v);assert.equal(readiness.status,'ready',JSON.stringify({viewport:v,readiness,pages:fit.pages.length}));const shown=[];
  for(let index=0;index<fit.pages.length;index++){
   const html=render(rich,config,(index+.5)*600000/fit.pages.length,v),fragment=html.split('<div aria-hidden="false"')[1]?.split(/<div aria-hidden="(?:true|false)"/)[0]?.split('<div data-source-copy-real-speaker=')[0],visible=fragment?.replace(/^[^>]*>/,'').replace(/<[^>]+>/g,'');
   assert.equal(visible,fit.pages[index].join(''));shown.push(visible);
  }
  assert.equal(shown.join(''),completeSourceCopyText(rich).replaceAll('\n',''));
 }
});

test('nine real entry paths display the complete body and unmapped nodes in their actual visible page before motion',()=>{
 for(const config of configs)for(const v of [viewport,{width:1080,height:1920}]){
  const html=render(scene,config,10000,v);assert.ok(html.includes('data-complete-source-status="ready"'),config.kind);assert.ok(html.includes('data-source-copy-window="true"'),config.kind);
  const shown=html.match(/data-source-copy-page=[\s\S]*?(?=<div data-source-copy-real-speaker=|$)/)?.[0];for(const text of ['BODY不能省略限制','完整d对象','DETAILd条件','BULLETd否定'])assert.ok(shown?.includes(text),config.kind+': '+text);
  assert.ok(html.includes(config.kind==='evidence-handoff'?'data-handoff-speaker=':config.kind==='hub-branch-flow'?'data-hub-real-cutout=':'data-source-copy-real-speaker='),config.kind+' retains a real speaker callback');
 }
});

test('unready/full-layout errors and stale reports suppress old graphics while retaining real human output; missing contract blocks',()=>{
 for(const options of [{fontWaiting:true},{reportCount:0},{stale:true},{badNative:true}]){
  const html=render(scene,configs[0],10000,viewport,options);assert.ok(!html.includes('data-source-copy-window="true"'));assert.ok(html.includes('data-actual-source-speaker='));assert.ok(/data-dynamic-mechanism="flip-board"[^>]*opacity:0/.test(html));
 }
 for(const config of configs){const html=render(scene,{...config,sourceCopyWindow:undefined},10000);assert.ok(html.includes('explicit-complete-source-copy-window-required'));assert.ok(!html.includes('data-dynamic-mechanism='));}
 const noHuman=render(scene,configs[0],10000,viewport,{noSpeaker:true});assert.ok(noHuman.includes('actual-source-speaker-callback-required'));
});

test('copy exit neither rewinds native phase nor hides Evidence/Hub human layers',()=>{
 const before=render(scene,configs[1],10000),after=render(scene,configs[1],26000);assert.ok(before.includes('data-source-copy-window="true"'));assert.ok(!after.includes('data-source-copy-window="true"'));assert.ok(after.includes('data-counter-value="9"'),'the actual source 26s is midway through 25–27s counting, not reset by a 20s introduction');
 for(const config of [configs[2],configs[6]])for(const options of [{},{reportCount:0}]){const html=render(scene,config,10000,viewport,options);assert.ok(html.includes('data-actual-source-speaker="10000"'));assert.ok(html.includes('data-real-live-background="true"'));}
});

test('ready callbacks are actively reset after stale font reports, invalid source copy or invalid native configuration',()=>{
 const reports=[],onReadiness=value=>reports.push(value),config=configs[1];
 render(scene,config,10000,viewport,{onReadiness});assert.equal(reports.at(-1).status,'ready');
 render(scene,config,10000,viewport,{onReadiness,stale:true});assert.equal(reports.at(-1).status,'waiting');
 render(scene,{...config,sourceCopyWindow:undefined},10000,viewport,{onReadiness});assert.equal(reports.at(-1).status,'blocked');
 render(scene,config,10000,viewport,{onReadiness});assert.equal(reports.at(-1).status,'ready');
 render(scene,{...config,to:NaN},10000,viewport,{onReadiness});assert.equal(reports.at(-1).status,'blocked');assert.equal(reports.at(-1).canApply,false);assert.equal(reports.at(-1).nativeReports,0);
});

test('repeated native effects count each mounted hook once, while identical copy in separate hooks remains distinct',()=>{
 const value={key:'same-layout',instanceId:'hook-A',active:true,pages:1,fontSize:40,unplaceable:false};let state={signature:'',reports:[]};
 for(let i=0;i<50;i++)state=updateNativeLayoutReports(state,'source-A',value);assert.equal(state.reports.length,1,'a single repeated effect cannot impersonate 50 measured objects');
 state=updateNativeLayoutReports(state,'source-A',{...value,instanceId:'hook-B'});assert.equal(state.reports.length,2,'two genuinely mounted identical labels count separately');
 state=updateNativeLayoutReports(state,'source-A',{...value,key:'new-current-text'});assert.equal(state.reports.length,2);assert.equal(state.reports.find(r=>r.instanceId==='hook-A').key,'new-current-text');
 state=updateNativeLayoutReports(state,'source-A',{...value,active:false});assert.equal(state.reports.length,1);const after=updateNativeLayoutReports(state,'source-B',{...value,instanceId:'hook-C'});assert.equal(after.reports.length,1);assert.equal(after.signature,'source-B');assert.deepEqual(updateNativeLayoutReports(after,'source-A',{...value,active:false}),after,'late old-source cleanup cannot erase current source reports');
});

test('external persistent speaker suppresses only fallback duplicates, still requires callback and leaves native human layers intact',()=>{
 const external=render(scene,configs[0],10000,viewport,{speakerRenderedExternally:true});assert.ok(external.includes('data-complete-source-status="ready"'));assert.ok(!external.includes('data-source-copy-real-speaker='));
 assert.ok(render(scene,configs[0],10000).includes('data-source-copy-real-speaker='));
 for(const c of [configs[2],configs[6]]){const html=render(scene,c,10000,viewport,{speakerRenderedExternally:true});assert.ok(html.includes('data-actual-source-speaker='));}
 assert.ok(render(scene,configs[0],10000,viewport,{speakerRenderedExternally:true,noSpeaker:true}).includes('actual-source-speaker-callback-required'));
});
