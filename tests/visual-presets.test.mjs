import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {visualPresets,visualPresetIssues,applyVisualPreset,visualSequence,visualContentRect,suggestVisualPresets} from '../src/visual-presets.mjs';
import {sceneSpeakerLayout,validateStoryboard,projectStoryboard} from '../src/storyboard.mjs';
import {applyVisualPresetToStore} from '../editor/apply-visual-preset.mjs';

const measured=(text,size)=>({width:Array.from(text).reduce((n,char)=>n+(char==='W'?1.5:/[a-z ]/i.test(char)?.45:1),0)*size,ascent:size*.85,descent:size*.23});
const scene={id:'visual',clipId:'voice',src:'clips/synthetic.mp4',startMs:1000,endMs:7000,layout:'cards',title:'完整内容按表达选择',nodes:[{id:'past',text:'过去：从手工记录开始',detail:'保留完整说明，不把标题截成前四字',atMs:0},{id:'now',text:'现在：让程序协作完成',atMs:3000}],tags:[{id:'tag',text:'合成强调',atMs:0,endMs:2000,x:.1,y:.2}],media:{src:'broll-assets/synthetic.svg',kind:'image',width:1600,height:1000}};
const presentation={theme:'knowledge',format:'landscape',style:'reference',chapters:[],scenes:[scene,{...scene,id:'other',startMs:7000,endMs:10000}]};

