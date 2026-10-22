import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticStoryboard} from '../src/auto-storyboard.mjs';
import {knowledgePlan} from '../src/presentation.mjs';
import {projectStoryboard,validateStoryboard} from '../src/storyboard.mjs';
const clip={id:'raw',src:'clips/raw.mp4',inSec:0,outSec:20};
const cap=(id,text,startMs,endMs,clipId='raw')=>({id,clipId,startMs,endMs,topPct:84,words:[{text,startMs,endMs,accent:false}]});
test('cue-only timing sets the new spoken scene boundary without rewriting uncertain word onsets',()=>{
 const captions=[cap('before','风险会让结果跑偏',1000,3000),{...cap('turn','所以我会看三件事',3000,5000),startMs:3400,endMs:5200,timingScope:'cue'},cap('first','第一，任务能完成。',6000,8000),cap('second','第二，结果可检查。',8500,10000),cap('third','第三，出错能修改。',10500,12000)];
 const before=structuredClone(captions),{scenes}=automaticStoryboard(captions,[clip]);
 const turn=scenes.find(s=>s.sourceText.startsWith('所以'));assert(turn);assert.equal(turn.startMs,3400);assert.equal(scenes.find(s=>s.sourceCaptionIds.includes('before')).endMs,3400);assert.deepEqual(captions,before);
});
test('automatic reference mode creates editable source-cited scenes without changing speech',()=>{
 const captions=[cap('a','第一，能完成任务。',0,4000),cap('b','第二，有依据。',4200,8000),cap('c','第三，可修改。',8200,12000)];
 const before=structuredClone(captions);const plan=knowledgePlan(captions,[clip],{style:'reference',independentScenes:true});
 const comparison=plan.presentation.scenes.find(s=>s.layout==='cards');assert(comparison);
 assert.equal(comparison.nodes.length,3);assert.deepEqual(comparison.sourceCaptionIds,['a','b','c']);
 assert.deepEqual(comparison.nodes.map(n=>n.atMs),[0,0,0]);assert(comparison.nodes[1].focusMs>comparison.nodes[0].focusMs);
 assert.deepEqual(plan.captions.map(c=>c.words),captions.map(c=>c.words));assert.deepEqual(captions,before);
 assert.deepEqual(validateStoryboard(plan.presentation.scenes,[clip]),[]);
 assert(!plan.presentation.scenes.some(s=>s.media||s.highlights));
});
test('trim descendants share a persistent scene but unrelated uploads never mix',()=>{
 const clips=[{...clip,outSec:4},{...clip,id:'raw-cut1',inSec:5,outSec:9},{...clip,id:'other',inSec:10,outSec:14}];
 const captions=[cap('a','搜索资料，',100,2000),cap('b','打开网页。',5500,7500,'raw-cut1'),cap('c','另一份独立内容。',10500,13000,'other')];
 const {scenes}=automaticStoryboard(captions,clips);assert.deepEqual(validateStoryboard(scenes,clips),[]);
 assert(scenes.filter(s=>s.clipId==='raw').every(s=>!s.sourceCaptionIds.includes('c')));
 assert(scenes.filter(s=>s.clipId==='other').every(s=>s.sourceCaptionIds.length===1&&s.sourceCaptionIds[0]==='c'));
 const projected=projectStoryboard(scenes,clips,30);assert(projected.some(s=>s.clipId==='raw-cut1'));
 assert(scenes.every(s=>s.planningMethod==='local-rules'&&s.sourceText));
});
test('existing bound images and clean templates retain their legacy behavior',()=>{
 const captions=[{...cap('a','这是原字幕。',0,4000),motion:{kind:'card',layout:'spotlight',title:'原标题',assetSrc:'broll-assets/a.jpg'}}];
 const plan=knowledgePlan(captions,[clip],{style:'reference',independentScenes:true});
 assert.equal(plan.presentation.scenes,undefined);assert.equal(plan.captions[0].motion.assetSrc,'broll-assets/a.jpg');
 assert.equal(knowledgePlan(captions,[clip],{style:'clean',independentScenes:true}).presentation.scenes,undefined);
});
test('an isolated ordinal stays attached to its explanation across subtitle pauses',()=>{
 const captions=[cap('a','第一，',0,500),cap('b','做完任务？',1900,4000),cap('c','第二，',4500,4900),cap('d','方便检查？',6500,8000),cap('e','第三，',8500,8900),cap('f','允许修改？',10500,12500)];
 const {scenes}=automaticStoryboard(captions,[clip]);
 const cards=scenes.find(s=>s.layout==='cards');
 assert.equal(cards.nodes.length,3);assert(cards.nodes.every(n=>n.text!=='原声讲解'));
 assert.deepEqual(cards.sourceCaptionIds,['a','b','c','d','e','f']);
});

