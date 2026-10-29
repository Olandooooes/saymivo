import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRetakePlan,retakeClipSnapshot} from '../src/retake-plan.mjs';
const sha='a'.repeat(64),clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:sha,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
const clip=(id,inSec,outSec)=>({id,src:'clips/synthetic.mp4',inSec,outSec,sourceDurationSec:12,speed:1});
const project=()=>({clips:[clip('earlier',0,4),clip('later',6,12)],captions:[],brolls:[],presentation:{theme:'knowledge',format:'landscape',chapters:[]},music:null,accentColor:'#abc'});
const candidate=(extra={})=>({id:'semantic',src:'clips/synthetic.mp4',clipId:'earlier',remove:{startSec:1,endSec:3,text:'废弃起句'},retain:{clipId:'later',src:'clips/synthetic.mp4',startSec:7,endSec:9,text:'完整表达'},status:'approved',confidence:'high',score:1,method:'codex-word-decisions',reason:'合成语义取舍',evidence:[{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true},{kind:'source-boundary-v2',safe:true,sourceSha256:sha}],...extra});
const analysis=(p,candidates)=>({id:'synthetic',status:'done',snapshot:{clips:retakeClipSnapshot(p.clips)},sources:[{src:'clips/synthetic.mp4',sourceSha256:sha,audioClock:clock}],candidates});
test('cross-clip retake edits only removal instance and retains later instance exactly',()=>{
 const p=project(),before=structuredClone(p),result=applyRetakePlan(p,analysis(p,[candidate()]));assert.equal(result.ok,true);
 assert.deepEqual(result.project.clips.map(c=>[c.id,c.inSec,c.outSec]),[['earlier',0,1],['earlier-retake1',3,4],['later',6,12]]);assert.deepEqual(result.project.clips.at(-1),p.clips.at(-1));assert.deepEqual(p,before);
});
test('earlier complete version can remain while a later failed take is deleted',()=>{
 const p=project(),c=candidate({clipId:'later',remove:{startSec:7,endSec:9,text:'后面失败起句'},retain:{clipId:'earlier',src:'clips/synthetic.mp4',startSec:1,endSec:3,text:'前面完整表达'}});
 const result=applyRetakePlan(p,analysis(p,[c]));assert.equal(result.ok,true);assert.deepEqual(result.project.clips[0],p.clips[0]);
});
test('cross-clip replacement deletion, unknown instance and forged/missing new boundary proof are rejected',()=>{
 const p=project(),c=candidate();
 assert.equal(applyRetakePlan(p,analysis(p,[candidate({retain:{...c.retain,clipId:'missing'}})])).ok,false);
 assert.equal(applyRetakePlan(p,analysis(p,[candidate({evidence:c.evidence.slice(0,2)})])).ok,false);
 const second=candidate({id:'second',clipId:'later',remove:{startSec:7,endSec:9,text:'不能删掉保留版本'},retain:{clipId:'earlier',startSec:0,endSec:.5,text:'合成保留'}});
 assert.equal(applyRetakePlan(p,analysis(p,[c,second])).ok,false);
});
test('one take split by prior pause trimming is applied as one candidate across exact source instances',()=>{
 const p=project();p.clips=[clip('first-a',0,2),clip('first-b',2.5,4.5),clip('complete-a',6,8),clip('complete-b',8.5,12)];
 const part=(clipId,startSec,endSec)=>({clipId,src:'clips/synthetic.mp4',startSec,endSec,text:'合成分段'});
 const c=candidate({clipId:'first-a',remove:{startSec:1,endSec:3.5,text:'失败重录'},retain:{clipId:'complete-a',src:'clips/synthetic.mp4',startSec:7,endSec:10,text:'完整重录'},
  removeParts:[part('first-a',1,2),part('first-b',2.5,3.5)],retainParts:[part('complete-a',7,8),part('complete-b',8.5,10)]});
 const before=structuredClone(p),result=applyRetakePlan(p,analysis(p,[c]));assert.equal(result.ok,true);
 assert.deepEqual(result.project.clips.map(c=>[c.id,c.inSec,c.outSec]),[['first-a',0,1],['first-b',3.5,4.5],['complete-a',6,8],['complete-b',8.5,12]]);
 assert.deepEqual(result.appliedIds,['semantic']);assert.deepEqual(p,before);
});
test('malformed partitions and deletion of any retained partition reject the entire transaction',()=>{
 const p=project();p.clips=[clip('first',0,4),clip('complete-a',6,8),clip('complete-b',8.5,12)];
 const part=(clipId,startSec,endSec)=>({clipId,src:'clips/synthetic.mp4',startSec,endSec,text:'合成分段'});
 const c=candidate({clipId:'first',removeParts:[part('first',1,3)],retain:{clipId:'complete-a',startSec:7,endSec:10,text:'保留完整录制'},retainParts:[part('complete-a',7,8),part('complete-b',8.5,10)]});
 assert.equal(applyRetakePlan(p,analysis(p,[{...c,removeParts:[part('missing',1,3)]}])).ok,false);
 assert.equal(applyRetakePlan(p,analysis(p,[{...c,removeParts:[part('first',1,2)]}])).ok,false);
 assert.equal(applyRetakePlan(p,analysis(p,[{...c,retainParts:[...c.retainParts].reverse()}])).ok,false);
 const second=candidate({id:'second',clipId:'complete-b',remove:{startSec:9,endSec:10,text:'不应删除'},retain:{clipId:'first',startSec:0,endSec:.5,text:'别的表达'}});
 assert.equal(applyRetakePlan(p,analysis(p,[c,second])).ok,false);
});

