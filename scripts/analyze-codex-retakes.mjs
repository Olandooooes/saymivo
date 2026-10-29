import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {validateRetakeRequest} from '../server/retake-input.mjs';
import {quietCutBounds} from './codex-retake-benchmark.mjs';
import {prepareWordEvidence} from './retake-word-evidence.mjs';
import {callCodexDecisions,runBounded,CODEX_RETAKE_VERSION} from './codex-retake-decision.mjs';
import {observeIndependentSources,planRecallCandidates,independentPasses} from './codex-retake-recall.mjs';
import {compileCodexFillerCandidates,confirmCodexFillers} from './codex-retake-fillers.mjs';
import {applyRetakePlan} from '../src/retake-plan.mjs';
import {mergeRetakeEvidence} from './merge-retake-evidence.mjs';
import {prepareRetakeComparisons,comparisonTextsForCandidate} from './retake-comparison.mjs';
import {protectedAssertionDifference} from './retake-protected-difference.mjs';
import {tightenQuietMargins} from './retake-quiet-margins.mjs';
import {refineIndependentClocks} from './refine-retake-clocks.mjs';
import {prepareSpeechProtectionEvidence} from './retake-speech-protection.mjs';
import {prepareSelectedVadEnvelopeEvidence,proposeSelectedVadEnvelope} from './retake-vad-envelope.mjs';
import {createKeeperCaptionEvidence} from '../src/retake-keeper-captions.mjs';
import {discoverObservedFillers,assessFillerDiscovery} from './retake-filler-discovery.mjs';
import {observeFillerWindows} from './codex-retake-fillers.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileHash=async file=>{const h=createHash('sha256');for await(const part of fs.createReadStream(file))h.update(part);return h.digest('hex');};
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
const writeAtomic=(file,value)=>{const temporary=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(value,null,2),{flag:'wx'});fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}};
const normalized=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const text=words=>words.map(w=>w.word).join('');

export function retainedWordStream(clips,sources){
 let timeline=0;const words=[];
 for(const clip of clips){
  const source=sources.find(s=>s.src===clip.src);if(!source)throw Error('缺少原片识别证据');
  const uncertain=(source.unresolved??[]).flatMap(value=>{
   const raw=value.word&&typeof value.word==='object'?[value.word]:(value.words??[value]);
   const start=value.startMs??Math.min(...raw.map(w=>w.startMs)),end=value.endMs??Math.max(...raw.map(w=>w.endMs));
   return Number.isFinite(start)&&Number.isFinite(end)?[{word:raw.map(w=>w.word??'').join('')||'[未确认语音]',startMs:start,endMs:end,sourceIndex:-1,contextOnly:true}]:[];
  });
  const observations=[...source.words.map((w,sourceIndex)=>({...w,sourceIndex})),...uncertain].sort((a,b)=>a.startMs-b.startMs||a.sourceIndex-b.sourceIndex);
  for(const w of observations)if(w.endMs>clip.inSec*1000+.01&&w.startMs<clip.outSec*1000-.01){
   const trimmed=w.startMs<clip.inSec*1000-.01||w.endMs>clip.outSec*1000+.01;
   words.push({...w,id:words.length,sourceIndex:w.sourceIndex,clipId:clip.id,src:clip.src,
    timelineMs:timeline+(Math.max(w.startMs,clip.inSec*1000)-clip.inSec*1000)/(clip.speed??1),
    ...(trimmed?{trimmed:true,contextOnly:true}:{})});
  }
  timeline+=(clip.outSec-clip.inSec)*1000/(clip.speed??1);
 }
 return words;
}

function takeGroups(selected,clips,source){
 if(!selected.length||selected.some(w=>w.src!==source.src))return {reason:'同一次取舍跨不同原片，保留原声'};
 const groups=[];
 for(const [i,w]of selected.entries()){
  if(i&&w.sourceIndex!==selected[i-1].sourceIndex+1)return {reason:'取舍跨过未纳入比较的原片词或回绕到重复实例，保留原声'};
  const clip=clips.find(c=>c.id===w.clipId);
  if(!clip||clip.src!==source.src)return {reason:'词没有绑定当前分析快照的片段'};
  let group=groups.at(-1);
  if(group?.clip.id!==clip.id){
   if(group&&clip.inSec<group.clip.outSec-.00001)return {reason:'取舍片段的原片时间回绕或重叠，保留原声'};
   group={clip,words:[]};groups.push(group);
  }
  group.words.push(w);
 }
 return {groups};
}

