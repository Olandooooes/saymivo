import test from 'node:test';
import assert from 'node:assert/strict';
import {createDynamicLibraryConfig,dynamicMotionLibrary} from '../src/dynamic-motion-library.mjs';
import {dynamicMechanismControls} from '../src/dynamic-mechanism-adapter.mjs';
import {phraseChoreographyControls,phraseChoreographyIssues} from '../src/phrase-choreography.mjs';
import {dynamicMechanismIssues,glassCapsuleState,flipBoardPages} from '../src/dynamic-mechanisms.mjs';
import {completeSourceCopyIssues} from '../src/complete-source-copy.mjs';
import {sceneSpeakerLayout} from '../src/storyboard.mjs';
import {speakerBox} from '../src/presentation.mjs';
const scene={id:'s',src:'clips/test.mp4',startMs:1000,endMs:61000,title:'完整标题',body:'包括限定条件',nodes:[{id:'n-a',text:'第一条',detail:'需要验证',bullets:['不是承诺']},{id:'n-b',text:'第二条'}],window:{x:.78,y:.4,size:.18}};
const env={width:1920,height:1080,sourceIdentity:{src:scene.src,sha256:'a'.repeat(64),width:1920,height:1080,kind:'video',durationSec:90}};
const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;

test('registry distinguishes all 32 mechanisms and chart variants without claiming UI acceptance',()=>{
 assert.equal(dynamicMotionLibrary.length,32);assert.equal(new Set(dynamicMotionLibrary.map(e=>e.id)).size,32);
 for(const e of dynamicMotionLibrary){assert.equal(typeof e.constructor,'function');assert.ok(e.name&&e.purpose);assert.ok(e.fields.length);assert.equal(e.uiAccepted,false);assert.equal(e.automaticAllowed,false);assert.equal(e.stage,'experimental-independent');}
 for(const c of [...dynamicMechanismControls,...phraseChoreographyControls]){
  const entry=dynamicMotionLibrary.find(e=>e.id===c.kind);assert.deepEqual(entry.fields.slice(0,c.fields.length),c.fields,'reuse the real editable control schema');
 }
 for(const variant of ['horizontal-bars','signed-columns','annotated-line']){const r=createDynamicLibraryConfig('quantitative-chart:'+variant,scene,env);assert.equal(r.config.kind,'quantitative-chart');assert.equal(r.config.variant,variant);assert.ok(r.requiredData.includes('provenance'));}
 assert.throws(()=>createDynamicLibraryConfig('quantitative-chart',scene,env));assert.throws(()=>createDynamicLibraryConfig('constructor',scene,env));
});

test('all source drafts preserve real words and stable IDs and never mutate the scene or environment',()=>{
 const before=structuredClone({scene,env});
 for(const e of dynamicMotionLibrary){const r=e.constructor(scene,env);assert.ok(r.config);assert.ok(Array.isArray(r.requiredData));assert.ok(Array.isArray(r.issues));}
 assert.deepEqual({scene,env},before);
 for(const id of ['emphasis-phrase','caret-phrase','cumulative-phrases','identity-sweep']){
  const draft=createDynamicLibraryConfig(id,scene,env);assert.deepEqual(draft.config.items.map(i=>i.nodeId),['n-a','n-b']);assert.deepEqual(draft.requiredData,[]);assert.deepEqual(phraseChoreographyIssues(scene,draft.config,env),[]);
 }
 const bilingual=createDynamicLibraryConfig('bilingual-board-transition',scene,env);assert.equal(bilingual.config.pairs[0].fromText,'第一条');assert.equal(bilingual.config.pairs[0].toText,undefined);assert.ok(bilingual.requiredData.includes('pairs[].toText'));
 const token=createDynamicLibraryConfig('source-token-transfer',scene,env);assert.equal(token.config.sources[0].expectedText,'第一条\n需要验证\n不是承诺');assert.equal(token.config.tokens,undefined);
});

