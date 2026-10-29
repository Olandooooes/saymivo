import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {callCodexDecisions,runBounded,validateCodexDecisions} from './codex-retake-decision.mjs';
import {groupTimedWords} from './codex-retake-benchmark.mjs';

export const CODEX_RECALL_VERSION='independent-word-recall-v1';
const atomic=(file,value)=>{const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);};
const digest=async file=>{const h=createHash('sha256');for await(const bytes of fs.createReadStream(file))h.update(bytes);return h.digest('hex');};
const overlaps=(a,b)=>a[0]<b[1]&&b[0]<a[1];

const abortableDelay=(milliseconds,signal)=>new Promise((resolve,reject)=>{
 signal?.throwIfAborted();const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason??Error('独立观察等待已取消'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);signal?.addEventListener('abort',abort,{once:true});
});
export function activeIndependentWriters(root,{isProcessAlive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}}={}){
 const base=path.join(root,'.auto-jobs/codex-independent-evidence');if(!fs.existsSync(base))return [];
 const writers=[];
 for(const id of fs.readdirSync(base)){if(!/^[a-f0-9]{64}$/i.test(id))continue;const lock=path.join(base,id,'.lock');if(!fs.existsSync(lock))continue;
  try{const owner=JSON.parse(fs.readFileSync(path.join(lock,'owner.json'),'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('invalid owner');if(isProcessAlive(owner.pid))writers.push({id,pid:owner.pid});}
  catch{writers.push({id,pid:null,unverified:true});}
 }
 return writers;
}
export async function waitForIndependentWriter({root=process.cwd(),signal,onProgress=()=>{},pollMs=5000,timeoutMs=2700000,isProcessAlive,now=Date.now,sleep=abortableDelay}={}){
 const started=now();let polls=0;
 for(;;){signal?.throwIfAborted();const writers=activeIndependentWriters(root,{isProcessAlive});if(!writers.length)return {waitedMs:now()-started,polls};
  const remaining=timeoutMs-(now()-started);if(remaining<=0)throw Error('等待已有独立识别任务超过45分钟，请检查本地任务状态');
  onProgress(0,'复用正在生成的独立识别证据，等待已有本地任务完成');polls++;await sleep(Math.min(pollMs,remaining),signal);
 }
}

export async function observeIndependentSources({root=process.cwd(),PUBLIC=path.join(root,'public'),clips,sources,directory,signal,threads=2,run=runBounded,onProgress=()=>{},waitForWriter=waitForIndependentWriter}={}){
 if(!directory||!Array.isArray(clips)||!clips.length||!Array.isArray(sources))throw Error('独立漏检复查需要当前原片快照与对应原声证据');
 root=path.resolve(root);PUBLIC=path.resolve(PUBLIC);
 directory=path.resolve(directory);fs.mkdirSync(directory,{recursive:true});
 const selected=[];
 for(const src of new Set(clips.map(clip=>clip.src))){
  if(typeof src!=='string'||!/^clips\/[\w.-]+\.mp4$/i.test(src)||src.includes('..'))throw Error('独立复查只接受素材库原片');
  const library=fs.realpathSync(path.join(PUBLIC,'clips')),actual=fs.realpathSync(path.join(PUBLIC,src));if(!actual.startsWith(library+path.sep))throw Error('独立复查原片不在素材库');
  const source=sources.find(item=>item.src===src);if(!source?.wav||!/^[a-f0-9]{64}$/i.test(source.sourceSha256??''))throw Error('独立复查缺少原片/WAV身份');
  if(await digest(path.join(PUBLIC,src))!==source.sourceSha256)throw Error('原片已变化，未执行独立漏检复查');
  const ranges=clips.filter(clip=>clip.src===src);selected.push({src,wav:source.wav,sourceSha256:source.sourceSha256,range:[Math.min(...ranges.map(c=>c.inSec)),Math.max(...ranges.map(c=>c.outSec))]});
 }
 const input=path.join(directory,'independent-input.json'),output=path.join(directory,'independent-observations.json');
 // No captions, previous editing decisions, source indices or semantic labels
 // enter recognition. Every invocation revalidates the original source bytes.
 await waitForWriter({root,signal,onProgress});signal?.throwIfAborted();
 atomic(input,{root,sources:selected,threads});
 await run(path.join(root,'.venv/bin/python'),[path.join(root,'scripts/retake-full-audit.py'),input,output],{cwd:root,signal,timeoutMs:3600000,
  log:path.join(directory,'independent-asr.log'),onLine:line=>{const match=line.match(/^PROGRESS:(\d+):(.*)$/);if(match)onProgress(Number(match[1]),match[2]);}});
 signal?.throwIfAborted();
 const result=JSON.parse(fs.readFileSync(output,'utf8'));
 if(result.audioUploaded!==false||result.geminiCalled!==false||!Array.isArray(result.sources)||result.sources.length!==selected.length)throw Error('独立观察结果不完整');
 for(const expected of selected){const source=result.sources.find(item=>item.src===expected.src);
  if(!source||source.sourceSha256!==expected.sourceSha256||(source.clock??source.audioClock)?.sourceSha256!==expected.sourceSha256||JSON.stringify(source.range)!==JSON.stringify(expected.range)||await digest(path.join(PUBLIC,expected.src))!==expected.sourceSha256)throw Error('独立观察的原片身份或时间范围已变化');
 }
 return result.sources.map(enrichIndependentSource);
}

export function recallWordStream(clips,sources){
 let timeline=0;const words=[];
 for(const clip of clips){const source=sources.find(item=>item.src===clip.src);if(!source)throw Error('独立观察缺少当前原片');
  for(const [sourceIndex,word]of source.words.entries())if(word.endMs>clip.inSec*1000+.01&&word.startMs<clip.outSec*1000-.01){
   const trimmed=word.startMs<clip.inSec*1000-.01||word.endMs>clip.outSec*1000+.01;
   words.push({...word,id:words.length,sourceIndex,clipId:clip.id,src:clip.src,timelineMs:timeline+(Math.max(word.startMs,clip.inSec*1000)-clip.inSec*1000)/(clip.speed??1),...(trimmed?{trimmed:true,contextOnly:true}:{})});
  }
  timeline+=(clip.outSec-clip.inSec)*1000/(clip.speed??1);
 }
 return words;
}

function unresolvedRanges(source){
 return (source.unresolved??[]).flatMap(item=>{
  const start=item.startMs??item.word?.startMs,end=item.endMs??item.word?.endMs;
  return Number.isFinite(start)&&Number.isFinite(end)?[[Math.max(0,start/1000-.25),Math.max(end,start)/1000+.25]]:[];
 });
}
export function recallDecisionIssue(decision,words,sources){
 const ranges=[words.slice(decision.first,decision.last+1),...(decision.kind==='filler'?[]:[words.slice(decision.replacementFirst,decision.replacementLast+1)])];
 const selected=ranges.flat();
 if(!selected.length||selected.some(word=>word.contextOnly||word.trimmed))return 'trimmed-or-missing-independent-word';
 for(const words of ranges)for(const src of new Set(words.map(word=>word.src))){
  const source=sources.find(item=>item.src===src);if(!source)return 'missing-independent-source';
  if((source.unresolved??[]).some(item=>!Number.isFinite(item.startMs??item.word?.startMs)||!Number.isFinite(item.endMs??item.word?.endMs)))return 'independent-word-clock-unresolved';
  const span=words.filter(word=>word.src===src),interval=[Math.min(...span.map(word=>word.startMs))/1000,Math.max(...span.map(word=>word.endMs))/1000];
  if(unresolvedRanges(source).some(range=>overlaps(range,interval)))return 'independent-word-clock-conflict';
 }
 return null;
}

export function missingSpeechRanges(source,words,{minimumSec=.18}={}){
 const covered=[...words.map(word=>[word.startMs/1000,word.endMs/1000]),...(source.quiet??[])].filter(range=>range.length===2&&range.every(Number.isFinite)&&range[1]>range[0]).sort((a,b)=>a[0]-b[0]);
 const missing=[];
 for(const range of source.speech??[]){if(range.length!==2||!range.every(Number.isFinite)||range[1]<=range[0])continue;let cursor=range[0];
  const add=(a,b)=>{if(b-a>=minimumSec)missing.push({reason:'untranscribed-nonquiet-speech',startMs:Math.round(a*1000),endMs:Math.round(b*1000),provider:'independent-vad-coverage'});};
  for(const [a,b]of covered){if(b<=cursor||a>=range[1])continue;if(a>cursor)add(cursor,Math.min(a,range[1]));cursor=Math.max(cursor,Math.min(b,range[1]));if(cursor>=range[1])break;}
  if(cursor<range[1])add(cursor,range[1]);
 }
 return missing;
}

function sameWindowConflicts(windows=[]){
 const unresolved=[];
 for(const [windowIndex,window]of windows.entries()){
  const byText=new Map();
  for(const word of window.words??[]){
   if(!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.endMs<=word.startMs||typeof word.word!=='string')continue;
   const key=word.word.normalize('NFKC').trim();if(!key)continue;
   if(!byText.has(key))byText.set(key,[]);byText.get(key).push(word);
  }
  for(const words of byText.values()){
   let group=[],end=-1;
   const flush=()=>{if(group.length>1)unresolved.push({reason:'same-window-overlapping-repeated-observations',windowIndex,
    startMs:Math.min(...group.map(word=>word.startMs)),endMs:Math.max(...group.map(word=>word.endMs)),words:group.map(word=>({...word,windowIndex}))});};
   for(const word of words.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)){
    if(group.length&&word.startMs>=end){flush();group=[];end=-1;}
    group.push(word);end=Math.max(end,word.endMs);
   }
   flush();
  }
 }
 return unresolved;
}
const mergeUnresolved=(existing=[],added=[])=>{
 const values=[...existing],keys=new Set(existing.map(value=>JSON.stringify([value.reason,value.startMs,value.endMs,value.windowIndex])));
 for(const value of added){const key=JSON.stringify([value.reason,value.startMs,value.endMs,value.windowIndex]);if(!keys.has(key)){keys.add(key);values.push(value);}}
 return values;
};

// Preserve the raw recognition receipt and its canonical clocks. A repeated
// token inside one recognition window cannot be explained as corroboration
// between windows, so expose that real observed interval as unresolved.
export function enrichIndependentSource(source){
 if(!source.observationPasses)return {...source,unresolved:mergeUnresolved(source.unresolved,sameWindowConflicts(source.windows))};
 const observationPasses=source.observationPasses.map(pass=>({...pass,unresolved:mergeUnresolved(pass.unresolved,sameWindowConflicts(pass.windows))}));
 const primary=observationPasses.find(pass=>pass.id==='core-overlap')??observationPasses[0];
 return {...source,observationPasses,unresolved:mergeUnresolved(source.unresolved,primary?.unresolved)};
}

const pureRawFiller=value=>typeof value==='string'&&/^[嗯恩呃额]+$/u.test(value.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,''));
function fillerClockCovered(word,canonical){
 let cursor=word.startMs;
 const ranges=canonical.filter(value=>pureRawFiller(value.word)&&Number.isFinite(value.startMs)&&Number.isFinite(value.endMs)&&value.endMs>value.startMs)
  .map(value=>[value.startMs,value.endMs]).sort((a,b)=>a[0]-b[0]);
 for(const [start,end]of ranges){if(end<=cursor)continue;if(start>cursor+.01)return false;cursor=Math.max(cursor,end);if(cursor>=word.endMs-.01)return true;}
 return false;
}
function windowWordEvidence(window,bounds){
 const words=[],unresolved=[...(window.unresolved??[])],observed=[];
 for(const word of window.words??[]){
  if(!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.startMs<0||word.endMs<=word.startMs){unresolved.push({reason:'non-positive-or-invalid-window-word',word});continue;}
  if(word.startMs<bounds[0]*1000-1||word.endMs>bounds[1]*1000+1){unresolved.push({reason:'word-outside-observed-window',word});continue;}
  observed.push(word);
 }
 let group=[],end=-1;
 const flush=()=>{if(group.length===1)words.push(group[0]);else if(group.length)unresolved.push({reason:'conflicting-overlapping-window-words',
  startMs:Math.min(...group.map(word=>word.startMs)),endMs:Math.max(...group.map(word=>word.endMs)),words:[...group]});};
 for(const word of observed.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)){
  if(group.length&&word.startMs>=end){flush();group=[];end=-1;}group.push(word);end=Math.max(end,word.endMs);
 }
 flush();return {words:groupTimedWords(words),unresolved};
}
const clippedRanges=(ranges,bounds)=>(ranges??[]).filter(value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&overlaps(value,bounds))
 .map(([start,end])=>[Math.max(start,bounds[0]),Math.min(end,bounds[1])]);
