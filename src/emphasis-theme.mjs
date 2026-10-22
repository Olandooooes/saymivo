export const emphasisThemes=[{id:'reference-yellow',label:'参考荧黄'},{id:'tech-indigo',label:'科技靛蓝'},{id:'tech-violet',label:'柔和蓝紫'}];
export const validEmphasisTheme=id=>emphasisThemes.some(t=>t.id===id);
export function emphasisThemeVars(id){
 const tech=id==='tech-indigo'||id==='tech-violet';
 return {'--koubo-emphasis':id==='tech-violet'?'#6950a8':tech?'#3156b9':'#efff24','--koubo-emphasis-on-dark':id==='tech-violet'?'#c2b5ff':tech?'#abc1ff':'#efff24','--koubo-emphasis-stroke':tech?'0px transparent':'1px #213027','--koubo-emphasis-shadow':tech?'0 2px 10px #243f7b12':'0 3px 8px #15221866','--koubo-emphasis-line':id==='tech-violet'?'#8b78bc':tech?'#8276ae':'#a5b64a','--koubo-corner-glow':tech?'#342968':'#914114'};
}