function partBoundaryStatus(part,source){
 const quietPoint=t=>source.quiet.some(([a,b])=>b-a>=.08&&t>=a+.03-.001&&t<=b-.03+.001);
 const insideWord=t=>source.words.some(w=>t>w.startMs/1000+.001&&t<w.endMs/1000-.001);
 return quietPoint(part.startSec)&&quietPoint(part.endSec)&&!insideWord(part.startSec)&&!insideWord(part.endSec)?'word-clock-and-quiet-checked':'needs-review';
}

function takeParts(groups,source,range,remove){
 return groups.map(({clip,words})=>{
  const part={clipId:clip.id,src:clip.src,clipInSec:clip.inSec,clipOutSec:clip.outSec,
   startSec:remove?Math.max(clip.inSec,range.startSec):words[0].startMs/1000,
   endSec:remove?Math.min(clip.outSec,range.endSec):words.at(-1).endMs/1000,
   text:text(words),first:words[0].sourceIndex,last:words.at(-1).sourceIndex};
  part.boundaryStatus=remove?partBoundaryStatus(part,source):'retained-word-clock';
  return part;
 });
}

// This gate is independent of the model's explanation or numerical confidence.
// Differing protected assertions are not promoted to automatic corrections.
export function protectedDifference(before,after){
 return protectedAssertionDifference(before,after).changed;
}
export function compileCodexCandidates(decisions,words,clips,sources){
 const candidates=[],blocked=[];
 for(const [index,d]of decisions.entries()){
  const removed=words.slice(d.first,d.last+1),retained=d.kind==='filler'?[]:words.slice(d.replacementFirst,d.replacementLast+1);
  if(!removed.length||d.kind==='filler'||!retained.length){blocked.push({decision:d,reason:'语气词的独立原声确认尚未完成，保留原声'});continue;}
  const edgeIndices=[d.first-1,d.first,d.last,d.last+1,d.replacementFirst-1,d.replacementFirst,d.replacementLast,d.replacementLast+1];
  if([...removed,...retained,...edgeIndices.map(i=>words[i]).filter(Boolean)].some(w=>w.trimmed||w.contextOnly)){
   blocked.push({decision:d,reason:'取舍涉及或紧邻已有剪口截断的词，上下文不完整，保留原声'});continue;
  }
  const clip=clips.find(c=>c.id===removed[0].clipId),retainedClip=clips.find(c=>c.id===retained[0].clipId);
  if(!clip||!retainedClip){blocked.push({decision:d,reason:'词没有绑定当前分析快照的片段'});continue;}
  if(clip.src!==retainedClip.src){blocked.push({decision:d,reason:'同一次取舍跨不同原片，保留原声'});continue;}
  const source=sources.find(s=>s.src===clip.src);
  if(!source||!Array.isArray(source.words)||!Array.isArray(source.quiet)){blocked.push({decision:d,reason:'缺少对应原片的词时间或静音证据'});continue;}
  const rg=takeGroups(removed,clips,source),kg=takeGroups(retained,clips,source);
  if(rg.reason||kg.reason){blocked.push({decision:d,reason:rg.reason??kg.reason});continue;}
  const range=quietCutBounds({first:removed[0].sourceIndex,last:removed.at(-1).sourceIndex},source.words,source.quiet,[rg.groups[0].clip.inSec,rg.groups.at(-1).clip.outSec]);
  const removeParts=takeParts(rg.groups,source,range,true),retainParts=takeParts(kg.groups,source,null,false);
  const start=removed[0].startMs/1000,end=removed.at(-1).endMs/1000;
  const candidate={id:'codex-'+hash(JSON.stringify([removeParts.map(p=>p.clipId),retainParts.map(p=>p.clipId),start,end,d.kind])).slice(0,20),src:clip.src,clipId:clip.id,kind:d.kind,
   remove:{startSec:range.startSec,endSec:range.endSec,text:text(removed)},earlier:{startSec:start,endSec:end,text:text(removed)},
   retain:{clipId:retainedClip.id,src:retainedClip.src,startSec:retained[0].startMs/1000,endSec:retained.at(-1).endMs/1000,text:text(retained)},
   status:'review',confidence:'review',score:0,method:'codex-word-decisions',reason:d.reason,
   first:removed[0].sourceIndex,last:removed.at(-1).sourceIndex,replacementFirst:retained[0].sourceIndex,replacementLast:retained.at(-1).sourceIndex,
   removeParts,retainParts,
   boundaryStatus:range.boundaryStatus==='word-clock-and-quiet-checked'&&removeParts.every(p=>p.boundaryStatus==='word-clock-and-quiet-checked')?'word-clock-and-quiet-checked':'needs-review',protectedChanged:protectedDifference(text(removed),text(retained)),
   evidence:[{kind:'codex-decision',version:CODEX_RETAKE_VERSION,decisionIndex:index,clipId:clip.id,retainedClipId:retainedClip.id}]};
  if(candidate.remove.startSec<candidate.retain.endSec&&candidate.retain.startSec<candidate.remove.endSec){blocked.push({decision:d,reason:'取舍覆盖同源保留版本，保留原声'});continue;}
  candidates.push(candidate);
 }
 // Cross-clip replacement protection must consider every proposed deletion.
 for(const candidate of candidates)if(candidates.some(c=>c.removeParts.some(part=>candidate.retainParts.some(keep=>part.clipId===keep.clipId&&part.startSec<keep.endSec&&keep.startSec<part.endSec)))){
  candidate.conflict=true;candidate.reason+='；保留版本与另一取舍冲突，须复核';
 }
 return {candidates,blocked};
}

