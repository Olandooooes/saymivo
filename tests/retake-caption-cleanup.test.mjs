import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {applyRetakePlan,retakeClipSnapshot} from '../src/retake-plan.mjs';
import {applyRetakePlanToStore} from '../editor/apply-retake-plan.mjs';

const sha='a'.repeat(64),clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:sha,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
const clip=(id,inSec=0,outSec=12)=>({id,src:'clips/synthetic.mp4',inSec,outSec,sourceDurationSec:12,speed:1});
const word=(text,startMs,endMs)=>({text,startMs,endMs,accent:true});
const cue=(id,words,clipId='remove',extra={})=>({id,clipId,words,startMs:words[0].startMs,endMs:words.at(-1).endMs,topPct:88,...extra});
const project=captions=>({clips:[clip('remove'),clip('retain',4,12)],captions,brolls:[],presentation:{theme:'knowledge',format:'landscape',chapters:[]},music:null,accentColor:'#123'});
const candidate=(extra={})=>({id:'synthetic-cut',src:'clips/synthetic.mp4',clipId:'remove',remove:{startSec:2,endSec:3,text:'先检查一下'},retain:{clipId:'retain',src:'clips/synthetic.mp4',startSec:5,endSec:7,text:'先检查一下完整功能'},status:'approved',confidence:'high',score:1,method:'codex-word-decisions',reason:'合成废弃起句',evidence:[{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true},{kind:'source-boundary-v2',safe:true,sourceSha256:sha}],...extra});
const analysis=(p,cut=candidate())=>({id:'caption-regression',status:'done',snapshot:{clips:retakeClipSnapshot(p.clips)},sources:[{src:'clips/synthetic.mp4',sourceSha256:sha,audioClock:clock}],candidates:[cut]});
const texts=result=>result.project.captions.flatMap(c=>c.words.map(w=>w.text));

test('complete deletion text removes legacy words extending both sides of the audio cut',()=>{
 const before=word('引入',1000,1400),after=word('接着说明',3400,3800);
 const p=project([cue('mixed',[before,word('先',1820,2050),word('检查',2050,2850),word('一下',2850,3180),after],undefined,{reviewOriginalWords:[word('旧文本',1800,3200)],reviewOriginalTiming:{startMs:1000,endMs:3800,text:'旧校对'}})]);
 const baseline=structuredClone(p),result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
 assert.deepEqual(texts(result),['引入','接着说明']);assert.deepEqual(p,baseline);
 assert.deepEqual(result.project.captions.map(c=>[c.startMs,c.endMs]),[[1000,1400],[3400,3800]]);
 assert.deepEqual(result.project.captions.flatMap(c=>c.words),[before,after]);
 assert.ok(result.project.captions.every(c=>c.reviewOriginalWords===undefined&&c.reviewOriginalTiming===undefined));
 assert.ok(result.warnings.some(w=>/不能据此认定/.test(w)));
});

test('one exact deleted phrase spanning two captions leaves no short ghost cue',()=>{
 const p=project([cue('one',[word('先',1900,2090),word('检查',2090,2600)]),cue('two',[word('一下',2600,3180)]),cue('kept',[word('继续',3300,3700)])]);
 const result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
 assert.deepEqual(texts(result),['继续']);assert.deepEqual(result.project.captions.map(c=>c.id),['kept-retake-remove-retake1']);
 assert.equal(result.project.captions[0].startMs,3300);
});

test('unmodified exact clip preserves an out-of-range legacy first word and every caption field',()=>{
 const unchanged=cue('retained',[word('完整',3820,3980),word('表达',4050,4500)],'retain',{startMs:3820,endMs:4500,holdMs:450,reviewOriginalTiming:{startMs:3820,endMs:4500,text:'完整表达'}});
 const repeated=cue('other-instance',[word('先检查一下',1900,3180)],'retain');
 const p=project([cue('deleted',[word('先检查一下',1900,3180)]),unchanged,repeated]);
 const result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
 assert.deepEqual(result.project.captions,[unchanged,repeated]);assert.deepEqual(result.project.clips.at(-1),p.clips.at(-1));
});

