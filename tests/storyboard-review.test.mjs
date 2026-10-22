import test from 'node:test';
import assert from 'node:assert/strict';
import {storyboardReview,storyboardReviewMarkdown,reviewTime} from '../src/storyboard-review.mjs';

test('review projects object spans through cuts and speed, without inventing removed events or mutating the plan',()=>{
 const project={name:'测试 | <项目>',clips:[{id:'raw-a',src:'clips/raw.mp4',inSec:1,outSec:3,speed:2},{id:'raw-b',src:'clips/raw.mp4',inSec:5,outSec:7,speed:1}],presentation:{scenes:[{id:'s',clipId:'raw',src:'clips/raw.mp4',startMs:0,endMs:8000,layout:'speaker',title:'标题',sourceText:'原话',tags:[{id:'held',text:'跨剪口',atMs:2000,endMs:6000,x:0,y:0},{id:'cut',text:'已删除',atMs:3500,endMs:4500,x:0,y:0}]}]}};
 const before=JSON.stringify(project),review=storyboardReview(project);
 assert.deepEqual(review.rows.map(r=>[r.startMs,r.endMs,r.sourceStartMs,r.sourceEndMs]),[[0,1000,1000,3000],[1000,3000,5000,7000]]);
 assert.deepEqual(review.rows.map(r=>r.events.map(e=>[e.id,e.startMs,e.endMs])),[[['held',500,1000]],[['held',1000,2000]]]);
 const md=storyboardReviewMarkdown(project);
 assert.match(md,/测试 &#124; &lt;项目&gt;/);assert.match(md,/00:00.500—00:01.000/);assert.doesNotMatch(md,/已删除/);
 assert.equal(JSON.stringify(project),before);
});

test('review lists explicit missing assets, unavailable provenance and scenes outside the retained timeline',()=>{
 const p={clips:[{id:'a',src:'a.mp4',inSec:0,outSec:1}],presentation:{scenes:[{id:'s',clipId:'a',startMs:0,endMs:1000,layout:'slide',title:'讲义',media:{src:'broll-assets/a.svg',kind:'image'},missing:'需要原始说明图'},{id:'removed',clipId:'a',startMs:2000,endMs:3000,layout:'speaker'}]}};
 const review=storyboardReview(p),md=storyboardReviewMarkdown(p);
 assert.deepEqual(review.unretainedSceneIds,['removed']);
 for(const text of ['需要原始说明图','未记录原话依据','素材来源说明待补','未进入保留时间轴'])assert.ok(md.includes(text));
 assert.equal(reviewTime(59999.7),'01:00.000');
});

test('literal word emphasis remains reviewable after a trimmed and accelerated source fragment',()=>{
 const p={clips:[{id:'raw-cut',src:'clips/raw.mp4',inSec:1,outSec:5,speed:2}],presentation:{scenes:[{id:'s',clipId:'raw',src:'clips/raw.mp4',startMs:0,endMs:6000,layout:'cards',title:'判断',nodes:[{id:'task',text:'把任务做完',atMs:0,textCues:[{text:'做完',atMs:3000}]}]}]}};
 const events=storyboardReview(p).rows[0].events.filter(e=>e.kind==='文字强调');
 assert.deepEqual(events.map(e=>[e.text,e.startMs,e.endMs]),[['做完',1000,2000]]);
 assert.match(storyboardReviewMarkdown(p),/文字强调 做完.*00:01.000—00:02.000/);
});

test('comparison assets and visible events use retained clip spans and speed without exporting a removed tail step',()=>{
 const comparison={before:{src:'broll-assets/before.png',label:'原片 | 实拍',atMs:0},after:{src:'broll-assets/after.png',label:'成片',atMs:2500},steps:[{id:'captions',text:'字幕',atMs:1500},{id:'visuals',text:'画面',atMs:4000},{id:'removed',text:'已裁掉的尾部步骤',atMs:7500}]};
 const p={clips:[{id:'raw-a',src:'clips/raw.mp4',inSec:1,outSec:3,speed:2},{id:'raw-b',src:'clips/raw.mp4',inSec:5,outSec:7,speed:.5}],presentation:{scenes:[{id:'compare',clipId:'raw',src:'clips/raw.mp4',startMs:0,endMs:8000,layout:'overview',title:'从原片到成片',overviewComparison:comparison}]}};
 const before=structuredClone(p),review=storyboardReview(p),md=storyboardReviewMarkdown(p);
 assert.deepEqual(review.rows.map(r=>r.overviewComparison),[comparison,comparison]);
 assert.deepEqual(review.rows.map(r=>r.events.map(e=>[e.id,e.startMs,e.endMs])),[
  [['compare.comparison-before',0,1000],['compare.comparison-after',750,1000],['captions',250,1000]],
  [['compare.comparison-before',1000,5000],['compare.comparison-after',1000,5000],['captions',1000,5000],['visuals',1000,5000]],
 ]);
 assert.match(md,/原片对照 原片 &#124; 实拍：broll-assets\/before\.png/);
 assert.match(md,/成片对照 成片：broll-assets\/after\.png/);
 assert.match(md,/对照加工项 字幕.*00:00.250—00:01.000/);
 assert.doesNotMatch(md,/已裁掉的尾部步骤/);
 review.rows[0].overviewComparison.before.label='导出副本';
 assert.deepEqual(p,before,'exported comparison metadata does not mutate the source plan');
});

test('return-overview comparison remains clipped into the two retained source fragments of scene15',()=>{
 const p={clips:[{id:'raw-cut3',src:'clips/raw.mp4',inSec:104.88,outSec:118.12},{id:'raw-cut3-cut1',src:'clips/raw.mp4',inSec:122.13,outSec:126.104}],presentation:{scenes:[{id:'auto-scene-15',clipId:'raw',src:'clips/raw.mp4',startMs:113203,endMs:122690,layout:'overview',title:'从原片到成片',overviewComparison:{before:{src:'broll-assets/raw.png',label:'原片',atMs:0},after:{src:'broll-assets/result.png',label:'成片',atMs:2360},steps:[{id:'captions',text:'字幕',atMs:1450},{id:'visuals',text:'画面',atMs:1750},{id:'emphasis',text:'重点',atMs:2050}]}}]}};
 const rows=storyboardReview(p).rows;
 assert.deepEqual(rows.map(r=>[r.sourceStartMs,r.sourceEndMs]),[[113203,118120],[122130,122690]]);
 assert.equal(rows[0].events.length,5);assert.equal(rows[1].events.length,5);
 assert.equal(rows[0].events.find(e=>e.id.endsWith('comparison-before')).startMs,8323);
 assert.equal(rows[0].events.find(e=>e.id.endsWith('comparison-after')).startMs,10683);
 for(const row of rows)for(const event of row.events){
  assert.ok(event.startMs>=row.startMs&&event.endMs<=row.endMs,'no visible span crosses the retained clip boundary');
 }
 for(const event of rows[1].events){
  assert.equal(event.startMs,rows[1].startMs);
  assert.equal(event.endMs,rows[1].endMs);
 }
 const md=storyboardReviewMarkdown(p);
 assert.equal((md.match(/原片对照 原片：broll-assets\/raw\.png/g)??[]).length,2);
 assert.equal((md.match(/对照加工项 重点/g)??[]).length,2);
});