const filler=(extra={})=>candidate({id:'filler',kind:'filler',remove:{startSec:1,endSec:1.6,text:'呃'},
 removeParts:[{clipId:'earlier',src:'clips/synthetic.mp4',startSec:1,endSec:1.6,text:'呃'}],
 retain:null,retainParts:[],first:1,last:1,replacementFirst:-1,replacementLast:-1,
 evidence:[...candidate().evidence,{kind:'filler-semantic',eligible:true}],...extra});

test('an independently verified filler removes only its exact instance without inventing a replacement take',()=>{
 const p=project();p.captions=[{id:'spoken',clipId:'earlier',startMs:500,endMs:2000,words:[
  {text:'前',startMs:500,endMs:900},{text:'呃',startMs:1200,endMs:1500},{text:'后',startMs:1700,endMs:2000}]}];
 const before=structuredClone(p),c=filler(),result=applyRetakePlan(p,analysis(p,[c]));assert.equal(result.ok,true);
 assert.deepEqual(result.project.clips.map(value=>[value.id,value.inSec,value.outSec]),[['earlier',0,1],['earlier-retake1',1.6,4],['later',6,12]]);
 assert.deepEqual(result.project.clips.at(-1),before.clips.at(-1));assert.deepEqual(result.appliedIds,['filler']);
 const words=result.project.captions.flatMap(cap=>cap.words);assert.deepEqual(words,[{text:'前',startMs:500,endMs:900},{text:'后',startMs:1700,endMs:2000}]);
 assert.deepEqual(result.session.base.clips,before.clips);assert.deepEqual(p,before);assert.equal(c.retain,null);assert.deepEqual(c.retainParts,[]);
});

test('automatic filler application requires literal eligible semantic proof and every independent boundary receipt',()=>{
 const p=project(),base=filler(),invalidEvidence=[
  base.evidence.filter(e=>e.kind!=='filler-semantic'),
  base.evidence.map(e=>e.kind==='filler-semantic'?{...e,eligible:false}:e),
  base.evidence.map(e=>e.kind==='filler-semantic'?{...e,eligible:'true'}:e),
  base.evidence.filter(e=>e.kind!=='independent-local-asr'),
  base.evidence.map(e=>e.kind==='independent-local-asr'?{...e,confirmed:'true'}:e),
  base.evidence.map(e=>e.kind==='acoustic-boundaries'?{...e,safe:false}:e),
  base.evidence.filter(e=>e.kind!=='source-boundary-v2'),
  base.evidence.map(e=>e.kind==='source-boundary-v2'?{...e,safe:false}:e),
  base.evidence.map(e=>e.kind==='source-boundary-v2'?{...e,sourceSha256:'c'.repeat(64)}:e)
 ];
 for(const evidence of invalidEvidence){const before=structuredClone(p),result=applyRetakePlan(p,analysis(p,[filler({evidence})]));assert.equal(result.ok,false);assert.equal(result.changed,false);assert.deepEqual(p,before);}
});

test('filler cannot claim a replacement, omit explicit empty retained parts or escape its verified exact clip',()=>{
 const p=project(),keep={clipId:'later',src:'clips/synthetic.mp4',startSec:7,endSec:9,text:'不应虚构替代'},invalid=[
  filler({retain:keep}),filler({retain:undefined}),filler({retainParts:[keep]}),filler({retainParts:undefined}),
  filler({method:'local-sequence-alignment'}),filler({removeParts:[{clipId:'missing',src:'clips/synthetic.mp4',startSec:1,endSec:1.6,text:'呃'}]}),
  filler({removeParts:[{clipId:'earlier',src:'clips/other.mp4',startSec:1,endSec:1.6,text:'呃'}]}),
  filler({removeParts:[{clipId:'earlier',src:'clips/synthetic.mp4',startSec:1,endSec:1.5,text:'呃'}]})
 ];
 for(const c of invalid){const result=applyRetakePlan(p,analysis(p,[c]));assert.equal(result.ok,false);assert.equal(result.changed,false);}
});