test('fitting measures the full text, including spaces and graphemes, without trimming content',()=>{
 for(const text of ['过去：从手工记录开始','AI Agent keeps spaces and WWW','数字 17.5% 不能误删','保留\n显式换行','人物 👨‍👩‍👦 与证据']){
  const fit=fitMeasuredText(text,{width:360,height:240,minFont:28,maxFont:80,measure:measured});
  assert.equal(fit.lines.join(''),text.replaceAll('\n',''));assert.ok(fit.fontSize>=28);assert.ok(fit.width<=360);
  assert.equal(fit.pages.flat().join(''),text.replaceAll('\n',''));
  assert.ok(fit.pages.every(page=>page.length*fit.rowHeight<=240));
 }
});
test('font metrics affect fit and vertical metrics paginate rather than silently shrink or lose a tail',()=>{
 const text='完整的长说明需要保留前因后果。'.repeat(20),wide=fitMeasuredText(text,{width:400,height:220,minFont:32,maxFont:80,measure:measured});
 const narrow=fitMeasuredText(text,{width:400,height:220,minFont:32,maxFont:80,measure:(v,s)=>({...measured(v,s),width:measured(v,s).width*.5})});
 assert.ok(wide.pages.length>1);assert.ok(wide.pages.length>narrow.pages.length);assert.equal(wide.fontSize,32);assert.equal(wide.pages.flat().join(''),text);
 const tall=fitMeasuredText('完整说明',{width:400,height:220,minFont:32,maxFont:80,measure:(v,s)=>({...measured(v,s),ascent:s*2,descent:s*.7})});
 assert.ok(tall.height<=220);assert.ok(tall.rowHeight>=tall.fontSize*2.7);
});
test('explicit timed phrases remain whole and no phrase is invented from a fixed keyword list',()=>{
 const text='结果需要依据，任务也要做完';const fit=fitMeasuredText(text,{width:250,height:300,minFont:30,maxFont:60,measure:measured,protectedPhrases:['需要依据']});
 assert.equal(fit.lines.join(''),text);assert.ok(fit.lines.some(line=>line.includes('需要依据')));
});
test('a preset changes only explicit visual settings; removing it restores all authored content',()=>{
 const before=structuredClone(presentation),out=applyVisualPreset(presentation,'visual','type-relay',{side:'left'});assert.equal(out.ok,true);
 const applied=out.presentation.scenes[0],{visualPreset,...rest}=applied;
 assert.deepEqual(rest,scene);assert.deepEqual(visualPreset,{id:'type-relay',version:1,side:'left'});assert.equal(applied.nodes,scene.nodes);assert.equal(applied.tags,scene.tags);assert.equal(out.presentation.scenes[1],presentation.scenes[1]);
 const removed=applyVisualPreset(out.presentation,'visual',null);assert.equal(removed.ok,true);assert.deepEqual(removed.presentation,presentation);assert.deepEqual(presentation,before);
});
test('requirements reject missing/foreign/short matte, missing evidence, and off-person placement',()=>{
 assert.ok(visualPresetIssues(scene,'person-backdrop').length);
 const matte={prefix:'broll-assets/person/frame-',sourceStartMs:1000,endMs:7000,fps:30,count:180,src:scene.src,sourceSha256:'a'.repeat(64),width:1920,height:1080};
 assert.deepEqual(visualPresetIssues({...scene,personMatte:matte},'person-backdrop'),[]);
 for(const bad of [{...matte,src:'clips/other.mp4'},{...matte,count:20},{...matte,sourceSha256:'bad'}])assert.ok(visualPresetIssues({...scene,personMatte:bad},'person-backdrop').length);
 assert.ok(visualPresetIssues({...scene,media:undefined},'floating-evidence').length);
 const crowded={...scene,window:{x:.05,y:.4,size:.25}};
 assert.equal(applyVisualPreset({...presentation,scenes:[crowded]},scene.id,'fine-process',{side:'left'}).ok,false);
 assert.equal(applyVisualPreset({...presentation,scenes:[crowded]},scene.id,'fine-process',{side:'right'}).ok,true);
 const grouped=applyVisualPreset(presentation,scene.id,'grouped-evidence',{primaryNodeIds:['now']});assert.equal(grouped.ok,true);assert.deepEqual(grouped.presentation.scenes[0].visualPreset.primaryNodeIds,['now']);assert.equal(grouped.presentation.scenes[0].nodes,scene.nodes);
 for(const primaryNodeIds of [[],['past','now'],['absent']])assert.equal(applyVisualPreset(presentation,scene.id,'grouped-evidence',{primaryNodeIds}).ok,false);
});
test('presets have distinct speaker modes and retain authored source-clock entry points',()=>{
 assert.equal(sceneSpeakerLayout({...scene,titleTreatment:'embedded',visualPreset:{id:'type-relay',version:1}}),'slide');
 assert.equal(sceneSpeakerLayout({...scene,visualPreset:{id:'clear-type',version:1}}),'speaker');
 assert.equal(visualSequence(scene,2999).current.id,'past');assert.equal(visualSequence(scene,3000).current.id,'now');
 const automatic={...scene,nodes:scene.nodes.map(({atMs,...node})=>node)};assert.equal(visualSequence(automatic,3000).current.id,'now');
 assert.deepEqual(visualSequence({...scene,nodes:scene.nodes.map(node=>({...node,atMs:0}))},1000).starts,[0,3000]);
 assert.deepEqual(visualSequence({...scene,nodes:scene.nodes.map((node,i)=>({...node,atMs:0,focusMs:i*2200}))},2500).starts,[0,2200]);
 const rect=visualContentRect({...scene,visualPreset:{id:'type-relay',version:1}},1920,1080);assert.ok(rect.x+rect.width<1920*.76);assert.ok(rect.y+rect.height<1080*.85);
 assert.ok(validateStoryboard([{...scene,visualPreset:{id:'unknown',version:1}}],[{id:'voice',src:scene.src,inSec:0,outSec:10}]).some(i=>/未知动效/.test(i.message)));
});
test('recommendations depend on current content and requirements, with only latest-five verified references',()=>{
 assert.equal(suggestVisualPresets(scene)[0].id,'floating-evidence');assert.ok(suggestVisualPresets({...scene,media:undefined})[0].id!=='floating-evidence');
 for(const preset of visualPresets)if(preset.provenance){assert.ok(['https://www.douyin.com/video/7699453390744489226','https://www.douyin.com/video/7697586978954497290'].includes(preset.provenance.url));assert.ok(['2026-10-22','2026-10-17'].includes(preset.provenance.publishedAt));}
 assert.deepEqual(suggestVisualPresets(scene),suggestVisualPresets(scene));
});

