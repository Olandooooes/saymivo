import {captionLexicalSpans} from './caption-lexical.mjs';
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
  const discourse=new Set(),clauseTurns=new Set();const protectedSpans=captionLexicalSpans(value,protectedPhrases);
  for(const match of value.matchAll(/关键的变化|举个例子|你说|如果|接下来|但这里|所以我|我希望|而具备|这也是|但是|不过|而是|虽然|因为|所以|然后|先说|平时|通常|说到这里|到时候|与此同时|另一方面|首先|其次|最后/g)){
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
  for(const match of value.matchAll(/(?:我|我们|你|你们)(?=看|觉得|认为|发现|希望|想|说)|觉得|认为|发现|而(?=[A-Za-z它我你这])|[A-Za-z][A-Za-z0-9]*(?=再|继续)/g)){discourse.add(match.index);protectedSpans.push([match.index,match.index+match[0].length]);}
  for(const match of value.matchAll(/第[一二三四五六七八九十]+(?=[，,、：:]|$)/g))discourse.add(match.index);
  // Keep a bounded 从…到… comparison together through its following noun phrase.
  // A recognized subject/turn supplies the right edge; punctuation already ends runs.
  for(const match of value.matchAll(/从[^，。！？!?；;]{1,12}?到/g)){
   const toEnd=match.index+match[0].length;
   const nextTurn=[...discourse].filter(at=>at>=toEnd).sort((a,b)=>a-b)[0]??value.length;
   const rightEnd=nextTurn-toEnd<=12?nextTurn:Math.min(value.length,toEnd+2);
   protectedSpans.push([match.index,rightEnd]);
  }
  for(const match of value.matchAll(/[\p{Script=Latin}0-9]+(?:[._’'-][\p{Script=Latin}0-9]+)*/gu))protectedSpans.push([match.index,match.index+match[0].length]);
  const safe=i=>lexical.has(offsets[i])&&!/(?:不代表|也就是|就是|走向|转向|从|让|把|给|以及|而且|但是|但|因为|所以|虽然|如果|可以|能够|需要|想要|正在|这些|这个|那些|那个|某个|每个|一些|平时|通常|现在|接下来|然后|而|再)$/.test(value.slice(0,offsets[i]))&&(!/的$/.test(value.slice(0,offsets[i]))||/(?:怎么|如何)[^，。！？]{1,8}的$/.test(value.slice(0,offsets[i])))&&!/(?:平时|通常|现在|接下来|然后|所以|但是|而|那|如果)(?:我们|你们|他们|它们|我|你|他|它)$/.test(value.slice(0,offsets[i]))&&!protectedSpans.some(([a,b])=>offsets[i]>a&&offsets[i]<b);
  const runStart=pages.length;
  let begin=0;
  while(begin<words.length){
   let limit=begin+1;
   while(limit<words.length&&width(value.slice(offsets[begin],offsets[limit+1]))<=maxWidth)limit++;
   let end=limit;
   // Explicit topic turns start a fresh page once the previous phrase is readable.
   const topic=Array.from({length:words.length-begin},(_,i)=>begin+i+1).find(i=>discourse.has(offsets[i])&&safe(i)&&width(value.slice(offsets[begin],offsets[i]))>=4&&width(value.slice(offsets[begin],offsets[i]))<=maxWidth+4&&words[i-1].endMs-words[begin].startMs<=6000);
   if(topic&&safe(topic))end=topic;
   else if(limit<words.length){
    const candidates=Array.from({length:limit-begin},(_,i)=>limit-i).filter(i=>safe(i));
    if(candidates.length)end=candidates[0];
    else {const next=Array.from({length:words.length-limit},(_,i)=>limit+i+1).find(i=>safe(i));end=next??words.length;}
   }
   pages.push(words.slice(begin,end));begin=end;
  }
  if(pages.length-runStart>1){
   const tail=pages.at(-1),head=pages.at(-2),tailText=tail.map(w=>w.text).join(''),headText=head.map(w=>w.text).join('');
   if(width(tailText)<4&&width(headText+tailText)<=maxWidth+4&&tail.at(-1).endMs-head[0].startMs<=6000&&!/^第[一二三四五六七八九十]+[，,、：:]?$/.test(tailText)&&!semanticTail(headText,tailText))pages.splice(-2,2,[...head,...tail]);
  }
 }
 return pages;
}