async function smallModelManifest(directory){
 const entries=[];
 const visit=async(relative='')=>{
  for(const entry of fs.readdirSync(path.join(directory,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const name=path.join(relative,entry.name),file=path.join(directory,name);
   if(entry.isDirectory())await visit(name);
   else if(entry.isFile()&&/\.json$|tokenizer|vocab|merges|config|chat_template|preprocessor/i.test(entry.name)&&fs.statSync(file).size<=16*1024*1024)entries.push({file:name,sha256:await fileHash(file)});
  }
 };
 await visit();return entries;
}

async function readSourceObservation({cache,sourceSha256,range,clockSpec}){
 const observationBytes=fs.readFileSync(path.join(cache,'observations.json')),
  clockBytes=fs.readFileSync(path.join(cache,'source.wav.clock.json')),
  obs=JSON.parse(observationBytes),clock=JSON.parse(clockBytes),wav=path.join(cache,'source.wav');
 if(!obs||!Array.isArray(obs.words)||!Array.isArray(obs.quiet)||!isDeepStrictEqual(obs.range,range)||
  !isDeepStrictEqual(obs.clock,clock)||clock.sourceSha256!==sourceSha256||
  !Object.entries(clockSpec).every(([key,value])=>clock[key]===value)||
  !/^[a-f0-9]{64}$/i.test(clock.wavSha256??'')||clock.wavBytes!==fs.statSync(wav).size||
  clock.wavSha256!==await fileHash(wav))throw Error('本地转写缓存的音频身份、时钟或证据不一致');
 return {obs,payloadSha256:hash(observationBytes),wavClockSha256:hash(clockBytes)};
}

// A cancelled/partial/corrupt cache is a miss, never a source of approved cuts.
export async function readCodexEvidenceCache({cache,identity,sourceSha256,range,clockSpec}){
 try{
  const receipt=JSON.parse(fs.readFileSync(path.join(cache,'receipt.json')));
  if(receipt.identity!==JSON.stringify(identity))return null;
  const checked=await readSourceObservation({cache,sourceSha256,range,clockSpec});
  return receipt.payloadSha256===checked.payloadSha256&&receipt.wavClockSha256===checked.wavClockSha256?checked.obs:null;
 }catch{return null;}
}

async function sourceEvidence({root,PUBLIC,src,clips,directory,signal,onProgress}){
 onProgress?.(3,'核验原片，准备本地词级识别');
 const file=path.join(PUBLIC,src),sourceSha256=await fileHash(file);
 const range=[Math.min(...clips.filter(c=>c.src===src).map(c=>c.inSec)),Math.max(...clips.filter(c=>c.src===src).map(c=>c.outSec))];
 const script=path.join(root,'scripts/retake-benchmark-qwen.py');
 const clockFile=path.join(root,'scripts/source-audio-clock.json'),clockSpec=JSON.parse(fs.readFileSync(clockFile));
 const identity={version:CODEX_RETAKE_VERSION,sourceSha256,range,scriptSha256:hash(fs.readFileSync(script)),
  sourceAudioSha256:hash(fs.readFileSync(path.join(root,'scripts/source_audio.py'))),clockSpecSha256:hash(fs.readFileSync(clockFile)),
  pythonEnvironmentSha256:hash(fs.readFileSync(path.join(root,'.venv-align/pyvenv.cfg'))),
  modelSha256:await fileHash(path.join(root,'.models/qwen3-asr-0.6b/model.safetensors')),alignerSha256:await fileHash(path.join(root,'.models/qwen3-forced-aligner-0.6b/model.safetensors')),
  modelConfiguration:await smallModelManifest(path.join(root,'.models/qwen3-asr-0.6b')),alignerConfiguration:await smallModelManifest(path.join(root,'.models/qwen3-forced-aligner-0.6b'))};
 const cache=path.join(root,'.auto-jobs/codex-source-evidence',hash(JSON.stringify(identity)));fs.mkdirSync(cache,{recursive:true});
 const receiptFile=path.join(cache,'receipt.json');
 let obs=await readCodexEvidenceCache({cache,identity,sourceSha256,range,clockSpec});
 if(!obs){
  onProgress?.(8,'载入本地语音模型，视频与音频留在本机');
  await runBounded(path.join(root,'.venv-align/bin/python'),[script,root,file,cache,...range.map(String)],{cwd:root,signal,log:path.join(directory,'qwen.log'),onLine:line=>{const match=line.match(/^Qwen observed\s+[\d.]+\s+([\d.]+)/);if(match)onProgress?.(10+35*Math.max(0,Math.min(1,(Number(match[1])-range[0])/(range[1]-range[0]))),'本地转写与词时间对齐');},timeoutMs:1800000});
  const checked=await readSourceObservation({cache,sourceSha256,range,clockSpec});obs=checked.obs;
  writeAtomic(receiptFile,{identity:JSON.stringify(identity),payloadSha256:checked.payloadSha256,wavClockSha256:checked.wavClockSha256});
 }
 if(obs.clock.sourceSha256!==sourceSha256||await fileHash(file)!==sourceSha256)throw Error('分析期间原片变化，未批准任何剪口');
 return {...obs,...prepareWordEvidence(obs.words),src,wav:path.join(cache,'source.wav'),sourceSha256,audioClock:obs.clock,cache};
}


async function scanPrimary(words,{directory,signal,decide,onProgress}){
 const decisions=[];
 for(let offset=0;offset<words.length;offset+=400){
  const lo=Math.max(0,offset-80),hi=Math.min(words.length,offset+480),window=words.slice(lo,hi).map((w,id)=>({...w,id}));
  onProgress(50+Math.round(20*offset/words.length),'Codex 检查完整上下文中的重录与废弃起句');
  const batch=await decide(window,{directory:path.join(directory,'codex-'+offset),signal});
  for(const d of batch)if(d.first+lo>=offset&&d.first+lo<offset+400)decisions.push({...d,first:d.first+lo,last:d.last+lo,replacementFirst:d.replacementFirst<0?-1:d.replacementFirst+lo,replacementLast:d.replacementLast<0?-1:d.replacementLast+lo});
 }
 const {validateCodexDecisions}=await import('./codex-retake-decision.mjs');validateCodexDecisions({cuts:decisions},words);return decisions;
}

async function verifyPass(pass,clips,{root,directory,signal,checkBoundaries,confirm,confirmFiller=confirmCodexFillers,originPass='primary',protectedSources=[],speechEvidence=[],envelopeEvidence=null,prepareComparison,comparisonWarnings=[],discoverFillers,observeFiller,decide,discoveryBudget,discoveryEntries=[],onProgress=()=>{}}){
 fs.mkdirSync(directory,{recursive:true});
 const discovery=discoverFillers?await discoverFillers(pass,clips,{root,directory:path.join(directory,'filler-discovery'),signal,protectedSources,observe:observeFiller,decide,budget:discoveryBudget}):{decisions:[],entries:[]};
 discoveryEntries.push(...discovery.entries);
 write(path.join(directory,'filler-discovery.json'),{entries:discovery.entries});
 const retakes=compileCodexCandidates(pass.decisions.filter(d=>d.kind!=='filler'),pass.words,clips,pass.sources);
 const fillers=compileCodexFillerCandidates([...pass.decisions.filter(d=>d.kind==='filler'),...discovery.decisions],pass.words,clips,pass.sources);
 const compiled={candidates:[...retakes.candidates,...fillers.candidates],blocked:[...(pass.blocked??[]),...retakes.blocked,...fillers.blocked]};
 if(protectedSources.length)compiled.candidates=compiled.candidates.map(c=>{
  const source=pass.sources.find(s=>s.src===c.src);
  const proposal=proposeSelectedVadEnvelope(c,source,{clips,protectedSources,envelopeEvidence});
  return tightenQuietMargins(proposal,source,{clips,protectedSources,speechEvidence,envelopeEvidence});
 });
 for(const c of compiled.candidates){c.originPass=originPass;if(originPass!=='primary')c.id=originPass+'-'+c.id;}
 const discoveredEntry=c=>discovery.entries.find(e=>e.src===c.src&&e.clipId===c.clipId&&e.first===c.first&&e.last===c.last&&discovery.decisions.some(d=>pass.words[d.first]?.sourceIndex===c.first));
 for(const c of compiled.candidates.filter(c=>c.kind==='filler')){const entry=discoveredEntry(c);if(entry)entry.candidateId=c.id;}
 const protectionCandidates=compiled.candidates.filter(c=>c.kind!=='filler');let comparable=protectionCandidates;
 if(prepareComparison&&protectionCandidates.length)try{
  const prepared=await prepareComparison(structuredClone(protectionCandidates),{root,directory:path.join(directory,'protected-comparison'),signal});
  if(!Array.isArray(prepared.candidates)||!Array.isArray(prepared.warnings))throw Error('保护词比较副本结果格式无效');
  const raw=values=>values.map(value=>{const {comparisonCopies,...original}=value;return original;});
  if(!isDeepStrictEqual(raw(prepared.candidates),raw(protectionCandidates)))throw Error('比较副本改动了候选原文、状态或证据');
  comparable=prepared.candidates;comparisonWarnings.push(...prepared.warnings);
 }catch(error){signal?.throwIfAborted();comparisonWarnings.push('保护词繁简比较未完成：'+error.message+'；保留原文保护检查。');}
 for(const [index,candidate]of protectionCandidates.entries()){
  const comparison=comparisonTextsForCandidate(comparable[index]);if(comparison.warning)comparisonWarnings.push(comparison.warning);
  const previous=candidate.protectedChanged,detail=protectedAssertionDifference(comparison.texts.remove,comparison.texts.retain??'');
  candidate.protectedChanged=detail.changed;
  if(comparison.valid)candidate.comparisonCopies=comparable[index].comparisonCopies;
  candidate.evidence.push({kind:'protected-assertion-comparison',...detail,previousProtectedChanged:previous,comparisonSource:comparison.valid?'bound-opencc-copy':'raw',
   normalizationSha256:comparison.valid?comparable[index].comparisonCopies.normalizationSha256:null,
   inputSha256:comparison.valid?comparable[index].comparisonCopies.receipt.inputSha256:null,outputSha256:comparison.valid?comparable[index].comparisonCopies.receipt.outputSha256:null,
   rawRecognitionChanged:false,automaticApproval:false});
 }
 write(path.join(directory,'word-stream.json'),pass.words);write(path.join(directory,'proposals.json'),compiled);
 const verificationInput={root,confirmationProvider:originPass==='primary'?'whisper-medium':'qwen',sources:pass.sources.map(s=>({src:s.src,wav:s.wav,sourceSha256:s.sourceSha256,words:s.words,unresolved:s.unresolved??[],quiet:s.quiet,range:s.range,provider:s.provider??s.recognizer,audioClock:s.audioClock??s.clock})),candidates:compiled.candidates.map(c=>({...c,startSec:c.remove.startSec,endSec:c.remove.endSec}))};
 write(path.join(directory,'verification-input.json'),verificationInput);
 const eligible=verificationInput.candidates.filter(c=>c.boundaryStatus==='word-clock-and-quiet-checked'&&!c.conflict&&!c.protectedChanged&&(c.kind!=='filler'||c.semanticEligible===true));
 const checks={...verificationInput,candidates:eligible},inputFile=path.join(directory,'boundary-input.json');write(inputFile,checks);
 let boundaries={candidates:[]},recognition={candidates:[]},fillerRecognition={candidates:[]};
 if(eligible.length){
  onProgress(75,'独立复查原声、语气词及两侧保留词');
  if(checkBoundaries)boundaries=await checkBoundaries(checks);
  else{const output=path.join(directory,'boundaries.json');await runBounded(path.join(root,'.venv-align/bin/python'),[path.join(root,'scripts/check-codex-retake-boundaries.py'),inputFile,output],{cwd:root,signal,log:path.join(directory,'boundary.log')});boundaries=JSON.parse(fs.readFileSync(output));}
  const retakeInput={...checks,candidates:eligible.filter(c=>c.kind!=='filler')};
  if(retakeInput.candidates.length){
   if(confirm)recognition=await confirm(retakeInput);
   else{const output=path.join(directory,'confirmation.json'),file=path.join(directory,'retake-confirmation-input.json');write(file,retakeInput);await runBounded(path.join(root,retakeInput.confirmationProvider==='qwen'?'.venv-align/bin/python':'.venv/bin/python'),[path.join(root,'scripts/codex-retake-confirm.py'),file,output],{cwd:root,signal,log:path.join(directory,'confirmation.log')});recognition=JSON.parse(fs.readFileSync(output));}
  }
  if(eligible.some(c=>c.kind==='filler')){
   const fillerCandidates=eligible.filter(c=>c.kind==='filler'),ordinary=fillerCandidates.filter(c=>!discoveredEntry(c));
   const existing=ordinary.length?await confirmFiller({...checks,candidates:ordinary},{root,directory,signal}):{candidates:[]};
   const recovered=fillerCandidates.filter(c=>discoveredEntry(c)).map(c=>{
    const entry=discoveredEntry(c),source=pass.sources.find(s=>s.src===c.src),result=assessFillerDiscovery(c,source,entry.records);
    return {id:c.id,...result,reason:result.confirmed?'补观察的两种本地识别确认语气词及两侧保留词':'补观察未通过最终剪口复核，保留原声'};
   });
   fillerRecognition={...existing,candidates:[...existing.candidates,...recovered]};write(path.join(directory,'filler-confirmation.json'),fillerRecognition);
  }
 }
 for(const c of compiled.candidates){
  const b=boundaries.candidates.find(x=>x.id===c.id),r=(c.kind==='filler'?fillerRecognition:recognition).candidates.find(x=>x.id===c.id);
  c.evidence.push({kind:'source-boundary-v2',safe:b?.safe===true,sourceSha256:pass.sources.find(s=>s.src===c.src).sourceSha256,details:b?.evidence},
   {kind:'independent-local-asr',confirmed:r?.confirmed===true,details:r}, {kind:'acoustic-boundaries',safe:b?.safe===true&&c.boundaryStatus==='word-clock-and-quiet-checked'});
  const semantic=c.kind!=='filler'||c.evidence.some(e=>e.kind==='filler-semantic'&&e.eligible===true);
  if(b?.safe===true&&r?.confirmed===true&&semantic&&!c.conflict&&!c.protectedChanged&&c.boundaryStatus==='word-clock-and-quiet-checked'){c.status='approved';c.confidence='high';c.score=1;}
  else c.reason+='；独立验证未全部通过，原声保留待复核';
  if(c.status==='approved'&&c.kind!=='filler'){const keeper=createKeeperCaptionEvidence(c,pass.sources.find(s=>s.src===c.src));if(keeper)c.keeperCaptionEvidence=keeper;}
  c.validation={boundary:b?.reason??(eligible.some(value=>value.id===c.id)?'未取得通过证据':'语义或词时间初检未通过，原声保留'),recognition:r?.reason??(r?.confirmed===true?'独立原声确认通过':'独立原声未确认'),semantic};
 }
 return compiled;
}
const strippedPassSources=sources=>sources.map(({observationPasses,...source})=>source);
const blockedLabels={'trimmed-or-missing-independent-word':'相关词被已有剪口截断或上下文不完整，原声保留','missing-independent-source':'缺少相应原片的独立识别证据，原声保留','independent-word-clock-unresolved':'独立识别存在无法定位的声音，原声保留','independent-word-clock-conflict':'相关范围存在未确认声音或词时间冲突，原声保留','cross-window-decision-conflict':'重叠上下文对取舍不一致，原声保留'};
const presentBlocked=blocked=>blocked.map(item=>blockedLabels[item.reason]?{...item,code:item.reason,reason:blockedLabels[item.reason]}:item);
const summaryOf=candidates=>({candidates:candidates.length,approved:candidates.filter(c=>c.status==='approved').length,review:candidates.filter(c=>c.status==='review').length,fillersApproved:candidates.filter(c=>c.status==='approved'&&c.kind==='filler').length,retakesApproved:candidates.filter(c=>c.status==='approved'&&c.kind!=='filler').length});

export async function analyzeCodexRetakes(request,{root=process.cwd(),PUBLIC=process.env.KOUBO_PUBLIC_DIR??path.join(root,'public'),directory,signal,onProgress=()=>{},observe=sourceEvidence,decide=callCodexDecisions,checkBoundaries,confirm,confirmFiller=confirmCodexFillers,independentObserve=observe===sourceEvidence?observeIndependentSources:null,recallPlanner=planRecallCandidates,residualRounds=1,refineClocks=independentObserve===observeIndependentSources?refineIndependentClocks:null,prepareSpeech=refineClocks===refineIndependentClocks?prepareSpeechProtectionEvidence:null,prepareEnvelope=prepareSpeech===prepareSpeechProtectionEvidence?prepareSelectedVadEnvelopeEvidence:null,prepareComparison=observe===sourceEvidence?prepareRetakeComparisons:null,discoverFillers=observe===sourceEvidence?discoverObservedFillers:null,observeFiller=observeFillerWindows}={}){
 const input=validateRetakeRequest(request,{PUBLIC});if(input.mode!=='codex'||input.allowCloudText!==true)throw Error('Codex 分析需要明确同意发送转写文字');
 if(!directory)throw Error('缺少独立任务目录');directory=path.resolve(directory);fs.mkdirSync(directory,{recursive:true});signal?.throwIfAborted();
 const sources=[];for(const src of new Set(input.clips.map(c=>c.src)))sources.push(await observe({root,PUBLIC,src,clips:input.clips,directory,signal,onProgress}));
 const words=retainedWordStream(input.clips,sources);if(!words.length)throw Error('保留范围内没有可验证词时间，未执行精剪');
 let primaryPass;
 if(independentObserve){
  const primaryPlan=await recallPlanner({clips:input.clips,independentSources:strippedPassSources(sources),directory:path.join(directory,'primary-decisions'),signal,decide,makeWordStream:retainedWordStream,coreWords:400,overlapWords:80,onProgress:()=>onProgress(48,'Codex 检查整片主识别与跨片段重说')});
  primaryPass=primaryPlan.passes[0];
 }else primaryPass={id:'primary',sources,words,decisions:await scanPrimary(words,{directory,signal,decide,onProgress}),blocked:[]};
 let independentSources=[],speechProtection={evidence:[],warnings:[]},residual={performed:false,rounds:[],newCandidates:0};
 if(independentObserve){
  onProgress(58,'独立重新识别整片，复查主识别遗漏的声音');
  independentSources=await independentObserve({root,PUBLIC,clips:input.clips,sources,directory:path.join(directory,'independent-observation'),signal,onProgress:(n,label)=>onProgress(58+Math.max(0,Math.min(1,n/100))*12,label)});
  if(refineClocks){onProgress(70,'校验独立识别的实际词时间，保护轻声词与长气口');independentSources=await refineClocks({root,sources:independentSources,directory:path.join(directory,'independent-clock-refinement'),signal,onProgress:(n,label)=>onProgress(70+Math.max(0,Math.min(1,n/100))*4,label)});}
  if(prepareSpeech){speechProtection=await prepareSpeech(independentSources,{root});if(!Array.isArray(speechProtection.evidence)||!Array.isArray(speechProtection.warnings))throw Error('语音保护证据格式无效');}
 }
 const speechEvidence=speechProtection.evidence;
 const protectedSources=independentObserve?[...sources,...independentSources]:[];
 let envelopeEvidence=null;
 if(prepareEnvelope)try{envelopeEvidence=await prepareEnvelope(protectedSources,{root});}
 catch(error){signal?.throwIfAborted();speechProtection.warnings.push('完整语音段括界证据未完成，继续保留原有边界保护；不增加自动批准。');}
 write(path.join(directory,'speech-protection-evidence.json'),speechProtection);
 write(path.join(directory,'evidence-sources.json'),{sources:protectedSources.length?protectedSources:sources});
 const comparisonWarnings=[],discoveryEntries=[],discoveryBudget={remaining:4,seen:new Set()};
 const primary=await verifyPass(primaryPass,input.clips,{root,directory,signal,checkBoundaries,confirm,confirmFiller,protectedSources,speechEvidence,envelopeEvidence,prepareComparison,comparisonWarnings,discoverFillers,observeFiller,decide,discoveryBudget,discoveryEntries,onProgress});
 const all=[...primary.candidates],blocked=[...primary.blocked],passes=[{id:'primary',counts:summaryOf(primary.candidates)}];
 if(independentObserve){
  const recall=await recallPlanner({clips:input.clips,primarySources:sources,independentSources,directory:path.join(directory,'recall-decisions'),signal,decide,makeWordStream:retainedWordStream,onProgress:state=>onProgress(84,'Codex 复查独立转写中的漏删 · '+state.pass)});
  for(const [i,pass]of recall.passes.entries()){
   const result=await verifyPass(pass,input.clips,{root,directory:path.join(directory,'recall-'+i),signal,checkBoundaries,confirm,confirmFiller,originPass:'recall-'+pass.id,protectedSources,speechEvidence,envelopeEvidence,prepareComparison,comparisonWarnings,discoverFillers,observeFiller,decide,discoveryBudget,discoveryEntries,onProgress});
   all.push(...result.candidates);blocked.push(...result.blocked);passes.push({id:'recall-'+pass.id,counts:summaryOf(result.candidates)});
  }
 }
 let mergeRound=0;
 const mergeAll=async()=>{
  let comparable=all;
  if(prepareComparison)try{const prepared=await prepareComparison(structuredClone(all),{root,directory:path.join(directory,'comparison-merge-'+mergeRound++),signal});
   if(!Array.isArray(prepared.candidates)||!Array.isArray(prepared.warnings))throw Error('比较副本结果格式无效');
   const raw=value=>value.map(candidate=>{const {comparisonCopies,...original}=candidate;return original;});
   if(!isDeepStrictEqual(raw(prepared.candidates),raw(all)))throw Error('比较副本改动了候选原文、状态或证据');
   comparable=prepared.candidates;comparisonWarnings.push(...prepared.warnings);
  }catch(error){signal?.throwIfAborted();comparisonWarnings.push('本地比较副本未完成：'+error.message+'；保留原文比较，不增加自动批准。');}
  const result=mergeRetakeEvidence(comparable);comparisonWarnings.push(...result.warnings);return result;
 };
 let merged=await mergeAll();
 const sourceReceipts=sources.map(s=>({src:s.src,sourceSha256:s.sourceSha256,audioClock:s.audioClock??s.clock}));
 if(independentObserve&&independentSources.length&&merged.candidates.some(c=>c.status==='approved')){
  const available=independentPasses(independentSources),chosen=available.find(p=>p.id.includes('vad'))??available[0];
  for(let round=0;round<Math.max(0,Math.min(2,residualRounds));round++){
   onProgress(91,'复查自动剪后仍保留的重录与语气词');
   const analysis={id:'residual-preview',status:'done',snapshot:{clips:input.clips},sources:sourceReceipts,candidates:merged.candidates};
   const before={clips:input.clips,captions:[],brolls:[],presentation:{},music:null},applied=applyRetakePlan(before,analysis);
   if(!applied.ok)throw Error('整片自动计划无法安全应用：'+applied.error);
   const owners=new Map(Object.entries(applied.session.retainedClipIds).flatMap(([id,children])=>children.map(child=>[child,id])));
   const plan=await recallPlanner({clips:applied.project.clips,primarySources:sources,independentSources:strippedPassSources(chosen.sources),directory:path.join(directory,'residual-decisions-'+round),signal,decide,
    makeWordStream:(clips,evidence)=>retainedWordStream(clips,evidence).map(w=>({...w,observationClipId:w.clipId,clipId:owners.get(w.clipId)??w.clipId})),onProgress:()=>{}});
   let added=0,approvedBefore=merged.candidates.filter(c=>c.status==='approved').length;
   for(const [i,pass]of plan.passes.entries()){
    const result=await verifyPass(pass,input.clips,{root,directory:path.join(directory,'residual-'+round+'-'+i),signal,checkBoundaries,confirm,confirmFiller,originPass:'residual-'+round+'-'+pass.id,protectedSources,speechEvidence,envelopeEvidence,prepareComparison,comparisonWarnings,discoverFillers,observeFiller,decide,discoveryBudget,discoveryEntries,onProgress});
    added+=result.candidates.length;all.push(...result.candidates);blocked.push(...result.blocked);
   }
   merged=await mergeAll();residual.performed=true;residual.newCandidates+=added;
   residual.rounds.push({round:round+1,suggestions:added,approvedAfterMerge:merged.candidates.filter(c=>c.status==='approved').length});
   if(merged.candidates.filter(c=>c.status==='approved').length<=approvedBefore)break;
  }
 }
 signal?.throwIfAborted();for(const source of sources)if(await fileHash(path.join(PUBLIC,source.src))!==source.sourceSha256)throw Error('分析期间原片变化，结果作废');
 const unresolved=sources.reduce((n,s)=>n+(s.unresolved?.length??0),0);
 const fillerDiscovery={found:discoveryEntries.length,probed:discoveryEntries.filter(e=>e.probed).length,entries:discoveryEntries.map(({records,...entry})=>{const candidate=merged.candidates.find(c=>c.id===entry.candidateId);return {...entry,reason:candidate?.status==='approved'?'已通过全部检查，是否应用以编辑器结果为准':candidate?candidate.reason:entry.reason};})};
 const result={version:CODEX_RETAKE_VERSION,fillerDiscovery,features:{fillerCleaning:true,independentRecall:Boolean(independentObserve),independentClockRefinement:Boolean(refineClocks),residualRecheck:residual.performed},mode:'codex',snapshot:{clips:input.clips},sources:sourceReceipts,candidates:merged.candidates,blocked:presentBlocked(blocked),audioUploaded:false,cloudTextSent:true,
  passes,residual,merge:{duplicates:merged.duplicates,conflicts:merged.conflicts},counts:{...summaryOf(merged.candidates),blocked:blocked.length,unresolvedPrimaryGroups:unresolved},
  warnings:['整片主识别、独立识别和剪后剩余内容分别复查；建议只有原声与剪口证据全部通过才自动删除。零候选不等于全片清净。',...speechProtection.warnings,...new Set(comparisonWarnings),...(unresolved?[String(unresolved)+' 组主识别词时间无法确认，相关原声保护保留，独立识别另行复查。']:[]),'回答、强调、连读和证据不一致的语气词保持原声；实际音轨审计另行检查，数值不代替听辨。']};
 write(path.join(directory,'full-analysis.json'),result);onProgress(100,'整片取舍及漏检复查完成；未通过的原声仍保留');return result;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();for(const event of ['SIGTERM','SIGINT'])process.once(event,()=>controller.abort(Error('分析已取消')));
 const [input,output]=process.argv.slice(2);
 analyzeCodexRetakes(JSON.parse(fs.readFileSync(input)),{directory:path.dirname(output),signal:controller.signal,onProgress:(n,label)=>console.log(`PROGRESS:${n}:${label}`)})
  .then(result=>write(output,result)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
