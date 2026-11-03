import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStoryboard} from '../src/storyboard.mjs';
import {dynamicMechanismControls,createDynamicMechanismDraft,editDynamicMechanismDraft,bindDynamicScreenshotRegion,dynamicDraftKey,dynamicContentInventory,prepareDynamicMechanismPreview,dynamicPreviewClock} from '../src/dynamic-mechanism-adapter.mjs';

const sha='a'.repeat(64),src='clips/synthetic.mp4',image='broll-assets/diagram.png';
const scene={id:'source-scene',clipId:'original',src,startMs:1000,endMs:11000,title:'完整标题',body:'完整限制条件不能遗失',layout:'route',nodes:[{id:'one',text:'第一对象',detail:'保留完整条件',bullets:['需要验证']},{id:'two',text:'第二对象',assetSrc:image}],media:{src:image,kind:'image',width:1600,height:1000}};
const clips=[{id:'first',src,inSec:3,outSec:5,speed:2},{id:'last',src,inSec:9,outSec:11,speed:.5},{id:'foreign',src:'clips/other.mp4',inSec:1,outSec:11,speed:1}];
const environment={clips,viewport:{width:1920,height:1080},fps:30,font:{key:'synthetic-font-v1',status:'ready'},assets:[{src:image,sha256:'b'.repeat(64),width:1600,height:1000,status:'ready'}],sourceIdentity:{src,sha256:sha,width:1920,height:1080},appearance:{accentColor:'#abcdef'}};
const roi={kind:'screenshot-region-focus',sourceKind:'screenshot',provenance:'synthetic original diagram',sourceWidth:1600,sourceHeight:1000,focusRegion:{x:700,y:200,width:400,height:100},regionUnits:'source-pixels',maskScope:'asset-only',atMs:500,expandMs:600,holdMs:2000,returnMs:600,focusRect:{x:.1,y:.3,width:.5,height:.2},dimOpacity:.6,explanationCues:[]};

test('editable contract covers nine independent kinds, locks decoded/original fields and preserves source content',()=>{
 assert.equal(dynamicMechanismControls.length,9);assert.ok(dynamicMechanismControls.every(item=>item.stage==='experimental-independent'&&!item.uiAccepted&&!item.automaticAllowed));
 const original=structuredClone(scene),draft=createDynamicMechanismDraft(scene,{kind:'bilingual-board-transition',provenance:'synthetic authored translation',pairs:[{nodeId:'one',fromText:scene.nodes[0].text,toText:'First complete object',fromLanguage:'中',toLanguage:'EN',atMs:2000,rollMs:600}]},environment);
 const next=editDynamicMechanismDraft(draft,['pairs',0,'toText'],'The complete first object');assert.equal(next.config.pairs[0].toText,'The complete first object');assert.equal(draft.config.pairs[0].toText,'First complete object');assert.deepEqual(scene,original);
 assert.throws(()=>editDynamicMechanismDraft(draft,['pairs',0,'fromText'],'截短'));
 assert.throws(()=>editDynamicMechanismDraft(draft,['__proto__','polluted'],true));
 assert.throws(()=>editDynamicMechanismDraft(draft,['clipId'],'foreign'));
 const imageDraft=createDynamicMechanismDraft(scene,roi,environment);assert.throws(()=>editDynamicMechanismDraft(imageDraft,['sourceWidth'],1920));
});

test('retained previews keep the original source phase and independent reading windows across clips and speeds',()=>{
 const draft=createDynamicMechanismDraft(scene,{kind:'number-counter',from:0,to:100,atMs:500,countMs:1500},environment),prepared=prepareDynamicMechanismPreview(draft,scene,environment);
 assert.equal(prepared.projections.length,2);assert.equal(prepared.projections[0].clipId,'first');assert.equal(prepared.projections[1].clipId,'last');
 assert.deepEqual(dynamicPreviewClock(draft,prepared.projections[0],500),{elapsed:3000,sourceMs:4000,sourceDurationMs:10000,visibleDurationMs:1000});
 assert.deepEqual(dynamicPreviewClock(draft,prepared.projections[1],2000),{elapsed:8500,sourceMs:9500,sourceDurationMs:10000,visibleDurationMs:4000});
 assert.ok(prepared.issues.some(issue=>issue.code==='multiple-instances'));assert.equal(prepared.canApply,false);assert.equal(prepared.uiAccepted,false);
 assert.throws(()=>createDynamicMechanismDraft(prepared.projections[0],draft.config,environment),/投影/);
 assert.throws(()=>dynamicPreviewClock(draft,{...prepared.projections[0],clipId:'foreign'},500));
 assert.throws(()=>dynamicPreviewClock(draft,{...prepared.projections[0],speed:1,phaseEndMs:9500},500));
 assert.throws(()=>dynamicPreviewClock(draft,prepared.projections[0],1500));
});

test('changing cuts, FPS, actual image identity, font, appearance or full text makes the draft stale',()=>{
 const draft=createDynamicMechanismDraft(scene,roi,environment);
 for(const changed of [{...environment,clips:clips.map((clip,index)=>index?clip:{...clip,outSec:4})},{...environment,fps:60},{...environment,viewport:{width:1080,height:1920}},{...environment,font:{...environment.font,key:'another-font'}},{...environment,assets:[{...environment.assets[0],sha256:'c'.repeat(64)}]},{...environment,appearance:{accentColor:'#123456'}}])assert.ok(prepareDynamicMechanismPreview(draft,scene,changed).issues.some(issue=>issue.code==='stale'));
 assert.ok(prepareDynamicMechanismPreview(draft,{...scene,body:'改后的完整条件'},environment).issues.some(issue=>issue.code==='stale'));
});

