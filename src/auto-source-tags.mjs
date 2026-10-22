// Source-bound contrast labels: no paraphrasing or guessed word timings.
export function sourceContrastTags(scene,words=[]){
 const selected=words.filter(w=>w.startMs>=scene.startMs&&w.endMs<=scene.endMs).sort((a,b)=>a.startMs-b.startMs);
 let text='';const anchors=[];
 for(const word of selected)for(const char of word.text.split('')){text+=char;anchors.push(word);}
 const matches=[...text.matchAll(/从([^，。！？?!但]{2,12}?)(?:走向|转向)([^，。！？?!但]{2,12})/g)];
 if(matches.length!==1)return [];
 const match=matches[0],first=match.index+1,second=match.index+match[0].length-match[2].length;
 // End the emphasis at the next topic/contrast word, without lingering on risks.
 const last=anchors[match.index+match[0].length-1];
 const endMs=Math.min(scene.endMs-scene.startMs,last.endMs-scene.startMs+450);
 return [first,second].map((offset,i)=>({id:`${scene.id}-contrast-${i+1}`,text:match[i+1],x:.035,y:.12+i*.12,scale:.85,
  atMs:Math.max(0,anchors[offset].startMs-scene.startMs),endMs}));
}

export function sourceManualTaskTags(scene,words=[]){
 const selected=words.filter(w=>w.startMs>=scene.startMs&&w.endMs<=scene.endMs).sort((a,b)=>a.startMs-b.startMs);
 let text='';const anchors=[];for(const word of selected)for(const char of word.text.split('')){text+=char;anchors.push(word);}
 if(!/(?:还是得|仍然要|还需要|还得).{0,4}(?:你|自己)/.test(text))return [];
 const actions=[...text.matchAll(/找资料|搜索资料|核对信息|整理表格|打开网页|提取信息/g)];
 if(actions.length!==3||new Set(actions.map(m=>m[0])).size!==3||new Set(actions.map(m=>anchors[m.index].startMs)).size!==3)return [];
 return actions.map((match,i)=>({id:`${scene.id}-manual-task-${i+1}`,text:match[0],x:.035,y:.12+i*.12,scale:.85,
  atMs:Math.max(0,anchors[match.index].startMs-scene.startMs),endMs:scene.endMs-scene.startMs}));
}

// Short spoken phrases become editable emphasis; timing always comes from words.
export function sourceEmphasisTags(scene,words=[]){
 const selected=words.filter(w=>w.startMs>=scene.startMs&&w.endMs<=scene.endMs&&w.endMs>w.startMs).sort((a,b)=>a.startMs-b.startMs);
 let text='';const anchors=[];for(const word of selected)for(const char of word.text.split('')){text+=char;anchors.push(word);}
 const phrases=[...text.matchAll(/竞品分析|分析框架|差在哪里|能自己执行|每一步都可靠|找错资料|理解错要求/g)];
 // Conservative topic-independent fallback: only explicit, delimited naming.
 // Do not turn arbitrary sentence fragments or negated names into assertions.
 if(!phrases.length){
  const naming=/(?:叫做|叫作|称为|关键词是)[：:\s]*([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff ·-]{1,11})(?=[，。！？；：,.!?;:]|$)/g;
  for(const m of text.matchAll(naming)){
   if(/(?:不|没|非|不能|不应|不要|没有|不再|不会|不是|别)(?:被)?$/.test(text.slice(Math.max(0,m.index-4),m.index)))continue;
   const term=m[1].trim(),index=m.index+m[0].indexOf(m[1]);
   if(!term||/^(?:一个|一种|这个|那个|什么)/.test(term))continue;
   const match=[term];match.index=index;phrases.push(match);
   if(phrases.length===2)break;
  }
 }
 // Distinctive mixed-case identifiers can be emphasized verbatim even when
 // ASR missed the preceding naming verb. Never repair the recognized spelling.
 if(!phrases.length){
  let offset=0;
  for(const word of selected){
   const token=word.text.trim().replace(/[，。！？?!；;,.]+$/,'');
   if(/^[A-Za-z][A-Za-z0-9]{5,23}$/.test(token)&&/[a-z]/.test(token)&&(token.match(/[A-Z]/g)?.length??0)>=3){
    const match=[token];match.index=offset+word.text.indexOf(token);phrases.push(match);
    if(phrases.length===2)break;
   }
   offset+=word.text.length;
  }
 }
 if(!phrases.length){
  for(const m of text.matchAll(/被(?:称|誉|译)为((?:当代|现代|新一代)的[\u4e00-\u9fff]{2,8}?)(?=那么|[，。！？?!；;]|$)/g)){
   if(/(?:不|没|未|不能|不会|没有)$/.test(text.slice(Math.max(0,m.index-4),m.index)))continue;
   const match=[m[1]];match.index=m.index+m[0].indexOf(m[1]);phrases.push(match);
  }
  for(const m of text.matchAll(/究竟是什么(?:呢)?(?=[，。！？?!；;]|$)/g))phrases.push(m);
  phrases.sort((a,b)=>a.index-b.index);
 }
 const unique=phrases.filter((m,i)=>phrases.findIndex(n=>n[0]===m[0])===i);
 return unique.map((m,i)=>{
  const atMs=anchors[m.index].startMs-scene.startMs;
  const next=unique[i+1],endMs=Math.min(scene.endMs-scene.startMs,next?anchors[next.index].startMs-scene.startMs:atMs+3500);
  return {id:`${scene.id}-emphasis-${i+1}`,text:m[0],x:.04,y:.13,scale:1,atMs,endMs};
 }).filter(t=>t.endMs-t.atMs>=300);
}
