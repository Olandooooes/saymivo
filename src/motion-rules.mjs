export const captionText=c=>c.words.map(w=>w.text).join('').trim();
export function suggestMotion(text){
 if(/以前|现在|相比|对比|区别|而不是|但是|反而/.test(text))return 'compare';
 if(/步骤|第一|第二|第三|首先|其次|最后|分为|分成|三点|两点/.test(text))return 'steps';
 if(/\d+(?:\.\d+)?\s*(?:%|倍|万|亿|元|分钟|秒|个)/.test(text))return 'number';
 if(/[A-Za-z][A-Za-z0-9]{2,}/.test(text)&&/叫|称|介绍|工具|岗位|概念/.test(text))return 'card';
 if(/关键|重点|一定|记住|核心|注意|最重要|结论|千万|究竟|是什么/.test(text))return 'emphasis';
 return 'none';
}
export function planMotions(caps,clips,strength,overrides){
 const last=new Map();
 const captions=caps.map(c=>{let kind=overrides?.[c.id]??suggestMotion(captionText(c));const id=c.clipId??'absolute';if(c.startMs-(last.get(id)??-10000)<2200)kind='none';if(kind!=='none')last.set(id,c.startMs);return {...c,motion:kind==='none'?undefined:{kind,title:captionText(c).slice(0,32),zoom:1+strength*.0015}};});
 return {captions,clips};
}
