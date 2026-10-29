import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {applyRetakePlan,retakeClipSnapshot,retakeSourceFrame} from '../src/retake-plan.mjs';
import {projectStoryboard} from '../src/storyboard.mjs';
import {projectChapters} from '../src/presentation.mjs';
import {applyRetakePlanToStore} from '../editor/apply-retake-plan.mjs';
import {retakeRequest} from '../editor/retake-request.mjs';

const clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:'a'.repeat(64),wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
const clip=(id='voice',extra={})=>({id,src:'clips/synthetic.mp4',inSec:0,outSec:12,sourceDurationSec:12,speed:1,...extra});
const word=(text,startMs,endMs)=>({text,startMs,endMs,accent:true});
const cue=(id,words,extra={})=>({id,clipId:'voice',startMs:0,endMs:12000,topPct:90,scale:.7,words,audioClock:clock,...extra});
const project=extra=>({clips:[clip()],captions:[],brolls:[],presentation:{theme:'knowledge',format:'landscape',chapters:[]},music:null,accentColor:'#321cbb',...extra});
const candidate=(id='take1',extra={})=>({id,src:'clips/synthetic.mp4',clipId:'voice',remove:{startSec:2,endSec:4,text:'先检查一个'},retain:{startSec:4,endSec:6,text:'先检查一个具体问题。'},status:'approved',confidence:'high',score:.96,method:'local-sequence-alignment',reason:'独立识别与声学边界确认',evidence:[{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true}],...extra});
const analysis=(p,candidates=[candidate()],extra={})=>({id:'synthetic-job',status:'done',snapshot:{clips:retakeClipSnapshot(p.clips)},sources:[{src:'clips/synthetic.mp4',sourceSha256:clock.sourceSha256,audioClock:clock}],candidates,warnings:[],...extra});

test('local is the request default and cloud text requires an explicit choice',()=>{
 const clips=[clip('voice',{transform:[{t:0,scale:1,x:0,y:0}],label:'private label'})];
 assert.deepEqual(retakeRequest(clips),{clips:retakeClipSnapshot(clips),mode:'local',policy:'conservative'});
 assert.deepEqual(retakeRequest(clips,{mode:'local',allowCloudText:true}),retakeRequest(clips));
 assert.throws(()=>retakeRequest(clips,{mode:'gemini'}),/明确同意/);
 assert.equal(retakeRequest(clips,{mode:'gemini',allowCloudText:true}).allowCloudText,true);
 assert.throws(()=>retakeRequest(clips,{mode:'fallback'}),/请选择/);
});

test('a deletion splits source-bound captions and B-roll without moving surviving words',()=>{
 const words=[word('切点前',500,1500),word('重录',2200,3500),word('后段正确',4500,6000)];
 const p=project({clips:[clip('voice',{speed:1.25})],captions:[cue('cue',words,{reviewOriginalWords:words,reviewOriginalTiming:{startMs:0,endMs:12000,text:'合成示例'}})],brolls:[{id:'asset',clipId:'voice',startMs:1000,endMs:7000,kind:'image',mode:'inset',src:'broll/synthetic.png'}]});
 const before=structuredClone(p),out=applyRetakePlan(p,analysis(p));
 assert.equal(out.ok,true);assert.equal(out.changed,true);
 assert.deepEqual(out.project.clips.map(c=>[c.id,c.inSec,c.outSec,c.speed]),[['voice',0,2,1.25],['voice-retake1',4,12,1.25]]);
 assert.deepEqual(out.project.captions.map(c=>[c.clipId,c.startMs,c.endMs,c.words.map(w=>w.text)]),[['voice',0,2000,['切点前']],['voice-retake1',4000,12000,['后段正确']]]);
 assert.deepEqual(out.project.brolls.map(b=>[b.clipId,b.startMs,b.endMs]),[['voice',1000,2000],['voice-retake1',4000,7000]]);
 assert.deepEqual(out.project.captions[1].words,[words[2]]);assert.equal(out.project.captions[1].scale,.7);assert.deepEqual(out.project.captions[1].audioClock,clock);
 assert.equal(out.project.captions[1].reviewOriginalTiming,undefined);assert.deepEqual(out.project.captions[1].reviewOriginalWords,[words[2]]);
 assert.deepEqual(p,before);
});

test('the same source in another clip instance is not edited and new IDs avoid collisions',()=>{
 const p=project({clips:[clip(),clip('voice-retake1'),clip('other')],captions:[cue('other-cue',[word('另一实例',2500,3500)],{clipId:'other'})]});
 const out=applyRetakePlan(p,analysis(p));assert.equal(out.ok,true);
 assert.deepEqual(out.project.clips.map(c=>c.id),['voice','voice-retake2','voice-retake1','other']);
 assert.deepEqual(out.project.clips.slice(2),p.clips.slice(1));assert.deepEqual(out.project.captions,p.captions);
});