test('nearest unique complete repeated phrase is selected; its neighboring repeat stays intact',()=>{
 const earlier=word('先检查一下',1450,1800),deleted=word('先检查一下',1980,3100);
 const p=project([cue('earlier',[earlier]),cue('deleted',[deleted])]);
 const result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);assert.deepEqual(texts(result),['先检查一下']);
 assert.deepEqual(result.project.captions[0].words,[earlier]);
});

test('a later cut in the same clip preserves the complete earlier cue including its zero-duration first token',()=>{
 const words=[word('完',4000,4000),word('整表达',4000,4500)];
 const preserved=cue('earlier-complete',words,'remove');
 const p=project([preserved, cue('later-deleted',[word('另一个起句',6900,8100)])]);
 const cut=candidate({remove:{startSec:7,endSec:8,text:'另一个起句'},retain:{clipId:'retain',src:'clips/synthetic.mp4',startSec:9,endSec:10,text:'另一个完整表达'}});
 const result=applyRetakePlan(p,analysis(p,cut));assert.equal(result.ok,true);
 assert.deepEqual(result.project.captions,[preserved]);
 assert.deepEqual(result.project.captions[0].words,words);
 assert.equal(result.project.captions[0].words[0].startMs,result.project.captions[0].words[0].endMs);
});

test('complete deleted text can include an observed zero-duration token without invented timestamps',()=>{
 const p=project([cue('deleted-zero',[word('先',1900,1900),word('检查一下',1900,3180)]),cue('after',[word('继续',3400,3800)])]);
 const result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
 assert.deepEqual(texts(result),['继续']);assert.ok(result.warnings.some(w=>/已按完整删除文字清理/.test(w)));
});

test('equidistant matches and partial text are not guessed and produce warnings',()=>{
 for(const words of [[word('先检查一下',1780,1980),word('先检查一下',3020,3220)],[word('先',1820,1990),word('检查',3100,3180)]]){
  const p=project([cue('uncertain',words)]),result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
  assert.deepEqual(result.project.captions.flatMap(c=>c.words),words);
  assert.ok(result.warnings.some(w=>/未能.*完整、唯一匹配/.test(w)));
 }
});

test('matching never skips an intervening lexical word or uses another source instance',()=>{
 const words=[word('先',1820,1990),word('另外',1990,2050),word('检查一下',3100,3180)];
 const p=project([cue('uncertain',words),cue('same-source',[word('先检查一下',1900,3100)],'retain')]);
 const result=applyRetakePlan(p,analysis(p));assert.equal(result.ok,true);
 assert.ok(texts(result).includes('先'));assert.ok(texts(result).includes('检查一下'));
 assert.deepEqual(result.project.captions.find(c=>c.id==='same-source'),p.captions[1]);
 assert.ok(result.warnings.some(w=>/未能/.test(w)));
});

const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const timelineUrl=moduleUrl(fs.readFileSync(new URL('../src/timeline.ts',import.meta.url),'utf8'));
const storeUrl=new URL('../editor/store.ts',import.meta.url);
const storeSource=ts.transpileModule(fs.readFileSync(storeUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s.endsWith('/timeline')?timelineUrl:s.startsWith('.')?new URL(s,storeUrl).href:import.meta.resolve(s))}`);
const {useEditor}=await import('data:text/javascript;base64,'+Buffer.from(storeSource).toString('base64'));
test('one actual store undo restores all original ghost-boundary and untouched captions exactly',()=>{
 const p=project([cue('deleted',[word('先',1820,2050),word('检查一下',2050,3180)]),cue('kept',[word('完整',3820,3980),word('表达',4050,4500)],'retain')]);
 useEditor.getState().init({fps:30,width:1920,height:1080,durationInFrames:600},p.captions,p.accentColor,p.clips,p.music,p.brolls,[],p.presentation);
 const result=applyRetakePlanToStore(useEditor,analysis(p));assert.equal(result.ok,true);assert.equal(useEditor.getState().past.length,1);
 assert.deepEqual(useEditor.getState().captions,[p.captions[1]]);useEditor.getState().undo();
 assert.deepEqual(useEditor.getState().captions,p.captions);assert.deepEqual(useEditor.getState().clips,p.clips);
});
