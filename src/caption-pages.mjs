// Repair short Chinese page tails without rewriting any recognized word.
const text=page=>page.words.map(w=>w.text).join('');
const width=text=>Array.from(text).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.55:/[\s，。！？,.!?]/.test(c)?.35:1),0);
const pronoun='(?:我们|你们|他们|她们|它们|我|你|他|她|它)';
// Plain 你能/我能 may introduce a relative clause (一份你能检查的结果).
const newSubject=/(?:它们|他们|她们|它|他|她)(?:就)?(?:可以|能够|能|会|需要|到底|究竟)|(?:我们|你们|我|你)(?:就|到底|究竟)(?:可以|能够|能|会|需要)?/g;
const personalTurn=new RegExp(pronoun+'(?:更|最)?(?:关心|在意|看重)的是','g');
const handedBack=new RegExp('再(?:让|由)'+pronoun,'g');
const errorAfterReliability=/(?:可靠|准确|正确)(?=(?:找错|理解错))/g;
const semanticTail=(head,tail)=>new RegExp('^(?:'+handedBack.source+'|'+personalTurn.source+'|'+newSubject.source+')').test(tail)||/(?:可靠|准确|正确)$/.test(head)&&/^(?:找错|理解错)/.test(tail);
export function mergeChineseCaptionTails(pages){
 const out=[];
 for(const page of pages){
  const previous=out.at(-1),tail=text(page),head=previous?text(previous):'';
  const compatible=previous&&page.clipId===previous.clipId&&page.topPct===previous.topPct&&page.scale===previous.scale&&!previous.motion&&!page.motion;
  if(compatible&&!semanticTail(head,tail)&&!/^第[一二三四五六七八九十]+[，,、：:]?$/.test(tail)&&/[\u3400-\u9fff]/.test(head+tail)&&!/[。！？.!?，,；;：:]$/.test(head)&&width(tail)<=4&&width(head+tail)<=24&&page.startMs>=previous.endMs&&page.startMs-previous.endMs<=200&&page.endMs-previous.startMs<=6000){
   out[out.length-1]={...previous,endMs:page.endMs,words:[...previous.words,...page.words]};
  }else out.push({...page,words:[...page.words]});
 }
 return out;
}

// Choose pages at lexical/discourse boundaries while retaining original word objects.
// The segmenter informs layout only; it never rewrites ASR text or word timings.
export function readableCaptionWordGroups(words,{maxWidth=15,gapMs=400,protectedPhrases=['竞品分析','整理表格']}={}){
 const runs=[];let run=[];
 const flush=()=>{if(run.length)runs.push(run);run=[];};
 for(const [index,word] of words.entries()){
  if(run.length&&word.startMs-run.at(-1).endMs>gapMs)flush();
  run.push(word);if(/[。！？?!，,]$/.test(word.text)||(/^第[一二三四五六七八九十]+[，,、：:]?$/.test(word.text)&&(words[index+1]?.startMs??Infinity)-word.endMs>=100))flush();
 }flush();
 const pages=[];
 for(const words of runs){
  const value=words.map(w=>w.text).join('');
  if(/[？?]$/.test(value)&&width(value)<=20&&words.at(-1).endMs-words[0].startMs<=6000){pages.push(words.slice());continue;}
  let offset=0;
  const offsets=words.map(w=>{const start=offset;offset+=w.text.length;return start;});offsets.push(offset);
  const lexical=new Set([0,value.length]);
  for(const part of new Intl.Segmenter('zh',{granularity:'word'}).segment(value))lexical.add(part.index);
  const discourse=new Set(),clauseTurns=new Set();const protectedSpans=[];
  for(const match of value.matchAll(/关键的变化|举个例子|你说|如果|接下来|但这里|所以我|我希望|而具备|这也是/g)){
   discourse.add(match.index);protectedSpans.push([match.index,match.index+match[0].length]);
  }
  for(const match of value.matchAll(/不代表|也就是|走向|转向/g))protectedSpans.push([match.index,match.index+match[0].length]);
  for(const pattern of [newSubject,personalTurn,handedBack])for(const match of value.matchAll(pattern)){
   discourse.add(match.index);clauseTurns.add(match.index);protectedSpans.push([match.index,match.index+match[0].length]);
  }
  for(const match of value.matchAll(new RegExp('(?:帮|替|让)'+pronoun,'g')))protectedSpans.push([match.index,match.index+match[0].length]);
  for(const match of value.matchAll(errorAfterReliability)){const at=match.index+match[0].length;discourse.add(at);clauseTurns.add(at);}
  for(const phrase of protectedPhrases){
   if(typeof phrase!=='string'||!phrase)continue;
   let at=value.indexOf(phrase);while(at>=0){protectedSpans.push([at,at+phrase.length]);at=value.indexOf(phrase,at+1);}
  }
  for(const match of value.matchAll(/第[一二三四五六七八九十]+(?=[，,、：:]|$)/g))discourse.add(match.index);
  // Keep a bounded 从…到… comparison together through its following noun phrase.
  // A recognized subject/turn supplies the right edge; punctuation already ends runs.
  for(const match of value.matchAll(/从[^，。！？!?；;]{1,12}?到/g)){
   const toEnd=match.index+match[0].length;
   const nextTurn=[...discourse].filter(at=>at>=toEnd).sort((a,b)=>a-b)[0]??value.length;
   const rightEnd=nextTurn-toEnd<=12?nextTurn:Math.min(value.length,toEnd+2);
   protectedSpans.push([match.index,rightEnd]);
  }
  const safe=i=>lexical.has(offsets[i])&&!/(?:不代表|也就是|就是|走向|转向|从|让|把|给|的)$/.test(value.slice(0,offsets[i]))&&!protectedSpans.some(([a,b])=>offsets[i]>a&&offsets[i]<b);
  let begin=0;
  while(begin<words.length){
   let limit=begin+1;
   while(limit<words.length&&width(value.slice(offsets[begin],offsets[limit+1]))<=maxWidth)limit++;
   let end=limit;
   // Explicit topic turns start a fresh page once the previous phrase is readable.
   const topic=Array.from({length:limit-begin},(_,i)=>begin+i+1).find(i=>discourse.has(offsets[i])&&(clauseTurns.has(offsets[i])||width(value.slice(offsets[begin],offsets[i]))>=4));
   if(topic)end=topic;
   else if(limit<words.length){
    const candidates=Array.from({length:limit-begin},(_,i)=>limit-i).filter(i=>safe(i));
    if(candidates.length)end=candidates[0];
    else {const next=Array.from({length:words.length-limit},(_,i)=>limit+i+1).find(i=>safe(i));if(next)end=next;}
   }
   pages.push(words.slice(begin,end));begin=end;
  }
 }
 return pages;
}
