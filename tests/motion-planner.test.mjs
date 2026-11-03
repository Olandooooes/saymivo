import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {generateMotionPlan,sceneSpeechContext,motionPlanSignature,updateMotionPlanSelection,applyMotionPlanToStore} from '../src/motion-planner.mjs';

const measure=(text,size)=>({width:Array.from(text).length*size*.55,ascent:size*.8,descent:size*.2});
const options={preserveExisting:false,measure};
const clip=(id='a',src='clips/synthetic.mp4',inSec=0,outSec=10,speed=1)=>({id,src,inSec,outSec,speed,sourceDurationSec:30});
const scene=(overrides={})=>({id:'s',clipId:'a',src:'clips/synthetic.mp4',startMs:0,endMs:10000,layout:'speaker',title:'说明',nodes:[{id:'n1',text:'完整对象甲',atMs:0},{id:'n2',text:'完整对象乙',atMs:5000}],...overrides});
const caption=(text,clipId='a',startMs=100,endMs=9900)=>({id:'c-'+clipId,clipId,startMs,endMs,topPct:91,words:[{text,startMs,endMs,accent:false}]});
const state=(text,overrides={})=>({clips:[clip()],captions:[caption(text)],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene()]},meta:{fps:30,width:1920,height:1080,durationInFrames:300},brolls:[],accentColor:'#3156b9',...overrides});
const media={src:'broll-assets/synthetic.svg',kind:'image',width:1600,height:1000};
const row=(project)=>generateMotionPlan(project,options).rows[0];

test('current spoken semantics choose distinct feasible effects, rather than layout or media alone',()=>{
 const cases=[
  ['这里有GitHub案例和测试结果，请看证据。','floating-evidence'],
  ['首先检查程序，然后收集线索，最后一步测试。','fine-process'],
  ['搜索涉及复杂范围和覆盖边界。','orbit-evidence'],
  ['一组工具通过接口连接外部账号。','grouped-evidence'],
  ['过去手动记录，现在协作完成，比较区别。','type-relay'],
  ['最后提醒，记住三个问题。','type-relay'],
 ];
 for(const [text,id] of cases){const project=state(text,{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({media})]}});const planned=row(project);assert.equal(planned.selected,id,text);assert.ok(planned.signals.some(signal=>signal.sources.includes('当前保留字幕')));}
 const plain=row(state('这是一段普通说明。',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({media,nodes:[]})]}}));
 assert.equal(plain.selected,'keep');assert.equal(plain.candidates.find(c=>c.id==='floating-evidence').score,0);
});

test('caption matching uses exact source instances and retained source windows',()=>{
 const project=state('',{clips:[clip('a','clips/synthetic.mp4',0,4),clip('b','clips/synthetic.mp4',10,14),clip('foreign','clips/other.mp4',10,14)],captions:[caption('所有软件都可以复制','a',100,3900),caption('不能随意复制','b',10100,13900),caption('范围集合覆盖','foreign',10100,13900)],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({clipId:'b',startMs:10000,endMs:14000,title:'不能随意复制',media})]}});
 const planned=row(project);assert.equal(planned.spokenText,'不能随意复制');assert.ok(planned.signals.some(s=>s.kind==='negation'));assert.ok(!planned.signals.some(s=>s.kind==='scope'));assert.notEqual(planned.selected,'orbit-evidence');
});

test('owned and unowned overlapping replays cannot mix conflicting edits or extend reading time',()=>{
 for(const clipId of ['a','removed-parent']){
  const target=scene({clipId,startMs:0,endMs:3000,title:'所有软件可复制',media,nodes:[]});
  const project=state('',{clips:[clip('a','clips/synthetic.mp4',0,3),clip('b','clips/synthetic.mp4',0,3,2)],captions:[caption('所有软件可复制','a',100,2900),caption('不代表所有软件可复制','b',100,2900)],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[target]}});
  const planned=row(project);assert.equal(planned.selected,'keep');assert.equal(planned.retainedMs,1500);assert.ok(planned.warnings.some(w=>w.includes('实例字幕不一致')));if(clipId==='a')assert.equal(planned.spokenText,'所有软件可复制');
 }
});

test('removed words and zero-retained nodes never trigger semantics; speed changes reading budgets',()=>{
 const project=state('',{clips:[clip('a','clips/synthetic.mp4',0,2,2)],captions:[caption('当前调查材料','a',100,1900),caption('复杂范围集合','a',5100,7900)],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({media,nodes:[{id:'now',text:'调查材料',atMs:0},{id:'gone',text:'复杂范围集合',atMs:5000}]})]}});
 const planned=row(project);assert.equal(planned.retainedMs,1000);assert.ok(!planned.signals.some(s=>s.kind==='scope'||s.kind==='group'));assert.equal(planned.readingWindows.find(w=>w.nodeId==='gone').retainedMs,0);
 const target=scene(),context=sceneSpeechContext({...project,clips:[clip('a','clips/synthetic.mp4',0,2,2),clip('b','clips/synthetic.mp4',8,10,.5)]},target);assert.equal(context.retainedMs,5000);
});

