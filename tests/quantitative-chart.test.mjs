import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {quantitativeAxisPosition,quantitativeNumber,quantitativeCopy,quantitativeMeasurementKey,quantitativeFieldPlan,quantitativeNumberPlans,quantitativeIssues,quantitativeReadiness,quantitativeState,quantitativeBarStates,quantitativeLineStates,quantitativeRegion,quantitativeChartControls} from '../src/quantitative-chart.mjs';

const viewport={width:1920,height:1080},portrait={width:1080,height:1920};
const scene={id:'quant',clipId:'raw',src:'clips/synthetic.mp4',startMs:1000,endMs:61000,layout:'speaker',title:'明确数据与原始尺度',body:'这些数据仅用于合成回归，不能推断真实产品表现。',nodes:[{id:'a',text:'对象甲',detail:'限定条件甲',bullets:['先核验单位']},{id:'b',text:'对象乙',detail:'限定条件乙'},{id:'c',text:'对象丙',bullets:['不得省略条件']} ]};
const binding={sceneId:scene.id,src:scene.src,sha256:'b'.repeat(64),startMs:1000,endMs:61000},proof={kind:'same-source-video',src:binding.src,sha256:binding.sha256,startMs:binding.startMs,endMs:binding.endMs};
const base={kind:'quantitative-chart',clock:'scene-source-relative-ms',binding,dataKind:'illustration',provenance:'原创合成数据；不代表任何真实测试',copyWindow:{atMs:0,endMs:22000,rect:{x:.03,y:.04,width:.74,height:.74}},chartWindow:{atMs:22000,endMs:60000},speakerRect:{x:.82,y:.30,width:.15,height:.28}};
const axis={scale:'log10',min:1,max:100,ticks:[1,10,100],unit:'Mbps',label:'吞吐量',decimals:0};
const horizontal={...base,variant:'horizontal-bars',axis,plotRect:{x:.24,y:.22,width:.40,height:.34},axisLayout:{tickBandRect:{x:.20,y:.59,width:.48,height:.06},labelRect:{x:.24,y:.68,width:.4,height:.07}},items:[53,5.3,1.6].map((to,i)=>({id:'item'+i,nodeId:['a','b','c'][i],from:1,to,decimals:i?1:0,atMs:23000+i*1500,durationMs:4000,labelRect:{x:.02,y:.23+i*.113,width:.20,height:.08},valueRect:{x:.66,y:.23+i*.113,width:.14,height:.08}}))};
const signed={...base,variant:'signed-columns',plotRect:{x:.25,y:.22,width:.42,height:.34},depth:{x:.012,y:-.012},axis:{scale:'linear',min:-10,max:10,ticks:[-10,0,10],unit:'ms',label:'变化',decimals:0},axisLayout:{tickBandRect:{x:.13,y:.17,width:.08,height:.44},labelRect:{x:.02,y:.22,width:.09,height:.32}},items:[7,-5,3].map((to,i)=>({id:'signed'+i,nodeId:['a','b','c'][i],from:0,to,decimals:0,atMs:23000+i*1500,durationMs:4000,labelRect:{x:.25+i*.14,y:.63,width:.12,height:.07},valueRect:{x:.25+i*.14,y:.73,width:.12,height:.08}}))};
const lineScene={...scene,nodes:[...scene.nodes,{id:'codeA',text:'value > 5'},{id:'codeB',text:'result = value'},{id:'condition',text:'仅在已知范围内',detail:'其他条件不能省略',bullets:['这不是实际执行结果']} ]};
const line={...base,variant:'annotated-line',plotRect:{x:.20,y:.18,width:.38,height:.26},xAxis:{scale:'linear',min:0,max:4,ticks:[0,2,4],unit:'s',label:'时间',decimals:0},yAxis:{scale:'linear',min:0,max:10,ticks:[0,5,10],unit:'个',label:'数量',decimals:0},xAxisLayout:{tickBandRect:{x:.15,y:.50,width:.48,height:.05},labelRect:{x:.24,y:.57,width:.30,height:.06}},yAxisLayout:{tickBandRect:{x:.10,y:.13,width:.08,height:.36},labelRect:{x:.02,y:.18,width:.06,height:.28}},series:[{id:'seriesA',nodeId:'a',labelRect:{x:.20,y:.06,width:.38,height:.07},points:[{id:'p0',x:0,y:1,atMs:23000},{id:'p1',x:2,y:8,atMs:26000},{id:'p2',x:4,y:4,atMs:29000}]}],code:{rect:{x:.63,y:.08,width:.17,height:.42},provenance:'作者编写的解释代码，不是运行画面',lines:[{id:'lineA',nodeId:'codeA',lineNumber:1},{id:'lineB',nodeId:'codeB',lineNumber:2}]},conditions:[{id:'conditionA',nodeId:'condition',textRect:{x:.10,y:.67,width:.67,height:.15},atMs:30000,endMs:60000,region:{xMin:1,xMax:3,yMin:5,yMax:9},codeLineIds:['lineA']}]};
// These are explicit synthetic proportional metrics, not browser/font proof.
const measure=(text,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].reduce((sum,{segment})=>sum+(/^[il .]$/.test(segment)?.28:/^[A-Za-z0-9+−>()=]$/.test(segment)?.55:1),0)*size,ascent:size*.8,descent:size*.2});
function fixture(s=scene,c=horizontal,v=viewport){const fields=quantitativeFieldPlan(s,c).map(f=>({id:f.id,text:f.text,fit:fitMeasuredText(f.text,{width:f.rect.width*v.width*.94,height:f.rect.height*v.height*.90,minFont:v.height*.023,maxFont:v.height*.023,measure})}));return {fontKey:'synthetic-chart-metrics',key:quantitativeMeasurementKey(s,c,v,'synthetic-chart-metrics'),fields,numbers:quantitativeNumberPlans(c).map(p=>({id:p.id,specKey:JSON.stringify(p),unplaceable:false}))};}