test('phrase/capsule drafts leave the entire known person path clear and budget complete copy before motion',()=>{
 const moving={...scene,window:{...scene.window,keyframes:[{atMs:30000,x:.75,y:.36,size:.21}]}};
 const people=[moving.window,...moving.window.keyframes].map(w=>({x:w.x,y:w.y,width:w.size,height:w.size*env.width/env.height}));
 for(const id of ['emphasis-phrase','caret-phrase','cumulative-phrases','identity-sweep','glass-capsules','flip-board']){
  const {config,requiredData,issues}=createDynamicLibraryConfig(id,moving,env);assert.deepEqual(requiredData,[],id+':'+issues.join());
  if(config.items)for(const item of config.items)assert.ok(people.every(p=>!overlap(p,item.rect)));
  if(config.copyWindow)assert.ok(config.copyWindow.endMs<=config.items[0].atMs);
  if(id==='glass-capsules'){assert.deepEqual(dynamicMechanismIssues(moving,config,env),[]);assert.deepEqual(completeSourceCopyIssues(moving,config,env),[]);for(const item of glassCapsuleState(moving,config,config.atMs[0]).items)assert.ok(people.every(p=>!overlap(p,item.rect)));}
  if(id==='flip-board'){assert.deepEqual(dynamicMechanismIssues(moving,config,env),[]);assert.deepEqual(completeSourceCopyIssues(moving,config,env),[]);assert.ok(flipBoardPages(moving,config).entries.some(e=>e.text==='不是承诺'));}
 }
 const crossing={...scene,window:{x:.8,y:.4,size:.16,keyframes:[{atMs:20000,x:.05,y:.2,size:.3}]}};
 assert.ok(createDynamicLibraryConfig('flip-board',crossing,env).requiredData.includes('scene.window'),'fixed native flip board may not pretend a config rect moves it away from the face path');
});

test('long complete text, missing faces and stale source identity stay explicit rather than truncate or compress',()=>{
 const long={...scene,endMs:5000,nodes:[{id:'n',text:'保留限定条件，'.repeat(80),detail:'不能删掉这一句',bullets:['所有内容都要完整']} ]};
 for(const id of ['caret-phrase','glass-capsules','flip-board']){const result=createDynamicLibraryConfig(id,long,env);assert.ok(result.requiredData.includes('scene.durationMs'));assert.ok(result.issues.some(i=>i.includes('不会截字')));}
 assert.ok(createDynamicLibraryConfig('emphasis-phrase',{...scene,window:undefined},env).requiredData.includes('scene.window'));
 const wrong=createDynamicLibraryConfig('closed-loop-runner',scene,{...env,sourceIdentity:{...env.sourceIdentity,src:'clips/other.mp4'}});assert.ok(wrong.requiredData.includes('sourceIdentity'));assert.equal(wrong.config.binding.sha256,undefined);
 assert.ok(createDynamicLibraryConfig('caret-phrase',scene,{...env,sourceIdentity:{...env.sourceIdentity,durationSec:2}}).requiredData.includes('sourceIdentity'));
 assert.throws(()=>createDynamicLibraryConfig('caret-phrase',{...scene,sourceId:'s',phaseStartMs:0,phaseEndMs:60000},env));
 assert.throws(()=>createDynamicLibraryConfig('caret-phrase',{...scene,src:'../private.mp4'},env));
});

test('numeric, graph and tool constructors cannot invent statistics, timings, translations or completed jobs',()=>{
 const counter=createDynamicLibraryConfig('number-counter',scene,env);assert.equal(counter.config.from,undefined);assert.equal(counter.config.to,undefined);
 const funnel=createDynamicLibraryConfig('quantified-funnel-flow',scene,env);for(const key of ['totalCount','passedCount','unitPerDot','dataKind','provenance']){assert.equal(funnel.config[key],undefined);assert.ok(funnel.requiredData.includes(key));}
 const bars=createDynamicLibraryConfig('quantitative-chart:horizontal-bars',scene,env);assert.equal(bars.config.axis,undefined);for(const item of bars.config.items){assert.equal(item.from,undefined);assert.equal(item.to,undefined);}
 const hub=createDynamicLibraryConfig('hub-branch-flow',scene,env);assert.equal(hub.config.hubNodeId,undefined);assert.equal(hub.config.edges,undefined);assert.equal(hub.config.nodeStates,undefined);
 const task=createDynamicLibraryConfig('task-tracks',scene,env);assert.equal(task.config.domain,undefined);assert.equal(task.config.cursor,undefined);assert.equal(task.config.calendar,undefined);assert.ok(task.config.rows.every(r=>r.segments===undefined));
 const progressive=createDynamicLibraryConfig('progressive-ui',scene,env);assert.ok(progressive.config.elements.every(e=>e.role===undefined&&e.atMs===undefined));
});

