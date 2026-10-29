// Replace only source clips that actually returned fresh captions; keep failed sources intact.
export function regenerateCaptions(existing,fresh,clips){
 const ids=new Set(clips.map(c=>c.id));
 const valid=fresh.filter(c=>ids.has(c.clipId)&&Array.isArray(c.words)&&c.words.length&&Number.isFinite(c.startMs)&&Number.isFinite(c.endMs)&&c.endMs>c.startMs);
 if(!valid.length)throw Error('未返回可用字幕，已保留原字幕');
 const replaced=new Set(valid.map(c=>c.clipId));
 return [...existing.filter(c=>!replaced.has(c.clipId)),...valid].map((c,i)=>({...c,id:`c${i}`}));
}