test('explicit logarithmic tick spacing and actual numeric growth never become zero-baseline linear bars',()=>{
 assert.deepEqual(quantitativeIssues(scene,horizontal),[]);assert.equal(quantitativeReadiness(scene,horizontal,fixture(),proof).status,'ready');
 assert.deepEqual([1,10,100].map(v=>quantitativeAxisPosition(axis,v)),[0,.5,1]);
 const final=quantitativeBarStates(horizontal,40000);for(let i=0;i<3;i++){assert.equal(final[i].value,[53,5.3,1.6][i]);assert.ok(Math.abs(final[i].rect.width/horizontal.plotRect.width-Math.log10(final[i].value)/2)<1e-12);}
 const middle=quantitativeBarStates(horizontal,25000)[0];assert.equal(middle.value,27);assert.equal(middle.progress,.5);assert.ok(Math.abs(middle.rect.width/horizontal.plotRect.width-Math.log10(27)/2)<1e-12);
 assert.equal(quantitativeBarStates(horizontal,22999)[0].visible,false);assert.deepEqual(quantitativeBarStates(horizontal,25000),quantitativeBarStates(horizontal,25000));
 for(const to of [0,-3,101])assert.ok(quantitativeIssues(scene,{...horizontal,items:[{...horizontal.items[0],to}]}).length);
 assert.ok(quantitativeIssues(scene,{...horizontal,axis:{...axis,min:0}}).length);
 const linear={...horizontal,axis:{...axis,scale:'linear',min:0,ticks:[0,50,100]},items:horizontal.items.map(i=>({...i,from:0}))};assert.deepEqual(quantitativeIssues(scene,linear),[]);assert.equal(quantitativeAxisPosition(linear.axis,50),.5);
 assert.ok(quantitativeIssues(scene,{...linear,axis:{...linear.axis,min:1,ticks:[1,50,100]}}).includes('linear-horizontal-bars-require-explicit-zero-baseline'));
});

test('signed columns share one zero baseline and keep signs, units and a bounded original depth hull',()=>{
 assert.deepEqual(quantitativeIssues(scene,signed),[]);assert.equal(quantitativeReadiness(scene,signed,fixture(scene,signed),proof).status,'ready');
 const states=quantitativeBarStates(signed,40000),zero=.22+.34/2;for(const b of states){assert.equal(b.zero,zero);assert.ok(Math.abs((b.value<0?b.rect.y:b.rect.y+b.rect.height)-zero)<1e-10);}
 assert.equal(states[0].text,'+7 ms');assert.equal(states[1].text,'−5 ms');assert.equal(quantitativeNumber(-1.6,1,'kg',true),'−1.6 kg');
 const cross={...signed,items:[{...signed.items[0],from:-8,to:8}]};assert.equal(quantitativeBarStates(cross,25000)[0].rect.height,0);
 assert.ok(quantitativeIssues(scene,{...signed,axis:{...signed.axis,scale:'log10',min:1,ticks:[1,10]}}).length);assert.ok(quantitativeIssues(scene,{...signed,axis:{...signed.axis,ticks:[-10,10]}}).length);
 assert.ok(quantitativeIssues(scene,{...signed,protectedAreas:[{rect:{x:.675,y:.22,width:.01,height:.1}}]}).includes('whole-chart-and-depth-envelope-overlaps-protected-area'));
});