function rawFillerContextPasses(sources){
 const contexts=[];
 for(const [sourceIndex,source]of sources.entries())for(const pass of source.observationPasses??[])for(const [windowIndex,window]of (pass.windows??[]).entries()){
  const missing=(window.words??[]).filter(word=>pureRawFiller(word.word)&&Number.isFinite(word.startMs)&&Number.isFinite(word.endMs)&&word.endMs>word.startMs&&!fillerClockCovered(word,pass.words??[]));
  if(!missing.length)continue;
  const bounds=[window.startSec,window.endSec];
  if(!bounds.every(Number.isFinite)||bounds[0]<0||bounds[1]<=bounds[0])throw Error('语气词上下文窗口缺少原片时间范围');
  const evidence=windowWordEvidence(window,bounds),localUnresolved=(pass.unresolved??[]).filter(value=>{
   const start=value.startMs??value.word?.startMs,end=value.endMs??value.word?.endMs;
   return !Number.isFinite(start)||!Number.isFinite(end)||overlaps([start/1000,Math.max(start,end)/1000],bounds);
  });
  const id='raw-filler-context-'+sourceIndex+'-'+String(pass.id).replace(/[^a-zA-Z0-9_.-]/g,'_')+'-'+windowIndex;
  const contextSources=sources.map(other=>{
   const {observationPasses,words,unresolved,speech,windows,...identity}=other;
   if(other.src!==source.src)return {...identity,words:[],unresolved:[],speech:[],evidencePass:id};
   const local={...identity,range:bounds,words:evidence.words,quiet:clippedRanges(source.quiet,bounds),speech:clippedRanges(source.speech,bounds),
    provider:pass.provider??source.provider,timingProvider:window.timingProvider??pass.timingProvider??source.timingProvider,windows:[window],evidencePass:id};
   return {...local,unresolved:mergeUnresolved(localUnresolved,[...evidence.unresolved,...missingSpeechRanges(local,evidence.words)])};
  });
  contexts.push({id,sources:contextSources,origin:'raw-window-filler-context',parentPass:pass.id,source:source.src,windowIndex,
   windowRange:bounds,automaticApplyEnabled:false});
 }
 return contexts;
}

