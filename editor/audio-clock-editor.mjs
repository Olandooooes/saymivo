import {audioClockEvidenceIssues,audioClockVideoCandidates} from '../src/audio-clock-integration.mjs';
export async function fetchVideoAudioEvidence(state,takeId,src,startMs,endMs,{fetcher=fetch,signal,bins=256}={}){
 if(!audioClockVideoCandidates(state).some(a=>a.src===src))throw Error('请选择本项目已导入的实际视频');
 const query=new URLSearchParams({src,startMs:String(startMs),endMs:String(endMs),bins:String(bins)}),response=await fetcher('/api/dynamic-audio/materialize?'+query,{method:'POST',signal,cache:'no-store'}),value=await response.json();if(!response.ok)throw Error(value.error??'实际音轨分析失败');
 const result={takeId,...value},take={id:takeId,source:{src,sha256:value.sourceIdentity?.sha256,analysisSha256:value.analysis?.analysisSha256},startMs:value.analysis?.range?.startMs,endMs:value.analysis?.range?.endMs},issues=audioClockEvidenceIssues(state,{takes:[take]},[result]);if(issues.length)throw Error(issues.join('；'));signal?.throwIfAborted();return result;
}
export function sourceWordTrackFromProject(state,take){
 const found=[],captions=[];
 for(const caption of state.captions??[]){const clip=state.clips?.find(c=>c.id===caption.clipId);if(!clip||clip.src!==take.source?.src||caption.timingScope==='cue'||caption.audioClock?.sourceSha256!==take.source.sha256||caption.audioClock?.timestampBasis!=='source-video-presentation-ms')continue;
  for(const [index,word] of (caption.words??[]).entries())if(word.startMs>=take.startMs&&word.endMs<=take.endMs&&word.startMs>=clip.inSec*1000&&word.endMs<=clip.outSec*1000){found.push({...word,id:caption.id+':'+index});captions.push(caption.id);}
 }
 found.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);const words=[],seen=new Set();let text='',end=take.startMs;
 for(const word of found){const key=JSON.stringify([word.startMs,word.endMs,word.text]);if(seen.has(key))continue;seen.add(key);if(!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.startMs<end||word.endMs<=word.startMs||typeof word.text!=='string'||!word.text.trim())throw Error('已有词时间存在冲突，不能自动修补；请先校对或关闭词游标');
  if(/[A-Za-z0-9]$/.test(text)&&/^[A-Za-z0-9]/.test(word.text))text+=' ';
  const startUtf16=text.length;text+=word.text;words.push({id:word.id,text:word.text,startUtf16,endUtf16:text.length,startMs:word.startMs,endMs:word.endMs});end=word.endMs;
 }
 if(!words.length)throw Error('本窗没有同源SHA、source-zero且仍保留的词时间；可保留纯波形比较，不生成ASR');
 return {src:take.source.src,sha256:take.source.sha256,clock:'source-zero-ms',provenance:'用户明确采用本项目已有source-zero词时间；未重新识别或评估准确率。字幕：'+[...new Set(captions)].join('、'),text,words};
}
export function arrangeAudioClockTakes(config){
 if(!['A-then-B','B-then-A'].includes(config.order)||!Number.isFinite(config.comparisonWindow?.atMs))throw Error('请先明确播放顺序和比较开始秒');
 const ids=config.order==='A-then-B'?['A','B']:['B','A'],next=structuredClone(config);let at=next.comparisonWindow.atMs;
 for(const id of ids){const take=next.takes.find(t=>t.id===id);if(!take?.source?.analysisSha256||![take.startMs,take.endMs].every(Number.isFinite)||take.endMs<=take.startMs)throw Error('请先分析A、B两段实际音轨');take.playAtMs=at;at+=take.endMs-take.startMs;}
 next.comparisonWindow.endMs=at;next.timeScaleMs=Math.max(...next.takes.map(t=>t.endMs-t.startMs));return next;
}
