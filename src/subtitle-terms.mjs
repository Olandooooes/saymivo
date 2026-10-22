// Only confirmed technical names are collapsed; ordinary English spaces survive.
const technicalTerms=['Agent','ChatGPT','OpenAI','GitHub','Remotion','Whisper'];
export function normalizeSubtitleTerms(text){
 for(const term of technicalTerms){const pattern=Array.from(term).join('\\s*');text=text.replace(new RegExp('\\b'+pattern+'\\b','gi'),term);}
 return text;
}
