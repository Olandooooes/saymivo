import {createHash} from 'node:crypto';

export const RETAKE_ANALYZER_VERSION = 'source-sequence-v1';
export const normalizeRetakeText = text => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const terminal = /[。！？!?;；.]\s*$/u;
const unfinished = /(?:没有|什么|一个|就是|因为|所以|比如|但是|然后|以及|的|把|让|是|在|当|到)$/u;
const negation = text => normalizeRetakeText(text).match(/不是|不能|没有|不要|不会|不|没|无/g)?.join('|') ?? '';
const numbers = text => normalizeRetakeText(text).match(/[0-9]+|[一二三四五六七八九十百千万亿]+/g)?.join('|') ?? '';
const latin = text => String(text).toLowerCase().match(/[a-z]{2,}/g)?.join('|') ?? '';
const overlap = (a,b) => a.startSec < b.endSec - .001 && b.startSec < a.endSec - .001;
const shortHash = value => createHash('sha256').update(value).digest('hex').slice(0,16);

// A word's original clock is retained even when it contains several characters.
// Splitting the text for comparison never manufactures sub-word timestamps.
export function retakeUnits(words = []) {
  const out = [];
  for (const [index,word] of words.entries()) {
    const text = String(word.word ?? word.text ?? ''), chars = [...normalizeRetakeText(text)];
    const startSec = Number(word.startMs) / 1000, endSec = Number(word.endMs) / 1000;
    if (!chars.length || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec < startSec) continue;
    chars.forEach((value,i) => out.push({value,startSec,endSec,wordId:index,
      terminal:i===chars.length-1 && terminal.test(text), probability:word.probability}));
  }
  return out.sort((a,b)=>a.startSec-b.startSec || a.wordId-b.wordId);
}

export function sequenceAlignment(a,b) {
  a=[...a]; b=[...b];
  const rows=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=0;i<=a.length;i++) rows[i][0]=i;
  for(let j=0;j<=b.length;j++) rows[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  let i=a.length,j=b.length;const operations=[];
  while(i||j){
    if(i&&j&&rows[i][j]===rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){operations.push({kind:a[i-1]===b[j-1]?'equal':'replace',before:a[i-1],after:b[j-1]});i--;j--;}
    else if(i&&rows[i][j]===rows[i-1][j]+1){operations.push({kind:'delete',before:a[--i]});}
    else operations.push({kind:'insert',after:b[--j]});
  }
  return {distance:rows[a.length][b.length],similarity:1-rows[a.length][b.length]/Math.max(1,a.length,b.length),operations:operations.reverse()};
}

function clauseEnd(units,start,minimum,limit) {
  let end=Math.max(start+1,minimum);
  while(end<limit){
    if(end>=minimum && (units[end-1].terminal || units[end].startSec-units[end-1].endSec>.52)) break;
    if(end-start>=80) break;
    end++;
  }
  return end;
}
const span = units => ({startSec:units[0].startSec,endSec:units.at(-1).endSec,text:units.map(u=>u.value).join(''),
  wordIds:[...new Set(units.map(u=>u.wordId))]});

