import test from 'node:test';import assert from 'node:assert/strict';import {attachSourceRecaps} from '../src/source-recap.mjs';
const cards={id:'criteria',src:'clips/a.mp4',clipId:'a',layout:'cards',startMs:0,endMs:10000,sourceCaptionIds:['c1','c2'],nodes:[{id:'n1',text:'任务能不能做完',detail:'原话说明'},{id:'n2',text:'结果有没有依据'},{id:'n3',text:'能不能修改'}]};
const outro={id:'end',src:cards.src,clipId:'a',layout:'outro',startMs:11000,endMs:15000,title:'这也是值得关注的地方',sourceText:'这也是值得关注的地方',sourceCaptionIds:['c3']};
test('recap quotes earlier criteria with source provenance and staggered visual timing',()=>{
 const before=structuredClone([cards,outro]),result=attachSourceRecaps(before),end=result[1];assert.deepEqual(end.nodes.map(n=>n.text),cards.nodes.map(n=>n.text));assert.equal(end.summarySourceSceneId,'criteria');assert.deepEqual(end.window,{x:.69,y:.30,size:.29});assert.deepEqual(end.sourceCaptionIds,['c3','c1','c2']);assert.equal(end.sourceText,outro.sourceText);assert.deepEqual(end.nodes.map(n=>n.atMs),[450,800,1150]);assert.deepEqual(before,[cards,outro]);assert.deepEqual(attachSourceRecaps(result),result);
});
test('unrelated, ambiguous, short or already authored endings do not receive a recap',()=>{
 assert.deepEqual(attachSourceRecaps([cards,{...outro,src:'clips/b.mp4'}])[1],{...outro,src:'clips/b.mp4'});
 assert.deepEqual(attachSourceRecaps([cards,{...cards,id:'other'},outro])[2],outro);
 const short={...outro,endMs:12000};assert.deepEqual(attachSourceRecaps([cards,short])[1],short);
 const authored={...outro,nodes:[{id:'own',text:'已有内容'}]};assert.deepEqual(attachSourceRecaps([cards,authored])[1],authored);
 const customWindow={...outro,window:{x:.7,y:.3,size:.25}};assert.deepEqual(attachSourceRecaps([cards,customWindow])[1].window,customWindow.window);
});
