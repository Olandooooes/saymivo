import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runBounded} from './codex-retake-decision.mjs';

export const CLOCK_REFINEMENT_VERSION='independent-window-alignment-v1';
const timingProvider='qwen-forced-aligner',sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),clean=text=>String(text??'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const finite=Number.isFinite,range=value=>Array.isArray(value)&&value.length===2&&value.every(finite)&&value[0]>=0&&value[1]>value[0];
const atomic=(file,value)=>{const tmp=file+'.tmp-'+randomUUID();fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);};
const digest=async file=>{const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex');};
const requireThat=(condition,message)=>{if(!condition)throw Error('独立词时钟校验失败：'+message);};
const timingReasons=new Set(['non-positive-observed-word','conflicting-overlapping-observations','same-window-overlapping-repeated-observations',
 'non-positive-or-invalid-window-word','word-outside-observed-window','conflicting-overlapping-window-words','untranscribed-nonquiet-speech']);
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=.0011;
// Content-identical library aliases may have different filenames. All actual
// source bytes, WAV bytes and every acoustic clock field must still agree.
const acousticClock=value=>Object.fromEntries(Object.entries(value??{}).filter(([key])=>key!=='sourcePath'));

function observedGroups(text,tokens,bounds){
 const matches=!!clean(text)&&clean(text)===tokens.map(t=>clean(t.text)).join('');
 if(!matches)return {matches,groups:[]};
 let cursor=0,previous=0;const raw=[];
 for(const [index,token]of tokens.entries()){
  const x=token.start_time,y=token.end_time,stop=cursor+clean(token.text).length;
  const valid=finite(x)&&finite(y)&&0<=x&&x<=y&&y<=bounds[1]-bounds[0]+.001&&x>=previous-.001;
  if(finite(x)&&x<previous-.001)for(const before of raw)if(before.endSec!==null&&before.endSec>bounds[0]+x+.001)before.valid=false;
  raw.push({text:token.text??'',charStart:cursor,charEnd:stop,startSec:finite(x)?bounds[0]+x:null,endSec:finite(y)?bounds[0]+y:null,tokenIndices:[index],valid});
  if(finite(y))previous=Math.max(previous,y);cursor=stop;
 }
 const groups=[];
 for(let i=0;i<raw.length;i++){
  const unit={...raw[i],tokenIndices:[...raw[i].tokenIndices]};
  if(unit.valid&&unit.startSec===unit.endSec){let last=i;
   while(last+1<raw.length&&raw[last+1].valid&&raw[last+1].startSec===unit.endSec){
    last++;unit.text+=raw[last].text;unit.charEnd=raw[last].charEnd;unit.endSec=raw[last].endSec;unit.tokenIndices.push(...raw[last].tokenIndices);
    if(unit.endSec>unit.startSec)break;
   }
   if(unit.endSec===unit.startSec){const previous=groups.at(-1);
    if(previous?.valid&&previous.endSec===unit.startSec){previous.text+=unit.text;previous.charEnd=unit.charEnd;previous.tokenIndices.push(...unit.tokenIndices);i=last;continue;}
    unit.valid=false;
   }i=last;
  }groups.push(unit);
 }
 return {matches,groups};
}
function originalSlice(text,lo,hi){
 const positions=[];let offset=0;
 for(const char of text){positions.push(...Array(clean(char).length).fill(offset));offset+=char.length;}
 if(!(0<=lo&&lo<hi&&hi<=positions.length)||(lo&&positions[lo]===positions[lo-1])||(hi<positions.length&&positions[hi]===positions[hi-1]))return null;
 return text.slice(lo===0?0:positions[lo],hi===positions.length?text.length:positions[hi]);
}
function checkWords(words,bounds,{nonoverlap=true}={}){
 requireThat(Array.isArray(words),'缺少词数组');let previous=-Infinity;
 for(const word of words){requireThat(typeof word.word==='string'&&!!clean(word.word)&&finite(word.startMs)&&finite(word.endMs)&&word.endMs>word.startMs&&word.startMs>=bounds[0]*1000-.0011&&word.endMs<=bounds[1]*1000+.0011,'词不在完整原声时间内');
  if(nonoverlap)requireThat(word.startMs>=previous-.0011,'有效词时钟重叠');previous=word.endMs;
 }
}
function wordKey(word){return JSON.stringify([word.word,word.startMs,word.endMs,word.windowIndex,word.observedTokenIndices,word.observedCharRange]);}
function canonicalWindows(windows,sourceRange){
 const observations=[];
 for(const [windowIndex,window]of windows.entries())for(const word of window.words){const midpoint=(word.startMs+word.endMs)/2000;
  if(window.coreStartSec<=midpoint&&midpoint<window.coreEndSec||midpoint===window.coreEndSec&&midpoint===sourceRange[1])observations.push({...word,windowIndex});
 }
 observations.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs||a.windowIndex-b.windowIndex);
 const words=[],conflicts=[];let group=[],end=-1;
 const flush=()=>{if(!group.length)return;const exact=new Set(group.map(w=>w.windowIndex)).size===group.length&&new Set(group.map(w=>JSON.stringify([w.word,w.startMs,w.endMs]))).size===1;
  if(group.length===1||exact)words.push(group[0]);else conflicts.push([Math.min(...group.map(w=>w.startMs)),Math.max(...group.map(w=>w.endMs))]);};
 for(const word of observations){if(group.length&&word.startMs>=end){flush();group=[];end=-1;}group.push(word);end=Math.max(end,word.endMs);}flush();return {words,conflicts};
}
const unresolvedContains=(values,range)=>values.some(item=>{const a=item.startMs??item.word?.startMs,b=item.endMs??item.word?.endMs;return finite(a)&&finite(b)&&a<=range[0]+.0011&&b>=range[1]-.0011;});
function canonicalUnresolved(item,window,windowIndex){
 const value={...item,windowIndex};
 if(item.contextRangeOnly&&item.sourceWindowRange){const a=Math.max(item.startMs,window.coreStartSec*1000),b=Math.min(item.endMs,window.coreEndSec*1000);if(b<=a)return null;
  Object.assign(value,{startMs:Math.round(a*1000)/1000,endMs:Math.round(b*1000)/1000,contextSourceRangeMs:[item.startMs,item.endMs]});}
 return value;
}
function unresolvedEnvelope(group,groups,bounds){
 const positive=groups.filter(g=>g.valid&&g.charEnd>g.charStart&&finite(g.startSec)&&finite(g.endSec)&&g.endSec>g.startSec),
  before=positive.findLast(g=>g.charEnd<=group.charStart),after=positive.find(g=>g.charStart>=group.charEnd);
 let a=before?Math.max(bounds[0],before.endSec):bounds[0],b=after?Math.min(bounds[1],after.startSec):bounds[1];if(b<=a)[a,b]=bounds;
 return [Math.round(a*1000000)/1000,Math.round(b*1000000)/1000];
}
function uncoveredSpeech(source,words){
 const covered=[...words.map(word=>[word.startMs/1000,word.endMs/1000]),...(source.quiet??[])].filter(range).sort((a,b)=>a[0]-b[0]),missing=[];
 const add=(a,b)=>{if(b-a>=.18)missing.push([Math.round(a*1000),Math.round(b*1000)]);};
 for(const [a,b]of source.speech??[]){requireThat(range([a,b]),'原始语音观察范围无效');let cursor=a;
  for(const [lo,hi]of covered){if(hi<=cursor||lo>=b)continue;if(lo>cursor)add(cursor,Math.min(lo,b));cursor=Math.max(cursor,Math.min(hi,b));if(cursor>=b)break;}if(cursor<b)add(cursor,b);
 }return missing;
}

