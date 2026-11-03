import test from 'node:test';
import assert from 'node:assert/strict';
import {projectStoryboard} from '../src/storyboard.mjs';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {conditionalSetState,conditionalSetIssues,conditionalSetBezier,conditionalSetPathEnvelope,conditionalSetBoundaryBands,conditionalSetSourceCopy,conditionalSetFieldPlan,conditionalSetKey,conditionalSetReadiness,conditionalSetTextReadiness,conditionalSetExposure} from '../src/conditional-set.mjs';

const clone=x=>structuredClone(x);
const full=n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean).join('\n');
function fixture(){
 const raw={id:'original-condition-scene',clipId:'voice',src:'clips/synthetic.mp4',startMs:1000,endMs:61000,layout:'cards',title:'集合与明确条件',body:'这是作者示意，不代表真实服务已经执行。',nodes:[
  {id:'larger',text:'集合 A'}, {id:'smaller',text:'A 内的小集合'}, {id:'target',text:'独立集合 B'},
  {id:'gate-source',text:'不满足条件，保持受阻'}, {id:'subject',text:'同一个对象',detail:'保留完整条件'},
 ]};
 const ref=id=>({nodeId:id,expectedText:full(raw.nodes.find(n=>n.id===id))});
 const config={version:1,kind:'conditional-set',clock:'scene-source-relative-ms',binding:{sceneId:raw.id,src:raw.src,sha256:'a'.repeat(64),startMs:raw.startMs,endMs:raw.endMs},provenance:{kind:'illustration',note:'原创集合条件示意，不作为软件执行结果'},copyWindow:{atMs:0,endMs:20000,rect:{x:.04,y:.04,width:.65,height:.70}},graphicWindow:{atMs:20000,endMs:60000},
  sets:[
   {id:'large',sourceRef:ref('larger'),boundary:{kind:'ellipse',rect:{x:.04,y:.26,width:.27,height:.38}},labelRect:{x:.05,y:.105,width:.16,height:.07},atMs:20000,drawMs:0},
   {id:'small',parentId:'large',sourceRef:ref('smaller'),boundary:{kind:'ellipse',rect:{x:.09,y:.36,width:.10,height:.16}},labelRect:{x:.075,y:.67,width:.19,height:.06},atMs:20000,drawMs:0},
   {id:'other',sourceRef:ref('target'),boundary:{kind:'ellipse',rect:{x:.50,y:.26,width:.24,height:.38}},labelRect:{x:.52,y:.105,width:.18,height:.07},atMs:20000,drawMs:0}
  ],
  gates:[{id:'first-gate',sourceRef:ref('gate-source'),fromSetId:'large',toSetId:'other',boundary:{axis:'x',position:.41,min:.35,max:.55},labelRect:{x:.32,y:.20,width:.14,height:.055},atMs:20000,condition:{kind:'authored',result:'blocked'}}],
  actors:[{id:'same-card',sourceRef:ref('subject'),initialSetId:'small',initialPoint:{x:.14,y:.44},size:{width:.026,height:.03},labelRect:{x:.32,y:.73,width:.36,height:.06},atMs:20000}],
  events:[
   {id:'approach',type:'travel',phase:'approach',actorId:'same-card',gateId:'first-gate',atMs:24000,endMs:26000,path:{from:{x:.14,y:.44},control1:{x:.22,y:.44},control2:{x:.33,y:.44},to:{x:.39,y:.44}}},
   {id:'blocked',type:'evaluate',actorId:'same-card',gateId:'first-gate',atMs:26000,expectedResult:'blocked'},
   {id:'retreat',type:'travel',phase:'retreat',actorId:'same-card',gateId:'first-gate',atMs:28000,endMs:30000,path:{from:{x:.39,y:.44},control1:{x:.33,y:.44},control2:{x:.22,y:.44},to:{x:.14,y:.44}}}
  ]};
 const context={rawScene:raw,sourceIdentity:{kind:'video',src:raw.src,sha256:'a'.repeat(64),width:1920,height:1080,durationSec:61},clips:[{id:'voice',src:raw.src,inSec:1,outSec:61,speed:1,sourceDurationSec:61}],fps:30,captions:[],viewport:{width:1920,height:1080},speaker:{known:true,rect:{x:.78,y:.37,width:.18,height:.30}}};
 return {config,context};
}
const measure=(text,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].reduce((n,{segment})=>n+(/^[a-zA-Z .]$/.test(segment)?.5:1),0)*size,ascent:size*.8,descent:size*.2});
function measurement(config,context){
 const fields=conditionalSetFieldPlan(config,context).map(f=>({id:f.id,text:f.text,fit:fitMeasuredText(f.text,{width:f.rect.width*context.viewport.width*.95,height:f.rect.height*context.viewport.height*.9,minFont:context.viewport.height*.025,maxFont:context.viewport.height*.025,measure})}));
 return {fontKey:'synthetic-current-font',key:conditionalSetKey(config,context,'synthetic-current-font'),fields};
}
function capacityFixture(){
 const {config:c,context:x}=fixture();
 x.rawScene.nodes.push({id:'second-source',text:'容量不超过120MB方可通过'},{id:'size-source',text:'作者提供的60MB示例值'});
 const ref=id=>({nodeId:id,expectedText:full(x.rawScene.nodes.find(n=>n.id===id))});
 x.rawScene.nodes.find(n=>n.id==='gate-source').text='容量小于50MB方可通过';
 c.gates[0].sourceRef=ref('gate-source');c.gates[0].condition={kind:'capacity',factKey:'bytes',operator:'lt',limit:50,unit:'MB'};
 c.gates.push({id:'second-gate',sourceRef:ref('second-source'),fromSetId:'large',toSetId:'other',boundary:{axis:'x',position:.41,min:.48,max:.58},labelRect:{x:.32,y:.65,width:.14,height:.06},atMs:20000,condition:{kind:'capacity',factKey:'bytes',operator:'lte',limit:120,unit:'MB'}});
 c.actors[0].facts=[{key:'bytes',value:60,unit:'MB',sourceRef:ref('size-source')}];
 c.events.push(
  {id:'reroute',type:'travel',phase:'reroute',blockedGateId:'first-gate',actorId:'same-card',gateId:'second-gate',atMs:34000,endMs:36000,path:{from:{x:.14,y:.44},control1:{x:.22,y:.44},control2:{x:.33,y:.51},to:{x:.39,y:.51}}},
  {id:'allowed',type:'evaluate',actorId:'same-card',gateId:'second-gate',atMs:36000,expectedResult:'allowed'},
  {id:'pass',type:'travel',phase:'pass',actorId:'same-card',gateId:'second-gate',atMs:38000,endMs:40000,path:{from:{x:.39,y:.51},control1:{x:.43,y:.51},control2:{x:.51,y:.51},to:{x:.58,y:.51}}}
 );
 return {config:c,context:x};
}

