import test from 'node:test';
import assert from 'node:assert/strict';
import {createDynamicLibraryConfig,dynamicMotionLibrary} from '../src/dynamic-motion-library.mjs';
import {createSceneDynamicMotionDraft,previewSceneDynamicMotion,validateSavedSceneDynamicMotion} from '../src/scene-dynamic-motion.mjs';
import {dynamicEditorBindSourceEvidence} from '../editor/dynamic-editor-fields.mjs';
import {patchControlRecord,newControlValue} from '../editor/dynamic-control-values.mjs';
import {dynamicSourceSlotReport,dynamicRenderedSourceSlotReport} from '../src/dynamic-source-slot.mjs';
const raw={id:'s',clipId:'voice',src:'clips/synthetic.mp4',startMs:1000,endMs:61000,layout:'slide',title:'完整标题',body:'不是实际执行结果。',nodes:[{id:'a',text:'请求',detail:'保留约束',bullets:['English spaces']},{id:'b',text:'处理'}],window:{x:.78,y:.5,size:.18}};
const identity={src:raw.src,sha256:'a'.repeat(64),width:1920,height:1080,kind:'video',durationSec:70},clips=[{id:'voice',src:raw.src,inSec:1,outSec:61,speed:1}],env={clips,viewport:{width:1920,height:1080},fps:30,font:{key:'none',status:'ready'},sourceIdentity:identity,assets:[]},lib={...env.viewport,sourceIdentity:identity};
const clone=v=>structuredClone(v),left={x:.06,y:.3,width:.23,height:.25},right={x:.4,y:.3,width:.23,height:.25};
const bind={sceneId:raw.id,src:raw.src,sha256:identity.sha256,startMs:raw.startMs,endMs:raw.endMs};
const paired={kind:'paired-relations',variant:'correspondence',clock:'scene-source-relative-ms',binding:bind,sides:{a:{nodeId:'a',rect:left},b:{nodeId:'b',rect:right}},relation:{type:'correspondence',provenance:'明确原始说明中的双方对应，非执行数据'},copyWindow:{atMs:0,endMs:10000,rect:{x:.05,y:.08,width:.64,height:.68}},graphicWindow:{atMs:10000,endMs:60000},titleRect:{x:.05,y:.04,width:.64,height:.1},speakerRect:{x:.78,y:.5,width:.18,height:.32},phases:[{id:'focus',atMs:15000,moveMs:800,holdMs:3000,positions:{a:{...left,x:.08},b:{...right,x:.42}},active:'a'}]};
const veil={kind:'veil-state',clock:'scene-source-relative-ms',binding:bind,sourceKind:'illustration',provenance:'作者明确输入的中性遮蔽示意',copyWindow:{atMs:0,endMs:10000,rect:{x:.04,y:.035,width:.59,height:.79}},objects:[{id:'kept-a',nodeId:'a',expectedText:'请求\n保留约束\nEnglish spaces',rect:{x:.04,y:.18,width:.59,height:.4},atMs:10000,freezeAtMs:22000,freezeMs:600,releaseAtMs:30000,releaseMs:600,endMs:60000,appearance:{dimOpacity:.4,veilOpacity:.55,blurPxAt1080:8}}]};
const full={kind:'full-frame-blur-zoom',clock:'scene-source-relative-ms',binding:{...bind,width:identity.width,height:identity.height,durationSec:identity.durationSec},target:{kind:'source-video'},transition:{atMs:25000,peakMs:26000,endMs:27000,clearHoldMs:2000,peakScale:1.15,maxBlurPx:24,origin:{x:.48,y:.42}},copyWindow:{atMs:0,endMs:20000,rect:{x:.05,y:.05,width:.64,height:.65}},speakerRect:{x:.78,y:.5,width:.18,height:.32}};
function saved(config,scene=raw,e=env){return {...scene,dynamicMotion:previewSceneDynamicMotion(createSceneDynamicMotionDraft(scene,config,e))};}

