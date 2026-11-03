import React,{useEffect,useRef,useState} from 'react';
import type {Clip} from '../src/timeline';
import type {RetakeAnalysis,RetakeAudit,RetakeCandidate,RetakeOptions,RetakeResult,RetakeSession} from '../src/retake-plan.mjs';
import {retakeRequest} from './retake-request.mjs';
import {SourceAudition} from './SourceAudition';

type Props={clips:Clip[];onApply:(analysis:RetakeAnalysis,options?:RetakeOptions)=>RetakeResult;onSeekSource:(retainedClipIds:string[],sourceSec:number)=>void;onPausePreview:()=>void};
const seconds=(n:number)=>`${n.toFixed(2)} 秒`;
const button='px-3 py-1.5 rounded border border-outline-variant/40 text-sm disabled:opacity-50';
async function readResponse(response:Response){
 const data=await response.json();
 if(!response.ok)throw Error(data.error??'分析请求失败，请重试。');
 return data;
}
const stopJob=(id:string)=>fetch(`/api/retakes/${encodeURIComponent(id)}/cancel`,{method:'POST'}).then(readResponse);
type Capabilities={codex:{ready:boolean;reason:string}};
const codexEvidence=(candidate:RetakeCandidate)=>candidate.evidence.some(value=>value!==null&&typeof value==='object'&&'kind' in value&&['codex-semantic','codex-decision'].includes(String(value.kind)));
function EvidenceDetails({evidence}:{evidence:unknown[]}){const [open,setOpen]=useState(false);return <details className="text-xs opacity-75" onToggle={event=>setOpen(event.currentTarget.open)}><summary>查看取舍依据</summary>{open&&<pre className="whitespace-pre-wrap break-words mt-2">{JSON.stringify(evidence,null,2)}</pre>}</details>;}