export function independentPasses(sources){
 sources=sources.map(enrichIndependentSource);
 const passIds=[...new Set(sources.flatMap(source=>source.observationPasses?.map(pass=>pass.id)??['independent']))];
 const passes=passIds.map(id=>({id,sources:sources.flatMap(source=>{
  const pass=source.observationPasses?.find(item=>item.id===id)??(!source.observationPasses?source:null);if(!pass)return [];
  const words=groupTimedWords(pass.words);
  return [{...source,words,unresolved:[...(pass.unresolved??[]),...missingSpeechRanges(source,words)],provider:pass.provider??source.provider,evidencePass:id}];
 })}));
 return [...passes,...rawFillerContextPasses(sources)];
}

export function markUnresolvedContext(words,clips,sources){
 const marked=new Set();
 for(const source of sources){
  const unknown=(source.unresolved??[]).some(item=>!Number.isFinite(item.startMs??item.word?.startMs)||!Number.isFinite(item.endMs??item.word?.endMs));
  if(unknown){words.forEach((word,index)=>{if(word.src===source.src)marked.add(index);});continue;}
  const ranges=unresolvedRanges(source);
  for(const clip of clips.filter(clip=>clip.src===source.src)){
   const indices=words.map((word,index)=>({word,index})).filter(item=>(item.word.observationClipId??item.word.clipId)===clip.id);
   for(const range of ranges){if(!overlaps(range,[clip.inSec,clip.outSec]))continue;
    let before,after;
    for(const item of indices){const extent=[item.word.startMs/1000,item.word.endMs/1000];
     if(overlaps(range,extent))marked.add(item.index);
     if(extent[1]<=range[0])before=item;
     if(!after&&extent[0]>=range[1])after=item;
    }
    // Real neighboring words carry the marker. No invented placeholder speech
    // or time interpolation is inserted into an ASR gap.
    if(before)marked.add(before.index);if(after)marked.add(after.index);
   }
  }
 }
 return words.map((word,index)=>marked.has(index)?{...word,contextOnly:true,independentUnresolved:true}:word);
}