test('nested/parallel sets preserve stable membership through actual approach, stop and authored retreat',()=>{
 const {config:c,context:x}=fixture();assert.deepEqual(conditionalSetIssues(c,x),[]);
 const initial=conditionalSetState(c,x,23000),mid=conditionalSetState(c,x,26000),blocked=conditionalSetState(c,x,28000),retreat=conditionalSetState(c,x,30000),end=conditionalSetState(c,x,33000);
 assert.equal(initial.status,'valid');assert.deepEqual(initial.sets.find(s=>s.id==='large').effectiveMemberIds,['same-card']);assert.deepEqual(initial.sets.find(s=>s.id==='large').directMemberIds,[]);
 assert.deepEqual(initial.sets.find(s=>s.id==='small').directMemberIds,['same-card']);assert.deepEqual(initial.sets.find(s=>s.id==='other').effectiveMemberIds,[]);
 assert.ok(mid.actors[0].point.x>.14&&mid.actors[0].point.x<.39);assert.equal(mid.actors[0].motion.phase,'approach');
 assert.equal(blocked.actors[0].point.x,.39);assert.equal(blocked.gates[0].outcomes[0].result,'blocked');assert.equal(retreat.actors[0].motion.phase,'retreat');
 assert.deepEqual(end.actors[0].point,{x:.14,y:.44});assert.equal(end.actors[0].memberSetId,'small');assert.deepEqual(conditionalSetState(c,x,26000),mid,'backward seek never leaves a future gate result or membership');
 assert.equal(end.canApply,false);assert.equal(end.uiAccepted,false);assert.equal(end.nativeReadiness,'unverified');
});

