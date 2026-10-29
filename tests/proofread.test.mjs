import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyCorrections,proofreadCaptions,parseGlossary} from '../server/proofread.mjs';
const make=(text,id='c',clipId='clip',start=0)=>({id,clipId,startMs:start,endMs:start+text.length*100,topPct:89,words:Array.from(text).map((text,i)=>({text,startMs:start+i*100,endMs:start+(i+1)*100,accent:false}))});
const text=caps=>caps.map(c=>c.words.map(w=>w.text).join('')).join('');
test('context and near sound repair a proper noun across subtitle pages without retiming',async()=>{const input=[make('这个生活指南被议为当代的亲民','a'),make('要素。howtolivebetter','b','clip',1500)];const original=structuredClone(input);const r=await proofreadCaptions(input);assert.match(text(r.captions),/被誉为当代的齐民要术/);assert.match(text(r.captions),/HowToLiveBetter/);assert.equal(r.changes.length,3);assert.deepEqual(input,original);for(let i=0;i<input.length;i++){assert.equal(r.captions[i].startMs,input[i].startMs);assert.equal(r.captions[i].endMs,input[i].endMs);assert.deepEqual(r.captions[i].words.map(w=>[w.startMs,w.endMs]),input[i].words.map(w=>[w.startMs,w.endMs]));}});
test('matching words without topic evidence do not trigger contextual term replacement',async()=>{const r=await proofreadCaptions([make('这个产品的亲民要素是价格实惠。')]);assert.equal(r.changes.length,0);assert.match(text(r.captions),/亲民要素/);});
test('personal glossary supports aliases and conservative homophone matching',async()=>{const r=await proofreadCaptions([make('我们使用飞书多位表格管理资料。')],{glossary:'多维表格｜多位表格'});assert.match(text(r.captions),/多维表格/);assert.equal(r.changes.length,1);});
test('ambiguous glossary homophones are flagged rather than choosing the first',async()=>{const r=await proofreadCaptions([make('功关理论')],{glossary:'公关理论\n攻关理论'});assert.equal(r.changes.length,0);assert.match(r.review[0].reason,/多个同音候选/);assert.equal(text(r.captions),'功关理论');});
test('numbers, negation, low confidence and substantial rewrites stay unchanged',()=>{const input=[make('价格50元，不需要安装。')];const r=applyCorrections(input,[{before:'50',after:'500',confidence:1},{before:'不需要',after:'需要',confidence:1},{before:'安装',after:'安裝',confidence:.8},{before:'价格',after:'费用完全免费',confidence:1}].map(e=>({...e,clipId:'clip',method:'gemini'})));assert.equal(r.changes.length,0);assert.equal(r.review.length,4);assert.equal(text(r.captions),text(input));});
test('model text must match a unique exact source span',()=>{const r=applyCorrections([make('议为议为')],[{clipId:'clip',before:'议为',after:'誉为',confidence:1,method:'gemini'},{clipId:'clip',before:'不存在',after:'乱写',confidence:1,method:'gemini'}]);assert.equal(r.changes.length,0);assert.equal(r.review.length,2);});
test('shorter correction keeps neighbouring tokens and outer timestamps intact',()=>{const c=make('我们用Git Hub制作', 'a');const r=applyCorrections([c],[{clipId:'clip',before:'Git Hub',after:'GitHub',confidence:1,method:'local'}]);assert.equal(text(r.captions),'我们用GitHub制作');assert.deepEqual(r.captions[0].words.slice(0,3),c.words.slice(0,3));assert.deepEqual(r.captions[0].words.slice(-2),c.words.slice(-2));assert.equal(r.captions[0].endMs,c.endMs);});
test('failed model falls back to local corrections with visible warning',async()=>{const r=await proofreadCaptions([make('howtolivebetter')],{mode:'gemini',model:async()=>{throw Error('network');}});assert.equal(text(r.captions),'HowToLiveBetter');assert.equal(r.warnings.length,1);});
test('context model receives transcript and glossary and its edits pass validation',async()=>{let prompt;const r=await proofreadCaptions([make('他被议为专家')],{mode:'gemini',glossary:'专家',model:async(parts)=>{prompt=parts[0].text;return {edits:[{before:'议为',after:'誉为',confidence:.99,reason:'近音错字'}]};}});assert.match(prompt,/<transcript>他被议为专家/);assert.match(prompt,/专家/);assert.equal(text(r.captions),'他被誉为专家');});
test('glossary validates bounds and rejects malformed input',()=>{assert.throws(()=>parseGlossary(123));assert.throws(()=>parseGlossary('x'.repeat(10001)));assert.equal(parseGlossary('术语｜错词')[0].aliases[0],'错词');});
test('malformed model confidence is not trusted',()=>{const r=applyCorrections([make('议为')],[{clipId:'clip',before:'议为',after:'誉为',confidence:'1',method:'gemini',reason:{invalid:true}}]);assert.equal(r.changes.length,0);assert.equal(typeof r.review[0].reason,'string');});
test('unknown titlecase term in Chinese context is flagged without guessing a replacement or blocking export',async()=>{
 const input=[make('最近有一个Skyo非常火爆。Agent和skill保留。')],before=structuredClone(input);const r=await proofreadCaptions(input);
 assert.deepEqual(r.captions,input);assert.deepEqual(input,before);assert.equal(r.changes.length,0);
 assert.deepEqual(r.review.map(x=>x.before),['Skyo']);assert.equal(r.review[0].kind,'unverified-term');assert.equal(r.review[0].after,undefined);assert.ok(r.review[0].endMs>r.review[0].startMs);
 const verified=await proofreadCaptions(input,{glossary:'Skyo'});assert.equal(verified.review.length,0);
 const english=await proofreadCaptions([make('Hello everyone welcome today')]);assert.equal(english.review.length,0);
});
test('same-length correction inside a multi-character word never invents character clocks',()=>{
 const c={...make('占位'),words:[{text:'这个复线功能',startMs:1000,endMs:3000,accent:false}],startMs:1000,endMs:3000};
 const r=applyCorrections([c],[{clipId:'clip',before:'复线',after:'复现',method:'local',confidence:1}]);
 assert.deepEqual(r.captions[0].words,[{text:'这个复现功能',startMs:1000,endMs:3000,accent:false}]);
});
test('contextual homophones require source-bound, time-local audio evidence',async()=>{
 const c=make('复线这个软件的功能');c.audioClock={sourceSha256:'source-a'};
 const options={audioEvidence:[{clipId:'clip',sourceSha256:'source-a',startMs:0,endMs:2000,text:'复现这个软件',verified:true,words:[{word:'复现',startMs:0,endMs:200}]}]};
 assert.equal((await proofreadCaptions([c])).changes.length,0);
 const good=await proofreadCaptions([c],options);assert.match(text(good.captions),/^复现/);
 for(const patch of [{sourceSha256:'other'},{words:[{word:'复现',startMs:1500,endMs:1800}]}]){
  const bad=await proofreadCaptions([c],{audioEvidence:[{...options.audioEvidence[0],...patch}]});assert.equal(bad.changes.length,0);
 }
 const railway=make('铁路复线这个软件仅展示轨道');railway.audioClock=c.audioClock;
 assert.equal((await proofreadCaptions([railway],options)).changes.length,0);
});
test('full-name case does not invent an expansion or join ordinary English words',async()=>{
 const r=await proofreadCaptions([make('全称是reverse engineer anything。')]);
 assert.match(text(r.captions),/Reverse Engineer Anything/);
 const unknown=await proofreadCaptions([make('这个项目叫XYZ')]);assert.equal(text(unknown.captions),'这个项目叫XYZ');
});
test('abbreviation consistency cannot expand another name without same-source audio',async()=>{
 const c=make('ABC项目ABC功能，BC公司。');c.audioClock={sourceSha256:'acronym-source'};
 assert.equal(text((await proofreadCaptions([c])).captions),'ABC项目ABC功能，BC公司。');
 const at=c.words.map(w=>w.text).join('').lastIndexOf('BC');
 const r=await proofreadCaptions([c],{audioEvidence:[{clipId:'clip',sourceSha256:'acronym-source',startMs:0,endMs:3000,verified:true,text:'ABC',words:[{word:'ABC',startMs:at*100,endMs:(at+2)*100}]}]});
 assert.match(text(r.captions),/ABC公司/);
});
test('homophone spelling uses domain context after acoustic sound agreement, never another pronunciation',async()=>{
 const c=make('软件复线这个功能');c.audioClock={sourceSha256:'same'};
 const evidence={clipId:'clip',sourceSha256:'same',startMs:0,endMs:3000,verified:true,text:'复线',words:[{word:'复线',startMs:200,endMs:400}]};
 assert.match(text((await proofreadCaptions([c],{audioEvidence:[evidence]})).captions),/软件复现/);
 evidence.words[0].word='复制';assert.equal((await proofreadCaptions([c],{audioEvidence:[evidence]})).changes.length,0);
});
test('case-only English full name may span a real pause without retiming or filling silence',async()=>{
 const a=make('全称是reverse','a'),b=make(' engineer anything','b','clip',3000);
 const r=await proofreadCaptions([a,b]);assert.match(text(r.captions),/Reverse Engineer Anything/);
 assert.deepEqual(r.captions.flatMap(c=>c.words).map(w=>[w.startMs,w.endMs]),[a,b].flatMap(c=>c.words).map(w=>[w.startMs,w.endMs]));
});
test('known names with arbitrary subword spaces normalize while English sentences keep spaces',async()=>{
 const r=await proofreadCaptions([make('Chat GPT和Open AI。AI agents can help me')]);
 assert.equal(text(r.captions),'ChatGPT和OpenAI。AI agents can help me');
});
test('a narrow aspirated-initial ASR confusion can support an explicit English-name introduction',async()=>{
 const c=make('全征式reverse engineer anything');c.audioClock={sourceSha256:'source'};
 const e={clipId:'clip',sourceSha256:'source',startMs:0,endMs:4000,verified:true,text:'全征是',words:[{word:'全征是',startMs:0,endMs:300}]};
 assert.match(text((await proofreadCaptions([c],{audioEvidence:[e]})).captions),/^全称是/);
 e.words[0].word='全正是';assert.equal((await proofreadCaptions([c],{audioEvidence:[e]})).changes.some(x=>x.after==='全称是'),false);
});
test('full-name display preserves existing mixed-case brands and acronyms',async()=>{
 const r=await proofreadCaptions([make('全称是iPhone API和其他内容')]);assert.equal(text(r.captions),'全称是iPhone API和其他内容');
});
