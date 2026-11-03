import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDynamicMotionPlan,dynamicMotionPlanSignature,updateDynamicMotionPlanSelection,dynamicMotionEditorRequest} from '../src/dynamic-motion-planner.mjs';
const src='clips/synthetic.mp4';
const scene=(extra={})=>({id:'s',clipId:'a',src,startMs:0,endMs:60000,layout:'cards',title:'完整原话',body:'保持条件完整',nodes:[{id:'n1',text:'甲方'},{id:'n2',text:'工具'},{id:'n3',text:'结果'}],...extra});
const clip=(extra={})=>({id:'a',src,inSec:0,outSec:60,speed:1,...extra});
const cap=(text,extra={})=>({id:'c',clipId:'a',startMs:100,endMs:59000,words:[{text,startMs:100,endMs:59000}],...extra});
const state=(text,extra={})=>({clips:[clip()],captions:[cap(text)],presentation:{format:'landscape',theme:'knowledge',scenes:[scene()]},meta:{fps:30},brolls:[],...extra});
const identity={src,sha256:'a'.repeat(64),width:1920,height:1080,kind:'video',durationSec:120};
const options={sourceIdentities:[identity]};
const row=s=>generateDynamicMotionPlan(s,options).rows[0];
const candidate=(r,id)=>r.candidates.find(c=>c.entryId===id);

test('actual media takes priority and ROI remains a user-selected source region',()=>{
 const media={src:'broll-assets/proof.png',kind:'image',width:800,height:600},s=state('请放大原文这一行，核对完整限制。',{presentation:{format:'landscape',scenes:[scene({media})]}}),r=row(s);
 assert.equal(r.recommendedEntryId,'screenshot-region-focus');assert.ok(candidate(r,'evidence-handoff'));assert.ok(!candidate(r,'emphasis-phrase'));
 assert.equal(candidate(r,'screenshot-region-focus').config.focusRegion,undefined);assert.ok(candidate(r,'screenshot-region-focus').requiredData.includes('focusRegion'));
 assert.ok(r.originalEvidence.every(e=>e.text==='请放大原文这一行，核对完整限制。'));assert.equal(r.canApply,false);assert.equal(r.requiresRendererSession,true);
});

test('planner forwards the exact loaded scene asset identity instead of source-video or other-image metadata',()=>{
 const media={src:'broll-assets/proof.png',kind:'image',width:800,height:600},s=state('这里是公开案例资料。',{presentation:{format:'landscape',scenes:[scene({media})]}}),proof={src:media.src,sha256:'b'.repeat(64),width:800,height:600,kind:'image'};
 const planned=generateDynamicMotionPlan(s,{...options,assetIdentities:[identity,{...proof,src:'broll-assets/other.png'},proof]}).rows[0];assert.ok(!candidate(planned,'evidence-handoff').requiredData.includes('assetIdentity'));assert.ok(candidate(planned,'evidence-handoff').requiredData.includes('cues'));
 const wrong=generateDynamicMotionPlan(s,{...options,assetIdentities:[identity,{...proof,src:'broll-assets/other.png'}]}).rows[0];assert.ok(candidate(wrong,'evidence-handoff').requiredData.includes('assetIdentity'));
});

test('lists alone never create a graph; explicit source links or named relations can suggest a pending graph',()=>{
 const list=row(state('甲方、工具、结果是三个词。'));assert.ok(!candidate(list,'hub-branch-flow'));
 const relation=row(state('甲方把材料交给工具，工具返回结果。'));const graph=candidate(relation,'hub-branch-flow');assert.ok(graph);assert.equal(graph.config.edges,undefined);assert.ok(graph.requiredData.includes('edges'));assert.equal(graph.config.hubNodeId,undefined);
 const linked=row(state('说明连接关系。',{presentation:{format:'landscape',scenes:[scene({links:[{id:'l',from:'n1',to:'n2',label:'明确输入'}]})]}}));assert.ok(candidate(linked,'hub-branch-flow').originalEvidence.some(e=>e.linkId==='l'&&e.text==='明确输入'));
 const negative=row(state('甲方不代表工具一定能够返回完整结果。'));assert.ok(!candidate(negative,'hub-branch-flow'));assert.equal(candidate(negative,'emphasis-phrase').role,'complete-limitation');
});

test('static numbers/English names do not turn into invented counters, charts, funnels or translations',()=>{
 const r=row(state('这里有2026年、三个问题和100个例子，项目英文名是REA。'));
 for(const id of ['number-counter','quantified-funnel-flow','bilingual-board-transition','quantitative-chart:horizontal-bars'])assert.ok(!candidate(r,id),id);
 const changing=row(state('明确数字从10增加到20。')),counter=candidate(changing,'number-counter');assert.ok(counter);assert.equal(counter.config.from,undefined);assert.equal(counter.config.to,undefined);assert.ok(counter.requiredData.includes('from'));
 assert.ok(!candidate(row(state('不是从0到100，也不是保证增长。')),'number-counter'));
});

