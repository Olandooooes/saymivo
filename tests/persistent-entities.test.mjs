import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentEntitiesSourceCopy,persistentEntitiesKey,persistentEntitiesIssues,persistentEntitiesState} from '../src/persistent-entities.mjs';

// Original synthetic examples. These records stand in for metadata only; no
// test claims a decoder, browser font, real application execution or UI receipt.
const illustration={kind:'illustration',note:'作者明确编排的原创流程示例，不代表软件实际完成任务。'};
const pose=(x,y,width,height)=>({x,y,width,height});
const identity={kind:'video',src:'clips/synthetic-persistent.mp4',sha256:'a'.repeat(64),width:1920,height:1080,durationSec:70};
const assets=[1,2,3].map((n)=>({kind:'image',src:`broll-assets/original-card-${n}.png`,sha256:String(n).repeat(64),width:640+n,height:400+n}));
const imageNodes=assets.map((a,i)=>({id:`image-node-${i+1}`,text:`原创证据卡 ${i+1}`,detail:'来源需要核对，图片本身不证明执行成功。',assetSrc:a.src}));
const taskNodes=[
 {id:'task-node-1',text:'核对来源',detail:'不能把示意当作真实执行',bullets:['保留原始出处']},
 {id:'task-node-2',text:'检查边界',detail:'未完成项目不能标成完成'},
 {id:'task-node-3',text:'确认完整条件',bullets:['不省略失败情况']},
 {id:'task-node-4',text:'检查来源一致',detail:'Keep English spaces and emoji 👨‍👩‍👧‍👦'},
 {id:'task-node-5',text:'保留待复核项',detail:'即使展示完成，也只是作者的假设示例'}
];
const nodeText=n=>[n.text,n.detail,...(n.bullets??[])].filter(Boolean).join('\n');
const context={scene:{id:'original-scene',src:identity.src,startMs:1000,endMs:61000,title:'完整原创说明',body:'不能据此认定任何实际软件已经执行。',nodes:[...imageNodes,...taskNodes]},sourceIdentity:identity,assets};
const binding={sceneId:context.scene.id,src:identity.src,sha256:identity.sha256,startMs:1000,endMs:61000};
const base=()=>({version:1,clock:'scene-source-relative-ms',binding:{...binding},provenance:illustration,entities:[],containers:[],events:[]});
const owner=(containerId,slotId)=>({containerId,slotId});
const compose=(p,c)=>pose(p.x+c.x*p.width,p.y+c.y*p.height,p.width*c.width,p.height*c.height);
const clone=x=>structuredClone(x);
const sample=(timeline,relativeMs)=>persistentEntitiesState(timeline,context,binding.startMs+relativeMs);
const issue=(timeline,fragment,c=context)=>assert.ok(persistentEntitiesIssues(timeline,c).some(i=>i.includes(fragment)),JSON.stringify(persistentEntitiesIssues(timeline,c)));

