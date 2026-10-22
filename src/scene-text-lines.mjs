// Keep the saved wording intact while choosing display-only word boundaries.
const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});
export const textUnits=text=>Array.from(text).reduce((n,c)=>n+(/[\x00-\x7f]/.test(c)?.56:1),0);
export function sceneTextLines(text,maxUnits=8,protectedPhrases=[]){
 return String(text??'').split('\n').flatMap(paragraph=>{
  if(!paragraph)return [''];
  const forbidden=new Set();
  for(const phrase of protectedPhrases.filter(Boolean)){
   let at=paragraph.indexOf(phrase);
   while(at>=0){for(let i=at+1;i<at+phrase.length;i++)forbidden.add(i);at=paragraph.indexOf(phrase,at+phrase.length);}
  }
  const boundaries=[...segmenter.segment(paragraph)].map(s=>s.index).filter(i=>i>0&&!forbidden.has(i));
  const pieces=[];let offset=0;
  for(const end of [...boundaries,paragraph.length]){const part=paragraph.slice(offset,end);offset=end;if(/^[，。！？、；：,.!?;:）】》…]+$/u.test(part)&&pieces.length)pieces[pieces.length-1]+=part;else pieces.push(part);}
  const width=pieces.map(textUnits),total=width.reduce((a,b)=>a+b,0),count=Math.max(1,Math.ceil(total/maxUnits));let target=total/count;
  const cache=new Map();
  const solve=(start,left)=>{
   const key=start+':'+left;if(cache.has(key))return cache.get(key);
   if(start===pieces.length)return left===0?{cost:0,lines:[]}:null;
   if(left<=0)return null;
   let best=null,units=0;
   for(let end=start;end<pieces.length;end++){
    units+=width[end];if(units>maxUnits&&end>start)break;
    if(pieces.length-end-1<left-1)break;
    const rest=solve(end+1,left-1);if(!rest)continue;
    const line=pieces.slice(start,end+1).join('');
    const dangling=left>1&&/(?:把|让|的|和|与|有|再|有没有|能不能)$/.test(line)?14:0;
    const cost=rest.cost+(units-target)**2+dangling;
    if(!best||cost<best.cost)best={cost,lines:[line,...rest.lines]};
   }
   cache.set(key,best);return best;
  };
  // A long foreign word can exceed the target; keep it whole for font fitting.
  for(let rows=count;rows<=pieces.length;rows++){target=total/rows;cache.clear();const fit=solve(0,rows);if(fit)return fit.lines;}
  return pieces;
 });
}