// Discovery is a local sequence comparison, NOT a semantic quality verdict.
// It also finds a restarted suffix inside an otherwise continuous sentence.
export function discoverRetakes(words,clip,{windowSec=28,maxCandidates=160}={}) {
  const u=retakeUnits(words).filter(t=>t.startSec>=clip.inSec-.001&&t.endSec<=clip.outSec+.001);
  const anchors=new Map(),found=[];
  for(let j=0;j+4<=u.length;j++){
    const key=u.slice(j,j+4).map(t=>t.value).join('');
    const previous=anchors.get(key)??[];
    for(const seed of previous.slice(-5)){
      if(j-seed<4 || u[j].startSec-u[seed].startSec>windowSec || u[j].startSec-u[seed+3].endSec<.2) continue;
      let a=seed,b=j;
      while(a>0&&b>0&&u[a-1].value===u[b-1].value&&u[a].startSec-u[a-1].endSec<.8&&u[b].startSec-u[b-1].endSec<.8&&b-a>4){a--;b--;}
      // A shared suffix inside an ASR token has no independent time boundary.
      // Do not turn its character index into a cut that removes unseen prefix.
      if((a>0&&u[a].wordId===u[a-1].wordId)||(b>0&&u[b].wordId===u[b-1].wordId))continue;
      let n=0;while(a+n<b&&b+n<u.length&&n<65&&u[a+n].value===u[b+n].value)n++;
      if(n<4)continue;
      const ae=clauseEnd(u,a,a+n,b),be=clauseEnd(u,b,b+n,u.length);
      const earlier=span(u.slice(a,ae)),later=span(u.slice(b,be));
      const bridge=u.slice(ae,b);
      // Word clocks can meet at a pause because ASR stretches the following
      // first token. Discovery may touch, but acoustic verification must later
      // find a separate safe entry before any automatic removal.
      if(earlier.endSec>later.startSec+.001 || later.endSec>clip.outSec+.001)continue;
      let aligned=sequenceAlignment(earlier.text,later.text);
      // A restarted take often continues beyond the failed phrase. Compare
      // aligned prefixes as well as whole clauses so a one-word correction is
      // still surfaced for review rather than hidden by the longer ending.
      for(let length=Math.max(4,earlier.text.length-2);length<=Math.min(later.text.length,earlier.text.length+4);length++){
        const partial=sequenceAlignment(earlier.text,later.text.slice(0,length));
        if(partial.similarity>aligned.similarity)aligned={...partial,comparedLaterCharacters:length};
      }
      const prefix=later.text.startsWith(earlier.text),exact=earlier.text===later.text;
      if(!prefix&&!exact&&aligned.similarity<.66)continue;
      const id='retake-'+shortHash([clip.id,clip.src,earlier.startSec,later.startSec,earlier.text,later.text].join(':'));
      found.push({id,src:clip.src,clipId:clip.id,remove:{...earlier,endSec:later.startSec},retain:later,
        earlier,interveningSpeech:bridge.length?span(bridge):null,
        similarity:aligned.similarity,matchedCharacters:n,prefix,exact,
        earlierComplete:u[ae-1].terminal,laterComplete:u[be-1].terminal ||
          (be<u.length&&u[be].startSec-u[be-1].endSec>=.52&&!unfinished.test(later.text)),
        changedProtected:numbers(earlier.text)!==numbers(later.text.slice(0,earlier.text.length)) ||
          negation(earlier.text)!==negation(later.text.slice(0,earlier.text.length)) ||
          latin(earlier.text)!==latin(later.text.slice(0,earlier.text.length)),
        evidence:[{kind:'sequence-alignment',similarity:aligned.similarity,matchedCharacters:n,
          earlierWordIds:earlier.wordIds,laterWordIds:later.wordIds,comparedLaterCharacters:aligned.comparedLaterCharacters??later.text.length,operations:aligned.operations}],
        status:'review',confidence:'review',score:Math.max(0,Math.min(1,aligned.similarity)),method:'local-sequence-alignment',
        reason:exact?'相邻完整重复可能是重录，也可能是刻意强调，需要复核':prefix?'后段覆盖了前段并继续讲述，待核对原声和剪口':'发现改词或近似重说，保留哪版需要复核'});
    }
    anchors.set(key,[...previous.filter(i=>u[j].startSec-u[i].startSec<=windowSec),j]);
  }
  // Prefer the longest aligned discovery at the same two source locations.
  const selected=[];
  for(const c of found.sort((a,b)=>b.matchedCharacters-a.matchedCharacters)){
    if(selected.some(p=>Math.abs(p.earlier.startSec-c.earlier.startSec)<.65&&Math.abs(p.retain.startSec-c.retain.startSec)<.65))continue;
    selected.push(c);if(selected.length>=maxCandidates)break;
  }
  return selected.sort((a,b)=>a.earlier.startSec-b.earlier.startSec);
}

function confirmationText(words,range) {
  return (words??[]).filter(w=>w.endMs/1000>range.startSec-.08&&w.startMs/1000<range.endSec+.08).map(w=>w.word??w.text??'').join('');
}