test('all five added entries create bound editable drafts with missing factual/phase data explicit',()=>{
 const before=clone({raw,lib});
 for(const id of ['paired-relations:correspondence','paired-relations:horizontal-alternate','paired-relations:bidirectional','veil-state','full-frame-blur-zoom']){
  const entry=dynamicMotionLibrary.find(e=>e.id===id),draft=createDynamicLibraryConfig(id,raw,lib);
  assert.ok(entry?.purpose&&entry.fields.length);assert.equal(draft.config.binding.sha256,identity.sha256);assert.ok(draft.requiredData.length);assert.equal(entry.automaticAllowed,false);
  assert.equal(draft.config.relation?.provenance,undefined);assert.equal(draft.config.transition?.peakMs,undefined);
 }
 const p=createDynamicLibraryConfig('paired-relations:bidirectional',raw,lib);assert.equal(p.config.sides.a.nodeId,undefined);assert.equal(p.config.relation.type,undefined);assert.deepEqual(p.config.phases,[]);
 const v=createDynamicLibraryConfig('veil-state',raw,lib);assert.equal(v.config.objects[0].expectedText,'请求\n保留约束\nEnglish spaces');assert.equal(v.config.objects[0].freezeAtMs,undefined);assert.ok(v.config.objects[0].id);assert.equal(v.config.objects[0].appearance.dimOpacity,undefined);
 assert.deepEqual({raw,lib},before);
});

test('fully authored configurations use real retained projections and never stay permanently blocked on raw input',()=>{
 for(const c of [paired,veil,full]){
  assert.deepEqual(validateSavedSceneDynamicMotion(saved(c),env),{ok:true,issues:[]},c.kind);
  const duplicate={...env,clips:[clips[0],{...clips[0],id:'second'}]};assert.equal(validateSavedSceneDynamicMotion(saved(c,raw,duplicate),duplicate).ok,true,c.kind+' duplicate full instance');
  const cut={...env,clips:[{...clips[0],inSec:15}]};assert.equal(validateSavedSceneDynamicMotion(saved(c,raw,cut),cut).ok,false,c.kind+' removed copy/action');
  const wrong=clone(c);wrong.binding.sha256='b'.repeat(64);assert.equal(validateSavedSceneDynamicMotion(saved(wrong),env).ok,false,'valid-looking foreign SHA is not current source');
 }
 const fast={...env,clips:[{...clips[0],speed:4}]};assert.equal(validateSavedSceneDynamicMotion(saved(paired,raw,fast),fast).ok,false,'short phase hold after speed');assert.equal(validateSavedSceneDynamicMotion(saved(full,raw,fast),fast).ok,false,'clear hold after speed');
});

test('existing evidence can only survive in the one actually displayed full-frame image target',()=>{
 const image={src:'broll-assets/synthetic.png',sha256:'b'.repeat(64),kind:'image',width:1200,height:800},s={...raw,media:{src:image.src,kind:'image'}},e={...env,assets:[image]},c={...full,target:{kind:'scene-image',identity:image}};
 assert.equal(validateSavedSceneDynamicMotion(saved(c,s,e),e).ok,true);
 for(const primitive of [paired,veil,full])assert.equal(validateSavedSceneDynamicMotion(saved(primitive,s,e),e).ok,false);
 const stale={...c,target:{...c.target,identity:{...image,sha256:'c'.repeat(64)}}};assert.equal(validateSavedSceneDynamicMotion(saved(stale,s,e),e).ok,false);
 const extra={...s,nodes:[...s.nodes,{id:'extra',text:'另一份真实资料',assetSrc:'broll-assets/extra.png'}]},ee={...e,assets:[image,{...image,src:'broll-assets/extra.png'}]};assert.equal(validateSavedSceneDynamicMotion(saved(c,extra,ee),ee).ok,false);
 const draft=createDynamicLibraryConfig('full-frame-blur-zoom',s,{...lib,assetIdentity:image});assert.deepEqual(draft.config.target.identity,image);assert.ok(!draft.requiredData.includes('target.identity'));
});

