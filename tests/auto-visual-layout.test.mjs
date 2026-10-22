import test from 'node:test';import assert from 'node:assert/strict';
import {sceneProfileSampleTimes,visualLayoutSamples,applyVisualProfileLayout} from '../server/auto-visual-layout.mjs';
import {applyVisualReview} from '../server/source-visual-reviews.mjs';
import {captureSceneDesign} from '../server/scene-design-review.mjs';
const src='clips/raw.mp4',sha='a'.repeat(64),face={x:.1,y:.3,w:.3,h:.4,confidence:.9};
const base=()=>({clips:[{id:'raw',src,inSec:0,outSec:6}],captions:[{id:'cap',clipId:'raw',startMs:1200,endMs:4000,words:[{text:'原话',startMs:1200,endMs:4000}]}],presentation:{format:'landscape',scenes:[{id:'s',clipId:'raw',src,layout:'speaker',tagTreatment:'kinetic',title:'原话',sourceText:'原话',startMs:1000,endMs:5000,tags:['找资料','核对信息','整理表格'].map((text,i)=>({id:'t'+i,text,x:i===1?.69:.04,y:i<2?.12:.43,atMs:i*400,endMs:3000}))}]}});
const profile=(p,rect=face)=>({version:1,sourceSha256:sha,frames:visualLayoutSamples(p,src).map(requestedAtSec=>({requestedAtSec,width:640,height:360,faces:[rect]}))});
test('scene samples stay inside retained windows; left subject yields a right text column without changing speech',()=>{
 const p=base(),before=structuredClone(p),times=sceneProfileSampleTimes(p.presentation.scenes[0],p.clips);
 assert.deepEqual(times,[1.35,3,4.65]);
 const r=applyVisualProfileLayout(p,profile(p),{src,sourceSha256:sha});assert.equal(r.report[0].status,'applied');
 assert.ok(r.project.presentation.scenes[0].tags.every(t=>Math.abs(t.x-.60)<1e-8&&t.width<=.36));
 assert.deepEqual(r.project.presentation.scenes[0].tags.map(t=>t.y),[.1,.32,.54]);
 assert.deepEqual(r.project.captions,p.captions);assert.deepEqual(r.project.clips,p.clips);assert.deepEqual(p,before);
 const split=[{id:'raw',src,inSec:1,outSec:2},{id:'raw-cut1',src,inSec:4,outSec:5}];
 assert.ok(sceneProfileSampleTimes(p.presentation.scenes[0],split).every(t=>t>=1&&t<=2||t>=4&&t<=5));
});
test('foreign profile, incomplete face samples, unsupported crop and crowded layout preserve the original tags',()=>{
 for(const mutate of [x=>x.sourceSha256='b'.repeat(64),x=>x.frames.pop(),x=>x.frames[0].faces=[],x=>x.frames[0].faces.push(face)]){
  const p=base(),data=profile(p);mutate(data);const r=applyVisualProfileLayout(p,data,{src,sourceSha256:sha});assert.deepEqual(r.project,p);assert.ok(r.report.every(x=>x.status==='skipped'));
 }
 const p=base();p.clips[0].transform=[{t:1,scale:1.2,x:0,y:0}];assert.deepEqual(applyVisualProfileLayout(p,profile(p),{src,sourceSha256:sha}).project,p);
 const crowded=base();assert.deepEqual(applyVisualProfileLayout(crowded,profile(crowded,{...face,x:.05,w:.9}),{src,sourceSha256:sha}).project,crowded);
});
test('reviewed source design applied after analysis keeps authored positions and timings',()=>{
 const p=base(),scene=p.presentation.scenes[0],adapted=applyVisualProfileLayout(p,profile(p),{src,sourceSha256:sha});
 const r=applyVisualReview(adapted.project,{version:1,decisions:[{kind:'scene-design',layout:scene.layout,anchor:scene,design:captureSceneDesign(scene)}]},src);
 assert.deepEqual(r.project.presentation.scenes[0].tags,scene.tags);assert.deepEqual(r.project.captions,p.captions);
});
test('one-side layout avoids stacking multiline titles or four simultaneous tags',()=>{
 const multiline=base();multiline.presentation.scenes[0].tags[0].text='第一行\n第二行';
 const a=applyVisualProfileLayout(multiline,profile(multiline),{src,sourceSha256:sha});
 assert.equal(a.report[0].reason,'insufficient-vertical-space');assert.deepEqual(a.project,multiline);
 const crowded=base();crowded.presentation.scenes[0].tags.push({...crowded.presentation.scenes[0].tags[0],id:'fourth'});
 const b=applyVisualProfileLayout(crowded,profile(crowded),{src,sourceSha256:sha});
 assert.equal(b.report[0].reason,'too-many-overlapping-tags');assert.deepEqual(b.project,crowded);
});
test('one-side multiline emphasis reserves its real height and reuses rows after source-time exit',()=>{
 const p=base();p.presentation.scenes[0].tags=p.presentation.scenes[0].tags.slice(0,2);p.presentation.scenes[0].tags[0].text='当代的\n齐民要术';
 const r=applyVisualProfileLayout(p,profile(p),{src,sourceSha256:sha});assert.equal(r.report[0].status,'applied');
 assert.deepEqual(r.project.presentation.scenes[0].tags.map(t=>t.y),[.1,.54]);assert.ok(r.project.presentation.scenes[0].tags.every(t=>t.x>=.6));
 const sequential=base();sequential.presentation.scenes[0].tags[0].text='第一行\n第二行';sequential.presentation.scenes[0].tags.forEach((t,i)=>{t.atMs=i*1000;t.endMs=(i+1)*1000;});
 const reused=applyVisualProfileLayout(sequential,profile(sequential),{src,sourceSha256:sha});assert.equal(reused.report[0].status,'applied');assert.deepEqual(reused.project.presentation.scenes[0].tags.map(t=>t.y),[.1,.1,.1]);
 assert.deepEqual(r.project.clips,p.clips);assert.deepEqual(r.project.captions,p.captions);
});