test('card copy keeps complete clauses rather than splitting off a final character',()=>{
 const captions=[cap('a','第一，任务能不能真正做完？',0,4000),cap('b','第二，结果有没有依据，方便我检查？',4200,8000),cap('c','第三，出错以后能不能停下来，让我接着修改？',8200,12000)];
 const {scenes}=automaticStoryboard(captions,[clip]);const cards=scenes.find(s=>s.layout==='cards');
 assert.equal(cards.nodes[1].text,'结果有没有依据');assert.equal(cards.nodes[1].detail,'方便我检查');
 assert.equal(cards.nodes[2].detail,'让我接着修改');
});
test('unpunctuated local recognition still yields anchored actions and a complete isolated definition',()=>{
 const captions=[cap('a','刚才提到一个词叫',0,1300),cap('b','Agent也就是智能体',1400,3600),cap('c','和聊天机器人有什么区别？',3700,5000),cap('d','搜索资料',5500,6500),cap('e','打开网页',6800,7800),cap('f','提取信息',8000,9000),cap('g','再整理成结果。',9200,11000)];
 const before=structuredClone(captions),{scenes}=automaticStoryboard(captions,[clip]);
 const definition=scenes.find(s=>s.layout==='chapter');assert.equal(definition.title,'Agent\n也就是智能体');assert.deepEqual(definition.sourceCaptionIds,['b']);assert.equal(definition.sourceText,'Agent也就是智能体');assert.deepEqual(definition.chapterTypography,{labelScale:1.6,lineScales:[1.2,1.7],entry:'sweep',delayMs:100});
 const flow=scenes.find(s=>s.layout==='flow');assert.equal(flow.nodes.length,4);assert.deepEqual(flow.nodes.map(n=>n.atMs),[0,1300,2500,3700]);assert.deepEqual(flow.nodes.map(n=>n.icon),['search','document','edit','check']);
 assert.deepEqual(captions,before);assert.deepEqual(validateStoryboard(scenes,[clip]),[]);
});
test('three criteria are found without punctuation and never absorb a later example',()=>{
 const clip={id:'raw',src:'clips/raw.mp4',inSec:0,outSec:28};
 const captions=[cap('intro','所以我会看三件事',0,2500),cap('a','第一',3000,3400),cap('b','任务能不能完成',3900,5500),cap('c','第二',6000,6400),cap('d','结果有没有依据',6900,8500),cap('e','第三',9000,9400),cap('f','出错能不能修改',9900,11500),cap('g','拿我正在做的工作台来说',24000,27000)];
 const {scenes}=automaticStoryboard(captions,[clip]);const cards=scenes.find(s=>s.layout==='cards');
 assert(cards);assert.equal(cards.nodes.length,3);assert(!cards.sourceText.includes('拿我'));assert.deepEqual(cards.sourceCaptionIds,['a','b','c','d','e','f']);
});
test('an English definition split into ASR subwords survives automatic subtitle reflow',async()=>{
 const {styleCaptions}=await import('../server/auto-plan.mjs');
 const words=[{text:'最近提到一个词叫',startMs:0,endMs:900},{text:'ag',startMs:1000,endMs:1300},{text:'ent',startMs:1300,endMs:1600},{text:'也就是智能体',startMs:1700,endMs:2900},{text:'和聊天机器人有什么区别',startMs:3500,endMs:5000}];
 const captions=styleCaptions([{id:'raw-caption',clipId:'raw',startMs:0,endMs:5000,words}],[clip]);
 const {scenes}=automaticStoryboard(captions,[clip]);const definition=scenes.find(s=>s.layout==='chapter');
 assert.equal(definition.title,'Agent\n也就是智能体');assert(!definition.sourceText.includes('最近'));
});
test('condition lecture uses a concise source-grounded heading, not the whole spoken paragraph',()=>{
 const input=[cap('condition','而具备相应工具和权限的Agent可以尝试把这些步骤接起来',0,6000)];
 const before=structuredClone(input),result=automaticStoryboard(input,[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:7}]);const stack=result.scenes.find(s=>s.layout==='stack');
 assert.equal(stack.title,'相应工具与权限');assert.equal(stack.sourceText,'而具备相应工具和权限的Agent可以尝试把这些步骤接起来');assert.deepEqual(stack.nodes.map(n=>n.text),['相应工具','权限']);assert.deepEqual(input,before);
});
test('different-topic naming reaches editable reference scenes with source onsets and both-side placement',()=>{
 const texts=['今天介绍一个工作方法。','这个方法叫做检索增强生成。','关键词是向量检索。'];
 const captions=texts.map((text,i)=>{const startMs=i*5000;return{id:'named'+i,clipId:'raw',startMs,endMs:startMs+text.length*180,words:[...text].map((text,j)=>({text,startMs:startMs+j*180,endMs:startMs+(j+1)*180}))};});
 const clips=[{id:'raw',src:'clips/topic.mp4',inSec:0,outSec:15}],before=structuredClone(captions);
 const plan=knowledgePlan(captions,clips,{style:'reference',independentScenes:true,format:'landscape'});
 const scenes=plan.presentation.scenes.filter(s=>s.tags?.length);
 assert.deepEqual(scenes.flatMap(s=>s.tags.map(t=>t.text)),['检索增强生成','向量检索']);
 assert.deepEqual(scenes.map(s=>s.tags[0].x),[.04,.69]);
 for(const scene of scenes){const tag=scene.tags[0],cap=captions.find(c=>scene.sourceCaptionIds.includes(c.id));const termStart=cap.words.find(w=>w.text===tag.text[0]).startMs;assert.equal(scene.startMs+tag.atMs,termStart);assert.equal(scene.tagTreatment,'kinetic');}
 assert.deepEqual(captions,before);assert.deepEqual(plan.captions.map(c=>c.words),captions.map(c=>c.words));assert.deepEqual(validateStoryboard(plan.presentation.scenes,clips),[]);
});