function stackExample(){
 const t=base(),stack=pose(.05,.1,.6,.6),anchor=pose(.72,.05,.25,.35),slot=pose(.05,.05,.9,.9);
 const a=pose(.08,.55,.8,.3),b=pose(.08,.65,.8,.3),c=pose(.08,.65,.8,.3),a2=pose(.08,.28,.8,.3),a3=pose(.08,.05,.8,.3),b3=pose(.08,.28,.8,.3);
 t.entities=assets.map((asset,i)=>({id:`card-${i+1}`,kind:'media',sourceRef:{asset,nodeId:imageNodes[i].id,expectedText:nodeText(imageNodes[i])}}));
 t.containers=[{id:'stack',kind:'stack',pose:stack,slots:[{id:'first',pose:a},{id:'second',pose:b},{id:'third',pose:c}]},{id:'anchor',kind:'anchor',pose:anchor,slots:[{id:'group',pose:slot}]}];
 const below=pose(.15,.7,.35,.2);
 t.events=[
  {id:'card1-already-visible',type:'spawn',atMs:0,instanceId:'card-1',to:owner('stack','first'),pose:compose(stack,a)},
  {id:'card2-enter',type:'spawn',atMs:750,instanceId:'card-2',to:null,pose:below},
  {id:'card2-push',type:'move',atMs:800,endMs:1000,subject:{kind:'entity',id:'card-2'},from:null,to:owner('stack','second'),fromPose:below,toPose:compose(stack,b)},
  {id:'stack-push-two',type:'layout',atMs:1000,endMs:1500,containerId:'stack',slots:[{id:'first',fromPose:a,toPose:a2},{id:'second',fromPose:b,toPose:a},{id:'third',fromPose:c,toPose:c}]},
  {id:'card3-enter',type:'spawn',atMs:1700,instanceId:'card-3',to:null,pose:below},
  {id:'card3-push',type:'move',atMs:1800,endMs:2000,subject:{kind:'entity',id:'card-3'},from:null,to:owner('stack','third'),fromPose:below,toPose:compose(stack,c)},
  {id:'stack-push-three',type:'layout',atMs:2000,endMs:2500,containerId:'stack',slots:[{id:'first',fromPose:a2,toPose:a3},{id:'second',fromPose:a,toPose:b3},{id:'third',fromPose:c,toPose:a}]},
  {id:'group-attaches-to-anchor',type:'attach',atMs:3000,endMs:4000,subject:{kind:'container',id:'stack'},from:null,to:owner('anchor','group'),fromPose:stack,toPose:compose(anchor,slot)}
 ];
 return t;
}
function checklistExample(){
 const t=base(),checklist=pose(.04,.06,.62,.7),archive=pose(.76,.12,.2,.3),archiveSlot=pose(.05,.05,.9,.9),summaryPose=pose(.1,.4,.4,.2);
 const slots=taskNodes.map((_,i)=>({id:`row-${i+1}`,pose:pose(.05,.03+i*.18,.9,.15)}));
 t.entities=[...taskNodes.map((n,i)=>({id:`task-${i+1}`,kind:'task',sourceRef:{nodeId:n.id,expectedText:nodeText(n)},initialStatus:'pending',provenance:illustration})),{id:'summary',kind:'summary',text:'五项核对的原创摘要',provenance:illustration}];
 t.containers=[{id:'checklist',kind:'checklist',pose:checklist,memberIds:taskNodes.map((_,i)=>`task-${i+1}`),slots},{id:'archive',kind:'archive',pose:archive,slots:[{id:'first-phase',pose:archiveSlot}]}];
 t.events=[...slots.map((slot,i)=>({id:`show-task-${i+1}`,type:'spawn',atMs:0,instanceId:`task-${i+1}`,to:owner('checklist',slot.id),pose:compose(checklist,slot.pose)})),...taskNodes.map((_,i)=>({id:`done-${i+1}`,type:'setStatus',atMs:1000+i*500,instanceId:`task-${i+1}`,from:'pending',to:'done',provenance:illustration})),
  {id:'summarize-all-five',type:'summarize',atMs:4000,instanceId:'summary',containerId:'checklist',memberIds:taskNodes.map((_,i)=>`task-${i+1}`),expectedMembers:taskNodes.map((n,i)=>({instanceId:`task-${i+1}`,text:nodeText(n),status:'done'})),completion:'all-done',provenance:illustration,to:null,pose:summaryPose},
  {id:'archive-the-same-summary',type:'archive',atMs:5000,endMs:6000,subject:{kind:'entity',id:'summary'},from:null,to:owner('archive','first-phase'),fromPose:summaryPose,toPose:compose(archive,archiveSlot)}];
 return t;
}

test('three verified image instances push persistently, then the same whole stack attaches to an anchor',()=>{
 const t=stackExample();assert.deepEqual(persistentEntitiesIssues(t,context),[]);
 const before=sample(t,900),moving=sample(t,1250),three=sample(t,2600),group=sample(t,3500),end=sample(t,4200);
 assert.equal(before.entities['card-2'].owner.containerId,'stack','logical ownership transfers once at motion start');
 assert.equal(before.containers.stack.slots.second.occupant.id,'card-2');
 assert.ok(moving.entities['card-1'].worldPose.y<sample(t,1000).entities['card-1'].worldPose.y);
 assert.equal(three.entities['card-1'].active,true);assert.equal(three.entities['card-2'].active,true);assert.equal(three.entities['card-3'].active,true);
 assert.notDeepEqual(group.containers.stack.worldPose,end.containers.stack.worldPose,'whole group has a real intermediate transform');
 assert.deepEqual(end.containers.stack.owner,owner('anchor','group'));
 for(let i=1;i<=3;i++){
  const e=end.entities[`card-${i}`];assert.equal(e.id,`card-${i}`);assert.equal(e.sourceRef.asset.sha256,assets[i-1].sha256);assert.equal(e.owner.containerId,'stack');
  assert.equal(end.containers.stack.slots[['first','second','third'][i-1]].occupant.id,e.id);
  assert.equal(e.worldPose.width,end.containers.stack.worldPose.width*.8);
 }
 assert.equal(end.canApply,false);assert.equal(end.nativeReadiness,'unverified');
});

