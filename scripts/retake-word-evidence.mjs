import {groupTimedWords} from './codex-retake-benchmark.mjs';

// Keep model observations intact. An unresolved local group must not discard
// all other speech in a long source, nor disappear from semantic context.
export function prepareWordEvidence(raw){
 if(!Array.isArray(raw))throw Error('Missing raw word observations');
 try{return {words:groupTimedWords(raw),unresolved:[]};}catch{}
 const chunks=[];let current=[],end=-1;
 for(const word of raw){
  if(!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.startMs<0||word.endMs<word.startMs)throw Error('Invalid raw source clock');
  if(current.length&&word.startMs>end){chunks.push(current);current=[];end=-1;}
  current.push(word);end=Math.max(end,word.endMs);
 }
 if(current.length)chunks.push(current);
 const words=[],unresolved=[];
 for(const chunk of chunks){
  try{words.push(...groupTimedWords(chunk));}
  catch(error){unresolved.push({word:chunk.map(w=>w.word).join(''),startMs:Math.min(...chunk.map(w=>w.startMs)),endMs:Math.max(...chunk.map(w=>w.endMs)),memberIds:chunk.map(w=>w.id),reason:error.message,contextOnly:true});}
 }
 return {words:words.map((w,id)=>({...w,id})),unresolved};
}