// Validation never treats forced alignment as a second speech recognizer. A
// cached clock is valid only with the original complete window text and tokens.
export function validateRefinedSources(rawSources,refinedSources){
 requireThat(Array.isArray(rawSources)&&rawSources.length>0&&Array.isArray(refinedSources)&&rawSources.length===refinedSources.length,'来源数量变化');
 const rawEvidenceSha256=sha(JSON.stringify(rawSources));
 for(const [sourceIndex,raw]of rawSources.entries()){
  const result=refinedSources[sourceIndex];requireThat(result&&range(raw.range),'缺少原始来源');
  for(const field of ['src','sourceSha256','provider','modelSha256','clock','audioClock','wav','range','quiet','speech'])requireThat(equal(result[field],raw[field]),'原片/识别/原声身份变化：'+field);
  requireThat(result.timingProvider===timingProvider&&result.clockRefinement?.version===CLOCK_REFINEMENT_VERSION&&result.clockRefinement.rawEvidenceSha256===rawEvidenceSha256,'时钟收据不匹配');
  requireThat(equal(result.rawObservationPasses,raw.observationPasses)&&equal(result.rawWords,raw.words??[])&&equal(result.rawUnresolved,raw.unresolved??[]),'原始证据未完整保留');
  requireThat(Array.isArray(result.observationPasses)&&result.observationPasses.length===raw.observationPasses.length,'识别轮次变化');
  for(const [passIndex,rawPass]of raw.observationPasses.entries()){
   const pass=result.observationPasses[passIndex];
   requireThat(pass?.id===rawPass.id&&pass.provider===rawPass.provider&&pass.modelSha256===rawPass.modelSha256&&pass.timingProvider===timingProvider,'识别轮次或模型变化');
   requireThat(equal(pass.rawWords,rawPass.words??[])&&equal(pass.rawUnresolved,rawPass.unresolved??[])&&Array.isArray(pass.unresolved),'原始轮次证据未保留');
   requireThat(Array.isArray(pass.windows)&&pass.windows.length===rawPass.windows.length,'完整识别窗缺失');
   for(const [windowIndex,rawWindow]of rawPass.windows.entries()){
    const window=pass.windows[windowIndex],bounds=[window?.startSec,window?.endSec];
    requireThat(window&&range(bounds)&&range([window.coreStartSec,window.coreEndSec])&&window.coreStartSec>=bounds[0]-.001&&window.coreEndSec<=bounds[1]+.001,'窗口范围无效');
    for(const field of ['text','startSec','endSec','coreStartSec','coreEndSec','kind'])requireThat(equal(window[field],rawWindow[field]),'完整自由识别窗口变化：'+field);
    requireThat(window.timingProvider===timingProvider&&equal(window.rawWords,rawWindow.words??[])&&Array.isArray(window.rawAlignmentTokens)&&Array.isArray(window.unresolved),'原始窗口时钟/对齐词缺失');
    const observed=observedGroups(window.text,window.rawAlignmentTokens,bounds);
    if(!clean(window.text))requireThat(window.words.length===0,'无文本窗口添加了词');
    else requireThat(window.alignment?.tokenTextMatches===observed.matches&&equal(window.alignment.groups,observed.groups),'原始模型token与有效group不一致');
    checkWords(window.words,bounds);
    const used=new Set();
    for(const word of window.words){const group=observed.groups.find(g=>g.valid&&equal(g.tokenIndices,word.observedTokenIndices)&&equal([g.charStart,g.charEnd],word.observedCharRange));
     requireThat(group&&word.word===originalSlice(window.text,group.charStart,group.charEnd)&&clean(word.word)===clean(group.text)&&near(word.startMs,group.startSec*1000)&&near(word.endMs,group.endSec*1000)&&word.windowIndex===windowIndex,'词没有不可拆分原始观察支持');
     const key=JSON.stringify(group.tokenIndices);requireThat(!used.has(key),'重复使用对齐group');used.add(key);
    }
    for(const group of observed.groups.filter(g=>g.charEnd>g.charStart))if(!used.has(JSON.stringify(group.tokenIndices)))requireThat(unresolvedContains(window.unresolved,unresolvedEnvelope(group,observed.groups,bounds)),'丢失对齐词没有未决保护');
    if(clean(window.text)&&!observed.matches)requireThat(window.words.length===0&&unresolvedContains(window.unresolved,bounds.map(value=>value*1000)),'文本不一致仍输出有效词或缺少全窗保护');
    for(const issue of rawWindow.unresolved??[])if(!timingReasons.has(issue.reason))requireThat(window.unresolved.some(value=>equal(value,issue)),'窗口未知证据被静默抹掉');
    for(const issue of window.unresolved){const owned=canonicalUnresolved(issue,window,windowIndex);if(owned)requireThat(pass.unresolved.some(value=>equal(value,owned)),'窗口未决没有传播到轮次');}
   }
   checkWords(pass.words,raw.range);const expected=canonicalWindows(pass.windows,raw.range);
   requireThat(equal(pass.words.map(wordKey),expected.words.map(wordKey)),'canonical词不等于实际窗口的观察');
   for(const conflict of expected.conflicts)requireThat(unresolvedContains(pass.unresolved,conflict),'跨窗冲突没有保护');
   for(const missing of uncoveredSpeech(raw,pass.words))requireThat(unresolvedContains(pass.unresolved,missing),'未归属非静音语音缺少保护');
   for(const issue of rawPass.unresolved??[])if(!timingReasons.has(issue.reason))requireThat(pass.unresolved.some(value=>equal(value,issue)),'未决文本/未知证据被静默抹掉');
   for(const issue of raw.unresolved??[])if(!timingReasons.has(issue.reason))requireThat(pass.unresolved.some(value=>equal(value,issue)),'来源未知证据没有保护所有轮次');
  }
  const primary=result.observationPasses.find(pass=>pass.id==='core-overlap')??result.observationPasses[0];
  requireThat(equal(result.words,primary.words)&&Array.isArray(result.unresolved)&&primary.unresolved.every(value=>result.unresolved.some(item=>equal(item,value))),'主词时钟未对应当前轮次');
  for(const issue of raw.unresolved??[])if(!timingReasons.has(issue.reason))requireThat(result.unresolved.some(value=>equal(value,issue)),'原始来源未知证据被静默抹掉');
 }
 return refinedSources;
}