export async function planRecallCandidates({clips,primarySources=[],independentSources,directory,signal,decide=callCodexDecisions,makeWordStream=recallWordStream,coreWords=320,overlapWords=100,onProgress=()=>{}}={}){
 if(!directory||!Array.isArray(clips)||!Array.isArray(independentSources)||!Number.isInteger(coreWords)||coreWords<40||!Number.isInteger(overlapWords)||overlapWords<0)throw Error('漏检复查参数无效');
 directory=path.resolve(directory);fs.mkdirSync(directory,{recursive:true});
 const passes=[];let transcriptSentToCodex=false;
 for(const observation of independentPasses(independentSources)){
  signal?.throwIfAborted();const words=markUnresolvedContext(makeWordStream(clips,observation.sources),clips,observation.sources);if(!words.length){passes.push({...observation,words,decisions:[],blocked:[],warnings:['独立词流为空，未作取舍']});continue;}
  const proposed=[],blocked=[];
  for(let offset=0;offset<words.length;offset+=coreWords){
   const lo=Math.max(0,offset-overlapWords),hi=Math.min(words.length,offset+coreWords+overlapWords);
   const window=words.slice(lo,hi).map((word,id)=>({...word,id}));onProgress({pass:observation.id,offset,totalWords:words.length});
   transcriptSentToCodex=true;const decisions=await decide(window,{directory:path.join(directory,observation.id+'-'+offset),signal});
   validateCodexDecisions({cuts:decisions},window);
   for(const decision of decisions){if(decision.first+lo<offset||decision.first+lo>=offset+coreWords)continue;
    const mapped={...decision,first:decision.first+lo,last:decision.last+lo,replacementFirst:decision.replacementFirst<0?-1:decision.replacementFirst+lo,replacementLast:decision.replacementLast<0?-1:decision.replacementLast+lo};
    const issue=recallDecisionIssue(mapped,words,observation.sources);if(issue)blocked.push({decision:mapped,reason:issue});else proposed.push(mapped);
   }
  }
  // Keep inconsistent cross-window suggestions visible without selecting one
  // arbitrarily or pretending they form an approved edit plan.
  const conflicted=new Map();
  for(let i=0;i<proposed.length;i++)for(let j=i+1;j<proposed.length;j++)try{validateCodexDecisions({cuts:[proposed[i],proposed[j]]},words);}catch(error){conflicted.set(i,error.message);conflicted.set(j,error.message);}
  const decisions=proposed.filter((proposal,index)=>{if(!conflicted.has(index))return true;blocked.push({decision:proposal,reason:'cross-window-decision-conflict',details:conflicted.get(index)});return false;});
  const classifications=decisions.map(decision=>{
   const removed=words.slice(decision.first,decision.last+1),primary=primarySources.find(source=>source.src===removed[0]?.src);
   const observed=primary?.words?.filter(word=>overlaps([word.startMs,word.endMs],[removed[0].startMs,removed.at(-1).endMs]))??[];
   const normal=value=>String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
   return {decision,discovery:normal(observed.map(word=>word.word).join('')).includes(normal(removed.map(word=>word.word).join('')))?'independent-semantic-recall':'primary-transcript-missing-or-different'};
  });
  passes.push({...observation,words,decisions,blocked,classifications,automaticApplyEnabled:false});
 }
 signal?.throwIfAborted();
 const result={version:CODEX_RECALL_VERSION,passes,audioUploaded:false,geminiCalled:false,transcriptSentToCodex,automaticApplyEnabled:false,
  warnings:['独立词流只补充漏检建议；每个pass须分别通过原声、保护词和边界验证，再按原片时钟解决冲突']};
 atomic(path.join(directory,'recall-plan.json'),result);return result;
}

async function main(){
 const [input,output]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/codex-retake-recall.mjs INPUT_JSON OUTPUT_JSON');
 const request=JSON.parse(fs.readFileSync(input,'utf8')),controller=new AbortController();const stop=()=>controller.abort(Error('Independent recognition cancelled'));
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{const sources=await observeIndependentSources({...request,signal:controller.signal,onProgress:(value,label)=>console.log(`PROGRESS:${value}:${label}`)});atomic(output,{sources,audioUploaded:false,geminiCalled:false});}
 finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