test('two distinct capacity gates keep the first rejection while the approved same actor passes the second',()=>{
 const {config:c,context:x}=capacityFixture();assert.deepEqual(conditionalSetIssues(c,x),[]);
 const pre=conditionalSetState(c,x,37000),cross=conditionalSetState(c,x,40000),end=conditionalSetState(c,x,43000);
 assert.equal(pre.gates.find(g=>g.id==='first-gate').outcomes.at(-1).result,'blocked');assert.equal(pre.gates.find(g=>g.id==='second-gate').outcomes.at(-1).result,'allowed');
 assert.equal(cross.actors[0].motion.phase,'pass');assert.equal(cross.actors[0].memberSetId,'small','membership changes only at actual authored arrival, not evaluation or plane crossing');
 assert.ok(cross.actors[0].point.x>.41&&cross.actors[0].point.x<.58);assert.equal(end.actors[0].memberSetId,'other');
 assert.equal(end.actors[0].id,'same-card');assert.equal(end.actors[0].outcomes.length,2);assert.deepEqual(end.sets.find(s=>s.id==='large').effectiveMemberIds,[]);assert.deepEqual(end.sets.find(s=>s.id==='other').directMemberIds,['same-card']);
 assert.equal(end.gates.find(g=>g.id==='first-gate').condition.limit,50);assert.equal(end.gates.find(g=>g.id==='first-gate').outcomes.at(-1).result,'blocked');
});

test('membership is a real ancestor relation; missing facts and unit conversion cannot invent permission',()=>{
 const {config:c,context:x}=fixture();c.gates[0].condition={kind:'membership',setId:'large',mode:'inside'};c.events[1].expectedResult='allowed';c.events=c.events.slice(0,2);
 assert.deepEqual(conditionalSetIssues(c,x),[]);assert.equal(conditionalSetState(c,x,28000).gates[0].outcomes[0].result,'allowed');
 c.gates[0].condition.mode='outside';assert.ok(conditionalSetIssues(c,x).includes('explicit-outcome-conflicts-with-current-condition'));
 const q=capacityFixture();q.config.actors[0].facts[0].unit='GB';assert.ok(conditionalSetIssues(q.config,q.context).includes('same-explicit-capacity-unit-required-no-invented-conversion'));
 q.config.actors[0].facts=[];assert.ok(conditionalSetIssues(q.config,q.context).includes('same-explicit-capacity-unit-required-no-invented-conversion'));
 for(const value of [50,120]){const f=capacityFixture();f.config.actors[0].facts[0].value=value;assert.deepEqual(conditionalSetIssues(f.config,f.context),[]);const result=conditionalSetState(f.config,f.context,43000);assert.equal(result.gates[0].outcomes.at(-1).result,'blocked','strict <50 rejects the equal boundary');assert.equal(result.gates[1].outcomes.at(-1).result,'allowed','<=120 accepts its equal boundary');}
});