test('legacy scenes keep their exact clip instance and animation phase across retained descendants',()=>{
 const scene={id:'legacy',clipId:'voice',startMs:1000,endMs:9000,layout:'headline',title:'合成重点',tags:[{id:'keyword',text:'合成重点',atMs:4000,endMs:7000,x:.1,y:.2}]};
 const p=project({clips:[clip(),clip('other')],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene]}}),before=structuredClone(p);
 const out=applyRetakePlan(p,analysis(p));assert.equal(out.ok,true);
 const projected=projectStoryboard(out.project.presentation.scenes,out.project.clips,30);
 assert.equal(projected.length,2);assert.deepEqual(projected.map(s=>s.clipId),['voice','voice-retake1']);
 const tail=projected[1];assert.equal(tail.startMs,2000);assert.equal(tail.phaseStartMs,-1000);assert.equal(tail.sourceOffsetMs,3000);assert.equal(tail.tags[0].atMs,4000);
 assert.equal(out.project.presentation.scenes.some(s=>s.src),false);assert.deepEqual(p,before);
 const onlyTail=project({presentation:{...p.presentation,scenes:[{...scene,startMs:5000}]}}),tailOut=applyRetakePlan(onlyTail,analysis(onlyTail));
 assert.equal(tailOut.ok,true);assert.equal(projectStoryboard(tailOut.project.presentation.scenes,tailOut.project.clips).length,1);
});

test('source seeking uses exact retained IDs, source speed and nearest surviving cut boundary',()=>{
 const p=project({clips:[clip(),clip('other')]}),out=applyRetakePlan(p,analysis(p));assert.equal(out.ok,true);
 assert.deepEqual(out.session.retainedClipIds.voice,['voice','voice-retake1']);
 assert.deepEqual(retakeSourceFrame(out.project.clips,out.session.retainedClipIds.voice,5,30),{frame:90,exact:true});
 assert.deepEqual(retakeSourceFrame(out.project.clips,out.session.retainedClipIds.voice,3.9,30),{frame:60,exact:false});
 assert.deepEqual(retakeSourceFrame(out.project.clips,['other'],5,30),{frame:450,exact:true});
 assert.equal(retakeSourceFrame(out.project.clips,['missing'],5,30),null);
});

test('legacy chapter anchors follow only their analyzed clip instance',()=>{
 const p=project({clips:[clip(),clip('other')],presentation:{theme:'knowledge',format:'landscape',chapters:[{id:'chapter',clipId:'voice',startMs:5000,title:'合成章节'}]}});
 const out=applyRetakePlan(p,analysis(p));assert.equal(out.ok,true);
 assert.equal(out.project.presentation.chapters[0].clipId,'voice-retake1');assert.equal(out.project.presentation.chapters[0].src,undefined);
 assert.deepEqual(projectChapters(out.project.presentation.chapters,out.project.clips).map(c=>c.at),[3000]);
});

test('snapshot ranges, source, order and speed are checked before any mutation',()=>{
 const p=project({clips:[clip(),clip('second')]});const job=analysis(p);
 for(const changed of [project({...p,clips:[...p.clips].reverse()}),project({...p,clips:[clip('voice',{inSec:.1}),p.clips[1]]}),project({...p,clips:[clip('voice',{speed:1.1}),p.clips[1]]}),project({...p,clips:[clip('voice',{src:'clips/other.mp4'}),p.clips[1]]})]){
  const before=structuredClone(changed),out=applyRetakePlan(changed,job);assert.equal(out.ok,false);assert.match(out.error,/改变/);assert.deepEqual(changed,before);
 }
});

test('incomplete clocks, ASR proof or acoustic proof cannot trigger automatic cuts',()=>{
 const p=project(),job=analysis(p);
 for(const bad of [
  {...job,sources:[{...job.sources[0],audioClock:{sourceSha256:clock.sourceSha256}}]},
  {...job,sources:[{...job.sources[0],sourceSha256:'c'.repeat(64)}]},
  analysis(p,[candidate('no-proof',{evidence:[]})]),
  analysis(p,[candidate('unconfirmed',{evidence:[{kind:'independent-local-asr',confirmed:false},{kind:'acoustic-boundaries',safe:true}]})]),
  analysis(p,[candidate('no-seam',{evidence:[{kind:'independent-local-asr',confirmed:true}]})]),
 ])assert.equal(applyRetakePlan(p,bad).ok,false);
});

test('review candidates remain untouched until explicitly selected and can then be applied',()=>{
 const p=project(),job=analysis(p,[candidate('review',{status:'review',confidence:'review',score:.6,evidence:[]})]);
 const skipped=applyRetakePlan(p,job);assert.equal(skipped.ok,true);assert.equal(skipped.changed,false);assert.deepEqual(skipped.project,p);
 assert.equal(applyRetakePlan(p,job,{candidateIds:['review']}).ok,false);
 const accepted=applyRetakePlan(p,job,{candidateIds:['review'],allowReview:true});assert.equal(accepted.ok,true);assert.equal(accepted.changed,true);
});

