import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStoryboard} from '../src/storyboard.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {phraseChoreographyIssues,phraseChoreographyState,phrasePageState,phraseTextReadiness,phraseSourceItems,phraseAdditionalCopy} from '../src/phrase-choreography.mjs';
const scene={id:'s',src:'clips/synthetic.mp4',clipId:'c',startMs:1000,endMs:21000,layout:'headline',title:'完整的表达',body:'限定条件仍要读清楚',nodes:[{id:'a',text:'第一项',detail:'必须保留否定条件',bullets:['不能保证每个案例成功']},{id:'b',text:'The full second phrase, with spaces.'}]};
const config={kind:'cumulative-phrases',items:[{nodeId:'a',atMs:1000,endMs:19000,rect:{x:.10,y:.22,width:.55,height:.17},fromScale:1.15,fromTrackingEm:.05},{nodeId:'b',atMs:4000,endMs:19000,rect:{x:.10,y:.45,width:.55,height:.17},fromScale:1.15}],copyWindow:{atMs:1000,endMs:19000,rect:{x:.10,y:.65,width:.55,height:.13}}};
test('complete source copy, retained old phrases and original phase survive trimming and speed',()=>{
 assert.deepEqual(phraseChoreographyIssues(scene,config),[]);assert.ok(phraseSourceItems(scene,config)[0].text.includes(scene.nodes[0].bullets[0]));assert.equal(phraseAdditionalCopy(scene,config).length,2);
 const before=phraseChoreographyState(scene,config,3000),after=phraseChoreographyState(scene,config,5000);assert.equal(before.items[0].opacity,1);assert.equal(before.items[1].opacity,0);assert.equal(after.items[0].opacity,1);assert.equal(after.items[1].opacity,1);
 const projection=projectStoryboard([scene],[{id:'kept',src:scene.src,inSec:4,outSec:9,speed:2}],30)[0];assert.deepEqual(phraseChoreographyState(projection,config,5000),after);
 assert.ok(phraseChoreographyIssues(scene,{...config,items:config.items.slice(0,1)}).some(message=>message.includes('每个完整对象')));
 assert.ok(phraseChoreographyIssues(scene,{...config,copyWindow:undefined}).some(message=>message.includes('标题和正文')));
});
test('scale/tracking converge and unsafe motion envelopes are rejected rather than clipped',()=>{
 const middle=phraseChoreographyState(scene,{...config,kind:'emphasis-phrase'},1100).items[0],settled=phraseChoreographyState(scene,config,2000).items[0];assert.ok(middle.scale>1&&middle.scale<1.15);assert.ok(middle.trackingEm>0&&middle.trackingEm<.05);assert.equal(settled.scale,1);assert.equal(settled.trackingEm,0);
 for(const rect of [{x:.01,y:.2,width:.8,height:.2},{x:.2,y:.75,width:.6,height:.2}])assert.ok(phraseChoreographyIssues(scene,{...config,items:config.items.map((item,i)=>i?item:{...item,rect,fromScale:1.5})}).length);
 assert.ok(phraseChoreographyIssues(scene,{...config,items:config.items.map((item,i)=>i?{...item,endMs:18000}:item)}).some(message=>message.includes('共同结束')));
 const plain={...config,items:config.items.map(({fromScale,fromTrackingEm,...item})=>item)};
 for(const kind of ['caret-phrase','identity-sweep'])assert.equal(phraseChoreographyState(scene,{...plain,kind},1100).items[0].scale,1,'typing and a light sweep are not automatically given a zoom');
 assert.deepEqual(phraseChoreographyIssues(scene,null),['未知短语动效']);
 assert.ok(phraseChoreographyIssues(scene,{...config,items:[null]}).some(message=>message.includes('配置须对应')));
});
test('each long-text page is actually scheduled, with a complete hold after its own caret writing',()=>{
 const text='完整原句不能省略限定词，including spaces。'.repeat(6),fit=fitMeasuredText(text,{width:450,height:90,minFont:28,maxFont:28,measure:(text,size)=>({width:[...text].length*size*.6,ascent:size*.8,descent:size*.2})});assert.ok(fit.pages.length>1);
 const pageMs=10000,readMs=fit.pages.length*pageMs,seen=new Set();
 for(let time=0;time<readMs;time+=100){const s=phrasePageState(fit.pages,time,readMs,{caret:true});assert.equal(s.insufficientDuration,false);if(s.revealedGlyphs===s.glyphCount)seen.add(s.pageIndex);}
 assert.equal(seen.size,fit.pages.length);assert.equal(phrasePageState(fit.pages,0,1000,{caret:true}).insufficientDuration,true);
 assert.equal(phrasePageState([['完整短句']],0,6000,{caret:true}).revealedGlyphs,0);assert.equal(phrasePageState([['完整短句']],2000,6000,{caret:true}).revealedGlyphs,4);
});

test('simultaneous copy, other phrases and the whole known speaker path cannot overlap',()=>{
 const copy={...config,copyWindow:{atMs:1500,endMs:7000,rect:config.items[0].rect}};
 assert.ok(phraseChoreographyIssues(scene,copy).some(message=>message.includes('区域重叠')));
 const first={nodeId:'a',atMs:1000,endMs:19000,rect:{x:.30,y:.25,width:.3,height:.15},fromScale:1};
 const oneScene={...scene,title:'',body:'',nodes:[scene.nodes[0]],window:{x:.75,y:.3,size:.12,keyframes:[{atMs:8000,x:0,y:.3,size:.12}]}};
 assert.ok(phraseChoreographyIssues(oneScene,{kind:'emphasis-phrase',items:[first]}).some(message=>message.includes('人物窗路径')),'both end poses clear the text, but the moving speaker crosses it');
 assert.ok(phraseChoreographyIssues({...oneScene,window:undefined},{kind:'emphasis-phrase',items:[first],protectedAreas:[{rect:{x:.35,y:.25,width:.1,height:.1}}]}).some(message=>message.includes('保护区')));
});

test('insufficient caret time cannot accelerate twelve glyphs into a flash; every retained page needs full exposure',()=>{
 const text='一二三四五六七八九十甲乙',fit={pages:[[text]],unplaceable:false};
 const flash=phrasePageState(fit.pages,100,1040,{caret:true});assert.equal(flash.insufficientDuration,true);assert.ok(flash.revealedGlyphs<12);
 assert.equal(phraseTextReadiness(fit,{atMs:0,endMs:1040,caret:true},{startMs:0,endMs:1040,speed:1}).status,'blocked');
 const twoPages={pages:[[text],[text]],unplaceable:false};assert.equal(phraseTextReadiness(twoPages,{atMs:1000,endMs:15000,caret:true},{startMs:0,endMs:16000,speed:1}).status,'ready');
 assert.equal(phraseTextReadiness(twoPages,{atMs:1000,endMs:15000,caret:true},{startMs:2000,endMs:3000,speed:2}).status,'blocked');
 assert.equal(phraseTextReadiness(twoPages,{atMs:1000,endMs:15000,caret:true},{startMs:0,endMs:16000,speed:8}).status,'blocked');
 assert.equal(phraseTextReadiness(null,{atMs:0,endMs:5000}).status,'waiting');assert.equal(phraseTextReadiness(fit,{atMs:0,endMs:5000},{startMs:NaN,endMs:5000,speed:1}).status,'blocked');
});