test('forged pass/retreat, wrong gate, teleport, reversed chronology, unsafe opening and hidden looping are rejected',()=>{
 const base=capacityFixture();const mutations=[
  c=>c.events.find(e=>e.id==='blocked').expectedResult='allowed',
  c=>c.events.find(e=>e.id==='retreat').gateId='second-gate',
  c=>c.events.find(e=>e.id==='pass').gateId='first-gate',
  c=>c.events.find(e=>e.id==='reroute').blockedGateId='second-gate',
  c=>c.events.find(e=>e.id==='pass').path.from.x=.40,
  c=>c.events.find(e=>e.id==='pass').path.control1.x=.60,
  c=>c.events.find(e=>e.id==='pass').path.control1.y=.46,
  c=>c.gates[1].boundary.max=.515,
  c=>c.events.find(e=>e.id==='approach').path.control1.x=.43,
  c=>c.events.find(e=>e.id==='allowed').atMs=25000,
  c=>c.events.find(e=>e.id==='pass').path.to={x:.85,y:.51}
 ];
 for(const mutate of mutations){const c=clone(base.config);mutate(c);assert.notDeepEqual(conditionalSetIssues(c,base.context),[]);assert.equal(conditionalSetState(c,base.context,40000).status,'blocked');}
});

test('a new approach cannot reuse an earlier approval, and an absent approval never manufactures a retreat outcome',()=>{
 const {config:c,context:x}=fixture();
 c.events.splice(3,0,{...clone(c.events[0]),id:'second-approach',atMs:34000,endMs:36000});
 c.events.push({...clone(c.events[2]),id:'second-retreat',atMs:38000,endMs:40000});
 assert.ok(conditionalSetIssues(c,x).includes('retreat-needs-this-gates-explicit-blocked-event'));
 const q=fixture();q.config.events=q.config.events.filter(e=>e.type!=='evaluate');assert.ok(conditionalSetIssues(q.config,q.context).includes('retreat-needs-this-gates-explicit-blocked-event'));
});

test('source binding, complete negative clauses, stable IDs and explicit illustration are mandatory',()=>{
 const {config:c,context:x}=fixture();const before=JSON.stringify({c,x});
 for(const mutate of [q=>q.binding.startMs++,q=>q.binding.sha256='b'.repeat(64),q=>q.provenance.kind='real-execution',q=>q.provenance.note='',q=>q.gates[0].sourceRef.expectedText='满足条件',q=>q.actors[0].id=q.sets[0].id,q=>q.events[2].id=q.events[0].id,q=>q.sets[0].parentId='small',q=>q.sets[1].boundary.rect.x=.40]){
  const q=clone(c);mutate(q);assert.ok(conditionalSetIssues(q,x).length);
 }
 const removed=clone(x);removed.rawScene.nodes=removed.rawScene.nodes.filter(n=>n.id!=='gate-source');assert.ok(conditionalSetIssues(c,removed).length);
 const sourceChanged=clone(x);sourceChanged.rawScene.nodes.find(n=>n.id==='subject').detail='删掉原限定';assert.ok(conditionalSetIssues(c,sourceChanged).length);
 assert.equal(JSON.stringify({c,x}),before,'all validation and sampling are pure');
});

test('current image identities are exact and undeclared/unmapped real source media cannot disappear',()=>{
 const {config:c,context:x}=fixture();const a={kind:'image',src:'broll-assets/synthetic.png',sha256:'b'.repeat(64),width:640,height:480};
 x.rawScene.nodes.find(n=>n.id==='subject').assetSrc=a.src;c.actors[0].assetIdentity=a;x.assets=[clone(a)];assert.deepEqual(conditionalSetIssues(c,x),[]);
 for(const mutate of [q=>q.assets[0].sha256='c'.repeat(64),q=>q.assets[0].width=641,q=>q.rawScene.nodes.find(n=>n.id==='subject').assetSrc='broll-assets/other.png']){const q=clone(x);mutate(q);assert.ok(conditionalSetIssues(c,q).length);}
 x.rawScene.media={src:'broll-assets/unmapped.png'};assert.ok(conditionalSetIssues(c,x).includes('all-real-source-media-must-remain-bound'));
});