test('a cue cut by trim or a split-character negation outside a scene requires context review',()=>{
 const words=[{text:'不',startMs:1000,endMs:1100},{text:'代',startMs:1100,endMs:1200},{text:'表',startMs:1200,endMs:1300},{text:'所有软件可以复制',startMs:3100,endMs:5000}].map(w=>({...w,accent:false}));
 for(const inSec of [0,3]){
  const project=state('',{clips:[clip('a','clips/synthetic.mp4',inSec,6)],captions:[{...caption('', 'a',1000,6000),words}],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({startMs:3000,endMs:6000,title:'所有软件可以复制',media,nodes:[]})]}});
  const planned=row(project);assert.equal(planned.selected,'keep');assert.equal(planned.spokenText,'所有软件可以复制');assert.ok(planned.warnings.some(w=>w.includes('否定')));
 }
});

test('unqualified universal titles cannot override negative speech; incomplete source clocks are not trusted',()=>{
 for(const text of ['我不认为AI能复现任何软件','所有软件都复制不了','未能完成复现','不是说它能复制全部软件']){
  const planned=row(state(text,{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({title:'复现任何软件',media})]}}));assert.equal(planned.selected,'keep',text);assert.ok(planned.signals.some(s=>s.kind==='negation'));
 }
 const project=state('这里有案例');project.captions[0].audioClock={version:'legacy',timestampBasis:'audio-local-ms'};assert.equal(row(project).selected,'keep');assert.ok(row(project).warnings.some(w=>w.includes('时钟')));
 const clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:'a'.repeat(64),wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
 const mixed=state('',{captions:[{...caption('这里是案例','a',100,4000),audioClock:clock},{...caption('这里是范围','a',5000,9900),id:'second',audioClock:{...clock,sourceSha256:'c'.repeat(64)}}]});assert.equal(row(mixed).selected,'keep');assert.ok(row(mixed).warnings.some(w=>w.includes('时钟')));
});

test('media, matte, complete text geometry and moving-person safety remain hard prerequisites',()=>{
 const project=state('这里是复杂范围和案例证据');const planned=row(project);
 for(const id of ['floating-evidence','orbit-evidence','person-backdrop'])assert.ok(planned.candidates.find(c=>c.id===id).issues.length);
 const shortMatte={prefix:'broll-assets/synthetic/frame-',sourceStartMs:0,endMs:2000,fps:30,count:60,src:'clips/synthetic.mp4',sourceSha256:'a'.repeat(64),width:1920,height:1080};
 const partial=row(state('这里是工具',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({personMatte:shortMatte})]}}));assert.ok(partial.candidates.find(c=>c.id==='person-backdrop').issues.some(issue=>issue.includes('完整源时间')));
 const moving=state('首先检查然后验证',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({window:{x:.76,y:.46,size:.205,keyframes:[{atMs:1000,x:.1,y:.46,size:.205}]}})]}});assert.ok(row(moving).candidates.find(c=>c.id==='fine-process').issues.length);
 const impossible=generateMotionPlan(state('过去手工，现在协作'),{...options,measure:(text,size)=>({width:text?1e9:0,ascent:size,descent:size})});assert.equal(impossible.rows[0].selected,'keep');assert.ok(impossible.rows[0].candidates.every(c=>c.issues.length));
});

test('no font metrics means no automatic change; actual measurement receives backdrop weight',()=>{
 const project=state('案例证据',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({media})]}}),unmeasured=generateMotionPlan(project);
 assert.equal(unmeasured.measurement,'unmeasured');assert.equal(unmeasured.rows[0].selected,'keep');assert.ok(unmeasured.rows[0].candidates.every(c=>!c.automaticAllowed));
 const changed=updateMotionPlanSelection(unmeasured,'s','floating-evidence');assert.equal(changed.ok,true);assert.equal(applyMotionPlanToStore({getState:()=>({...project,setPresentation:()=>assert.fail('unmeasured plan must not write')})},changed.plan).ok,false);
 const weights=[],matte={prefix:'broll-assets/synthetic/frame-',sourceStartMs:0,endMs:10000,fps:30,count:300,src:'clips/synthetic.mp4',sourceSha256:'a'.repeat(64),width:1920,height:1080};
 generateMotionPlan(state('这一段讲工具',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({title:'REA',personMatte:matte})]}}),{...options,measure:(text,size,weight)=>{weights.push(weight);return measure(text,size);}});assert.ok(weights.includes(900));
});

