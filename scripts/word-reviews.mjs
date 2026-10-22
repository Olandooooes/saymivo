const normalized=text=>text.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'');
// Reuse explicit, source-bound project reviews; never edit a model's raw cache.
export function applyWordReviews(input,patches=[]){
 let words=input.map(w=>({...w}));const report=[];
 for(const patch of patches){
  const replacement=patch.replacementWords;
  if(!Number.isFinite(patch.windowStartMs)||!Number.isFinite(patch.windowEndMs)||patch.windowEndMs<=patch.windowStartMs||!Array.isArray(replacement)||!replacement.length||!replacement.every(w=>typeof w.word==='string'&&w.word&&Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&w.startMs>=0&&w.endMs>w.startMs)||replacement.some((w,i)=>i&&w.startMs<replacement[i-1].endMs)){
   report.push({id:patch.id,status:'skipped',reason:'invalid replacement'});continue;
  }
  const targets=[...(patch.acceptedText??[]),replacement.map(w=>w.word).join('')].map(normalized),max=Math.max(...targets.map(t=>t.length));
  const matches=[];
  for(let i=0;i<words.length;i++){
   if(words[i].startMs<patch.windowStartMs||words[i].endMs>patch.windowEndMs)continue;
   let text='';
   for(let j=i;j<words.length&&words[j].endMs<=patch.windowEndMs;j++){
    text+=normalized(words[j].word);if(text.length>max)break;
    if(targets.includes(text))matches.push({i,j});
   }
  }
  if(matches.length!==1){report.push({id:patch.id,status:'skipped',reason:matches.length?'ambiguous source span':'source text differs'});continue;}
  const {i,j}=matches[0],next=replacement.map(w=>({...w}));
  const left=Math.max(0,(words[i-1]?.endMs??0)-next[0].startMs),right=Math.max(0,next.at(-1).endMs-(words[j+1]?.startMs??Infinity));
  if(left>80||right>80){report.push({id:patch.id,status:'skipped',reason:'review conflicts with adjacent speech'});continue;}
  next[0].startMs+=left;next.at(-1).endMs-=right;
  if(next.some(w=>w.endMs<=w.startMs)){report.push({id:patch.id,status:'skipped',reason:'empty adjusted word'});continue;}
  const before=words.slice(i,j+1),unchanged=JSON.stringify(before.map(({word,startMs,endMs})=>({word,startMs,endMs})))===JSON.stringify(next);words.splice(i,j-i+1,...next);
  report.push({id:patch.id,status:unchanged?'unchanged':'applied',before,after:next,boundaryAdjustmentMs:{left,right},evidence:patch.evidence??[]});
 }
 return {words,report};
}
