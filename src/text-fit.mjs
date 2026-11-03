const graphemes=new Intl.Segmenter('zh-CN',{granularity:'grapheme'});
// measure(text,fontSize) must use the loaded font used by the renderer. No
// character-count estimate or destructive text shortening is permitted here.
export function fitMeasuredText(text,{width,height,minFont=32,maxFont=96,lineHeight=1.18,measure,protectedPhrases=[]}){
 text=String(text??'');
 if(![width,height,minFont,maxFont,lineHeight].every(v=>Number.isFinite(v)&&v>0)||typeof measure!=='function')throw Error('文字测量参数无效');
 const layout=size=>{
  const lines=[];
  for(const paragraph of text.split('\n')){
   const pieces=[...graphemes.segment(paragraph)],units=[];
   for(let i=0;i<pieces.length;i++){
    const phrase=protectedPhrases.filter(Boolean).sort((a,b)=>b.length-a.length).find(p=>paragraph.startsWith(p,pieces[i].index));
    if(phrase){units.push(phrase);const end=pieces[i].index+phrase.length;while(i+1<pieces.length&&pieces[i+1].index<end)i++;}else units.push(pieces[i].segment);
   }
   let line='';for(const segment of units){
    if(line&&measure(line+segment,size).width>width){lines.push(line);line=segment;}else line+=segment;
   }lines.push(line);
  }
  const metrics=lines.map(line=>measure(line||'国Ag',size));
  const rowHeight=Math.max(size*lineHeight,...metrics.map(m=>(m.ascent??size*.8)+(m.descent??size*.2)));
  return {fontSize:size,rowHeight,lines,height:lines.length*rowHeight,width:Math.max(0,...metrics.map(m=>m.width))};
 };
 let low=Math.min(minFont,maxFont),high=Math.max(minFont,maxFont),best=layout(low);
 if(best.height<=height&&best.width<=width){for(let i=0;i<12;i++){const size=(low+high)/2,next=layout(size);if(next.height<=height&&next.width<=width){best=next;low=size;}else high=size;}}
 const perPage=Math.max(1,Math.floor(height/best.rowHeight)),pages=[];
 for(let i=0;i<best.lines.length;i+=perPage)pages.push(best.lines.slice(i,i+perPage));
 return {...best,pages,fits:best.height<=height&&best.width<=width,unplaceable:best.width>width||best.rowHeight>height};
}