async function modelManifest(directory){
 const files=[];
 async function walk(current){for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(current,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&(/\.(json|txt|model|safetensors|bin)$/i.test(entry.name)))files.push({path:path.relative(directory,file),sha256:await digest(file)});}}
 await walk(directory);requireThat(files.some(file=>file.path.endsWith('.safetensors')),'缺少本地对齐模型');return files;
}
function readReceiptCache(file,receiptFile,identity,rawSources){
 try{const bytes=fs.readFileSync(file),receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8')),result=JSON.parse(bytes);
  if(receipt.version!==CLOCK_REFINEMENT_VERSION||receipt.cacheIdentity!==identity||receipt.refinedEvidenceSha256!==sha(bytes)||receipt.rawEvidenceSha256!==sha(JSON.stringify(rawSources))||result.cacheIdentity!==identity||result.audioUploaded!==false||result.geminiCalled!==false||result.timingOnly!==true)return null;
  validateRefinedSources(rawSources,result.sources);return {result,receipt};
 }catch{return null;}
}

// Read-only receipt verification for audit/application gates. It loads no
// model, and accepts no browser-supplied replacement timing evidence.
export async function verifyRefinedSourceEvidence(source,{root=process.cwd()}={}){
 root=path.resolve(root);const refinement=source?.clockRefinement;
 requireThat(refinement?.version===CLOCK_REFINEMENT_VERSION&&/^[a-f0-9]{64}$/.test(refinement.cacheIdentity??''),'缺少重定位收据');
 const cache=path.join(root,'.auto-jobs/codex-refined-clocks',refinement.cacheIdentity),receiptFile=path.join(cache,'receipt.json');
 requireThat(refinement.receiptPath===receiptFile,'重定位收据路径不匹配');
 const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8')),input=JSON.parse(fs.readFileSync(path.join(cache,'input.json'),'utf8'));
 requireThat(sha(JSON.stringify(receipt.identity))===refinement.cacheIdentity&&receipt.identity?.rawEvidenceSha256===refinement.rawEvidenceSha256,'缓存身份或原始观察摘要不匹配');
 const verified=readReceiptCache(path.join(cache,'observations.json'),receiptFile,refinement.cacheIdentity,input.sources);
 requireThat(verified&&verified.receipt.refinedEvidenceSha256===refinement.refinedEvidenceSha256,'重定位输出已损坏');
 const output=verified.result.sources.find(value=>value.src===source.src),base={...source,clockRefinement:{...source.clockRefinement}};
 for(const key of ['cache','receiptPath','refinedEvidenceSha256'])delete base.clockRefinement[key];
 requireThat(output&&equal(base,output),'当前有效时钟不同于已验证的缓存');
 const identity=receipt.identity.sources.find(item=>item.src===source.src);
 requireThat(identity&&await digest(path.join(root,'public',source.src))===identity.sourceSha256&&await digest(source.wav)===identity.wavSha256&&await digest(source.wav+'.clock.json')===identity.clockSha256,'重定位使用的原声或时钟已变化');
 for(const [file,expected]of Object.entries(receipt.identity.scripts))requireThat(await digest(path.join(root,'scripts',file))===expected,'重定位验证程序已变化');
 return {valid:true,receiptPath:receiptFile,cacheIdentity:refinement.cacheIdentity,rawEvidenceSha256:receipt.rawEvidenceSha256,refinedEvidenceSha256:receipt.refinedEvidenceSha256};
}

