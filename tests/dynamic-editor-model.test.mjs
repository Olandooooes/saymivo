import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicEditorRawScene,dynamicEditorAppearance,dynamicEditorAssetSources,fetchDynamicEditorAssets,dynamicEditorProjectionWindow} from '../editor/dynamic-editor-model.mjs';

const scene={id:'scene',clipId:'A',src:'clips/synthetic.mp4',startMs:2000,endMs:8000,title:'完整条件',body:'原文保留',nodes:[{id:'n',text:'条件',assetSrc:'broll-assets/test.png'}],visualPreset:{id:'clear-type'},dynamicMotion:{version:1},media:{src:'broll-assets/test.png',kind:'image'}};
test('editor uses full timeline clips and only limits Player frames, preserving absolute source and repeated instances',()=>{
 const clips=[{id:'before',src:'clips/other.mp4',inSec:0,outSec:4,speed:1},{id:'A',src:scene.src,inSec:1,outSec:10,speed:2},{id:'after',src:'clips/other.mp4',inSec:0,outSec:3,speed:.5},{id:'B',src:scene.src,inSec:2,outSec:8,speed:1}],before=structuredClone(clips),window=dynamicEditorProjectionWindow(scene,clips,30);
 assert.equal(window.inFrame,135);assert.equal(window.outFrame,614);assert.equal(window.durationInFrames,615);assert.equal(window.projections.length,2);assert.equal(window.projections[0].sourceOffsetMs,0);assert.equal(window.projections[0].phaseStartMs,4500);assert.deepEqual(clips,before);assert.equal(dynamicEditorProjectionWindow({...scene,src:'clips/absent.mp4'},clips,30),null);
 const fractional=dynamicEditorProjectionWindow({...scene,startMs:404,endMs:2000},[{id:'prefix',src:'clips/other.mp4',inSec:0,outSec:2,speed:1},{id:'fast',src:scene.src,inSec:0,outSec:10,speed:4}],30);assert.equal(fractional.inFrame,64,'Player must start at the actual first active ceil frame, not the preceding blank frame');
});
test('raw signature removes only two visual wrappers and appearance keeps viewport/font/global copy dependencies',()=>{
 const raw=dynamicEditorRawScene(scene);assert.equal(raw.title,scene.title);assert.equal(raw.nodes,scene.nodes);assert.equal(raw.visualPreset,undefined);assert.equal(raw.dynamicMotion,undefined);assert.ok(scene.dynamicMotion);
 const appearance=dynamicEditorAppearance({presentation:{scenes:[scene],displayFont:'B',format:'landscape',theme:'classic'},accentColor:'#123456',meta:{fps:30,width:1920,height:1080}});assert.equal(appearance.presentationWithoutScenes.scenes,undefined);assert.equal(appearance.presentationWithoutScenes.displayFont,'B');assert.equal(appearance.accentColor,'#123456');assert.equal(appearance.meta.fps,30);
});
test('asset identity endpoint is read-only, deduplicated, exact-source-bound and reports each missing prerequisite',async()=>{
 assert.deepEqual(dynamicEditorAssetSources(scene),[scene.src,'broll-assets/test.png']);const calls=[];
 const result=await fetchDynamicEditorAssets(scene,{fetcher:async(path,options)=>{calls.push({path,options});const src=new URL(path,'http://local').searchParams.get('src');return {ok:true,json:async()=>({src,sha256:'a'.repeat(64),width:1920,height:1080,kind:src===scene.src?'video':'image',...(src===scene.src?{durationSec:20}:{})})};}});
 assert.equal(result.assets.length,2);assert.deepEqual(result.errors,[]);assert.ok(calls.every(c=>c.options.method===undefined&&c.path.startsWith('/api/dynamic-asset?src=')));
 const invalid=await fetchDynamicEditorAssets(scene,{fetcher:async()=>({ok:true,json:async()=>({src:'clips/foreign.mp4',sha256:'a'.repeat(64),width:1920,height:1080,kind:'video',durationSec:20})})});assert.equal(invalid.assets.length,0);assert.equal(invalid.errors.length,2);
 const missing=await fetchDynamicEditorAssets(scene,{fetcher:async()=>({ok:false,json:async()=>({error:'无法读取原片'})})});assert.ok(missing.errors.every(e=>e.message==='无法读取原片'));
});