test('structured controls synchronize complete source text and readonly real image identity after selection',()=>{
 const fields=dynamicMotionLibrary.find(e=>e.id==='veil-state').fields.find(f=>f.key==='objects').itemFields;
 const changed=patchControlRecord(fields,veil.objects[0],'nodeId','b',raw);assert.equal(changed.expectedText,'处理');assert.equal(changed.id,veil.objects[0].id);assert.throws(()=>patchControlRecord(fields,changed,'expectedText','删掉条件',raw));
 assert.equal(newControlValue({key:'id',type:'stable-id',readonly:true},{newId:()=> 'unique'}),'unique');
 const phases=dynamicMotionLibrary.find(e=>e.id==='paired-relations:bidirectional').fields.find(f=>f.key==='phases').itemFields;
 assert.equal(newControlValue(phases.find(f=>f.key==='flow')),undefined,'missing relation direction is not invented by add-item');assert.equal(phases.find(f=>f.key==='id').readonly,true);
 const img={src:'broll-assets/source.png',sha256:'b'.repeat(64),kind:'image',width:800,height:600},s={...raw,nodes:[{id:'proof',text:'原图',assetSrc:img.src}]};
 const bound=dynamicEditorBindSourceEvidence({...full,target:{kind:'scene-image',nodeId:'proof',identity:{...img,sha256:'c'.repeat(64)}}},s,[img]);assert.deepEqual(bound.target.identity,img);
 assert.equal(dynamicEditorBindSourceEvidence({...full,target:{kind:'scene-image',nodeId:'missing',identity:img}},s,[img]).target.identity,undefined);
 assert.deepEqual(dynamicEditorBindSourceEvidence({...full,target:{kind:'source-video',identity:img}},s,[img]).target,{kind:'source-video'});
});

test('slot reports derive readiness from actual decoded dimensions/path/clock and muted video, not declared identity',()=>{
 const actual={currentSrc:'http://localhost/clips/synthetic.mp4',videoWidth:1920,videoHeight:1080,currentTime:26.5,readyState:2,muted:true,error:null};
 assert.equal(dynamicSourceSlotReport(actual,identity,26500,30).status,'ready');
 for(const patch of [{currentSrc:'http://localhost/clips/foreign.mp4'},{videoWidth:800},{muted:false},{error:new Error('decode')}])assert.equal(dynamicSourceSlotReport({...actual,...patch},identity,26500,30).status,'blocked');
 for(const patch of [{currentTime:26},{readyState:1},{videoWidth:0}])assert.equal(dynamicSourceSlotReport({...actual,...patch},identity,26500,30).status,'waiting');
 assert.equal(dynamicSourceSlotReport(null,identity,26500,30).status,'waiting');
 assert.equal(dynamicRenderedSourceSlotReport({naturalWidth:1920,naturalHeight:1080},identity,26500).status,'ready');assert.equal(dynamicRenderedSourceSlotReport({naturalWidth:800,naturalHeight:600},identity,26500).status,'blocked');
});