test('deduplication stays within semantics and cannot use unconfirmed fullframe face space',()=>{
 const a=scene({id:'a',startMs:0,endMs:5000,title:'最后提醒：核对结果',nodes:[]}),b=scene({id:'b',startMs:5000,endMs:10000,title:'最后提醒：核对结果',nodes:[]});
 const project=state('',{captions:[caption('最后提醒，核对结果','a',100,4900),{...caption('最后提醒，核对结果','a',5100,9900),id:'second'}],presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[a,b]}});
 const plan=generateMotionPlan(project,options);assert.deepEqual(plan.rows.map(row=>row.selected),['type-relay','type-relay']);assert.ok(!plan.rows[1].reasons.some(r=>r.includes('相邻重复')));assert.equal(plan.rows[1].candidates.find(c=>c.id==='clear-type').automaticAllowed,false);
});

test('manual choices keep warnings current and preserve explicit group membership',()=>{
 const project=state('一组工具通过接口连接外部账号',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene({visualPreset:{id:'grouped-evidence',version:1,primaryNodeIds:['n2']}})]}});
 const plan=generateMotionPlan(project,options);assert.deepEqual(plan.rows[0].candidates.find(c=>c.id==='grouped-evidence').options.primaryNodeIds,['n2']);
 const selected=updateMotionPlanSelection(plan,'s','clear-type');assert.equal(selected.ok,true);assert.ok(selected.plan.rows[0].warnings.some(w=>w.includes('真人避让')));
 const keep=updateMotionPlanSelection(selected.plan,'s','keep');assert.deepEqual(keep.plan.rows[0].warnings,keep.plan.rows[0].baseWarnings);
 const preserved=generateMotionPlan(project,{measure});assert.equal(preserved.rows[0].selected,'keep');
});

test('every visible preview input invalidates a plan, while playhead changes do not',()=>{
 const original=state('案例证据'),signature=motionPlanSignature(original);
 for(const mutate of [s=>s.clips[0].inSec=.1,s=>s.clips[0].speed=2,s=>s.clips[0].muted=true,s=>s.captions[0].words[0].text='否定',s=>s.presentation.displayFont='source-han-heavy',s=>s.presentation.format='portrait',s=>s.presentation.scenes[0].media=media,s=>s.brolls.push({id:'new',src:'synthetic.svg'}),s=>s.accentColor='#ffffff',s=>s.meta.fps=60,s=>s.meta.width=1080]){const changed=structuredClone(original);mutate(changed);assert.notEqual(motionPlanSignature(changed),signature);}
 assert.equal(motionPlanSignature({...original,currentFrame:90,selected:'different'}),signature);
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText).toString('base64');
const timelineUrl=moduleUrl(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
const storeUrl=new URL('../editor/store.ts',import.meta.url);
const storeSource=ts.transpileModule(fs.readFileSync(storeUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s.endsWith('/timeline')?timelineUrl:s.startsWith('.')?new URL(s,storeUrl).href:import.meta.resolve(s))}`);
const {useEditor}=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64'));
test('a full plan changes only visualPreset in one real-store undo, rejects stale plans atomically',()=>{
 const project=state('首先检查，然后验证',{presentation:{theme:'knowledge',format:'landscape',chapters:[],scenes:[scene(),scene({id:'second',title:'对比过去和现在'})]}});
 useEditor.getState().init(project.meta,project.captions,project.accentColor,project.clips,null,[],[],project.presentation);
 const before=useEditor.getState(),plan=generateMotionPlan(before,options),result=applyMotionPlanToStore(useEditor,plan);assert.equal(result.ok,true);assert.equal(result.changed,true);
 const after=useEditor.getState();assert.equal(after.past.length,1);assert.equal(after.clips,before.clips);assert.equal(after.captions,before.captions);assert.equal(after.brolls,before.brolls);
 for(let i=0;i<after.presentation.scenes.length;i++){const {visualPreset,...actual}=after.presentation.scenes[i];assert.deepEqual(actual,before.presentation.scenes[i]);assert.ok(visualPreset);}
 useEditor.getState().undo();assert.deepEqual(useEditor.getState().presentation,before.presentation);
 const stale=generateMotionPlan(useEditor.getState(),options);useEditor.getState().setAccentColor('#00ff00');const checkpoint=useEditor.getState(),rejected=applyMotionPlanToStore(useEditor,stale);assert.equal(rejected.ok,false);assert.equal(useEditor.getState().presentation,checkpoint.presentation);assert.equal(useEditor.getState().past,checkpoint.past);
});
