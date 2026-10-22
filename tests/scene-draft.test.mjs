import test from 'node:test';import assert from 'node:assert/strict';import {proposeScene} from '../src/scene-draft.mjs';import {focusedNodeId,nodeFocusAmount,sampleSceneWindow,sceneSpeakerLayout,validateStoryboard} from '../src/storyboard.mjs';
const clip={id:'a-1',src:'clips/a.mp4',inSec:0,outSec:10},scene={id:'s',clipId:'a',src:clip.src,startMs:0,endMs:10000,layout:'speaker',title:'判断标准'};
const cap=text=>({id:'c',clipId:clip.id,startMs:1000,endMs:9000,words:[{text,startMs:1000,endMs:9000}]});
test('local scene proposal cites current subtitles and never borrows unrelated source content',()=>{
 const p=proposeScene(scene,[cap('第一，能做完。第二，有依据。第三，可修改。'),{...cap('外部来源'),clipId:'other'}],[clip]);assert.equal(p.method,'local-rules');assert.equal(p.scene.layout,'cards');assert.deepEqual(p.scene.nodes.map(n=>n.text),['能做完','有依据','可修改']);assert.deepEqual(p.captionIds,['c']);assert(!p.sourceText.includes('外部'));assert.equal(scene.layout,'speaker');
 assert('error' in proposeScene(scene,[],[clip]));
});
test('structured graph validates its active node and every edge endpoint',()=>{
 const graph={...scene,layout:'route',nodes:[{id:'a',text:'输入'},{id:'b',text:'结果'}],links:[{id:'e',from:'a',to:'missing'}],activeNodeId:'absent'};const errors=validateStoryboard([graph],[clip]);assert(errors.some(i=>i.message.includes('连线')));assert(errors.some(i=>i.message.includes('当前节点')));
 for(const layout of ['overview','stack','route'])assert.equal(sceneSpeakerLayout({...scene,layout}),'slide');assert.equal(sceneSpeakerLayout({...scene,layout:'headline',headlinePosition:'split'}),'speaker');
});

test('independent tags reject invalid timing and protected bottom area',()=>{
 const tag={id:'t',text:'检查依据',x:.1,y:.5,atMs:500,endMs:9000};
 assert.deepEqual(validateStoryboard([{...scene,tags:[tag]}],[clip]),[]);
 for(const patch of [{endMs:12000},{atMs:9000},{y:.9},{text:''},{scale:Infinity}])assert(validateStoryboard([{...scene,tags:[{...tag,...patch}]}],[clip]).some(i=>i.message.includes('独立标签')));
 assert(validateStoryboard([{...scene,tags:[tag,tag]}],[clip]).some(i=>i.message.includes('独立标签')));
});

test('gallery accepts local image assets and rejects paths outside the library',()=>{
 const g={...scene,layout:'gallery',nodes:[{id:'n',text:'总结',assetSrc:'broll-assets/summary.jpg'}]};
 assert.equal(sceneSpeakerLayout(g),'slide');assert.deepEqual(validateStoryboard([g],[clip]),[]);
 for(const assetSrc of ['https://example.com/p.png','broll-assets/../secret.png','broll-assets/movie.mp4','/tmp/p.png'])assert(validateStoryboard([{...g,nodes:[{...g.nodes[0],assetSrc}]}],[clip]).some(i=>i.message.includes('展示图片')));
});

test('speaker window interpolates in source time and holds endpoints',()=>{
 const s={...scene,window:{x:.76,y:.46,size:.205,keyframes:[{atMs:0,x:.76,y:.46,size:.205},{atMs:2000,x:.70,y:.36,size:.24}]}};
 assert.deepEqual(sampleSceneWindow(s,0),{x:.76,y:.46,size:.205});
 const mid=sampleSceneWindow(s,1000);assert(Math.abs(mid.x-.73)<1e-9);assert(Math.abs(mid.size-.2225)<1e-9);
 assert.deepEqual(sampleSceneWindow(s,9000),{x:.70,y:.36,size:.24});
 assert.deepEqual(validateStoryboard([s],[clip]),[]);
 assert(validateStoryboard([{...s,window:{...s.window,keyframes:[...s.window.keyframes,{atMs:2000,x:.7,y:.8,size:.3}]}}],[clip]).some(e=>e.message.includes('关键帧')));
});
test('highlight lifetime must belong to its authored scene',()=>{
 const h={id:'h',x:.1,y:.2,w:.5,h:.05,atMs:1000,endMs:3000};
 assert.deepEqual(validateStoryboard([{...scene,highlights:[h]}],[clip]),[]);
 for(const patch of [{atMs:-1},{endMs:1000},{endMs:11000}])assert(validateStoryboard([{...scene,highlights:[{...h,...patch}]}],[clip]).some(e=>e.message.includes('高亮入场')));
});

test('visible millisecond endpoint tolerates source floating-point subtraction',()=>{
 const h={id:'h',x:.1,y:.2,w:.5,h:.05,atMs:0,endMs:2000};
 assert.deepEqual(validateStoryboard([{...scene,startMs:1000.00000000001,endMs:3000,highlights:[h]}],[clip]),[]);
});

test('card focus follows edited source times rather than node array order',()=>{
 const s={...scene,nodes:[{id:'late',text:'后讲',atMs:0,focusMs:4000},{id:'early',text:'先讲',atMs:0,focusMs:0}]};
 assert.equal(focusedNodeId(s,1000),'early');assert.equal(focusedNodeId(s,4500),'late');
 assert.equal(nodeFocusAmount(s,'late',4125),.5);assert.equal(nodeFocusAmount(s,'early',4125),.5);assert.equal(s.nodes[0].id,'late');
 assert(validateStoryboard([{...scene,nodes:[{id:'n',text:'无效',atMs:1000,focusMs:500}]}],[clip]).some(e=>e.message.includes('聚焦时间')));
});