// Exercise the actual central dispatch and source wrapper. Native mechanisms
// are replaced by transparent call-recording components; no decode is faked.
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {projectStoryboard} from '../src/storyboard.mjs';
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),reactUrl=JSON.stringify(import.meta.resolve('react'));
const remotionStub=data(`import React from ${reactUrl};export const AbsoluteFill=({children,...props})=>React.createElement('div',props,children);export const Video=({trimBefore,trimAfter,playbackRate,volume,onError,onLoadedData,onSeeked,onTimeUpdate,onCanPlay,...props})=>React.createElement('video',{...props,'data-test-trim':trimBefore,'data-test-volume':volume});export const OffthreadVideo=Video;export const staticFile=s=>'/'+s;export const useCurrentFrame=()=>0;export const useVideoConfig=()=>({width:1920,height:1080,fps:30});export const getRemotionEnvironment=()=>({isRendering:false});`);
const timelineStub=data('export const sampleTransform=()=>({x:0,y:0,scale:1});');
const nativeStub=data(`import React from ${reactUrl};const noop=()=>{};const node=(name,p)=>{globalThis.__dynamicCentralCalls.push({name,props:p});return React.createElement('div',{'data-test-native':name},p.renderSpeaker?.());};export const DynamicMechanismScene=p=>node('old',p);export const PhraseChoreographyScene=p=>node('phrase',p);export const SourceTokenTransferScene=p=>node('token',p);export const PersistentEntitiesScene=p=>node('persistent',p);export const TypedDataClockScene=p=>node('typed',p);export const ConditionalSetScene=p=>node('conditional',p);export const FieldRollBoardScene=p=>node('field-roll',p);export const PathRunnerScene=p=>node('path',p);export const FunnelFlowScene=p=>node('funnel',p);export const QuantitativeChartScene=p=>node('chart',p);export const ProgressiveUiScene=p=>node('progressive',p);export const TaskTracksScene=p=>node('task',p);export const AudioClockScene=p=>node('audio',p);export const VeilStateScene=p=>node('veil',p);export const PairedRelationsScene=p=>node('paired',p);export const FullFrameHandoffScene=p=>{globalThis.__dynamicCentralCalls.push({name:'full',props:p});const r={width:1920,height:1080,elapsed:p.elapsed,sourceMs:p.sourceProof.sourceMs,muted:true,volume:0,preserveFraming:true,onSourceStatus:noop};return React.createElement('div',{'data-test-native':'full'},p.renderSpeaker({...r,slotId:'speaker',mode:'inset'}),p.config.target.kind==='source-video'?p.renderSpeaker({...r,slotId:'full-frame',mode:'full-frame'}):null);};`);
const rendererUrl=new URL('../src/DynamicMotionRenderer.tsx',import.meta.url),rendererSource=ts.transpileModule(fs.readFileSync(rendererUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(name==='./DynamicMattePerson'?data('export const useDynamicMatteFrame=()=>({});export const DynamicMattePerson=()=>null;'):name==='remotion'?remotionStub:name==='./timeline'?timelineStub:name==='./AudioClockPlayback'?data('export const useAudioClockMixer=()=>({forceMuteOriginal:false,forceMuteMusic:false,runtimeFor:()=>undefined,reportSpeaker:()=>{}});'):name.endsWith('Scene')?nativeStub:name.startsWith('.')?new URL(name,rendererUrl).href:import.meta.resolve(name))}`);
const {DynamicMotionRenderer}=await import(data(rendererSource));
function central(config,scene=raw,e=env){globalThis.__dynamicCentralCalls=[];const projected=projectStoryboard([scene],e.clips,e.fps)[0],html=renderToStaticMarkup(React.createElement(DynamicMotionRenderer,{scene:projected,rawScene:scene,config,clips:e.clips,identity:e.sourceIdentity,assetIdentities:e.assets,draftKey:'synthetic-draft'}));return {html,calls:globalThis.__dynamicCentralCalls};}
test('central dispatch owns exactly the native speaker slots and creates no extra audio or fabricated ready report',()=>{
 for(const [config,name,count] of [[paired,'paired',1],[veil,'veil',1],[full,'full',2]]){
  const {html,calls}=central(config);assert.equal(calls[0].name,name);assert.equal((html.match(/<video /g)??[]).length,count);assert.equal((html.match(/data-dynamic-real-source=/g)??[]).length,1,'only the clear speaker certifies person visibility');
  assert.equal((html.match(/muted=""/g)??[]).length,count);assert.equal((html.match(/data-test-volume="0"/g)??[]).length,count);assert.ok(!html.includes('<audio'));assert.ok(html.includes('data-dynamic-preview-status="waiting"'),'a mounted slot is not a decoded slot');
  assert.equal(calls[0].props.projectionProof.rawScene,raw);assert.equal(calls[0].props.projectionProof.clips,clips);
  if(config===full){assert.equal(calls[0].props.sourceProof.status,'waiting');assert.equal(calls[0].props.sourceProof.sourceMs,raw.startMs);assert.equal(calls[0].props.sourceProof.audioOwner,'external-single-track');assert.equal((html.match(/data-test-trim="30"/g)??[]).length,2,'both slots retain the actual original source offset');}
 }
 const image={src:'broll-assets/original.png',sha256:'b'.repeat(64),width:1200,height:800,kind:'image'},s={...raw,media:{src:image.src,kind:'image'}},e={...env,assets:[image]},c={...full,target:{kind:'scene-image',identity:image}};
 const {html,calls}=central(c,s,e);assert.deepEqual(calls[0].props.assetIdentity,image);assert.equal((html.match(/<video /g)??[]).length,1);
 assert.equal(central(c,s,{...e,assets:[]}).calls[0].props.assetIdentity,undefined,'config cannot self-report actual image identity');
});