test('explicit polyline reveals a true intermediate segment and authored region highlights only mapped explanatory lines',()=>{
 assert.deepEqual(quantitativeIssues(lineScene,line),[]);assert.equal(quantitativeReadiness(lineScene,line,fixture(lineScene,line),proof).status,'ready');
 const mid=quantitativeLineStates(line,24500)[0].points;assert.equal(mid.length,2);assert.ok(Math.abs(mid[1].x-(.20+.38*.25))<1e-12);assert.ok(Math.abs(mid[1].y-(.18+.26*.55))<1e-12);
 assert.equal(quantitativeLineStates(line,22999)[0].points.length,0);assert.equal(quantitativeLineStates(line,40000)[0].points.length,3);
 const m=fixture(lineScene,line),before=quantitativeState(lineScene,line,29999,m,proof),active=quantitativeState(lineScene,line,30000,m,proof);assert.deepEqual(before.activeCodeLineIds,[]);assert.deepEqual(active.activeCodeLineIds,['lineA']);assert.equal(active.regions[0].rect.x,.20+.38*.25);assert.deepEqual(active.regions[0].rect,quantitativeRegion(line,line.conditions[0].region));
 const bad=[{...line,conditions:[{...line.conditions[0],codeLineIds:['unknown']}]},{...line,conditions:[{...line.conditions[0],region:{xMin:1,xMax:5,yMin:5,yMax:9}}]},{...line,series:[{...line.series[0],points:line.series[0].points.map((p,i)=>i===1?{...p,atMs:22000}:p)}]}];for(const c of bad)assert.ok(quantitativeIssues(lineScene,c).length);
});

test('missing data, precision, stable original nodes and unsupported media never receive invented chart defaults',()=>{
 const mutations=[{...horizontal,provenance:''},{...horizontal,dataKind:undefined},{...horizontal,axis:{...axis,ticks:undefined}},{...horizontal,axis:{...axis,unit:undefined}},{...horizontal,items:[{...horizontal.items[1],decimals:0}]},{...horizontal,items:[{...horizontal.items[0],nodeId:'unknown'}]},{...horizontal,items:[null]},{...horizontal,items:[]},{...horizontal,copyWindow:undefined},{...horizontal,chartWindow:undefined},{...horizontal,depth:{x:1,y:-1}}];
 for(const c of mutations)assert.ok(quantitativeIssues(scene,c).length);
 assert.ok(quantitativeIssues({...scene,media:{src:'broll-assets/real-chart.png'}},horizontal).includes('native-chart-does-not-render-evidence-screenshots'));
 assert.ok(quantitativeIssues(scene,{...horizontal,copyWindow:{...horizontal.copyWindow,endMs:23000}}).includes('complete-copy-and-chart-windows-must-be-separate'));
 const plan=quantitativeNumberPlans(signed);assert.ok(plan[0].glyphs.includes('+')&&plan[0].glyphs.includes('−'));assert.equal(plan[0].unit,'ms');assert.ok(plan[0].samples.includes('+7'));assert.deepEqual(quantitativeNumberPlans(signed),plan,'current elapsed never enters final atlas plan');
});