test('five explicit done events retain earlier rows, summary references complete members, same summary archives',()=>{
 const t=checklistExample();assert.deepEqual(persistentEntitiesIssues(t,context),[]);
 const mid=sample(t,1750),done=sample(t,4500),moving=sample(t,5500),end=sample(t,6500);
 assert.deepEqual(taskNodes.map((_,i)=>mid.entities[`task-${i+1}`].status),['done','done','pending','pending','pending']);
 assert.equal(mid.entities.summary.active,false);
 assert.equal(done.entities.summary.summary.members.length,5);assert.deepEqual(done.entities.summary.summary.unresolvedMemberIds,[]);
 for(let i=0;i<5;i++){assert.equal(done.entities[`task-${i+1}`].status,'done');assert.equal(done.entities.summary.summary.members[i].text,nodeText(taskNodes[i]));assert.equal(done.entities[`task-${i+1}`].active,true);}
 assert.deepEqual(end.entities.summary.owner,owner('archive','first-phase'));assert.equal(end.containers.archive.slots['first-phase'].occupant.id,'summary');
 assert.notDeepEqual(moving.entities.summary.worldPose,end.entities.summary.worldPose);
 assert.equal(end.entities.summary.summary.members[0].sourceRef.expectedText,nodeText(taskNodes[0]));
});

test('both original mechanisms genuinely compose through the same ownership and source timeline',()=>{
 const a=stackExample(),b=checklistExample(),t={...a,entities:[...a.entities,...b.entities],containers:[...a.containers,...b.containers],events:[...a.events,...b.events].sort((x,y)=>x.atMs-y.atMs)};
 assert.deepEqual(persistentEntitiesIssues(t,context),[]);const end=sample(t,7000);
 assert.equal(end.containers.anchor.slots.group.occupant.id,'stack');assert.equal(end.containers.archive.slots['first-phase'].occupant.id,'summary');
 assert.equal(end.entities.summary.summary.memberIds.length,5);assert.equal(Object.values(end.entities).filter(x=>x.kind==='media'&&x.active).length,3);
});

test('absolute source clock, image identity and complete source text are bound, not inferred from dimensions or elapsed',()=>{
 const t=stackExample();assert.equal(persistentEntitiesState(t,context,0).status,'blocked');
 issue(t,'raw-source-binding-mismatch',{...context,scene:{...context.scene,startMs:2000,endMs:62000}});
 issue(t,'current-source-identity-required',{...context,sourceIdentity:{...identity,sha256:'f'.repeat(64)}});
 issue(t,'raw-absolute-source-scene-required',{...context,scene:{...context.scene,phaseStartMs:0}});
 for(const key of ['sha256','width','src']){const c=clone(context);c.assets[0][key]=key==='width'?999:key==='src'?'broll-assets/other.png':'f'.repeat(64);issue(t,'verified-current-source-image',c);}
 const c=clone(context);c.scene.nodes[0].detail='遗漏原条件的改写';issue(t,'verified-current-source-image',c);
 const k=persistentEntitiesKey(t,context);assert.notEqual(k,persistentEntitiesKey(t,{...context,scene:{...context.scene,body:'不同完整原文'}}));
});

test('sampling order is deterministic and never mutates manifest, source, assets or earlier state',()=>{
 const t=checklistExample(),original=JSON.stringify({t,context}),early=sample(t,1750),last=sample(t,6500);
 assert.notEqual(last.entities.summary.active,early.entities.summary.active);assert.deepEqual(sample(t,1750),early);
 for(const time of [5500,10,4500,1000,2500,6500,1750])assert.equal(sample(t,time).status,'valid');
 assert.equal(JSON.stringify({t,context}),original);
 const edited=clone(last);edited.entities['task-1'].text='outside mutation';assert.notEqual(sample(t,6500).entities['task-1'].text,edited.entities['task-1'].text);
});