test('convex motion envelope, all person keyframes, complete labels and real caption hold reserve safe areas',()=>{
 const {config:c,context:x}=fixture();const path=c.events[0].path,envelope=conditionalSetPathEnvelope(path,c.actors[0].size);
 for(let i=0;i<=100;i++){const p=conditionalSetBezier(path,i/100),r={x:p.x-.013,y:p.y-.015,width:.026,height:.03};assert.ok(r.x>=envelope.x-1e-8&&r.x+r.width<=envelope.x+envelope.width+1e-8&&r.y>=envelope.y-1e-8&&r.y+r.height<=envelope.y+envelope.height+1e-8);}
 assert.ok(conditionalSetBoundaryBands(c.sets[0].boundary).length===64);
 const moving=clone(x);moving.rawScene.window={x:.80,y:.37,size:.1,keyframes:[{atMs:30000,x:.12,y:.37,size:.1}]};assert.ok(conditionalSetIssues(c,moving).some(s=>s.includes('person')||s.includes('text')));
 const unknown=clone(x);unknown.speaker.known=false;assert.ok(conditionalSetIssues(c,unknown).includes('known-person-reservation-required'));
 const caption=clone(x);caption.captions=[{clipId:'voice',startMs:25000,endMs:28000,topPct:50,holdMs:700}];assert.ok(conditionalSetIssues(c,caption).some(s=>s.includes('caption')));
 const legacy=clone(x);legacy.captions=[{startMs:24000,endMs:27000,topPct:50}];assert.ok(conditionalSetIssues(c,legacy).some(s=>s.includes('caption')));
 const ownLabel=clone(c);ownLabel.actors[0].labelRect={x:.2,y:.42,width:.08,height:.05};assert.ok(conditionalSetIssues(ownLabel,x).some(s=>s.includes('label')));
 const malformed=clone(x);malformed.rawScene.window={x:.8,y:.1,size:.1,keyframes:[{atMs:NaN,x:.8,y:.2,size:.1}]};assert.ok(conditionalSetIssues(c,malformed).includes('speaker-keyframe-clock-invalid'));
});

test('raw absolute source clock survives retained cuts and speed; forged projection and removed phase block',()=>{
 const {config:c,context:x}=fixture();const expected=conditionalSetState(c,x,26000).actors[0].point;
 for(const speed of [.5,1,2]){const q=clone(x);q.clips[0].speed=speed;q.projection=projectStoryboard([q.rawScene],q.clips,30)[0];assert.deepEqual(conditionalSetIssues(c,q),[]);assert.deepEqual(conditionalSetState(c,q,26000).actors[0].point,expected);}
 const q=clone(x);q.clips=[{...q.clips[0],id:'cut-a',inSec:1,outSec:28},{...q.clips[0],id:'cut-b',inSec:29,outSec:61,speed:2}];q.projection=projectStoryboard([q.rawScene],q.clips,30)[1];
 assert.deepEqual(conditionalSetState(c,q,30000).actors[0].point,conditionalSetState(c,x,30000).actors[0].point);
 assert.equal(conditionalSetState(c,q,26000).status,'blocked','cannot display another retained instance while pretending it is this projection');
 q.projection.sourceOffsetMs+=10;assert.ok(conditionalSetIssues(c,q).includes('projected-clock-content-or-instance-mismatch'));
 for(const t of [0,61000,NaN,Infinity])assert.equal(conditionalSetState(c,x,t).status,'blocked');
});

