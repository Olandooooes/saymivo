import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRetakePlan,retakeClipSnapshot} from '../src/retake-plan.mjs';
import {createKeeperCaptionEvidence} from '../src/retake-keeper-captions.mjs';

const sha='a'.repeat(64),src='clips/synthetic.mp4',clock={version:'source-zero-v1',timestampBasis:'source-video-presentation-ms',sourceSha256:sha,wavSha256:'b'.repeat(64),sampleRate:16000,channels:1,sampleWidthBytes:2};
const word=(text,startMs,endMs,accent=false)=>({text,startMs,endMs,accent});
const cue=(id,clipId,words,extra={})=>({id,clipId,words,startMs:words[0].startMs,endMs:words.at(-1).endMs,topPct:87,audioClock:clock,...extra});
function fixture({sameClip=false}={}){
 const clips=[{id:'remove',src,inSec:0,outSec:12,speed:1.25,sourceDurationSec:12},...sameClip?[]:[{id:'keep',src,inSec:4,outSec:12,speed:1,sourceDurationSec:12}]],keeper=sameClip?'remove':'keep';
 const words=[{word:'先检查',startMs:5000,endMs:5500},{word:'一下',startMs:5500,endMs:5800},{word:'完整',startMs:6000,endMs:6400},{word:'功能',startMs:6400,endMs:6900}];
 const source={src,sourceSha256:sha,audioClock:clock,words};
 const remove={clipId:'remove',src,startSec:2,endSec:3,text:'先检查一下'},retain={clipId:keeper,src,startSec:5,endSec:6.9,text:words.map(w=>w.word).join(''),first:0,last:3};
 const candidate={id:'synthetic-keeper',src,clipId:'remove',kind:'false-start',remove:{...remove},retain:{...retain},removeParts:[remove],retainParts:[retain],status:'approved',confidence:'high',score:1,method:'codex-word-decisions',reason:'synthetic failed start',evidence:[{kind:'independent-local-asr',confirmed:true},{kind:'acoustic-boundaries',safe:true},{kind:'source-boundary-v2',safe:true,sourceSha256:sha}]};
 candidate.keeperCaptionEvidence=createKeeperCaptionEvidence(candidate,source);
 const style={scale:1.1,styleOverride:{fontFamily:'synthetic'},protectedPhrases:['完整功能']};
 const captions=[cue('deleted-prefix','remove',[word('先',1900,2050,true),word('检查',2050,2600,true),word('一下',2600,3100)]),cue('keeper-suffix',keeper,[word('完整',6100,6500,true),word('功能！',6500,7000)],style),cue('untouched',keeper,[word('后文。',9000,9500)])];
 const project={clips,captions,brolls:[],presentation:{},music:null,accentColor:'#123'};
 const analysis={id:'keeper-caption-regression',status:'done',snapshot:{clips:retakeClipSnapshot(clips)},sources:[{src,sourceSha256:sha,audioClock:clock}],candidates:[candidate]};
 return {project,analysis,candidate,source,style};
}
const allText=result=>result.project.captions.flatMap(c=>c.words.map(w=>w.text)).join('');

for(const sameClip of [false,true])test(`a verified lost prefix is restored only in its complete retained ${sameClip?'child clip':'other clip'} with actual source groups`,()=>{
 const f=fixture({sameClip}),before=structuredClone(f.project),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);assert.equal(allText(result),'先检查一下完整功能！后文。');
 const repaired=result.project.captions.find(c=>c.id.startsWith('keeper-suffix'));assert.ok(repaired);assert.deepEqual(repaired.words.map(w=>[w.startMs,w.endMs]),f.source.words.map(w=>[w.startMs,w.endMs]));
 assert.deepEqual(repaired.words.map(w=>w.accent),[true,false,true,false]);assert.equal(repaired.topPct,87);assert.equal(repaired.scale,f.style.scale);assert.deepEqual(repaired.styleOverride,f.style.styleOverride);assert.deepEqual(repaired.protectedPhrases,f.style.protectedPhrases);
 assert.equal(repaired.clipId,sameClip?'remove-retake1':'keep');assert.ok(result.warnings.some(w=>w.includes('恢复 1 处')));assert.deepEqual(f.project,before);
 const again=applyRetakePlan(result.project,f.analysis,{session:result.session});assert.equal(again.ok,true);assert.equal(again.changed,false);assert.deepEqual(again.project,result.project);
});

test('no evidence is emitted before independent approval or from indivisible invalid word clocks',()=>{
 const f=fixture();assert.ok(f.candidate.keeperCaptionEvidence);
 assert.equal(createKeeperCaptionEvidence({...f.candidate,status:'review'},f.source),null);
 assert.equal(createKeeperCaptionEvidence({...f.candidate,evidence:[]},f.source),null);
 assert.equal(createKeeperCaptionEvidence(f.candidate,{...f.source,words:f.source.words.map((w,i)=>i? w:{...w,endMs:w.startMs})}),null);
});