// Intentionally independent from Editor. Mount with a project key so changing
// projects cancels polling and never applies an old job to a new editor.
export function RetakeTools({clips,onApply,onSeekSource,onPausePreview}:Props){
 const [mode,setMode]=useState<'local'|'codex'>('local'),[consent,setConsent]=useState(false),[capabilities,setCapabilities]=useState<Capabilities|null>(null);
 const [busy,setBusy]=useState(false),[analysis,setAnalysis]=useState<RetakeAnalysis|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[selected,setSelected]=useState<string[]>([]),[applied,setApplied]=useState<string[]>([]);
 const [applicationWarnings,setApplicationWarnings]=useState<string[]>([]);
 const [audit,setAudit]=useState<RetakeAudit|null>(null),[auditing,setAuditing]=useState(false);
 const request=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),jobId=useRef<string|null>(null);
 const session=useRef<RetakeSession|undefined>(undefined),generation=useRef(0),apply=useRef(onApply);
 apply.current=onApply;
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/retakes/capabilities',{signal:controller.signal}).then(readResponse).then(value=>{setCapabilities(value);if(value.codex?.ready)setMode('codex');})
   .catch(()=>{if(!controller.signal.aborted)setCapabilities({codex:{ready:false,reason:'无法确认 Codex 精剪状态，请检查本地服务。'}});});
  return ()=>controller.abort();
 },[]);
 useEffect(()=>()=>{
  generation.current++;request.current?.abort();if(timer.current)clearTimeout(timer.current);
  if(jobId.current)void stopJob(jobId.current).catch(()=>{});
 },[]);
 const pollAudit=async(id:string,token:number,signal:AbortSignal)=>{
  try{
   const job:RetakeAnalysis=await readResponse(await fetch(`/api/retakes/${encodeURIComponent(id)}`,{signal}));
   if(token!==generation.current)return;setAudit(job.audit??null);
   if(job.audit&&['done','error','cancelled'].includes(job.audit.status)){jobId.current=null;setAuditing(false);return;}
   timer.current=setTimeout(()=>{void pollAudit(id,token,signal);},1200);
  }catch(e){if(token===generation.current&&!signal.aborted){jobId.current=null;setAuditing(false);setError(e instanceof Error?e.message:'声音审计未完成。');}}
 };
 const startAudit=async(job:RetakeAnalysis,result:Extract<RetakeResult,{ok:true}>)=>{
  const token=generation.current,signal=request.current?.signal;if(!signal)return;
  setAuditing(true);jobId.current=job.id;
  try{
   // Keep the POST receipt on close, then cancel the now-created exact audit.
   const response=await readResponse(await fetch(`/api/retakes/${encodeURIComponent(job.id)}/audit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectBefore:result.session.base,projectAfter:result.project})}));
   if(token!==generation.current){void stopJob(job.id).catch(()=>{});return;}
   if(response.jobId!==job.id)throw Error('声音审计返回了不匹配的分析编号。');
   await pollAudit(job.id,token,signal);
  }catch(e){if(token===generation.current&&!signal.aborted){jobId.current=null;setAuditing(false);setError(e instanceof Error?e.message:'未能启动声音审计；已应用取舍可撤销。');}}
 };
 const accept=(job:RetakeAnalysis)=>{
  const result=apply.current(job);
  if(!result.ok){setError(result.error);return;}
  session.current=result.session;setApplied(result.appliedIds);setApplicationWarnings(result.warnings??[]);
  const review=job.candidates.filter(candidate=>candidate.status==='review').length;
  setNotice(result.changed?`已应用 ${result.appliedIds.length} 处验证通过的取舍（语气词 ${job.counts?.fillersApproved??0} 处），${review} 条建议待复核（含同处不同识别）；可撤销一次还原。`:`未应用删除，${review} 条建议待复核；这不表示原片没有重录或语气词。`);
  if(job.features?.independentRecall)void startAudit(job,result);
 };
 const poll=async(id:string,token:number,signal:AbortSignal)=>{
  try{
   const job:RetakeAnalysis=await readResponse(await fetch(`/api/retakes/${encodeURIComponent(id)}`,{signal}));
   if(token!==generation.current)return;
   setAnalysis(job);
   if(job.status==='done'){jobId.current=null;setBusy(false);accept(job);return;}
   if(job.status==='error'||job.status==='cancelled'){jobId.current=null;setBusy(false);if(job.status==='error')setError(job.error??job.label??'分析未完成。');return;}
   timer.current=setTimeout(()=>{void poll(id,token,signal);},1200);
  }catch(e){if(token===generation.current&&!signal.aborted){setBusy(false);setError(e instanceof Error?e.message:'分析请求失败。');}}
 };
 const start=async()=>{
  request.current?.abort();if(timer.current)clearTimeout(timer.current);
  const controller=new AbortController(),token=++generation.current;request.current=controller;
  session.current=undefined;jobId.current=null;setBusy(true);setAuditing(false);setAudit(null);setError('');setNotice('');setSelected([]);setApplied([]);setApplicationWarnings([]);setAnalysis(null);onPausePreview();
  try{
   if(mode==='codex'&&!capabilities?.codex.ready)throw Error(capabilities?.codex.reason??'正在检查 Codex 精剪状态。');
   const body=retakeRequest(clips,{mode,allowCloudText:consent});
   // Let this small request return its job ID even if the dialog closes, so a
   // just-started background process can still be cancelled deterministically.
   const response=await readResponse(await fetch('/api/retakes/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
   if(token!==generation.current){if(typeof response.jobId==='string')void stopJob(response.jobId).catch(()=>{});return;}
   if(typeof response.jobId!=='string')throw Error('服务未返回分析任务编号。');
   jobId.current=response.jobId;await poll(response.jobId,token,controller.signal);
  }catch(e){if(token===generation.current&&!controller.signal.aborted){setBusy(false);setError(e instanceof Error?e.message:'无法启动分析。');}}
 };
 const cancel=async()=>{
  const id=jobId.current;jobId.current=null;generation.current++;request.current?.abort();if(timer.current)clearTimeout(timer.current);setBusy(false);setAuditing(false);
  try{if(id)await stopJob(id);setNotice(auditing?'已取消声音审计；已经应用的取舍仍保留，可撤销。':'已取消分析；尚未应用的取舍不会改变时间线。');}
  catch(e){setError(e instanceof Error?e.message:'取消请求失败。');}
 };
 const applySelected=()=>{
  if(!analysis||!selected.length||!session.current)return;
  const result=apply.current(analysis,{candidateIds:selected,allowReview:true,session:session.current});
  if(!result.ok){setError(result.error);return;}
  session.current=result.session;setApplied(result.appliedIds);setApplicationWarnings(result.warnings??[]);setSelected([]);setError('');
  setNotice('已应用所选取舍，可用编辑器撤销一次还原这一批。');
 };
 const card=(candidate:RetakeCandidate)=>{
  const done=applied.includes(candidate.id),canReview=candidate.status==='review';
  return <article key={candidate.id} className="border border-outline-variant/30 rounded-lg p-3 space-y-2">
   <div className="flex gap-2 items-start">{canReview&&!done&&<input type="checkbox" aria-label={`选择复核候选 ${candidate.id}`} checked={selected.includes(candidate.id)} disabled={busy||auditing||!session.current} onChange={e=>setSelected(ids=>e.target.checked?[...ids,candidate.id]:ids.filter(id=>id!==candidate.id))}/>}
    <strong className="text-sm">{done?(candidate.kind==='filler'?'已清理语气词':'已删除重复录制'):canReview?'待复核，当前仍保留':'验证通过的取舍'}</strong>
    <span className="text-xs opacity-70">{codexEvidence(candidate)?'本地识别 + Codex 语义判断':'本地识别与序列对齐'}</span></div>
   <p className="text-sm">{candidate.reason}</p>
   <div className="grid md:grid-cols-2 gap-3 text-sm">
    {[{label:candidate.kind==='filler'?'拟删除语气词':'拟删除录制',range:candidate.remove,parts:candidate.removeParts},...(candidate.retain?[{label:'保留录制',range:candidate.retain,parts:candidate.retainParts}]:[])].map(({label,range,parts})=><div key={label}>
     <button type="button" className="underline text-xs" disabled={busy} onClick={()=>{const clipId=(range as {clipId?:string}).clipId??candidate.clipId;onSeekSource(session.current?.retainedClipIds[clipId]??[clipId],range.startSec);}}>{label} · 原片 {seconds(range.startSec)}—{seconds(range.endSec)}</button>
     <p className="my-2 whitespace-pre-wrap">{range.text}</p>
     {parts&&parts.length>1&&<p className="text-xs opacity-70">跨 {parts.length} 个片段，按当前时间线中的保留范围比较。</p>}
     <SourceAudition src={candidate.src} startMs={range.startSec*1000} endMs={range.endSec*1000} onPlay={onPausePreview}/>
    </div>)}
   </div>
   <EvidenceDetails evidence={candidate.evidence}/>
  </article>;
 };
 return <section aria-label="口播精剪" className="p-4 space-y-3">
  <h2 className="font-bold">口播精剪</h2>
  <p className="text-sm opacity-80">{mode==='codex'?'整片检查重录、废弃起句和无意义语气词，独立重读并复查剪后漏删，再生成全片声音与剪口对照。只有原声和边界检查均通过才自动删除；整批可撤销。':'本地规则检查相邻重说与未完成起句；完整重复及不确定取舍保留待复核。此方式不包含 Codex 整片语义检查和语气词清理。整批可撤销。'}</p>
  <label className="block text-sm">分析方式 <select aria-label="口播精剪分析方式" className="bg-surface-container border border-outline-variant rounded px-2 py-1" value={mode} disabled={busy||auditing} onChange={e=>{setMode(e.target.value==='codex'?'codex':'local');setConsent(false);}}>
   <option value="local">本地规则（原有）</option><option value="codex" disabled={!capabilities?.codex.ready}>{capabilities?.codex.ready?'本地识别 + Codex':'本地识别 + Codex（验证中）'}</option>
  </select></label>
  {!capabilities?.codex.ready&&<p role="status" className="text-xs opacity-75">{capabilities?.codex.reason??'正在检查 Codex 精剪状态…'}</p>}
  {mode==='codex'&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy||auditing} onChange={e=>setConsent(e.target.checked)}/><span>允许将转写文字发送给 Codex<small className="block opacity-75">语音识别与边界复核在本机完成；Codex 判断取舍，不接收视频或音频。语义建议不会绕过本地安全检查。</small></span></label>}
  <div className="flex gap-2"><button type="button" className={button} disabled={busy||auditing||!clips.length||(mode==='codex'&&(!capabilities?.codex.ready||!consent))} onClick={()=>void start()}>{mode==='codex'?'本地识别并由 Codex 精剪':'本地识别并精剪'}</button>{(busy||auditing)&&<button type="button" className={button} onClick={()=>void cancel()}>取消</button>}</div>
  {busy&&<p role="status" className="text-sm">{analysis?.label??'正在准备本地识别…'} {typeof analysis?.progress==='number'?`${Math.round(Math.max(0,Math.min(1,analysis.progress))*100)}%`:''}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
  {analysis?.status==='done'&&analysis.fillerDiscovery&&<section aria-label="语气词补查" className="text-sm space-y-1"><p>语气词补查：发现 {analysis.fillerDiscovery.found} 条疑似观察 · 完成补观察 {analysis.fillerDiscovery.probed} 条；实际删除数量见应用结果。</p><details><summary>补查结果与保留原因</summary><ul>{analysis.fillerDiscovery.entries.map(entry=><li key={entry.id}>{(entry.startMs/1000).toFixed(2)} 秒 · {entry.word}：{entry.reason}</li>)}</ul></details></section>}
  {analysis?.warnings?.map((warning,i)=><p key={i} className="text-sm text-amber-300">{warning}</p>)}
  {applicationWarnings.map((warning,i)=><p key={`apply-${i}`} role="status" className="text-sm text-amber-300">{warning}</p>)}
  {auditing&&<p role="status" className="text-sm">{audit?.label??'正在自动生成整片声音与剪口对照…'} {Math.round((audit?.progress??0)*100)}%</p>}
  {audit?.status==='done'&&<section aria-label="整片声音检查" className="border rounded-lg p-3 space-y-2"><strong>本次自动精剪的整片声音检查</strong><p className="text-sm">{audit.signalStatus==='signal-preservation-verified-with-scope-limits'?'已核对的保留声音一致；低能量窗口和最终编码仍需复核。':audit.signalStatus==='passed'?'保留声音的数值检查通过。':audit.signalStatus==='failed'?'发现声音一致性问题，需要检查。':'部分声音数值尚未确认。'} 本次新增剪口 {audit.summary?.newAutomaticJoins??0} 处；全片（含原有剪口）突变提示 {audit.summary?.abruptJoinReviewFlags??0} 处 · 长气口提示 {audit.summary?.longPauseReviewFlags??0} 处 · 短静音片段 {audit.summary?.nearSilentShortFragments??0} 处</p><p className="text-xs opacity-75">数值检查与自然听感分别记录；仍保留待复核原声，不表示已经全片清净。</p><div className="flex gap-3 text-sm"><a className="underline" href={audit.indexUrl} target="_blank" rel="noreferrer">全片与逐剪口对照</a><a className="underline" href={audit.afterAudioUrl} target="_blank" rel="noreferrer">剪后完整声音</a><a className="underline" href={audit.reportUrl} target="_blank" rel="noreferrer">检查记录</a></div><details className="text-xs"><summary>检查范围与限制</summary>{audit.result?.warnings?.map((value,i)=><p key={i} className="mt-1 opacity-75">{value}</p>)}</details></section>}
  {audit?.status==='error'&&<p role="alert" className="text-sm text-red-400">声音审计未完成：{audit.error}。已应用取舍仍可撤销。</p>}
  {analysis?.status==='done'&&<><p className="text-xs opacity-70">已应用 {applied.length} 处 · 待复核 {analysis.candidates.filter(candidate=>candidate.status==='review'&&!applied.includes(candidate.id)).length} 条建议（含同处不同识别） · 安全检查未通过 {analysis.counts?.blocked??0} 处</p><p className="text-xs opacity-70">候选不等于错误：完整重复可能是强调，改词、数字和否定词需要对照原声。未发现候选不等于已经清除所有重录。</p>{analysis.candidates.map(card)}{!!analysis.blocked?.length&&<details className="text-xs"><summary>仍保留的候选及原因（{analysis.blocked.length} 处）</summary><ul className="list-disc pl-5 mt-2">{analysis.blocked.map((item,i)=><li key={i}>{item.reason}</li>)}</ul></details>}{selected.length>0&&<button type="button" className={button} disabled={busy||auditing||!session.current} onClick={applySelected}>删除所选录制（{selected.length} 处）</button>}</>}
 </section>;
}
