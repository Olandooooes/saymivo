import {pinyin} from 'pinyin-pro';
// Conservative domain collocations. Context alone proposes; acoustic agreement approves.
export const contextTerms=[
 {term:'复现',aliases:['复线','复限'],context:/软件|代码|功能|应用|程序/,exclude:/铁路|线路|轨道/},
 {term:'实现',aliases:['时限'],context:/重写|写出|对应的|类似的|重新|功能的/,exclude:/截止|期限|办理|时间|小时|分钟|到期|限制/},
 {term:'剪贴板',aliases:['剪贴片','剪贴版'],context:/复制|粘贴|桌面|应用|操作|处理/},
 {term:'源代码',aliases:['原代码'],context:/编译|反编译|开发者|源文件|源码|没有.*(?:软件|里面)/,exclude:/原来的|修改前|修改后|旧版|新代码|改动|保留原/},
 {term:'全称是',aliases:['全征式','全称式'],context:/[A-Za-z]{2,}/},
];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function audioSupports(e,term,startMs,endMs){
 if(!Array.isArray(e.words))return false;
 const nearby=e.words.filter(w=>w.endMs>startMs-250&&w.startMs<endMs+250).map(w=>w.word).join('').replace(/\s/g,'');
 if(nearby.toLowerCase().includes(term.replace(/\s/g,'').toLowerCase()))return true;
 if(!/^[\u3400-\u9fff]{2,12}$/.test(term))return false;
 const sound=value=>pinyin(value,{toneType:'num',type:'array'}).map(s=>s.replace(/^(zh|ch)/,'zh')).join('|');
 const n=Array.from(term).length,letters=Array.from(nearby);
 return letters.some((_,i)=>i+n<=letters.length&&/^[\u3400-\u9fff]+$/.test(letters.slice(i,i+n).join(''))&&sound(letters.slice(i,i+n).join(''))===sound(term));
}
export function contextualProposals(groups,evidence=[]){
 const proposals=[];
 for(const g of groups.values())for(const entry of contextTerms)for(const alias of entry.aliases){
  for(const match of g.text.matchAll(new RegExp(escape(alias),'g'))){
   const at=Array.from(g.text.slice(0,match.index)).length,n=Array.from(alias).length;
   const context=g.units.slice(Math.max(0,at-25),at+n+25).map(u=>u.text).join('');
   if(!entry.context.test(context)||entry.exclude?.test(context))continue;
   const range=g.units.slice(at,at+n),startMs=range[0].original.startMs,endMs=range.at(-1).original.endMs;
   const proof=evidence.filter(e=>e.clipId===g.id&&e.startMs<=startMs&&e.endMs>=endMs&&audioSupports(e,entry.term,startMs,endMs)&&g.sourceSha256&&e.sourceSha256===g.sourceSha256);
   // Evidence is bound to the analyzed source and exact span by the orchestrator.
   const verified=proof.some(e=>e.verified===true);
   proposals.push({clipId:g.id,at,startMs,endMs,before:alias,after:entry.term,method:'local',confidence:verified?1:0,kind:'contextual-homophone',reason:verified?'领域搭配确定用字，局部原声重识别提供同音或限定近音支持':'上下文疑似近音错字，缺少原声确认，保留原文',evidence:proof.map(e=>({startMs:e.startMs,endMs:e.endMs,text:e.text,model:e.model}))});
  }
 }
 for(const g of groups.values()){
  const names=[...g.text.matchAll(/(?<![A-Za-z])[A-Z]{2,8}(?![A-Za-z])/g)],counts=new Map();
  for(const m of names)counts.set(m[0],(counts.get(m[0])??0)+1);
  for(const m of names){
   const choices=[...counts].filter(([term,count])=>count>=2&&term.length===m[0].length+1&&Array.from(term).some((_,i)=>term.slice(0,i)+term.slice(i+1)===m[0])).map(([term])=>term);
   if(choices.length!==1)continue;
   const at=Array.from(g.text.slice(0,m.index)).length,range=g.units.slice(at,at+m[0].length),startMs=range[0].original.startMs,endMs=range.at(-1).original.endMs;
   const proof=evidence.filter(e=>e.clipId===g.id&&g.sourceSha256&&e.sourceSha256===g.sourceSha256&&e.verified===true&&audioSupports(e,choices[0],startMs,endMs));
   proposals.push({clipId:g.id,at,startMs,endMs,before:m[0],after:choices[0],method:'local',confidence:proof.length?1:0,kind:'acronym-consistency',reason:proof.length?'全文反复出现的专名与局部原声一致':'疑似专名漏字，缺少原声确认，保留原文',evidence:proof.map(e=>({startMs:e.startMs,endMs:e.endMs,text:e.text,model:e.model}))});
  }
 }
 for(const g of groups.values()){
  // Style only what is actually transcribed after an explicit full-name introduction.
  for(const match of g.text.matchAll(/(?:全称(?:是|为)?|全征式|英文名(?:是|为)?)[\s，,:：]*([A-Za-z][A-Za-z ]{3,70})/g)){
   const before=match[1].trim(),after=before.replace(/\b[a-z]+\b/g,word=>word[0].toUpperCase()+word.slice(1));
   if(before===after)continue;
   const prefix=match.index+match[0].indexOf(match[1]),at=Array.from(g.text.slice(0,prefix)).length;
   const range=g.units.slice(at,at+Array.from(before).length);
   if(!range.length||range.at(-1).original.endMs-range[0].original.startMs>12000)continue;
   proposals.push({clipId:g.id,at,before,after,method:'local',confidence:1,kind:'full-name-case',reason:'仅统一已转写英文全称的大小写，不扩写缩写或猜测拼写'});
  }
 }
 return proposals;
}
