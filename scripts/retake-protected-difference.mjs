export const PROTECTED_DIFFERENCE_VERSION='protected-token-frontier-v1';
const compact=value=>String(value).normalize('NFKC').toLowerCase().replace(/−/g,'-').replace(/[^\p{L}\p{N}.%,+-]/gu,'');
const spans=text=>[...text.matchAll(/[+-]?\d+(?:[.,]\d+)*(?:%)?|(?:百分之)?[零〇一二三四五六七八九十百千万亿两]+(?:点[零〇一二三四五六七八九]+)?(?=年|月|日|时|分|秒|元|个|次|台|天|周|期|版|米|岁|%|$)|不是|不能|没有|不要|不会|未必|不|没|[a-z]{2,}/g)]
 .map(match=>({text:match[0],start:match.index,end:match.index+match[0].length}));
const negative=text=>/^(不是|不能|没有|不要|不会|未必|不|没)$/.test(text);

// Compare protected assertions in the complete retained text, rather than
// cutting it at the old Chinese character count. Ordinary rewritten context
// can move an unchanged name; it cannot hide an inserted protected token.
export function protectedAssertionDifference(before,after){
 const a=compact(before),b=compact(after),original=spans(a),retained=spans(b),base={version:PROTECTED_DIFFERENCE_VERSION};
 if(original.some((token,index)=>token.text!==retained[index]?.text))return {...base,changed:true,reason:'protected-anchor-changed-or-missing'};
 const tail=a.slice(original.at(-1)?.end??0);let frontier=retained[original.length-1]?.end??0;
 for(const char of tail){
  const next=b.indexOf(char,frontier);
  if(next<0){const changed=retained.slice(original.length).some(token=>negative(token.text));
   return {...base,changed,tailMatched:false,reason:changed?'unmatched-ordinary-tail-with-new-negation':'protected-anchors-preserved-no-new-negation'};
  }
  frontier=next+char.length;
 }
 const changed=retained.slice(original.length).some(token=>token.start<frontier);
 return {...base,changed,tailMatched:true,frontier,reason:changed?'extra-protected-token-inside-original-span':'original-protected-span-preserved'};
}
export const protectedDifference=(before,after)=>protectedAssertionDifference(before,after).changed;