test('caption hold is output time across a faster clip and legacy cues stay in output clock',()=>{
 const {config:c,context:x}=fixture();
 x.rawScene.startMs=9000;x.rawScene.endMs=69000;c.binding.startMs=9000;c.binding.endMs=69000;x.sourceIdentity.durationSec=69;x.clips[0].outSec=69;x.clips[0].sourceDurationSec=69;x.clips[0].speed=2;
 assert.deepEqual(conditionalSetIssues(c,x),[]);
 x.captions=[{clipId:'voice',startMs:8000,endMs:8500,topPct:50,holdMs:700}];assert.ok(conditionalSetIssues(c,x).some(s=>s.includes('caption')),'700 output ms of hold crosses the 9s source-scene boundary at 2x');
 x.captions=[{startMs:4100,endMs:4500,topPct:50,holdMs:700}];assert.ok(conditionalSetIssues(c,x).some(s=>s.includes('caption')),'legacy4.1s output cue intersects the source9s scene');
 x.captions=[{startMs:0,endMs:100,topPct:50,holdMs:0}];assert.deepEqual(conditionalSetIssues(c,x),[],'a genuinely earlier caption is not pulled into the source scene');
});

test('all title/body/node details and conditions are inventoried; measurements and page exposure cannot be self-certified',()=>{
 const {config:c,context:x}=fixture();const inventory=conditionalSetSourceCopy(x,c);for(const value of [x.rawScene.title,x.rawScene.body,...x.rawScene.nodes.map(full)])assert.ok(inventory.includes(value));
 const m=measurement(c,x);assert.equal(conditionalSetReadiness(c,x,null).status,'waiting');assert.equal(conditionalSetReadiness(c,x,m).status,'ready');assert.equal(conditionalSetReadiness(c,x,m).canApply,false);
 const edited=clone(x);edited.rawScene.body+=' 不能省略。';assert.equal(conditionalSetReadiness(c,edited,m).status,'waiting');
 const missing=clone(m);missing.fields.pop();assert.equal(conditionalSetReadiness(c,x,missing).status,'waiting');
 const f=conditionalSetFieldPlan(c,x)[0],bad=clone(m);bad.fields[0].fit.pages=[['遗漏否定条件']];assert.equal(conditionalSetReadiness(c,x,bad).status,'blocked');
 const long={...f,text:'不能跳过完整条件与 English spaces 👨‍👩‍👧‍👦。'.repeat(10),endMs:120000};const fit=fitMeasuredText(long.text,{width:190,height:90,minFont:30,maxFont:30,measure});assert.ok(fit.pages.length>1);
 const exposure=[{projectionId:'p',clipId:'p',startMs:0,endMs:120000,speed:1}];assert.equal(conditionalSetTextReadiness(long,fit,exposure).status,'ready');
 assert.equal(conditionalSetTextReadiness(long,fit,[{...exposure[0],startMs:20000}]).status,'blocked');assert.equal(conditionalSetTextReadiness(long,fit,[{...exposure[0],speed:8}]).status,'blocked');
 assert.equal(conditionalSetTextReadiness({...f,endMs:1000},m.fields[0].fit,[{...exposure[0],endMs:1000},{...exposure[0],projectionId:'replay',endMs:1000}]).status,'blocked','same source replay is not two seconds of reading credit');
 for(const speed of [0,-1,NaN,Infinity])assert.equal(conditionalSetTextReadiness(long,fit,[{...exposure[0],speed}]).status,'blocked');
 assert.equal(conditionalSetTextReadiness(long,{...fit,pages:'invalid'},exposure).status,'blocked');
});

test('horizontal and portrait contracts keep geometry and source phase, while actual current font capacity is remeasured',()=>{
 const {config:c,context:x}=fixture();for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){const q={...x,viewport};assert.deepEqual(conditionalSetIssues(c,q),[]);assert.equal(conditionalSetReadiness(c,q,measurement(c,q)).status,'ready');assert.equal(conditionalSetState(c,q,30000).actors[0].memberSetId,'small');}
 const q=clone(x);q.clips[0].speed=2;assert.equal(conditionalSetReadiness(c,q,measurement(c,q)).status,'ready');
 const cropped=clone(x);cropped.clips[0].inSec=5;assert.equal(conditionalSetReadiness(c,cropped,measurement(c,cropped)).status,'blocked','cannot spend copy-page exposure before retained source starts');
 assert.ok(conditionalSetExposure(q)[0].speed===2);
});
