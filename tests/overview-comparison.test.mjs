import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createOverviewComparison,overviewComparisonIssues} from '../src/overview-comparison.mjs';
import {validateStoryboard,projectStoryboard} from '../src/storyboard.mjs';
import {captureSceneDesign,reviewedSceneDesign} from '../server/scene-design-review.mjs';
const comparison=()=>createOverviewComparison('broll-assets/before.png','broll-assets/accepted-after.png');
const scene={id:'return',clipId:'raw',src:'clips/raw.mp4',layout:'overview',startMs:113203,endMs:122690,title:'从原片到成片',sourceText:'我更关心的是从原片到成片它到底替我完成了多少工作',sourceCaptionIds:['current-voice','prior-demo'],overviewSourceSceneId:'criteria',activeNodeId:'task',nodes:[{id:'task',text:'任务',atMs:0},{id:'result',text:'结果',atMs:0},{id:'error',text:'出错',atMs:0}]};
const clips=[{id:'raw',src:scene.src,inSec:104.88,outSec:118.12}];
test('comparison uses explicit local images and finite scene-local timing; old overview remains optional',()=>{
 assert.deepEqual(overviewComparisonIssues(undefined,9487),[]);
 assert.deepEqual(validateStoryboard([scene],clips),[]);
 assert.deepEqual(validateStoryboard([{...scene,overviewComparison:comparison()}],clips),[]);
 assert.deepEqual(overviewComparisonIssues(createOverviewComparison('broll-assets/a.png','broll-assets/b.png',900),900),[],'short scenes receive proportionally shorter relative entries');
 for(const value of [null,[],{}, {...comparison(),before:{...comparison().before,src:'../private.png'}},{...comparison(),after:{...comparison().after,src:'https://example.com/result.png'}},{...comparison(),after:{...comparison().after,src:'public/exports/current.mp4'}},{...comparison(),after:{...comparison().after,src:'broll-assets/current.mp4'}},{...comparison(),after:{...comparison().after,src:'broll-assets/before.png'}},{...comparison(),before:{...comparison().before,atMs:NaN}},{...comparison(),after:{...comparison().after,atMs:9487}},{...comparison(),steps:[{id:'one',text:'字幕',atMs:-1}]},{...comparison(),steps:[{id:'one',text:'字幕',atMs:0},{id:'one',text:'画面',atMs:1}]}])assert.ok(overviewComparisonIssues(value,9487).length);
 assert.ok(validateStoryboard([{...scene,layout:'speaker',overviewComparison:comparison()}],clips).some(item=>item.message.includes('总览版式')));
});
test('comparison is captured and reused with current source/navigation IDs, with material and layout checks',()=>{
 const PUBLIC=fs.mkdtempSync(path.join(os.tmpdir(),'koubo-overview-comparison-'));try{
  const authored={...scene,overviewComparison:comparison()},design=captureSceneDesign(authored),before=structuredClone(authored);
  assert.notEqual(design.overviewComparison,authored.overviewComparison);
  assert.equal(reviewedSceneDesign(scene,design,{PUBLIC}).error,'missing-design-overview-comparison');
  fs.mkdirSync(path.join(PUBLIC,'broll-assets'));for(const item of [design.overviewComparison.before,design.overviewComparison.after])fs.writeFileSync(path.join(PUBLIC,item.src),'image-existence-only fixture');
  const fresh={...scene,id:'fresh-return',clipId:'fresh-raw',sourceCaptionIds:['new-current','new-demo'],activeNodeId:'fresh-task',nodes:scene.nodes.map(node=>({...node,id:'fresh-'+node.id}))};
  const restored=reviewedSceneDesign(fresh,design,{PUBLIC}).scene;
  assert.deepEqual(restored.overviewComparison,authored.overviewComparison);assert.deepEqual(restored.nodes,fresh.nodes);assert.equal(restored.activeNodeId,'fresh-task');assert.equal(restored.overviewSourceSceneId,'criteria');assert.deepEqual(restored.sourceCaptionIds,['new-current','new-demo']);
  assert.deepEqual([restored.src,restored.clipId,restored.startMs,restored.endMs,restored.sourceText],[fresh.src,fresh.clipId,fresh.startMs,fresh.endMs,fresh.sourceText]);assert.deepEqual(authored,before);
  assert.equal(reviewedSceneDesign({...fresh,layout:'speaker'},design,{PUBLIC}).error,'invalid-design-overview-comparison');
  const invalid={...design,overviewComparison:{...design.overviewComparison,after:{...design.overviewComparison.after,atMs:9487}}};assert.equal(reviewedSceneDesign(fresh,invalid,{PUBLIC}).error,'invalid-design-overview-comparison');
 }finally{fs.rmSync(PUBLIC,{recursive:true,force:true});}
});
test('comparison timing stays in source-scene coordinates through retained cuts and speed changes',()=>{
 const authored={...scene,overviewComparison:comparison()},before=structuredClone(authored);
 const projected=projectStoryboard([authored],[{id:'raw',src:scene.src,inSec:113.203,outSec:118.12,speed:2},{id:'raw-cut1',src:scene.src,inSec:122.13,outSec:123,speed:1}],30);
 assert.equal(projected.length,2);assert.deepEqual(projected[0].overviewComparison,authored.overviewComparison);assert.deepEqual(projected[1].overviewComparison,authored.overviewComparison);
 assert.equal((projected[1].startMs-projected[1].phaseStartMs)*projected[1].speed,8927,'return does not restart its reveals after the retained source gap');assert.deepEqual(authored,before);
});
test('outlined context cue remains inside the original tag window',()=>{
 const base={...scene,layout:'speaker',overviewComparison:undefined,tags:[{id:'contrast',text:'回答问题',x:.04,y:.12,atMs:1200,endMs:6000,contextAtMs:3200}]};
 assert.deepEqual(validateStoryboard([base],clips),[]);
 for(const contextAtMs of [NaN,-1,1199,6000])assert.ok(validateStoryboard([{...base,tags:[{...base.tags[0],contextAtMs}]}],clips).some(item=>item.message==='转为轮廓时点须位于标签可见时段内'));
});
