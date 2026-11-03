import {subtitleTermSpans} from './subtitle-terms.mjs';
// Small general collocation supplement for ICU ambiguities, not a transcript patch list.
const wordSegmenter=new Intl.Segmenter('zh',{granularity:'word'});
export const captionPhrases=['调用','源代码','剪贴板','人工智能','应用程序','操作系统','机器学习','专有名词','竞品分析','整理表格','也就是','不代表','走向','转向'];
export function captionLexicalSpans(value,phrases=[]){
 const spans=subtitleTermSpans(value);
 for(const part of wordSegmenter.segment(value))if(part.isWordLike)spans.push([part.index,part.index+part.segment.length]);
 for(const match of value.matchAll(/[\p{Script=Latin}0-9]+(?:[._’'-][\p{Script=Latin}0-9]+)*/gu))spans.push([match.index,match.index+match[0].length]);
 for(const phrase of [...captionPhrases,...phrases]){
  if(typeof phrase!=='string'||!phrase)continue;
  let at=value.indexOf(phrase);while(at>=0){spans.push([at,at+phrase.length]);at=value.indexOf(phrase,at+1);}
 }
 return spans;
}
export function captionLayoutSpans(value,phrases=[]){
 const spans=captionLexicalSpans(value,phrases);
 // Keep grammatical particles and productive person suffixes with their head.
 for(const part of wordSegmenter.segment(value)){
  if(!/^[的地得者]$/.test(part.segment)||part.index===0)continue;
  const heads=spans.filter(([a,b])=>b===part.index&&a<b);
  if(heads.length)spans.push([Math.min(...heads.map(([a])=>a)),part.index+part.segment.length]);
 }
 return spans;
}
export function captionTextGroups(value,phrases=[]){
 const spans=captionLayoutSpans(value,phrases),groups=[];let offset=0;
 for(const char of Array.from(value)){
  if(groups.length&&(spans.some(([a,b])=>offset>a&&offset<b)||/^[，。！？；：、,.!?;:）”’」』】]/.test(char)||/[“‘（「『【]$/.test(groups.at(-1))))groups[groups.length-1]+=char;
  else groups.push(char);
  offset+=char.length;
 }
 return groups;
}