test('ROI constructor uses only the selected actual asset identity and never guesses the region',()=>{
 const assetScene={...scene,nodes:[{id:'proof',text:'这是原图',assetSrc:'broll-assets/proof.png'}]},proof={src:'broll-assets/proof.png',sha256:'b'.repeat(64),width:800,height:1200,kind:'image'};
 const result=createDynamicLibraryConfig('screenshot-region-focus',assetScene,{...env,assetIdentity:proof});assert.equal(result.config.sourceWidth,800);assert.equal(result.config.sourceHeight,1200);assert.equal(result.config.mediaNodeId,'proof');assert.equal(result.config.focusRegion,undefined);assert.ok(result.requiredData.includes('focusRegion'));assert.ok(!result.requiredData.includes('assetIdentity'));
 const wrong=createDynamicLibraryConfig('screenshot-region-focus',assetScene,{...env,assetIdentity:env.sourceIdentity});assert.equal(wrong.config.sourceWidth,undefined);assert.ok(wrong.requiredData.includes('assetIdentity'));
 assert.ok(createDynamicLibraryConfig('emphasis-phrase',assetScene,env).requiredData.includes('evidenceComposition'));
});

test('a verified evidence identity is not reported missing while real node mapping and cues remain pending',()=>{
 const media={src:'broll-assets/proof.png',kind:'image',width:800,height:600},s={...scene,media},proof={src:media.src,sha256:'b'.repeat(64),width:800,height:600,kind:'image'};
 const valid=createDynamicLibraryConfig('evidence-handoff',s,{...env,assetIdentity:proof});assert.ok(!valid.requiredData.includes('assetIdentity'));assert.ok(valid.requiredData.includes('cues'));assert.ok(valid.requiredData.includes('mediaNodeId'),'loading a file does not decide which original node it represents');
 for(const wrong of [undefined,env.sourceIdentity,{...proof,src:'broll-assets/other.png'},{...proof,sha256:'bad'},{...proof,width:0},{...proof,kind:'video',durationSec:1}])assert.ok(createDynamicLibraryConfig('evidence-handoff',s,{...env,assetIdentity:wrong}).requiredData.includes('assetIdentity'));
 const nodeOnly={...scene,nodes:[{id:'proof-node',text:'真实资料',assetSrc:media.src}]};const node=createDynamicLibraryConfig('evidence-handoff',nodeOnly,{...env,assetIdentity:proof});assert.ok(!node.requiredData.includes('assetIdentity'));assert.equal(node.config.mediaNodeId,'proof-node');
 const multiple={...s,nodes:[...s.nodes,{id:'other',text:'另一份资料',assetSrc:'broll-assets/other.png'}]};assert.ok(createDynamicLibraryConfig('evidence-handoff',multiple,{...env,assetIdentity:proof}).requiredData.includes('assetIdentity'),'one proof cannot cover another declared picture');
 const videoScene={...scene,media:{src:'broll-assets/recording.mp4',kind:'video'}};assert.ok(createDynamicLibraryConfig('evidence-handoff',videoScene,{...env,assetIdentity:{...proof,src:videoScene.media.src,kind:'video'}}).requiredData.includes('assetIdentity'),'video identity requires its actual duration');
});

test('real default circular insets are known geometry without a manual window, while full-frame/editorial remain review-only',()=>{
 for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}])for(const layout of ['cards','flow','slide']){
  const s={...scene,layout,window:undefined,visualPreset:{id:'person-backdrop'}},e={...env,...viewport};
  const expected=speakerBox(sceneSpeakerLayout({...s,visualPreset:undefined}),e.width,e.height),r={x:expected.left/e.width,y:expected.top/e.height,width:expected.width/e.width,height:expected.height/e.height};
  for(const id of ['emphasis-phrase','glass-capsules','flip-board']){
   const draft=createDynamicLibraryConfig(id,s,e);
   if(id==='flip-board'&&e.width<e.height)assert.ok(draft.issues.some(i=>i.includes('固定字板')),'portrait native board really intersects the known default inset');
   else assert.ok(!draft.requiredData.includes('scene.window'),id+layout+JSON.stringify(viewport));
   assert.ok(!draft.issues.some(i=>i.includes('尚无已知人物')),'a known default inset is not mistaken for an unknown face');
   if(draft.config.sourceCopyWindow)assert.deepEqual(draft.config.sourceCopyWindow.speakerRect,r,'copy uses the same real default inset as central renderer');
   const textRect=draft.config.items?.[0]?.rect??draft.config.rect??draft.config.sourceCopyWindow.rect;assert.equal(overlap(textRect,r),false);
  }
 }
 for(const s of [{...scene,window:undefined,layout:'speaker'},{...scene,window:undefined,layout:'headline',titleTreatment:'airy'}])assert.ok(createDynamicLibraryConfig('emphasis-phrase',s,env).requiredData.includes('scene.window'));
 const bad={...scene,layout:'cards',window:{x:.8,y:.8,size:.3}};assert.ok(createDynamicLibraryConfig('emphasis-phrase',bad,env).requiredData.includes('scene.window'),'an invalid authored path cannot fall back silently to the default');
});
