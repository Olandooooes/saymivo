import test from 'node:test';import assert from 'node:assert/strict';import {bindAutomaticSceneMedia} from '../src/auto-scene-media.mjs';
const scene={id:'goal',clipId:'raw',src:'clips/raw.mp4',startMs:1000,endMs:4000,layout:'speaker',title:'口播目标',sourceText:'我希望导入一段真人口播，它帮我整理字幕',sourceCaptionIds:['a']};
const asset={id:'demo',src:'broll-assets/demo.mp4',kind:'video',width:1920,height:1080,durationSec:20,startSec:2,label:'真实界面配套演示',sourceNote:'录下的编辑界面，不代表自动任务已完成',keywords:['真人口播','字幕'],continuationKeywords:['安排画面','调整']};
test('literal approved keywords bind one real asset and hold it across related clauses',()=>{
 const scenes=[scene,{...scene,id:'steps',startMs:4000,endMs:7000,layout:'flow',sourceText:'安排画面，再让我调整',sourceCaptionIds:['b']},{...scene,id:'next',startMs:7000,endMs:9000,sourceText:'检查最终结果'}];const before=structuredClone(scenes);
 const result=bindAutomaticSceneMedia(scenes,[asset]);assert.equal(result.scenes.length,2);assert.equal(result.scenes[0].media.src,asset.src);assert.equal(result.scenes[0].endMs,7000);assert.deepEqual(result.scenes[0].sourceCaptionIds,['a','b']);assert.equal(result.scenes[0].highlights,undefined);assert.equal(result.scenes[0].media.cursor,undefined);assert.deepEqual(scenes,before);
});
test('weak, ambiguous, disabled, too-short assets and existing media cannot be substituted',()=>{
 for(const assets of [[{...asset,keywords:['字幕']}],[asset,{...asset,id:'other'}],[{...asset,enabled:false}],[{...asset,durationSec:3}],[{...asset,keywords:['真人口播','不相关']}]] )assert.equal(bindAutomaticSceneMedia([scene],assets).scenes[0].media,undefined);
 const existing={...scene,media:{src:'broll-assets/selected.jpg',kind:'image'}};assert.deepEqual(bindAutomaticSceneMedia([existing],[asset]).scenes[0],existing);
});