for(const [name,change]of [
 ['missing proof',f=>{delete f.candidate.keeperCaptionEvidence;}],
 ['candidate binding mismatch',f=>{f.candidate.keeperCaptionEvidence.candidateId='other';}],
 ['source SHA mismatch',f=>{f.candidate.keeperCaptionEvidence.sourceSha256='c'.repeat(64);}],
 ['clock mismatch',f=>{f.candidate.keeperCaptionEvidence.audioClock.wavSha256='c'.repeat(64);}],
 ['word clock changed',f=>{f.candidate.keeperCaptionEvidence.parts[0].words[0].endMs=5000;}],
 ['part boundary changed',f=>{f.candidate.keeperCaptionEvidence.parts[0].startSec=4.9;}],
 ['word index binding changed',f=>{f.candidate.keeperCaptionEvidence.parts[0].words[0].sourceIndex=99;}],
 ['missing prefix was already intentionally absent',f=>{f.project.captions[0].words=[word('别的内容',1900,3100)];}],
 ['an internal caption edit is not a suffix',f=>{f.project.captions[1].words[0].text='特殊';}],
 ['empty captions',f=>{f.project.captions=f.project.captions.filter(c=>c.id!=='keeper-suffix');}],
 ['short suffix',f=>{f.project.captions[1].words=[word('功能！',6500,7000)];}],
])test(name+' leaves surviving captions unchanged',()=>{
 const f=fixture();change(f);const expected=f.project.captions.find(c=>c.id==='keeper-suffix'),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);
 assert.ok(!result.warnings.some(w=>w.includes('恢复 1 处')));if(expected)assert.deepEqual(result.project.captions.find(c=>c.id==='keeper-suffix'),expected);
});

test('a complete existing keeper is a byte-for-byte caption no-op',()=>{
 const f=fixture(),caption=f.project.captions[1];caption.words=f.source.words.map(w=>word(w.word,w.startMs,w.endMs));caption.startMs=5000;caption.endMs=6900;
 const before=structuredClone(caption),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);assert.deepEqual(result.project.captions.find(c=>c.id===caption.id),before);
});

test('the same lost text in another original clip instance does not repair an intentionally omitted prefix',()=>{
 const f=fixture();f.project.clips.push({...f.project.clips[0],id:'other-instance'});f.project.captions[0].clipId='other-instance';f.analysis.snapshot.clips=retakeClipSnapshot(f.project.clips);
 const before=structuredClone(f.project.captions[1]),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);assert.deepEqual(result.project.captions.find(c=>c.id===before.id),before);
});

for(const [actual,corrected]of [['1.5','15'],['1,500','1500'],['1/5','15'],['-2','2'],['+2','2'],['2%','2'],['2±1','21'],["we'll",'well'],['不会','会'],['Qwen','Gemini']])test(`a corrected suffix ${actual} / ${corrected} cannot be overwritten by normalization`,()=>{
 const f=fixture();f.source.words[2].word='保留'+actual;f.candidate.retain.text=f.source.words.map(w=>w.word).join('');f.candidate.retainParts[0].text=f.candidate.retain.text;
 f.candidate.keeperCaptionEvidence=createKeeperCaptionEvidence(f.candidate,f.source);f.project.captions[1].words[0].text='保留'+corrected;
 const expected=structuredClone(f.project.captions[1]),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);assert.deepEqual(result.project.captions.find(c=>c.id===expected.id),expected);
 assert.ok(!result.warnings.some(w=>w.includes('恢复 1 处')));
});

test('a different corrected number in the actually lost prefix is not replaced by the ASR number',()=>{
 const f=fixture();f.source.words[0].word='需时';f.source.words[1].word='1.5';f.candidate.retain.text=f.source.words.map(w=>w.word).join('');f.candidate.retainParts[0].text=f.candidate.retain.text;
 f.candidate.remove.text='需时1.5';f.candidate.removeParts[0].text='需时1.5';f.candidate.keeperCaptionEvidence=createKeeperCaptionEvidence(f.candidate,f.source);
 f.project.captions[0].words=[word('需时',1900,2050),word('15',2050,3100)];
 const expected=structuredClone(f.project.captions[1]),result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);assert.deepEqual(result.project.captions.find(c=>c.id===expected.id),expected);
 assert.ok(!result.warnings.some(w=>w.includes('恢复 1 处')));
});

test('matched suffix style boundaries and punctuation survive pagination without splitting actual observed word clocks',()=>{
 const f=fixture(),first=f.project.captions[1],second={...first,id:'second-suffix',topPct:72,styleOverride:{fontFamily:'other'},protectedPhrases:['功能']};
 first.words=[word('完整',6100,6500,true)];first.endMs=6500;second.words=[word('功能！',6500,7000)];second.startMs=6500;f.project.captions.splice(2,0,second);
 const result=applyRetakePlan(f.project,f.analysis);assert.equal(result.ok,true);const restored=result.project.captions.filter(c=>c.startMs>=5000&&c.endMs<=7000);
 assert.equal(restored.length,2);assert.equal(restored[0].topPct,87);assert.equal(restored[1].topPct,72);assert.deepEqual(restored[1].styleOverride,second.styleOverride);assert.deepEqual(restored[1].protectedPhrases,second.protectedPhrases);
 assert.deepEqual(restored.flatMap(c=>c.words.map(w=>[w.startMs,w.endMs])),f.source.words.map(w=>[w.startMs,w.endMs]));assert.equal(restored.at(-1).words.at(-1).text,'功能！');
});