test('retain overlap and malformed ranges reject the complete batch',()=>{
 const p=project();
 const second=candidate('second',{remove:{startSec:5,endSec:7,text:'重复'},retain:{startSec:8,endSec:10,text:'保留'}});
 const cases=[analysis(p,[candidate(),second]),analysis(p,[candidate('outside',{remove:{startSec:-1,endSec:2,text:'越界'}})]),analysis(p,[candidate('cross',{remove:{startSec:2,endSec:4.1,text:'跨保留版'}})]),analysis(p,[candidate(),candidate()])];
 for(const job of cases){const before=structuredClone(p);assert.equal(applyRetakePlan(p,job).ok,false);assert.deepEqual(p,before);}
});

test('a session applies later reviews cumulatively from the captured source snapshot',()=>{
 const p=project(),review=candidate('review',{remove:{startSec:7,endSec:8,text:'另一遍'},retain:{startSec:8,endSec:10,text:'正确版本'},status:'review',confidence:'review',score:.7});
 const job=analysis(p,[candidate(),review]),first=applyRetakePlan(p,job);assert.equal(first.ok,true);
 const second=applyRetakePlan(first.project,job,{candidateIds:['review'],allowReview:true,session:first.session});assert.equal(second.ok,true);
 assert.deepEqual(second.project.clips.map(c=>[c.inSec,c.outSec]),[[0,2],[4,7],[8,12]]);
 assert.deepEqual(second.appliedIds,['take1','review']);
 const repeat=applyRetakePlan(second.project,job,{candidateIds:['review'],allowReview:true,session:second.session});assert.equal(repeat.ok,true);assert.equal(repeat.changed,false);
 const edited={...second.project,accentColor:'#000'};
 const stale=applyRetakePlan(edited,job,{candidateIds:[],session:second.session});assert.equal(stale.ok,false);assert.match(stale.error,/工程已改变/);
});

test('a subframe remainder and legacy absolute overlays fail safely',()=>{
 const p=project();const tiny=candidate('tiny',{remove:{startSec:.01,endSec:4,text:'仅余小段'}});
 assert.equal(applyRetakePlan(p,analysis(p,[tiny])).ok,false);
 const legacy=project({captions:[cue('legacy',[word('合成字幕',500,1500)],{clipId:undefined})]});
 assert.match(applyRetakePlan(legacy,analysis(legacy)).error,/没有绑定原片/);
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const timelineUrl=moduleUrl(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
const compiledModule=async file=>{
 const url=new URL(file,import.meta.url),source=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s.endsWith('/timeline')?timelineUrl:s.startsWith('.')?new URL(s,url).href:import.meta.resolve(s))}`);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
};
const {useEditor}=await compiledModule('../editor/store.ts');
test('the actual store applies a multi-cut batch atomically, supports undo and ignores repeated application',()=>{
 const p=project({captions:[cue('cue',[word('前',500,1000),word('保留',4500,5500),word('后',8500,10000)])],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[{id:'legacy',clipId:'voice',startMs:5000,endMs:9000,layout:'headline',title:'合成场景'}]}});
 const second=candidate('second',{remove:{startSec:7,endSec:8,text:'后一个重录'},retain:{startSec:8,endSec:10,text:'后一个正确版本'}}),job=analysis(p,[candidate(),second]);
 useEditor.getState().init({fps:30,width:1920,height:1080,durationInFrames:360},p.captions,p.accentColor,p.clips,p.music,p.brolls,[],p.presentation);
 useEditor.getState().setCurrentFrame(359);
 const result=applyRetakePlanToStore(useEditor,job);assert.equal(result.ok,true);assert.equal(useEditor.getState().past.length,1);
 assert.equal(useEditor.getState().meta.durationInFrames,270);assert.equal(useEditor.getState().currentFrame,269);
 const repeat=applyRetakePlanToStore(useEditor,job,{session:result.session});assert.equal(repeat.ok,true);assert.equal(repeat.changed,false);assert.equal(useEditor.getState().past.length,1);
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().clips,p.clips);assert.deepEqual(useEditor.getState().captions,p.captions);assert.deepEqual(useEditor.getState().presentation,p.presentation);assert.equal(useEditor.getState().meta.durationInFrames,360);
 useEditor.getState().redo();assert.deepEqual(useEditor.getState().clips,result.project.clips);
 const before=useEditor.getState(),bad=applyRetakePlanToStore(useEditor,job);assert.equal(bad.ok,false);assert.equal(useEditor.getState(),before);
});