test('only exact retained source/instance words enter evidence, and duplicate overlaps do not extend reading time',()=>{
 const s=state('',{clips:[clip({id:'a',inSec:0,outSec:4}),clip({id:'b',inSec:10,outSec:14}),clip({id:'foreign',src:'clips/other.mp4',inSec:10,outSec:14})],captions:[cap('从0增加到100',{startMs:100,endMs:3900,words:[{text:'从0增加到100',startMs:100,endMs:3900}]}),cap('不能随意复制',{id:'b',clipId:'b',startMs:10100,endMs:13900,words:[{text:'不能随意复制',startMs:10100,endMs:13900}]}),cap('从100增加到200',{id:'foreign',clipId:'foreign',startMs:10100,endMs:13900,words:[{text:'从100增加到200',startMs:10100,endMs:13900}]})],presentation:{format:'landscape',scenes:[scene({clipId:'b',startMs:10000,endMs:14000,title:'能力限制'})]}});
 const r=row(s);assert.equal(r.spokenText,'不能随意复制');assert.ok(!candidate(r,'number-counter'));assert.ok(r.originalEvidence.every(e=>e.clipId==='b'));
 const duplicate=state('',{clips:[clip({outSec:3}),clip({id:'b',outSec:3,speed:2})],captions:[cap('全部能复制',{startMs:100,endMs:2900,words:[{text:'全部能复制',startMs:100,endMs:2900}]}),cap('并非全部能复制',{id:'b',clipId:'b',startMs:100,endMs:2900,words:[{text:'并非全部能复制',startMs:100,endMs:2900}]})],presentation:{format:'landscape',scenes:[scene({endMs:3000})]}});
 const d=row(duplicate);assert.equal(d.retainedMs,1500);assert.equal(d.selectedEntryId,'keep');assert.ok(d.warnings.some(w=>w.includes('实例字幕不一致')));assert.equal(d.projections.length,2);
});

test('cut words and a previous-cue negative lead-in block an unqualified current claim',()=>{
 const s=state('',{clips:[clip({inSec:3,outSec:6})],captions:[cap('',{startMs:1000,endMs:6000,words:[{text:'不',startMs:1000,endMs:1100},{text:'代表',startMs:1100,endMs:1300},{text:'所有软件都能复制',startMs:3100,endMs:5900}]})],presentation:{format:'landscape',scenes:[scene({startMs:3000,endMs:6000,title:'所有软件都能复制'})]}});
 assert.equal(row(s).selectedEntryId,'keep');assert.ok(row(s).warnings.some(w=>w.includes('否定')));
 const leading=state('',{captions:[cap('所以我不会把它简单理解成，',{id:'lead',startMs:1000,endMs:2800,words:[{text:'所以我不会把它简单理解成，',startMs:1000,endMs:2800}]}),cap('所有软件都能随便复制。',{id:'claim',startMs:3100,endMs:5900,words:[{text:'所有软件都能随便复制。',startMs:3100,endMs:5900}]})],presentation:{format:'landscape',scenes:[scene({startMs:3000,endMs:6000,title:'所有软件都能复制'})]}});
 const r=row(leading);assert.equal(r.selectedEntryId,'keep');assert.ok(r.boundaryContext.some(e=>e.captionId==='lead'));assert.ok(r.warnings.some(w=>w.includes('前一条')));
 const half=state('',{captions:[cap('一个被截半的词',{startMs:0,endMs:60000,words:[{text:'一个被截半的词',startMs:0,endMs:3000}]})],presentation:{format:'landscape',scenes:[scene({startMs:1000})]}});assert.ok(row(half).warnings.some(w=>w.includes('半词')));
 const separate=structuredClone(leading);separate.clips=[clip({id:'previous',outSec:3}),clip({id:'current',inSec:3,outSec:6})];separate.captions[0].clipId='previous';separate.captions[1].clipId='current';separate.presentation.scenes[0].clipId='current';
 const cut=row(separate);assert.ok(cut.boundaryContext.some(e=>e.clipId==='previous'));assert.equal(cut.selectedEntryId,'keep','a retained negative lead-in survives its own clip boundary');
});

test('caption array order and identical replay records cannot manufacture spoken sequence or numeric evidence',()=>{
 const s=state('',{captions:[cap('20。',{id:'late',startMs:3000,endMs:4000,words:[{text:'20。',startMs:3000,endMs:4000}]}),cap('从10增加到',{id:'early',startMs:1000,endMs:2000,words:[{text:'从10增加到',startMs:1000,endMs:2000}]}),cap('从10增加到',{id:'duplicate',startMs:1000,endMs:2000,words:[{text:'从10增加到',startMs:1000,endMs:2000}]})]});
 assert.equal(row(s).spokenText,'从10增加到20。');assert.ok(candidate(row(s),'number-counter'));
 const media={src:'broll-assets/proof.png',kind:'image'};s.presentation.scenes[0].media=media;
 const protectedRow=row(s);assert.ok(!candidate(protectedRow,'number-counter'));assert.equal(protectedRow.recommendedEntryId,'evidence-handoff');
});

