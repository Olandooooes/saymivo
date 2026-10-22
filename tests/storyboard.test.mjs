import test from 'node:test';import assert from 'node:assert/strict';
import {projectStoryboard,activeStoryboard,validateStoryboard,previousStoryboardScene,storyboardFrameRange} from '../src/storyboard.mjs';
const scene={id:'flow',clipId:'raw',src:'clips/raw.mp4',startMs:2000,endMs:12000,layout:'flow',title:'步骤',nodes:[{id:'n',text:'搜索',atMs:5000}]};
test('visual scenes retain animation phase across a source split and speed changes',()=>{
 const clips=[{id:'raw-1',src:'clips/raw.mp4',inSec:3,outSec:7,speed:2},{id:'raw-2',src:'clips/raw.mp4',inSec:9,outSec:13,speed:1}];const p=projectStoryboard([scene],clips,30);
 assert.equal(p.length,2);assert.equal(p[0].startMs,0);assert.equal(p[0].endMs,2000);assert.equal(p[0].phaseStartMs,-500);
 assert.equal(p[1].startMs,2000);assert.equal(p[1].endMs,5000);assert.equal(p[1].phaseStartMs,-5000);assert.equal((p[1].startMs-p[1].phaseStartMs)*p[1].speed,7000);
 assert.equal(p[1].nodes[0].atMs,5000); // does not restart a revealed node
});
test('scenes do not attach to an unrelated clip with the same filename or a removed source',()=>{
 assert.equal(projectStoryboard([scene],[{id:'other',src:scene.src,inSec:0,outSec:20}]).length,0);
 assert.equal(activeStoryboard([scene],2000,{id:'raw-2',src:scene.src}),scene);assert.equal(activeStoryboard([scene],12000),undefined);
});
test('validation exposes missing materials, invalid regions, duplicate IDs and detached scenes',()=>{
 const issues=validateStoryboard([{...scene,missing:'真实录屏',highlights:[{x:.8,y:.2,w:.5,h:.1}]},{...scene,endMs:1000}], [{id:'raw',src:scene.src,inSec:0,outSec:20}]);
 assert(issues.some(i=>i.message.includes('待补素材')));assert(issues.some(i=>i.message.includes('高亮范围')));assert(issues.some(i=>i.message.includes('重复')));assert(issues.some(i=>i.message.includes('时间范围')));
});

test('route editing rejects off-canvas widths, duplicate links and invisible link timing',()=>{
 const route={...scene,layout:'route',nodes:[{id:'a',text:'起点',x:.8,width:.3},{id:'b',text:'终点'}],links:[{id:'edge',from:'a',to:'b',atMs:10000},{id:'edge',from:'a',to:'b',atMs:-1}]};
 const issues=validateStoryboard([route],[{id:'raw',src:scene.src,inSec:0,outSec:20}]);
 assert(issues.some(i=>i.message.includes('节点宽度')));
 assert(issues.some(i=>i.message.includes('连线编号重复')));
 assert(issues.some(i=>i.message.includes('连线入场')));
 const valid={...route,nodes:[{id:'a',text:'起点',x:.35,width:.28},{id:'b',text:'终点',x:.02,width:.28}],links:[{id:'edge',from:'a',to:'b',atMs:400}]};
 assert.deepEqual(validateStoryboard([valid],[{id:'raw',src:scene.src,inSec:0,outSec:20}]),[]);
});
test('cursor paths reject duplicate times and off-media points; highlight identities stay distinct',()=>{
 const mediaScene={...scene,layout:'spotlight',media:{src:'broll-assets/test.svg',kind:'image',width:1600,height:900,cursor:[{atMs:0,x:.2,y:.3},{atMs:0,x:1.2,y:.4}]},highlights:[{id:'same',x:.1,y:.1,w:.3,h:.1,atMs:0},{id:'same',x:.1,y:.3,w:.3,h:.1,atMs:0}]};
 const clips=[{id:'raw',src:scene.src,inSec:0,outSec:20}];const issues=validateStoryboard([mediaScene],clips);
 assert(issues.some(i=>i.message.includes('示意光标')));assert(issues.some(i=>i.message.includes('高亮区域编号重复')));
 mediaScene.media.cursor=[{atMs:0,x:.2,y:.3},{atMs:1000,x:.8,y:.4,click:true}];mediaScene.highlights[1].id='second';
 assert.deepEqual(validateStoryboard([mediaScene],clips),[]);
});

test('reordered source scenes and clip order use the actual rendered predecessor',()=>{
 const source=[{...scene,id:'overview',startMs:20000,endMs:25000,layout:'overview'},{...scene,id:'intro',startMs:12000,endMs:15000,layout:'chapter'},{...scene,id:'question',startMs:15000,endMs:20000,layout:'speaker'}];
 const clips=[{id:'raw-1',src:scene.src,inSec:12,outSec:15},{id:'raw-2',src:scene.src,inSec:15,outSec:25}];
 const projected=projectStoryboard(source,clips,30);
 const question=projected.find(s=>s.sourceId==='question'),overview=projected.find(s=>s.sourceId==='overview');
 assert.equal(previousStoryboardScene(projected,question).sourceId,'intro');
 assert.equal(previousStoryboardScene(projected,overview).sourceId,'question');
 const reversed=projectStoryboard(source,[clips[1],clips[0]],30);
 assert.equal(previousStoryboardScene(reversed,reversed.find(s=>s.sourceId==='intro')).sourceId,'overview');
 assert.equal(previousStoryboardScene(projected,undefined),undefined);
});

test('fractional scene boundaries never drop an otherwise active frame',()=>{
 const a={...scene,startMs:10846.666666666666,endMs:15146.666666666666},b={...scene,startMs:a.endMs,endMs:17396.666666666668};
 const x=storyboardFrameRange(a),y=storyboardFrameRange(b);
 assert.equal(x.from+x.durationInFrames,y.from);
 assert(454>=x.from&&454<x.from+x.durationInFrames); // old round(start)+round(duration) lost this frame
 for(const fps of [24,25,30,60])for(let i=0;i<100;i++){
  const cut=1000+i*13.37,left=storyboardFrameRange({...scene,startMs:0,endMs:cut},fps),right=storyboardFrameRange({...scene,startMs:cut,endMs:cut+1234.56},fps);
  assert.equal(left.from+left.durationInFrames,right.from);
 }
});

test('window pose bounds reject invalid imported geometry and preserve valid pose through source projection',()=>{
 const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:15}];
 const valid={...scene,containerPose:{rotateY:-8,rotateZ:2,perspective:3200}};
 assert.deepEqual(validateStoryboard([valid],clips),[]);assert.deepEqual(projectStoryboard([valid],clips)[0].containerPose,valid.containerPose);
 for(const containerPose of [{rotateY:16},{rotateZ:NaN},{perspective:999}])assert.ok(validateStoryboard([{...scene,containerPose}],clips).some(i=>i.message.includes('窗口倾斜')));
});
test('chapter typography rejects nonfinite or unsupported imported entry parameters',()=>{
 const clips=[{id:'raw',src:'clips/raw.mp4',inSec:0,outSec:15}];
 for(const chapterTypography of [{delayMs:NaN},{delayMs:600},{entry:'unknown'},{lineScales:[Infinity]},{labelScale:3}])assert.ok(validateStoryboard([{...scene,layout:'chapter',chapterTypography}],clips).some(i=>i.message.includes('章节字号')));
 assert.deepEqual(validateStoryboard([{...scene,layout:'chapter',chapterTypography:{entry:'sweep',delayMs:100,labelScale:1.6,lineScales:[1.2,1.7]}}],clips),[]);
});
