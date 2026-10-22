import test from 'node:test';import assert from 'node:assert/strict';
import {fittedMediaRect,sampleMediaCamera,sampleMediaCursor,activeHighlights,sampleFocusRegions} from '../src/scene-media.mjs';
test('annotations fit portrait and wide media content rather than the letterboxed panel',()=>{
 const r=fittedMediaRect(1000,1000,1600,900);assert.deepEqual(r,{left:350,top:0,width:900,height:900});
 // intrinsic centre is the same pixel whether an annotation or image.
 assert.equal(r.left+.5*r.width,800);assert.equal(r.top+.5*r.height,450);
 assert.deepEqual(fittedMediaRect(1600,900,1000,1000,'cover'),{left:-388.8888888888889,top:0,width:1777.7777777777778,height:1000});
});
test('camera keyframes interpolate in source elapsed time, hold bounds and do not mutate input',()=>{
 const media={scale:1,x:0,y:0,camera:[{atMs:2000,scale:2,x:-10,y:5},{atMs:0,scale:1,x:0,y:0}]};const before=JSON.stringify(media);
 assert.equal(sampleMediaCamera(media,1000).scale,1.5);assert.equal(sampleMediaCamera(media,1000).x,-5);assert.equal(sampleMediaCamera(media,9000).scale,2);assert.equal(JSON.stringify(media),before);
});
test('simultaneous spotlight and multi-line marks expire independently; cursor click is separate from movement',()=>{
 const marks=[{id:'spot',atMs:0,endMs:3000},{id:'line1',atMs:500,endMs:2000},{id:'line2',atMs:1000,endMs:2500}];assert.equal(activeHighlights(marks,1500).length,3);assert.deepEqual(activeHighlights(marks,2000).map(m=>m.id),['spot','line2']);
 const cursor=[{atMs:0,x:.1,y:.2},{atMs:1000,x:.8,y:.4,click:true},{atMs:2000,x:.2,y:.9}];assert.equal(sampleMediaCursor(cursor,-1),null);assert(Math.abs(sampleMediaCursor(cursor,500).x-.45)<.00001);const c=sampleMediaCursor(cursor,1300);assert.equal(c.clickAge,300);assert.equal(c.clickX,.8);assert(Math.abs(c.x-.62)<.00001);assert.equal(sampleMediaCursor(cursor,2000).clickAge,null);
});

test('consecutive focus regions move without losing simultaneous openings',()=>{
 const r=[{id:'a',x:.1,y:.2,w:.6,h:.1,atMs:0,endMs:1000},{id:'b',x:.1,y:.6,w:.8,h:.2,atMs:1000,endMs:3000}];const before=JSON.stringify(r);
 assert.equal(sampleFocusRegions(r,1000)[0].y,.2);assert(Math.abs(sampleFocusRegions(r,1175)[0].y-.4)<1e-9);assert.equal(sampleFocusRegions(r,1600)[0].y,.6);assert.deepEqual(sampleFocusRegions(r,3000),[]);assert.equal(JSON.stringify(r),before);
 assert.equal(sampleFocusRegions([...r,{id:'parallel',x:.8,y:.1,w:.1,h:.1,atMs:0,endMs:3000}],1500).length,2);
});

test('distant recorded-UI focus jumps settle before crossing unrelated controls',()=>{
 const regions=[{id:'timeline',x:.1,y:.72,w:.83,h:.11,atMs:0,endMs:1000},{id:'preview',x:.26,y:.04,w:.44,h:.45,atMs:1000,endMs:2000}];
 const focus=sampleFocusRegions(regions,1150)[0];
 for(const [key,value] of Object.entries({x:.26,y:.04,w:.44,h:.45}))assert(Math.abs(focus[key]-value)<1e-9);
 assert.equal(sampleFocusRegions(regions,1000)[0].y,.72);
});
