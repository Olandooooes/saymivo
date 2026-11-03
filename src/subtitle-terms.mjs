// Only confirmed technical names are collapsed; ordinary English spaces survive.
export const technicalTerms=['Agent','ChatGPT','OpenAI','GitHub','Remotion','Whisper'];
export function normalizeSubtitleTerms(text){
 for(const term of technicalTerms){const pattern=Array.from(term).join('\\s*');text=text.replace(new RegExp('\\b'+pattern+'\\b','gi'),term);}
 return text;
}

// Protect confirmed multi-token spellings without rewriting source tokens.
export function subtitleTermSpans(text,terms=technicalTerms){
 const spans=[];
 for(const term of terms){
  const pattern=Array.from(term).map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
  for(const match of text.matchAll(new RegExp('\\b'+pattern+'\\b','gi')))spans.push([match.index,match.index+match[0].length]);
 }
 return spans;
}