test('cut and speed projections retain the full source-scene duration and object phase',()=>{
 const original={...scene,startMs:0,endMs:10000,nodes:scene.nodes.map(({atMs,...node})=>node)};
 for(const speed of [1,2,.5]){
  const fragments=projectStoryboard([original],[{id:'part-a',src:scene.src,inSec:2,outSec:4,speed},{id:'part-b',src:scene.src,inSec:6,outSec:8,speed}],30);
  for(const [index,fragment] of fragments.entries()){
   const elapsed=(fragment.startMs-fragment.phaseStartMs)*speed,sequence=visualSequence(fragment,elapsed);
   assert.equal(sequence.duration,10000);assert.deepEqual(sequence.starts,[0,5000]);assert.equal(sequence.index,index);assert.equal(sequence.current.id,original.nodes[index].id);
   assert.equal(sequence.to,index===0?5000:10000);
  }
 }
});

test('static text reserves the full authored person-window path and the actual portrait default',()=>{
 const settings={id:'type-relay',version:1,side:'left'};
 const moving={...scene,visualPreset:settings,window:{x:.76,y:.46,size:.205,keyframes:[{atMs:1000,x:.1,y:.46,size:.205}]}};
 assert.ok(visualPresetIssues(moving,'type-relay').some(v=>v.includes('空间不足')));
 const safe={...moving,window:{...moving.window,keyframes:[{atMs:1000,x:.65,y:.46,size:.25}]}};
 const rect=visualContentRect(safe,1920,1080);assert.ok(rect.x+rect.width<.65*1920);
 const portrait=visualContentRect({...scene,visualPreset:settings},1080,1920);assert.ok(portrait.x+portrait.width<.645*1080);
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64');
const timelineUrl=moduleUrl(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
const compiled=file=>{
 const url=new URL(file,import.meta.url),source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s.endsWith('/timeline')?timelineUrl:s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
};
const {useEditor}=await compiled('../editor/store.ts');
test('the real store applies one scene in one undo and keeps all speech, source time and other scenes',()=>{
 const clips=[{id:'voice',src:scene.src,inSec:0,outSec:10,sourceDurationSec:10,speed:1}],captions=[{id:'cap',clipId:'voice',startMs:1100,endMs:6500,topPct:91,words:[{text:'保留真人原话',startMs:1100,endMs:6500,accent:false}]}];
 useEditor.getState().init({fps:30,width:1920,height:1080,durationInFrames:300},captions,'#3156b9',clips,null,[],[],presentation);
 const result=applyVisualPresetToStore(useEditor,'visual','fine-process');assert.equal(result.ok,true);assert.equal(useEditor.getState().past.length,1);assert.equal(useEditor.getState().clips,clips);assert.equal(useEditor.getState().captions,captions);assert.deepEqual(useEditor.getState().presentation.scenes[0].nodes,scene.nodes);
 applyVisualPresetToStore(useEditor,'visual','fine-process');assert.equal(useEditor.getState().past.length,1);
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation,presentation);assert.equal(useEditor.getState().clips,clips);assert.equal(useEditor.getState().captions,captions);
});

test('legacy criteria renderer passes a complete original title, never the first four characters',async()=>{
 const url=new URL('../src/EditorialCriteria.tsx',import.meta.url),fakeText='data:text/javascript,import React from '+JSON.stringify(import.meta.resolve('react'))+';export const MeasuredText=props=>React.createElement("div",null,props.text);';
 const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='remotion'?'data:text/javascript,export const useVideoConfig=()=>({width:1920,height:1080,fps:30});':s==='./MeasuredText'?fakeText:s==='./OverviewComparison'?'data:text/javascript,export const OverviewComparison=()=>null;':s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
 const {EditorialCriteria}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const first=renderToStaticMarkup(React.createElement(EditorialCriteria,{scene,elapsed:1000}));assert.ok(first.includes(scene.nodes[0].text));assert.ok(!first.includes('过去：从</div>'));
 const second=renderToStaticMarkup(React.createElement(EditorialCriteria,{scene,elapsed:4000}));assert.ok(second.includes(scene.nodes[1].text));assert.ok(!second.includes('现在：让</div>'));assert.ok(!second.includes('grid-template-columns'));
});

test('preset renderers page every full title on the source clock and keep middle-cut evidence visible',async()=>{
 const react=JSON.stringify(import.meta.resolve('react'));
 const fakeText=moduleUrl(`import React from ${react};export const calls=[];export const MeasuredText=props=>{calls.push(props);return React.createElement('div',{'data-text':props.text},props.text);};`);
 const remotion=moduleUrl(`import React from ${react};export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const AbsoluteFill=({children,...props})=>React.createElement('div',{'data-fill':'true',...props},children);export const staticFile=s=>s;export const Img=props=>React.createElement('img',props);`);
 const nullExports=names=>moduleUrl(names.map(name=>`export const ${name}=()=>null;`).join(''));
 const load=async(file)=>{
  const url=new URL(file,import.meta.url),mocks={remotion,'./MeasuredText':fakeText,'./SceneMedia':nullExports(['SceneMedia']),'./SceneIcon':nullExports(['SceneIcon']),'./SpatialEvidenceScene':nullExports(['SpatialEvidenceScene'])};
  const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(mocks[s]??(s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s)))}`);
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 };
 const {VisualPresetScene}=await load('../src/VisualPresetScene.tsx'),{SpatialEvidenceScene}=await load('../src/SpatialEvidenceScene.tsx'),{calls}=await import(fakeText);
 const full={...scene,startMs:0,endMs:10000,title:'完整的长标题必须在跨剪口后仍按原场时钟展示全部页面。'.repeat(4),nodes:[{id:'a',text:'完整对象',category:'完整的主组分类',bullets:['唯一附加条件：需要验证']},{id:'b',text:'另一个对象',category:'完整的外部分类'}],links:[{id:'link',from:'a',to:'b',label:'完整关系说明'}]};
 for(const id of ['floating-evidence','orbit-evidence','grouped-evidence']){
  const projected=projectStoryboard([{...full,visualPreset:{id,version:1}}],[{id:'middle',src:scene.src,inSec:2,outSec:4,speed:2}],30)[0];
  calls.length=0;const html=renderToStaticMarkup(React.createElement(id==='floating-evidence'?VisualPresetScene:SpatialEvidenceScene,{scene:projected,elapsed:2000}));
  assert.match(html,/data-fill="true" style="pointer-events:none;opacity:1"/);
  for(const text of [full.title,...(id==='grouped-evidence'?['完整的主组分类','完整的外部分类','完整关系说明']:[])]){
   const props=calls.find(call=>call.text===text);assert.ok(props,`renderer must retain ${text}`);assert.equal(props.elapsed,2000);assert.equal(props.duration,10000);
  }
  if(id==='orbit-evidence')assert.ok(calls.some(call=>call.text.includes('唯一附加条件：需要验证')));
 }
});

test('classic projects use the real preset speaker window and suppress only overlapping legacy motion',async()=>{
 const react=JSON.stringify(import.meta.resolve('react'));
 const stub='data:text/javascript;base64,'+Buffer.from(`import React from ${react};let frame=90;export const setFrame=n=>frame=n;export const useCurrentFrame=()=>frame;export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const getRemotionEnvironment=()=>({isRendering:false});export const staticFile=s=>s;export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const Sequence=({children})=>children;export const Video=({src,style})=>React.createElement('video',{src,style});export const OffthreadVideo=Video;export const Audio=()=>null;export const interpolate=()=>1;`).toString('base64');
 const nullExports=names=>'data:text/javascript,'+names.map(name=>`export const ${name}=()=>null;`).join('');
 const url=new URL('../src/MultiClipVideo.tsx',import.meta.url);
 const broll='data:text/javascript,export const BrollLayer=()=>null;export const projectBrolls=items=>items;';
 const captionsSource=ts.transpileModule(fs.readFileSync(new URL('../src/captions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './timeline'",`from ${JSON.stringify(timelineUrl)}`);
 const captionsUrl='data:text/javascript;base64,'+Buffer.from(captionsSource).toString('base64');
 const display='data:text/javascript,import React from '+react+';export const DisplayFontContext=React.createContext(undefined);export const useDisplayFont=()=>{};';
 const source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>{
  const mocks={remotion:stub,'./AudioClockPlayback':'data:text/javascript,export const AudioClockPlayback=({children})=>children;export const useAudioClockMixer=()=>({forceMuteOriginal:false,forceMuteMusic:false,runtimeFor:()=>undefined,reportSpeaker:()=>{}});','./TalkingMotionLayer':nullExports(['TalkingMotionLayer']),'./DynamicMotionLayer':nullExports(['DynamicMotionLayer']),'./DisplayFont':display,'./EmbeddedTitle':nullExports(['EmbeddedTitle']),'./ClipFocusWindows':nullExports(['ClipFocusWindows']),'./StoryboardLayer':nullExports(['StoryboardLayer']),'./ReferenceLayer':nullExports(['ReferenceLayer']),'./KnowledgeLayer':nullExports(['KnowledgeLayer']),'./CaptionTrack':nullExports(['CaptionTrack']),'./MotionLayer':'data:text/javascript,import React from '+react+';export const MotionLayer=()=>React.createElement("div",{"data-legacy-motion":"true"});','./Broll':broll,'./captions':captionsUrl,'./timeline':timelineUrl};
  return `from ${JSON.stringify(mocks[s]??(s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s)))}`;
 });
 const {MultiClipVideo}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),{setFrame}=await import(stub);
 const props={clips:[{id:'voice',src:scene.src,inSec:0,outSec:10,sourceDurationSec:10}],captions:[{id:'cap',clipId:'voice',startMs:0,endMs:10000,topPct:91,words:[],motion:{kind:'card',title:'旧动效'}}],presentation:{...presentation,theme:'classic',scenes:[{...scene,visualPreset:{id:'type-relay',version:1}}]}};
 const during=renderToStaticMarkup(React.createElement(MultiClipVideo,props));
 const speakerStyle=during.match(/data-ab="clip:voice"[^>]*style="([^"]+)"/)[1],speakerWidth=Number(speakerStyle.match(/(?:^|;)width:([\d.]+)px/)[1]);
 assert.ok(Math.abs(speakerWidth-393.6)<1e-8);assert.ok(!during.includes('data-legacy-motion'));
 setFrame(240);const after=renderToStaticMarkup(React.createElement(MultiClipVideo,props));assert.ok(after.includes('data-legacy-motion'));assert.match(after,/data-ab="clip:voice"[^>]+width:42%/);
});

 test('switching to a basic preset or original layout removes an independent dynamic selection',()=>{
 const original={...scene,dynamicMotion:{version:1,config:{kind:'emphasis-phrase'}}},input={...presentation,scenes:[original]};
 for(const id of ['type-relay',null]){const result=applyVisualPreset(input,scene.id,id);assert.equal(result.ok,true);assert.equal(result.presentation.scenes[0].dynamicMotion,undefined);assert.equal(result.presentation.scenes[0].nodes,original.nodes);assert.equal(original.dynamicMotion.config.kind,'emphasis-phrase');}
 });