test('move releases old ownership, cloning preserves source as a new instance, retire never consumes others',()=>{
 const t=stackExample(),p=pose(.05,.75,.2,.2);
 t.events.push({id:'clone-first',type:'clone',atMs:4500,cloneOf:'card-1',instanceId:'card-1-copy',to:null,pose:p},{id:'retire-copy',type:'retire',atMs:5000,subject:{kind:'entity',id:'card-1-copy'},reason:'独立副本已完成作者安排的展示'});
 assert.deepEqual(persistentEntitiesIssues(t,context),[]);const both=sample(t,4700),end=sample(t,5500);
 assert.equal(both.entities['card-1-copy'].cloneOf,'card-1');assert.deepEqual(both.entities['card-1-copy'].sourceRef,both.entities['card-1'].sourceRef);
 assert.equal(end.entities['card-1-copy'].active,false);assert.equal(end.entities['card-1'].active,true);assert.equal(end.entities['card-1-copy'].text,nodeText(imageNodes[0]));
 const consume=stackExample();consume.events.push({id:'implicit-consume',type:'retire',atMs:5000,subject:{kind:'container',id:'stack'},reason:'不能隐式销毁成员'});issue(consume,'cannot-implicitly-consume');
 const duplicate=stackExample();duplicate.events.push({id:'bad-clone',type:'clone',atMs:4500,cloneOf:'card-1',instanceId:'card-2',to:null,pose:p});issue(duplicate,'clone-needs-new-id');
});

test('occupied slots, wrong motion origins, duplicate IDs, cycles and ancestor motion overlap reject the whole plan',()=>{
 const t=stackExample();
 const conflict=clone(t);conflict.events[2].to=owner('stack','first');conflict.events[2].toPose=compose(conflict.containers[0].pose,conflict.containers[0].slots[0].pose);issue(conflict,'already-owned');
 const origin=clone(t);origin.events[2].fromPose={...origin.events[2].fromPose,x:origin.events[2].fromPose.x+.01};issue(origin,'motion-origin');
 const duplicate=clone(t);duplicate.entities[1].id='card-1';issue(duplicate,'unique-instance');
 const cycle=clone(t);cycle.events.push({id:'cycle',type:'attach',atMs:5000,endMs:5500,subject:{kind:'container',id:'anchor'},from:null,to:owner('stack','first'),fromPose:cycle.containers[1].pose,toPose:pose(.1,.1,.1,.1)});issue(cycle,'already-owned');
 const actualCycle=clone(t);actualCycle.containers[0].slots.push({id:'empty',pose:pose(.1,.1,.1,.1)});actualCycle.events[3].slots.push({id:'empty',fromPose:pose(.1,.1,.1,.1),toPose:pose(.1,.1,.1,.1)});actualCycle.events[6].slots.push({id:'empty',fromPose:pose(.1,.1,.1,.1),toPose:pose(.1,.1,.1,.1)});actualCycle.events.push({id:'cycle',type:'attach',atMs:5000,endMs:5500,subject:{kind:'container',id:'anchor'},from:null,to:owner('stack','empty'),fromPose:actualCycle.containers[1].pose,toPose:pose(.1,.1,.1,.1)});issue(actualCycle,'cycle-rejected');
 const overlap=clone(t);overlap.events[7].atMs=2200;issue(overlap,'overlapping-container-layout');
});

test('pending/negative conditions cannot vanish from a summary or be marked complete by time alone',()=>{
 const t=checklistExample(),wrongText=clone(t);wrongText.events.at(-2).expectedMembers[0].text='核对来源';issue(wrongText,'cannot-drop-fulltext');
 const omitted=clone(t);omitted.events.at(-2).memberIds.pop();issue(omitted,'reference-all-active-member');
 const noDone=clone(t);noDone.events=noDone.events.filter(e=>e.id!=='done-5');issue(noDone,'cannot-drop-fulltext');
 const mixed=clone(noDone),event=mixed.events.at(-2);event.expectedMembers[4].status='pending';event.completion='mixed';assert.deepEqual(persistentEntitiesIssues(mixed,context),[]);
 const state=sample(mixed,6500);assert.equal(state.entities['task-5'].status,'pending');assert.deepEqual(state.entities.summary.summary.unresolvedMemberIds,['task-5']);
 const hidden=clone(noDone);hidden.events.splice(hidden.events.length-2,0,{id:'hide-pending',type:'retire',atMs:3500,subject:{kind:'entity',id:'task-5'},reason:'不能以隐藏逃过摘要'});issue(hidden,'cannot-hide-retired');
 const neverShown=clone(noDone);neverShown.events=neverShown.events.filter(e=>e.id!=='show-task-5');issue(neverShown,'cannot-hide-retired');
 const implied=clone(t);delete implied.events[5].provenance;issue(implied,'explicit-current-state-and-illustration');
});

