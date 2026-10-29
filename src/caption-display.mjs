// Presentation only: retain source text, word clocks and paired closing quotes.
export function captionDisplayWords(words){
 const text=words.map(w=>w.text).join('');
 const match=/([，。！？；：、,.!?;:…—]+)([\s”’」』）》】〕〉"'）)\]]*)$/u.exec(text);
 if(!match)return words;
 const start=match.index,end=start+match[1].length;let offset=0;
 return words.flatMap(word=>{
  const a=offset,b=a+word.text.length;offset=b;
  const left=Math.max(a,start),right=Math.min(b,end);
  if(right<=left)return [word];
  const value=word.text.slice(0,left-a)+word.text.slice(right-a);
  return value.trim()?[{...word,text:value}]:[];
 });
}
