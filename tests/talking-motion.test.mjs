import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchTalkingMotion,projectTalkingMotion} from '../src/talking-motion.mjs';
const clip={id:'voice',src:'clips/synthetic.mp4',inSec:0,outSec:40,speed:1};
const cap=(text,startMs,endMs)=>({id:String(startMs),clipId:'voice',startMs,endMs,words:[{text,startMs,endMs,accent:false}],topPct:88});
test('different topics use the same matcher and preserve exact wording, including limitations',()=>{
 for(const text of ['关键是先确认数据来源。','保温不代表食物不会变质。','缓存就是暂存经常使用的数据。']){
  const captions=[cap(text,1000,5000)],before=JSON.stringify(captions),out=matchTalkingMotion(captions,[clip]);
  assert.equal(out.length,1);assert.equal(out[0].kind,'emphasis');assert.equal(out[0].items[0].text,text);assert.equal(JSON.stringify(captions),before);
 }
});
test('explicit contrasts preserve both clauses and their source token timing',()=>{
 const words=['这不是','免费使用，','而是','限期试用。'].map((text,i)=>({text,startMs:1000+i*1000,endMs:2000+i*1000,accent:false}));
 const c={...cap('',1000,5000),words},out=matchTalkingMotion([c],[clip]);
 assert.equal(out[0].kind,'contrast');assert.equal(out[0].items.map(x=>x.text).join(''),words.map(w=>w.text).join(''));assert.equal(out[0].items[1].atMs,3000);
});
test('short isolated ordinals collect their actual spoken bodies without inventing a third step',()=>{
 const captions=[cap('第一',1000,1500),cap('清洗蔬菜。',1700,4200),cap('第二',4500,5000),cap('放入锅里。',5200,7700)];
 const out=matchTalkingMotion(captions,[clip]);assert.equal(out.length,1);assert.equal(out[0].kind,'steps');assert.equal(out[0].items.length,2);assert.equal(out[0].items[1].atMs,4500);
});
test('trimmed sentences, unmarked speech and ranges outside the requested sample remain plain',()=>{
 assert.deepEqual(matchTalkingMotion([cap('我今天去公园散步。',1000,4000)],[clip]),[]);
 assert.deepEqual(matchTalkingMotion([cap('核心是保持原文完整。',1000,5000)],[{...clip,inSec:2}]),[]);
 assert.deepEqual(matchTalkingMotion([cap('核心是保持原文完整。',1000,5000)],[clip],{startMs:2000,endMs:6000}),[]);
});
test('projection follows reordered speed and refuses different media or changed wording',()=>{
 const captions=[cap('核心是保护原始记录。',10000,14000)],cue=matchTalkingMotion(captions,[clip])[0];assert.ok(cue);
 const clips=[{...clip,id:'intro',outSec:2},{...clip,inSec:8,outSec:20,speed:2}];
 const projected=projectTalkingMotion([cue],captions,clips);assert.equal(projected[0].startMs,3000);assert.equal(projected[0].endMs,5000);
 assert.deepEqual(projectTalkingMotion([cue],captions,[{...clip,src:'different.mp4'}]),[]);
 assert.deepEqual(projectTalkingMotion([cue],[cap('核心是不保护原始记录。',10000,14000)],[clip]),[]);
});
test('nearby matches do not stack or erase protected motion metadata',()=>{
 const captions=[cap('关键是先完成准备。',1000,4000),cap('核心是检查结果。',4200,7200)];
 assert.equal(matchTalkingMotion(captions,[clip]).length,1);
 const reviewed={...captions[0],motion:{kind:'emphasis',title:'人工设置'}};
 assert.equal(reviewed.motion.title,'人工设置');assert.deepEqual(matchTalkingMotion([reviewed],[clip]),[]);
});