test('source absolute clock, source SHA and recomputed retained projection reject stale plans without resetting phase',()=>{
 const m=fixture();assert.equal(quantitativeReadiness(scene,horizontal,m,{...proof,sha256:'c'.repeat(64)}).status,'blocked');assert.ok(quantitativeIssues({...scene,startMs:2000,endMs:62000},horizontal).length);
 for(const speed of [.5,1,2]){const clips=[{id:'whole',src:scene.src,inSec:1,outSec:61,speed}],s=projectStoryboard([scene],clips,30)[0],origin={rawScene:scene,clips,fps:30},state=quantitativeState(s,horizontal,25000,fixture(s),proof,viewport,origin);assert.equal(state.readiness,'ready');assert.equal(state.bars[0].value,27);assert.equal(fixture(s).key,m.key);assert.equal(quantitativeReadiness(s,horizontal,fixture(s),proof).status,'blocked');}
 const clips=[{id:'whole',src:scene.src,inSec:0,outSec:70,speed:1}],old=projectStoryboard([scene],clips,30)[0],movedRaw={...scene,startMs:2000,endMs:62000},moved=projectStoryboard([movedRaw],clips,30)[0];assert.equal(quantitativeReadiness(moved,horizontal,fixture(old),proof,viewport,{rawScene:scene,clips,fps:30}).status,'blocked');assert.equal(quantitativeReadiness(moved,horizontal,fixture(old),proof,viewport,{rawScene:movedRaw,clips,fps:30}).status,'blocked');
 const shortClips=[{id:'cut',src:scene.src,inSec:25,outSec:40,speed:2}],short=projectStoryboard([scene],shortClips,30)[0];assert.equal(quantitativeReadiness(short,horizontal,fixture(short),proof,viewport,{rawScene:scene,clips:shortClips,fps:30}).status,'blocked');
 assert.equal(quantitativeReadiness(scene,{...horizontal,provenance:'changed'},m,proof).status,'blocked');assert.equal(quantitativeReadiness(scene,horizontal,{...m,fontKey:'different'},proof).status,'blocked');
 for(const t of [-1,60000,NaN,Infinity])assert.equal(quantitativeState(scene,horizontal,t,m,proof).readiness,'blocked');
});

test('full chart, thickness, all title fields and every known speaker keyframe avoid subtitle/protected footprints',()=>{
 const cases=[{...horizontal,protectedAreas:[{rect:{x:.3,y:.3,width:.1,height:.1}}]},{...horizontal,items:horizontal.items.map((i,j)=>j?i:{...i,valueRect:base.speakerRect})},{...horizontal,copyWindow:{...base.copyWindow,rect:{x:.1,y:.7,width:.6,height:.2}}},{...horizontal,items:horizontal.items.map((i,j)=>j?i:{...i,valueRect:i.labelRect})}];for(const c of cases)assert.ok(quantitativeIssues(scene,c).length);
 const moving={...scene,window:{x:.85,y:.1,size:.10,keyframes:[{atMs:30000,x:.3,y:.25,size:.10}]}};assert.ok(quantitativeIssues(moving,horizontal).some(i=>i.includes('protected')||i.includes('speaker')));
 for(const atMs of [NaN,-1,60001])assert.ok(quantitativeIssues({...scene,window:{x:.85,y:.1,size:.10,keyframes:[{atMs,x:.85,y:.1,size:.10}]}},horizontal).includes('speaker-keyframe-clock-invalid'));
 for(const c of quantitativeChartControls){assert.equal(c.canApply,false);assert.equal(c.automaticAllowed,false);assert.equal(c.fields.find(f=>f.key==='binding').readonly,true);assert.ok(c.fields.find(f=>f.key==='provenance'));}
});

test('each actual retained readable page includes complete body/detail/conditions, with a local late-condition page clock',()=>{
 const full=quantitativeCopy(lineScene,line);for(const value of [lineScene.title,lineScene.body,...lineScene.nodes.flatMap(n=>[n.text,n.detail,...(n.bullets??[])])].filter(Boolean))assert.ok(full.includes(value));
 const s={...lineScene,endMs:601000,body:'完整条件不能被省略，先明确单位再讨论变化。'.repeat(100),nodes:lineScene.nodes.map(n=>n.id==='condition'?{...n,detail:'晚入条件必须从第一页开始显示。'.repeat(30)}:n)},c={...line,binding:{...binding,endMs:601000},copyWindow:{...line.copyWindow,endMs:400000},chartWindow:{atMs:400000,endMs:600000},series:line.series.map(s=>({...s,points:s.points.map(p=>({...p,atMs:p.atMs+378000}))})),conditions:line.conditions.map(k=>({...k,atMs:420000,endMs:600000}))},p={...proof,endMs:601000},m=fixture(s,c),state=quantitativeState(s,c,420000,m,p);assert.equal(state.readiness,'ready');
 const copy=m.fields.find(f=>f.id==='source-copy'),condition=m.fields.find(f=>f.id==='condition-conditionA');assert.ok(copy.fit.pages.length>1);assert.ok(condition.fit.pages.length>1);assert.equal(state.fields.find(f=>f.id==='condition-conditionA').page.index,0);
 for(let i=0;i<condition.fit.pages.length;i++){const t=420000+(i+.5)*180000/condition.fit.pages.length;assert.equal(quantitativeState(s,c,t,m,p).fields.find(f=>f.id==='condition-conditionA').page.index,i);}
 const tooFast={...s,speed:100};assert.equal(quantitativeReadiness(tooFast,c,fixture(tooFast,c),p).status,'blocked');assert.equal(quantitativeReadiness(s,c,{...m,fields:m.fields.map(f=>f.id==='source-copy'?{...f,fit:{...f.fit,unplaceable:true}}:f)},p).status,'blocked');
});

