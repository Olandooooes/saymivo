import {captionLayoutSpans} from './caption-lexical.mjs';
// Layout groups preserve every original timing token for per-word highlighting.
export function joinsLatinWord(left, right) {
  return /[\p{Script=Latin}0-9](?:[.’'_-])?$/u.test(left ?? '') && /^(?:[.’'_-])?[\p{Script=Latin}0-9]/u.test(right ?? '');
}
export function captionWordGroups(words,protectedPhrases=[]) {
  const groups=[];
  const spans=captionLayoutSpans(words.map(w=>w.text).join(''),protectedPhrases);let offset=0;
  for (const word of words) {
    const previous=groups.at(-1);
    if(previous && (joinsLatinWord(previous.at(-1).text,word.text)||/^[，。！？；：、,.!?;:）”’」』】]/.test(word.text)||/[“‘（「『【]$/.test(previous.at(-1).text)||spans.some(([start,end])=>offset>start&&offset<end))) previous.push(word);
    else groups.push([word]);
    offset+=word.text.length;
  }
  return groups;
}
