const meaningful=char=>!/[\p{P}\p{Z}\s]/u.test(char);
// Keep surviving words anchored when proofreading spelling or punctuation.
// Newly inserted speech cannot acquire phonetic precision from text alone;
// attach it to an adjacent reviewed word instead of shifting every word.
export function editCaptionWords(words,text,startMs,endMs){
 const chars=Array.from(text),old=[];
 words.forEach((word,group)=>Array.from(word.text).forEach(char=>{if(meaningful(char))old.push({char:char.toLowerCase(),group});}));
 const next=chars.map((char,index)=>({char:char.toLowerCase(),index})).filter(x=>meaningful(x.char));
 if(!next.length||old.length*next.length>1000000)return [{text,startMs,endMs,accent:false}];
 const rows=Array.from({length:old.length+1},()=>new Uint16Array(next.length+1));
 for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--)rows[i][j]=old[i].char===next[j].char?1+rows[i+1][j+1]:Math.max(rows[i+1][j],rows[i][j+1]);
 const matched=new Map();let i=0,j=0;
 while(i<old.length&&j<next.length){if(old[i].char===next[j].char){matched.set(j,i);i++;j++;}else if(rows[i+1][j]>=rows[i][j+1])i++;else j++;}
 if(!matched.size)return [{text,startMs,endMs,accent:false}];
 const assigned=new Map();let previous=-1;
 for(j=0;j<next.length;j++){
  if(matched.has(j)){previous=matched.get(j);assigned.set(next[j].index,old[previous].group);continue;}
  let after=j+1;while(after<next.length&&!matched.has(after))after++;
  const following=matched.get(after)??old.length;
  const candidate=previous+1<following?previous+1:previous>=0?previous:following;
  assigned.set(next[j].index,old[Math.min(old.length-1,candidate)].group);
 }
 let group=assigned.get(next[0].index),out=[];
 chars.forEach((char,index)=>{
  group=assigned.get(index)??group;
  const last=out.at(-1);
  if(last?.group===group)last.text+=char;else out.push({...words[group],text:char,group});
 });
 return out.filter(w=>w.text.trim()).map(({group,...word})=>word);
}