export async function refineIndependentClocks({root=process.cwd(),sources,directory,signal,onProgress=()=>{},run=runBounded}={}){
 requireThat(directory&&Array.isArray(sources)&&sources.length,'缺少独立窗口或任务目录');root=path.resolve(root);directory=path.resolve(directory);fs.mkdirSync(directory,{recursive:true});signal?.throwIfAborted();
 const python=path.join(root,'.venv-align/bin/python'),script=path.join(root,'scripts/refine-retake-clocks.py'),fingerprintFile=path.join(directory,'clock-runtime.json');
 // Runtime probing does not load a model. Use a file to preserve the actual
 // child interpreter/package versions as part of the new immutable identity.
 const runtimeCode='import importlib.util,json,sys; sys.path.insert(0,sys.argv[1]); s=importlib.util.spec_from_file_location("refine_clock",sys.argv[2]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); open(sys.argv[3],"w").write(json.dumps(m.fingerprint()))';
 await run(python,['-c',runtimeCode,path.join(root,'scripts'),script,fingerprintFile],{cwd:root,signal,timeoutMs:30000});
 const runtime=JSON.parse(fs.readFileSync(fingerprintFile,'utf8')),rawEvidenceSha256=sha(JSON.stringify(sources)),identities=[];
 for(const source of sources){
  requireThat(typeof source.src==='string'&&/^clips\/[\w.-]+\.mp4$/i.test(source.src)&&!source.src.includes('..')&&/^[a-f0-9]{64}$/i.test(source.sourceSha256??'')&&range(source.range)&&Array.isArray(source.observationPasses)&&source.observationPasses.length,'原片/自由识别窗口无效');
  const original=fs.realpathSync(path.join(root,'public',source.src)),library=fs.realpathSync(path.join(root,'public/clips'));
  requireThat(original.startsWith(library+path.sep)&&await digest(original)===source.sourceSha256,'原片字节已变化');
  const clockFile=source.wav+'.clock.json',clock=JSON.parse(fs.readFileSync(clockFile,'utf8')),wavSha256=await digest(source.wav);
  const expectedClock=JSON.parse(fs.readFileSync(path.join(root,'scripts/source-audio-clock.json'),'utf8'));
  requireThat(Object.entries(expectedClock).every(([key,value])=>clock[key]===value)&&clock.sourceSha256===source.sourceSha256&&clock.wavSha256===wavSha256&&clock.limitSec===null&&equal(acousticClock(clock),acousticClock(source.clock??source.audioClock))&&equal(acousticClock(clock),acousticClock(source.audioClock??clock)),'独立识别原声时钟或字节不匹配');
  identities.push({src:source.src,sourceSha256:source.sourceSha256,wavSha256,clockSha256:await digest(clockFile)});
 }
 const fingerprints={};for(const file of ['refine-retake-clocks.py','refine-retake-clocks.mjs','retake_boundary_check.py','forced_alignment_compare.py','source_audio.py','source-audio-clock.json'])fingerprints[file]=await digest(path.join(root,'scripts',file));
 const identity={version:CLOCK_REFINEMENT_VERSION,rawEvidenceSha256,sources:identities,scripts:fingerprints,runtime,
  pythonEnvironmentSha256:await digest(path.join(root,'.venv-align/pyvenv.cfg')),model:await modelManifest(path.join(root,'.models/qwen3-forced-aligner-0.6b')),threads:4};
 const cacheIdentity=sha(JSON.stringify(identity)),cache=path.join(root,'.auto-jobs/codex-refined-clocks',cacheIdentity),output=path.join(cache,'observations.json'),receiptFile=path.join(cache,'receipt.json');fs.mkdirSync(cache,{recursive:true});
 let cached=readReceiptCache(output,receiptFile,cacheIdentity,sources);
 if(!cached){
  const lock=path.join(cache,'.lock');try{fs.mkdirSync(lock);}catch(error){if(error.code!=='EEXIST')throw error;
   let live=true;try{const owner=JSON.parse(fs.readFileSync(path.join(lock,'owner.json'),'utf8'));try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')live=false;}}catch{}
   requireThat(!live,'相同独立词时钟任务仍在运行');fs.renameSync(lock,lock+'.stale-'+randomUUID());fs.mkdirSync(lock);
  }
  atomic(path.join(lock,'owner.json'),{pid:process.pid,createdAt:new Date().toISOString()});
  try{
   cached=readReceiptCache(output,receiptFile,cacheIdentity,sources);
   if(!cached){
    const input=path.join(cache,'input.json'),workerOutput=path.join(cache,'observations.pending-'+randomUUID()+'.json');
    atomic(input,{root,sources,threads:4,rawEvidenceSha256,cacheIdentity,checkpointDirectory:path.join(cache,'windows')});atomic(path.join(cache,'identity.json'),identity);
    await run(python,[script,input,workerOutput],{cwd:root,signal,timeoutMs:7200000,log:path.join(directory,'clock-refinement.log'),onLine:line=>{const match=line.match(/^PROGRESS:(\d+):(.*)$/);if(match)onProgress(Number(match[1]),match[2]);}});signal?.throwIfAborted();
    const result=JSON.parse(fs.readFileSync(workerOutput,'utf8'));
    requireThat(result.version===CLOCK_REFINEMENT_VERSION&&result.cacheIdentity===cacheIdentity&&result.rawEvidenceSha256===rawEvidenceSha256&&result.audioUploaded===false&&result.geminiCalled===false&&result.timingOnly===true,'重定位结果收据无效');validateRefinedSources(sources,result.sources);
    // A changed source cannot acquire a good receipt from a completed child.
    for(const source of sources){const expected=identities.find(item=>item.src===source.src);
     requireThat(await digest(path.join(root,'public',source.src))===source.sourceSha256&&await digest(source.wav)===expected.wavSha256&&await digest(source.wav+'.clock.json')===expected.clockSha256,'分析期间原片/原声/时钟变化');}
    fs.renameSync(workerOutput,output);
    const refinedEvidenceSha256=await digest(output),receipt={version:CLOCK_REFINEMENT_VERSION,cacheIdentity,rawEvidenceSha256,refinedEvidenceSha256,timingOnly:true,
     supersededBy:{rawEvidenceSha256,refinedEvidenceSha256,cacheIdentity},timingProvider,recognitionProviders:sources.map(source=>source.provider),audioUploaded:false,geminiCalled:false,completedAt:new Date().toISOString(),identity};
    atomic(receiptFile,receipt);cached={result,receipt};
   }
  }finally{fs.rmSync(lock,{recursive:true,force:true});}
 }else onProgress(100,'已复用完整独立词时钟重定位证据');
 const refined=cached.result.sources.map(source=>({...source,clockRefinement:{...source.clockRefinement,cacheIdentity,cache,receiptPath:receiptFile,refinedEvidenceSha256:cached.receipt.refinedEvidenceSha256}}));
 atomic(path.join(directory,'clock-refinement-receipt.json'),{...cached.receipt,cache,receiptPath:receiptFile});atomic(path.join(directory,'refined-independent-sources.json'),{sources:refined});return refined;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]??'.'),input=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),directory=path.resolve(process.argv[4]);
 const sources=input.sources.filter(source=>source.provider==='whisper-medium');
 await refineIndependentClocks({root,sources,directory,onProgress:(percent,label)=>process.stdout.write(`PROGRESS:${percent}:${label}\n`)});
}
