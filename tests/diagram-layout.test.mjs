import test from 'node:test';
import assert from 'node:assert/strict';
import {orbitGeometry,unequalGroupGeometry,evidenceGroups} from '../src/diagram-layout.mjs';

test('orbit points move deterministically inside their own circle and leave the real evidence window separate',()=>{
 for(const rect of [{x:96,y:140,width:1267,height:691},{x:54,y:250,width:520,height:1000}]){
  const first=orbitGeometry(rect,0),later=orbitGeometry(rect,2000);
  assert.deepEqual(first,orbitGeometry(rect,0));assert.notDeepEqual(first.dots,later.dots);
  for(const frame of [first,later]){
   assert.ok(frame.center.x-frame.radius>=rect.x);assert.ok(frame.center.x+frame.radius<frame.media.x);
   for(const dot of frame.dots)assert.ok(Math.hypot(dot.x-frame.center.x,dot.y-frame.center.y)+dot.r<frame.radius);
   assert.ok(frame.media.x+frame.media.width<=rect.x+rect.width);assert.ok(frame.media.y+frame.media.height<=rect.y+rect.height);
  }
 }
});
test('grouped evidence keeps a wide parent and narrow external group rather than three equal columns',()=>{
 const rect={x:96,y:140,width:1267,height:691},{primary,secondary}=unequalGroupGeometry(rect);
 assert.ok(primary.width>secondary.width*2);assert.ok(primary.x+primary.width<secondary.x);
 for(const box of [primary,secondary])assert.ok(box.x>=rect.x&&box.x+box.width<=rect.x+rect.width&&box.y>=rect.y&&box.y+box.height<=rect.y+rect.height);
});
test('groups reuse original node identities and only an explicit group choice changes membership',()=>{
 const nodes=[{id:'browser',category:'本地工具',text:'浏览器'},{id:'terminal',category:'本地工具',text:'命令行'},{id:'account',category:'外部对象',text:'演示账户'}];
 const scene={nodes},before=structuredClone(scene),groups=evidenceGroups(scene);
 assert.deepEqual(groups.primary.map(n=>n.id),['browser','terminal']);assert.deepEqual(groups.secondary.map(n=>n.id),['account']);assert.equal(groups.primary[0],nodes[0]);
 const changed=evidenceGroups({...scene,visualPreset:{primaryNodeId:'account'}});assert.deepEqual(changed.primary,[nodes[2]]);assert.deepEqual(changed.secondary,nodes.slice(0,2));assert.deepEqual(scene,before);
 const ungrouped=evidenceGroups({nodes:nodes.map(({category,...node})=>node)});assert.equal(ungrouped.primary.length,1);assert.equal(ungrouped.secondary.length,2);
 const explicit=evidenceGroups({nodes,visualPreset:{primaryNodeIds:['browser','account']}});assert.deepEqual(explicit.primary,[nodes[0],nodes[2]]);assert.deepEqual(explicit.secondary,[nodes[1]]);
});