export function decideRetakes(candidates,{confirmations={},boundaries={},clip}={}) {
  const result=candidates.map(input=>{
    const c=structuredClone(input),confirm=confirmations[c.id],boundary=boundaries[c.id];
    const early=normalizeRetakeText(confirmationText(confirm?.earlier,c.earlier));
    const late=normalizeRetakeText(confirmationText(confirm?.later,c.retain));
    const firstStable=early.includes(c.earlier.text),laterStable=late.includes(c.retain.text);
    const stable=Boolean(confirm&&firstStable&&laterStable);
    c.evidence.push({kind:'independent-local-asr',confirmed:stable,earlierText:early,laterText:late,
      model:confirm?.model??null});
    if(boundary)c.evidence.push({kind:'acoustic-boundaries',...boundary});
    const unfinishedPrefix=c.prefix&&!c.exact&&!c.earlierComplete&&unfinished.test(c.earlier.text)&&
      c.retain.text.length-c.earlier.text.length>=2&&c.laterComplete;
    if(c.interveningSpeech){c.reason='两遍之间还有独立转写语音，不能将整段间隔自动删除';return c;}
    if(c.changedProtected){c.reason='数字、否定词或英文专名发生变化，不能自动判断哪一版正确';return c;}
    if(!stable){c.reason='独立窄窗识别未确认两遍原话，保留待复核';return c;}
    if(!boundary?.safe || !Number.isFinite(boundary.startSec)||!Number.isFinite(boundary.endSec)){
      c.reason='词界附近没有可验证的安全声学切缝，保留待复核';return c;
    }
    if(boundary.startSec<clip.inSec || boundary.endSec>clip.outSec || boundary.endSec<=boundary.startSec || boundary.endSec>=c.retain.endSec){
      c.reason='候选边界超出当前片段或会覆盖保留版本，保留待复核';return c;
    }
    c.remove.startSec=boundary.startSec;c.remove.endSec=boundary.endSec;
    // A recognizer may stretch a first token across the preceding long pause.
    // The retained evidence range follows the independently observed safe entry.
    c.retain.startSec=Math.max(c.retain.startSec,boundary.endSec);
    c.localVerificationComplete=true;
    if(unfinishedPrefix){
      c.status='approved';c.confidence='high';c.score=.96;
      c.reason='前段在未完成词组处停下，后段按相同顺序覆盖全部内容并完成句子；独立识别与声学剪口均确认';
    }
    return c;
  });
  return finalizeRetakes(result);
}

export function finalizeRetakes(result){
  result=structuredClone(result);
  // A→B→C chains must refer to C, never to a take another decision deletes.
  for(const c of result){
    const seen=new Set([c.id]);let winner=c.retain;
    for(let n=0;n<result.length;n++){
      const next=result.find(other=>!seen.has(other.id)&&other.clipId===c.clipId&&other.src===c.src&&
        other.status==='approved'&&!other.interveningSpeech&&!other.changedProtected&&
        other.evidence.some(e=>e.kind==='independent-local-asr'&&e.confirmed===true)&&
        other.evidence.some(e=>e.kind==='acoustic-boundaries'&&e.safe===true)&&overlap(other.remove,winner)&&
        other.retain.startSec>winner.startSec&&other.retain.text.startsWith(c.earlier.text));
      if(!next)break;seen.add(next.id);winner=next.retain;
    }
    if(winner!==c.retain){c.retain=winner;c.evidence.push({kind:'take-chain',winnerStartSec:winner.startSec,ids:[...seen]});}
  }
  // Conflicting approved cuts are deferred, rather than silently unioned.
  const approved=[];
  for(const c of result){
    if(c.status!=='approved')continue;
    if(approved.some(p=>overlap(p.remove,c.remove))||result.some(p=>p!==c&&p.status==='approved'&&overlap(p.remove,c.retain))){
      c.status='review';c.confidence='review';c.reason='多个取舍区间冲突，需逐项复核';
    }else approved.push(c);
  }
  return result;
}

// An optional semantic model can choose ONLY existing candidate IDs, never free
// timestamps. Protected-content changes and unsafe cuts remain review-only.
export function applySemanticChoices(candidates,choices=[]){
  const selected=new Map(choices.filter(c=>c?.candidateId&&c.action==='discard-earlier'&&c.confidence==='high').map(c=>[c.candidateId,c]));
  return finalizeRetakes(candidates.map(c=>{
    const choice=selected.get(c.id);if(!choice)return c;
    const verified=c.evidence.some(e=>e.kind==='independent-local-asr'&&e.confirmed);
    const safe=c.evidence.some(e=>e.kind==='acoustic-boundaries'&&e.safe);
    if(c.localVerificationComplete!==true||c.interveningSpeech||c.changedProtected||!verified||!safe)return {...c,evidence:[...c.evidence,{kind:'semantic-review',...choice}],reason:'语义模型给出建议，但中间语音/保护词/声学条件未满足，仍需复核'};
    return {...c,status:'approved',confidence:'high',score:.96,method:'gemini-semantic',reason:String(choice.reason??'显式选择的语义服务判断为重录，且本地证据与剪口已确认').slice(0,300),evidence:[...c.evidence,{kind:'semantic-review',...choice}]};
  }));
}