test('manual dynamic/visual choices and an existing matte-backed title are locked until explicit per-scene unlock',()=>{
 for(const extra of [{visualPreset:{id:'fine-process',version:1}},{dynamicMotion:{config:{kind:'emphasis-phrase'}}}]){
  const s=state('完整说明',{presentation:{format:'landscape',scenes:[scene(extra)]}}),p=generateDynamicMotionPlan(s,options),r=p.rows[0];assert.equal(r.locked,true);assert.equal(r.selectedEntryId,'keep');assert.equal(updateDynamicMotionPlanSelection(p,'s','emphasis-phrase').ok,false);assert.equal(updateDynamicMotionPlanSelection(p,'s','emphasis-phrase',{unlockManual:true}).plan.rows[0].selectedEntryId,'emphasis-phrase');
 }
 const matte={prefix:'broll-assets/person/frame-',src,sourceSha256:'a'.repeat(64),width:1920,height:1080,sourceStartMs:0,endMs:60000,fps:30,count:1800};
 const r=row(state('REA介绍',{presentation:{format:'landscape',scenes:[scene({titleTreatment:'embedded',embeddedText:{backdrop:'REA',headline:''},personMatte:matte})]}}));assert.equal(r.locked,true);assert.ok(r.lockReason.includes('后景字'));
});

test('removed nodes/words cannot drive proposals and source clock conflicts remain review-only',()=>{
 const s=state('',{clips:[clip({outSec:2,speed:2})],captions:[cap('当前说明',{startMs:100,endMs:1900,words:[{text:'当前说明',startMs:100,endMs:1900}]}),cap('从0增加到100',{id:'removed',startMs:5100,endMs:5900,words:[{text:'从0增加到100',startMs:5100,endMs:5900}]})],presentation:{format:'landscape',scenes:[scene({endMs:6000,nodes:[{id:'now',text:'当前说明',atMs:0},{id:'gone',text:'从0增加到100',atMs:5000}]})]}});
 const r=row(s);assert.equal(r.retainedMs,1000);assert.deepEqual(r.activeNodeIds,['now']);assert.ok(!candidate(r,'number-counter'));assert.equal(r.selectedEntryId,'keep');
 const clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:'c'.repeat(64),wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2},mismatch=state('完整说明');mismatch.captions[0].audioClock=clock;assert.ok(row(mismatch).warnings.some(w=>w.includes('SHA')));assert.equal(row(mismatch).selectedEntryId,'keep');
});

test('repetition avoidance only trades close candidates of the same semantic/safety role',()=>{
 const a=scene({id:'a',startMs:0,endMs:30000,nodes:[{id:'n',text:'完整短句'}]}),b=scene({id:'b',startMs:30000,endMs:60000,nodes:[{id:'m',text:'另一完整短句'}]}),s=state('',{captions:[cap('普通完整短句',{startMs:100,endMs:29000,words:[{text:'普通完整短句',startMs:100,endMs:29000}]}),cap('另一普通完整短句',{id:'c2',startMs:30100,endMs:59000,words:[{text:'另一普通完整短句',startMs:30100,endMs:59000}]})],presentation:{format:'landscape',scenes:[a,b]}});
 const p=generateDynamicMotionPlan(s,options);assert.deepEqual(p.rows.map(r=>r.selectedEntryId),['emphasis-phrase','glass-capsules']);assert.equal(p.rows[0].candidates[0].role,p.rows[1].candidates.find(c=>c.entryId==='glass-capsules').role);
 b.media={src:'broll-assets/proof.png',kind:'image'};const media=generateDynamicMotionPlan(s,options);assert.equal(media.rows[1].selectedEntryId,'evidence-handoff','never trade media retention for stylistic variety');
});

test('an editor request carries only review intent and rejects every stale rendering/context dependency',()=>{
 const s=state('普通完整说明'),before=structuredClone(s),p=generateDynamicMotionPlan(s,options),request=dynamicMotionEditorRequest(p,'s',s,options);assert.equal(request.ok,true);assert.equal(request.entryId,p.rows[0].selectedEntryId);assert.equal(request.canApply,false);assert.equal(request.requiresRendererSession,true);assert.deepEqual(s,before);
 for(const change of [v=>v.clips[0].speed=2,v=>v.captions[0].words[0].text='改原话',v=>v.presentation.format='portrait',v=>v.presentation.scenes[0].nodes[0].text='改节点',v=>v.brolls.push({id:'new'}),v=>v.meta.fps=60]){const fresh=structuredClone(s);change(fresh);assert.equal(dynamicMotionEditorRequest(p,'s',fresh,options).ok,false);}
 assert.equal(dynamicMotionEditorRequest(p,'s',s,{sourceIdentities:[{...identity,sha256:'b'.repeat(64)}]}).ok,false);assert.equal(dynamicMotionPlanSignature({...s,currentFrame:90,selected:'x'},options),p.signature);assert.equal(p.automaticAllowed,false);assert.equal(p.canApply,false);
});