test('image/font loading waits, source dimensions must match, and explicit ROI rebinding cannot hide a changed scene',()=>{
 const loading={...environment,font:{...environment.font,status:'loading'},assets:[{...environment.assets[0],status:'loading'}]},draft=createDynamicMechanismDraft(scene,roi,loading);
 const waiting=prepareDynamicMechanismPreview(draft,scene,loading);assert.equal(waiting.previewReadiness,'waiting');assert.ok(waiting.issues.some(issue=>issue.code==='asset-loading'));assert.ok(waiting.issues.some(issue=>issue.code==='font-loading'));
 const ready=prepareDynamicMechanismPreview(draft,scene,environment);assert.equal(ready.previewReadiness,'ready');assert.ok(ready.reviewRequired);assert.ok(!ready.canApply);
 const resized={...environment,assets:[{...environment.assets[0],width:1920,height:1200}]},rebound=bindDynamicScreenshotRegion(draft,scene,resized.assets[0],{x:1000,y:300,width:300,height:100},resized);
 assert.equal(rebound.config.sourceWidth,1920);assert.equal(draft.config.sourceWidth,1600);assert.ok(prepareDynamicMechanismPreview(rebound,scene,resized).issues.some(issue=>issue.code==='configuration'),'original authored media metadata still needs correction rather than being silently rewritten');
 assert.throws(()=>bindDynamicScreenshotRegion(draft,{...scene,title:'另一个标题'},resized.assets[0],roi.focusRegion,resized),/已变化/);
 assert.throws(()=>bindDynamicScreenshotRegion(draft,scene,{...resized.assets[0],src:'broll-assets/other.png'},roi.focusRegion,resized),/原图/);
 assert.ok(prepareDynamicMechanismPreview(createDynamicMechanismDraft(scene,roi,resized),scene,resized).issues.some(issue=>issue.code==='roi-dimensions'));
});

test('a real cutout requires matching source identity, continuous coverage and loaded verified RGBA',()=>{
 const personMatte={prefix:'person-mattes/synthetic/frame-',src,sourceSha256:sha,width:1920,height:1080,sourceStartMs:1000,fps:10,count:100,endMs:11000,timesMs:Array.from({length:100},(_,index)=>1000+index*100)},actorScene={...scene,personMatte},config={kind:'evidence-handoff',speakerMode:'cutout',cues:[{nodeId:'two',atMs:500,travelMs:600,holdMs:1500,returnMs:600}]},actorEnvironment={...environment,matte:{prefix:personMatte.prefix,sourceSha256:sha,status:'ready',rgbaVerified:true}};
 const draft=createDynamicMechanismDraft(actorScene,config,actorEnvironment);assert.ok(!prepareDynamicMechanismPreview(draft,actorScene,actorEnvironment).issues.some(issue=>issue.code==='matte'));
 for(const [changedScene,changedEnvironment] of [[actorScene,{...actorEnvironment,matte:{...actorEnvironment.matte,rgbaVerified:false}}],[actorScene,{...actorEnvironment,sourceIdentity:{...environment.sourceIdentity,sha256:'c'.repeat(64)}}],[{...actorScene,personMatte:{...personMatte,timesMs:[...personMatte.timesMs.slice(0,30),...personMatte.timesMs.slice(30).map(value=>value+400)]}},actorEnvironment],[{...actorScene,personMatte:{...personMatte,endMs:10000}},actorEnvironment]]){
  const changedDraft=createDynamicMechanismDraft(changedScene,config,changedEnvironment);assert.ok(prepareDynamicMechanismPreview(changedDraft,changedScene,changedEnvironment).issues.some(issue=>issue.code==='matte'));
 }
});

test('review is bound to the exact configuration, every retained instance and all complete text fields',()=>{
 const draft=createDynamicMechanismDraft(scene,roi,environment),key=dynamicDraftKey(draft),projections=projectStoryboard([scene],clips,30).map(item=>item.id),inventory=dynamicContentInventory(scene);
 assert.ok(inventory.some(item=>item.text===scene.body));assert.ok(inventory.some(item=>item.text===scene.nodes[0].bullets[0]));
 const reviewed={...environment,layoutReview:{draftKey:key,status:'reviewed',projectionIds:projections,displayedFields:inventory.map(item=>item.id)},safetyReview:{draftKey:key,status:'reviewed',projectionIds:projections,overlaps:[]}};
 const valid=prepareDynamicMechanismPreview(draft,scene,reviewed);assert.ok(!valid.issues.some(issue=>['layout-review','layout-invalid','person-safety','person-overlap'].includes(issue.code)));assert.equal(valid.canApply,false,'independent preparation is never workbench acceptance');
 const omitted={...reviewed,layoutReview:{...reviewed.layoutReview,displayedFields:inventory.filter(item=>item.id!=='body').map(item=>item.id)}};assert.ok(prepareDynamicMechanismPreview(draft,scene,omitted).issues.some(issue=>issue.code==='layout-invalid'));
 const missedInstance={...reviewed,safetyReview:{...reviewed.safetyReview,projectionIds:projections.slice(0,1)}};assert.ok(prepareDynamicMechanismPreview(draft,scene,missedInstance).issues.some(issue=>issue.code==='person-overlap'));
 const edited=editDynamicMechanismDraft(draft,['dimOpacity'],.4);assert.notEqual(dynamicDraftKey(edited),key);assert.ok(prepareDynamicMechanismPreview(edited,scene,reviewed).issues.some(issue=>issue.code==='person-safety'));
});
