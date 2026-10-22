export const displayFontChoices=[
 {id:'douyin',label:'A · 抖音美好体',family:'Koubo Douyin',file:'douyin-sans-bold.ttf',license:'douyin-sans-OFL.txt'},
 {id:'source-han',label:'B · 思源黑体 Heavy',family:'Koubo Source Han',file:'source-han-sans-sc-heavy.otf',license:'source-han-sans-LICENSE.txt'},
 {id:'smiley',label:'C · 得意黑',family:'Koubo Smiley',file:'SmileySans-Oblique.ttf',license:'smiley-sans-OFL.txt'},
];
export const displayFontConfig=id=>displayFontChoices.find(f=>f.id===id);
export const displayFontFamily=id=>{const f=displayFontConfig(id);return f?`"${f.family}", PingFang SC, sans-serif`:'PingFang SC, Microsoft YaHei, sans-serif';};
