import test from 'node:test';import assert from 'node:assert/strict';
import {reuseOverview} from '../src/reuse-overview.mjs';
import {projectStoryboard,validateStoryboard} from '../src/storyboard.mjs';
test('returning to an overview preserves current speech, source ranges and other scenes while focusing a quoted node',()=>{
 const overview={id:'overview',clipId:'a',src:'a.mp4',startMs:0,endMs:3000,title:'判断总览',layout:'overview',sourceCaptionIds:['old'],nodes:[{id:'n1',text:'任务',detail:'任务能否做完',atMs:900,focusMs:1200},{id:'n2',text:'结果',detail:'结果是否可靠',atMs:1800}]};
 const target={id:'return',clipId:'a',src:'a.mp4',startMs:7000,endMs:10000,title:'回顾',layout:'demo',missing:'旧录屏缺失',sourceText:'最后再看结果',sourceCaptionIds:['current'],media:{src:'broll-assets/a.mp4',kind:'video'},highlights:[{id:'h'}],tags:[{id:'tag'}],window:{x:.7,y:.4,size:.2}};
 const before=structuredClone({overview,target}),result=reuseOverview(target,overview,'n2');assert.ok(result.scene);
 assert.equal(result.scene.sourceText,target.sourceText);assert.equal(result.scene.startMs,7000);assert.equal(result.scene.endMs,10000);assert.deepEqual(result.scene.window,target.window);
 assert.equal(result.scene.activeNodeId,'n2');assert.equal(result.scene.overviewMode,undefined);assert.equal(result.scene.overviewSourceSceneId,'overview');assert.deepEqual(result.scene.sourceCaptionIds,['current','old']);assert.equal(result.scene.missing,undefined);assert.equal(result.scene.media,undefined);assert.equal(result.scene.highlights,undefined);assert.equal(result.scene.tags,undefined);
 assert.deepEqual(result.scene.nodes.map(n=>[n.text,n.atMs,n.focusMs]),[['任务',0,undefined],['结果',0,undefined]]);
 const clips=[{id:'a',src:'a.mp4',inSec:0,outSec:10}];assert.deepEqual(validateStoryboard([overview,result.scene],clips),[]);assert.equal(projectStoryboard([overview,result.scene],clips).at(-1).startMs,7000);
 result.scene.nodes[0].text='独立修改';assert.deepEqual({overview,target},before);
});
test('invalid source, self reuse, too-short target and nonexistent focus are rejected',()=>{
 const s={id:'s',layout:'overview',startMs:0,endMs:2000,nodes:[{id:'n',text:'任务'}]},t={id:'t',startMs:3000,endMs:5000};
 for(const args of [[s,s],[t,{...s,layout:'speaker'}],[{...t,endMs:4000},s],[t,s,'missing']])assert.ok(reuseOverview(...args).error);
 assert.equal(reuseOverview(t,s).scene.overviewMode,'preview');
});