// React visibility regressions execute actual renderer branches; fonts are mocked
// with explicitly synthetic metrics. They do NOT establish browser/pixel approval.
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactUrl=import.meta.resolve('react');
const fakeReact=data(`import React from ${JSON.stringify(reactUrl)};export default React;export const useContext=()=>globalThis.__quant.font;export const useCallback=f=>f;export const useState=()=>[globalThis.__quant.reports,()=>{}];export const useLayoutEffect=f=>f();`);
const fakeRender=data(`import React from ${JSON.stringify(reactUrl)};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const useVideoConfig=()=>globalThis.__quant.viewport;export const DisplayFontContext={};export const useMeasuredText=text=>({fit:globalThis.__quant.fits[text]??null,family:'synthetic'});export const useStableGlyphLayout=()=>globalThis.__quant.glyphFit;`);
const code=fs.readFileSync(new URL('../src/QuantitativeChartScene.tsx',import.meta.url),'utf8').replaceAll("'react'",JSON.stringify(fakeReact)).replaceAll("'remotion'",JSON.stringify(fakeRender)).replaceAll("'./DisplayFont'",JSON.stringify(fakeRender)).replaceAll("'./MeasuredText'",JSON.stringify(fakeRender)).replaceAll("'./StableGlyphLayout'",JSON.stringify(fakeRender)).replaceAll("'./quantitative-chart.mjs'",JSON.stringify(new URL('../src/quantitative-chart.mjs',import.meta.url).href)).replaceAll("'./dynamic-mechanisms.mjs'",JSON.stringify(new URL('../src/dynamic-mechanisms.mjs',import.meta.url).href));
const {QuantitativeChartScene}=await import(data(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText));
function render(s=scene,c=horizontal,time=28000,{v=viewport,waiting=false,speakerProof=proof,speakerOutput='video',projectionProof}={}){
 const m=fixture(s,c,v),glyphFit={fontSize:28,family:'synthetic',advance:20,unitWidth:80,rowHeight:32,unplaceable:false},reports={key:m.key,fields:Object.fromEntries(m.fields.map(f=>[f.id,{...f,fit:waiting?null:f.fit,family:'synthetic'}])),numbers:Object.fromEntries(quantitativeNumberPlans(c).map(p=>[p.id,{id:p.id,specKey:JSON.stringify(p),fit:waiting?null:glyphFit}]))},readiness=[],calls=[];
 globalThis.__quant={font:m.fontKey,viewport:v,reports,fits:Object.fromEntries(m.fields.map(f=>[f.text,waiting?null:f.fit])),glyphFit:waiting?null:glyphFit};
 try{return {html:renderToStaticMarkup(React.createElement(QuantitativeChartScene,{scene:s,config:c,elapsed:time,speakerProof,projectionProof,renderSpeaker:p=>{calls.push(p);return speakerOutput==='video'?React.createElement('video',{'data-actual-source':c.binding.src}):speakerOutput;},onReadiness:r=>readiness.push(r)})),readiness,calls};}finally{delete globalThis.__quant;}
}