test('additive document revisions retain full before/after history and cumulative changed line IDs',()=>{
 const t=base(),first=nodeText(taskNodes[0]),second=nodeText(taskNodes[1]);
 t.entities=[{id:'document',kind:'document',revisionId:'v1',lines:[{id:'source-line',sourceRef:{nodeId:taskNodes[0].id,expectedText:first}},{id:'boundary-line',sourceRef:{nodeId:taskNodes[1].id,expectedText:second}}]}];
 t.events=[{id:'show-doc',type:'spawn',atMs:0,instanceId:'document',to:null,pose:pose(.05,.1,.6,.6)},
 {id:'add-source-note',type:'revise',atMs:1000,instanceId:'document',fromRevisionId:'v1',toRevisionId:'v2',changedLineIds:['source-line'],changes:[{lineId:'source-line',beforeText:first,afterText:first+'\n新增：附上作者提供的核对说明。'}],provenance:illustration},
 {id:'add-boundary-note',type:'revise',atMs:2000,instanceId:'document',fromRevisionId:'v2',toRevisionId:'v3',changedLineIds:['boundary-line'],changes:[{lineId:'boundary-line',beforeText:second,afterText:second+'\n新增：继续保留待审状态。'}],provenance:illustration}];
 assert.deepEqual(persistentEntitiesIssues(t,context),[]);const doc=sample(t,3000).entities.document.document;
 assert.equal(doc.revisionId,'v3');assert.deepEqual(doc.changedLineIds,['source-line','boundary-line']);assert.equal(doc.revisions.length,3);
 assert.equal(doc.lines[0].sourceText,first);assert.ok(doc.lines[0].text.includes(first));assert.equal(doc.revisions[1].changes[0].beforeText,first);
 assert.equal(sample(t,1500).entities.document.document.revisionId,'v2');assert.deepEqual(sample(t,1500).entities.document.document.changedLineIds,['source-line']);
 const drop=clone(t);drop.events[1].changes[0].afterText='核对来源，说明已经真实执行成功。';issue(drop,'cannot-delete-or-rewrite-existing-conditions');
 const stale=clone(t);stale.events[2].fromRevisionId='v1';issue(stale,'current-version-new-id');
 const changed=clone(t);changed.events[2].changedLineIds=[];issue(changed,'changed-line-ids');
});

test('full original copy, emoji and all member conditions survive summary and archive preparation',()=>{
 const state=sample(checklistExample(),6500),copy=persistentEntitiesSourceCopy(context);
 for(const s of [context.scene.title,context.scene.body,...context.scene.nodes.map(nodeText)])assert.ok(copy.includes(s));
 assert.equal(state.sourceCopy,copy);assert.ok(state.entities.summary.summary.members[3].text.includes('English spaces and emoji 👨‍👩‍👧‍👦'));
 assert.ok(state.entities.summary.summary.members[0].text.includes('不能把示意当作真实执行'));
 assert.equal(state.status,'valid');assert.equal(state.uiAccepted,false);assert.equal(state.canApply,false);assert.equal(state.nativeReadiness,'unverified','semantic validation must not masquerade as actual retained-page/font/UI proof');
});

test('malformed or unsorted events, non-finite times and source snapshots fail closed without a partial state',()=>{
 const invalids=[null,{...stackExample(),clock:'output-ms'},{...stackExample(),provenance:{kind:'real-execution',note:'假的成功'}}, {...stackExample(),events:[{id:'bad',type:'unknown',atMs:0}]}, {...stackExample(),events:[{id:'nan',type:'spawn',atMs:NaN}]}];
 const unordered=stackExample();[unordered.events[1],unordered.events[2]]=[unordered.events[2],unordered.events[1]];invalids.push(unordered);
 for(const t of invalids){const state=persistentEntitiesState(t,context,2000);assert.equal(state.status,'blocked');assert.deepEqual(state.entities,{});assert.deepEqual(state.containers,{});assert.ok(state.issues.length);}
 for(const sourceMs of [NaN,Infinity,999,61001])assert.equal(persistentEntitiesState(stackExample(),context,sourceMs).status,'blocked');
 const duplicateContext={...context,scene:{...context.scene,nodes:[taskNodes[0],taskNodes[0]]}};issue(checklistExample(),'unique-source-nodes',duplicateContext);
});
