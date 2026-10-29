import {captionTextGroups} from './caption-lexical.mjs';
const clean=text=>text.replace(/[，。！？；：、,.!?;:]+$/u,'');
const units=s=>Array.from(s).reduce((n,c)=>n+(/[A-Za-z0-9]/.test(c)?.6:1),0);
// Keep lexical groups intact; move a final orphan group back with its neighbour.
export function bluePhraseLines(text){
 const groups=captionTextGroups(clean(text),['能不能','有没有','不代表','不等于','做完','停下来']),lines=[];let line=[];
 for(const group of groups){if(line.length&&units(line.join('')+group)>6){lines.push(line);line=[];}line.push(group);}if(line.length)lines.push(line);
 if(lines.length>1&&units(lines.at(-1).join(''))<3&&lines.at(-2).length>1)lines.at(-1).unshift(lines.at(-2).pop());
 return lines.map(line=>line.join(''));
}
export function blueTalkingTags(cue){
 const duration=cue.endMs-cue.startMs,sourceWords=JSON.parse(cue.signature??'[]');
 const tags=cue.items.map((item,index)=>{
  const lines=bluePhraseLines(item.text),right=cue.items.length>1&&index===1;
  const x=right?.68:(cue.leftPct??4)/100,y=(cue.topPct??10)/100+(index===2?.36:0),width=Math.min(.30,(cue.widthPct??28)/100);
  const allText=cue.items.map(i=>i.text).join('');let cursor=cue.items.slice(0,index).reduce((n,i)=>n+i.text.length,0),offset=0;
  const lineAtMs=lines.map(line=>{
   const preceding=allText.slice(0,cursor+offset).length;let n=0,at=item.atMs;
   for(const [text,start] of sourceWords){if(n+text.length>preceding){at=Math.max(item.atMs,start);break;}n+=text.length;}
   offset+=line.length;return Math.max(0,at-cue.startMs);
  });
  // Cap the entire multiline block before the subtitle zone. Same size function
  // as the approved renderer; no destructive shortening or invented word clocks.
  const scale=(cue.scale??1)*Math.min(1,.31/(Math.max(1,lines.length)*.16*1.12));
  return {id:cue.id+'-blue-'+index,text:lines.join('\n'),x,y,width,scale,atMs:item.atMs-cue.startMs,endMs:duration,lineAtMs,animation:{inMs:cue.entryMs??220,outMs:180},...(cue.items[index+1]?{contextAtMs:cue.items[index+1].atMs-cue.startMs}:{})};
 });return tags;
}