test('actual renderer preserves speaker through copy/font wait and shows only current complete pages and stable numerals',()=>{
 const copy=render(scene,horizontal,4000);assert.equal(copy.readiness.at(-1).status,'ready');assert.ok(copy.html.includes('data-chart-field="source-copy"'));assert.ok(!copy.html.includes('data-quantitative-native-chart='));assert.ok(copy.html.includes(scene.body));assert.ok(copy.html.includes('先核验单位'));assert.ok(copy.html.includes('data-chart-real-speaker="true"'));assert.equal(copy.calls[0].sourceMs,5000);
 for(const [s,c] of [[scene,horizontal],[scene,signed],[lineScene,line]]){const graph=render(s,c,31000);assert.equal(graph.readiness.at(-1).status,'ready');assert.ok(graph.html.includes('data-quantitative-native-chart="true"'));assert.ok(!graph.html.includes('data-chart-field="source-copy"'));}
 const graph=render(scene,signed,40000);assert.ok(graph.html.includes('data-chart-number="+7"'));assert.ok(graph.html.includes('data-chart-number="−5"'));assert.ok(graph.html.includes('data-original-depth-side="true"'));assert.ok(graph.html.includes('data-common-zero="true"'));
 const condition=render(lineScene,line,30000);assert.ok(condition.html.includes('data-code-line-active="true"'));assert.ok(condition.html.includes('data-explicit-condition-region="conditionA"'));assert.ok(condition.html.includes('其他条件不能省略'));
 const wait=render(scene,horizontal,28000,{waiting:true});assert.equal(wait.readiness.at(-1).status,'waiting');assert.ok(!wait.html.includes('data-quantitative-native-chart='));assert.ok(wait.html.includes('data-chart-real-speaker="true"'));
});

test('empty/foreign speaker or changed readiness cannot leave an old ready frame, including null configuration',()=>{
 for(const out of [null,false,[],React.createElement(React.Fragment,null),React.createElement('div',null)]){const r=render(scene,horizontal,28000,{speakerOutput:out});assert.equal(r.calls.length,1);assert.equal(r.readiness.at(-1).status,'blocked');assert.ok(!r.html.includes('data-quantitative-native-chart='));assert.ok(!r.html.includes('data-chart-real-speaker='));}
 const results=[render(),render(scene,horizontal,28000,{speakerProof:{...proof,sha256:'c'.repeat(64)}}),render(),render(scene,horizontal,28000,{waiting:true})];assert.deepEqual(results.map(r=>r.readiness.at(-1).status),['ready','blocked','ready','waiting']);
 const r=render(scene,{...horizontal,provenance:''});assert.equal(r.readiness.at(-1).status,'blocked');assert.ok(!r.html.includes('data-quantitative-native-chart='));
});

test('horizontal and portrait layouts must independently fit rather than relying on wide-only placement',()=>{
 for(const v of [viewport,portrait])for(const [s,c] of [[scene,horizontal],[scene,signed],[lineScene,line]]){const m=fixture(s,c,v);assert.deepEqual(quantitativeIssues(s,c,v),[]);assert.equal(quantitativeReadiness(s,c,m,proof,v).status,'ready',JSON.stringify(m.fields.filter(f=>f.fit.unplaceable).map(f=>f.id)));assert.equal(render(s,c,31000,{v}).readiness.at(-1).status,'ready');}
});

test('actual multi-page visibility starts late labels at page zero and gives every page its own visible source interval',()=>{
 const s={...lineScene,endMs:601000,body:'不能遗漏单位和限制条件。'.repeat(150),nodes:lineScene.nodes.map(n=>n.id==='condition'?{...n,detail:'晚入文本必须完整显示。'.repeat(40)}:n)},c={...line,binding:{...binding,endMs:601000},copyWindow:{...line.copyWindow,endMs:400000},chartWindow:{atMs:400000,endMs:600000},series:line.series.map(s=>({...s,points:s.points.map(p=>({...p,atMs:p.atMs+378000}))})),conditions:line.conditions.map(k=>({...k,atMs:420000,endMs:600000}))},p={...proof,endMs:601000},m=fixture(s,c),cf=m.fields.find(f=>f.id==='source-copy'),condition=m.fields.find(f=>f.id==='condition-conditionA');assert.ok(cf.fit.pages.length>1&&condition.fit.pages.length>1);
 for(let i=0;i<cf.fit.pages.length;i++){const r=render(s,c,(i+.5)*400000/cf.fit.pages.length,{speakerProof:p});assert.equal(r.readiness.at(-1).status,'ready');assert.ok(r.html.includes(`data-chart-field="source-copy" data-chart-page="${i}"`));assert.ok(r.html.includes(`data-chart-text-page="${i}" aria-hidden="false"`));assert.equal((r.html.match(/aria-hidden="false"/g)??[]).length,1);}
 for(let i=0;i<condition.fit.pages.length;i++){const r=render(s,c,420000+(i+.5)*180000/condition.fit.pages.length,{speakerProof:p});assert.equal(r.readiness.at(-1).status,'ready');assert.ok(r.html.includes(`data-chart-field="condition-conditionA" data-chart-page="${i}"`));}
});
