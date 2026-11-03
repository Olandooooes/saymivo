export const captionFonts={system:'Inter, -apple-system, system-ui, sans-serif',pingfang:'PingFang SC, sans-serif',song:'Songti SC, serif'};
export const defaultCaptionStyle={font:'pingfang',fontSize:54,weight:650,color:'#ffffff',accentColor:'#ffb020',strokeColor:'#171717',strokeWidth:1.5,shadow:5,backgroundColor:'#16181c',backgroundOpacity:0,topPct:88,lineHeight:1.3};
export const captionStylePresets=[
 {id:'clean',name:'底部白字',style:defaultCaptionStyle},
 {id:'panel',name:'半透明底条',style:{...defaultCaptionStyle,backgroundOpacity:.65,strokeWidth:0,shadow:0}},
 {id:'bold',name:'醒目粗体',style:{...defaultCaptionStyle,fontSize:64,weight:800,strokeWidth:2.5}},
];
export function sanitizeCaptionStyle(input={}){
 const output={};if(!input||typeof input!=='object')return output;
 if(Object.hasOwn(captionFonts,input.font))output.font=input.font;
 for(const [key,min,max]of [['fontSize',24,110],['weight',400,900],['strokeWidth',0,5],['shadow',0,15],['backgroundOpacity',0,.95],['topPct',5,92],['lineHeight',1,1.8]])if(Number.isFinite(input[key]))output[key]=Math.min(max,Math.max(min,input[key]));
 for(const key of ['color','accentColor','strokeColor','backgroundColor'])if(/^#[0-9a-f]{6}$/i.test(input[key]??''))output[key]=input[key];
 return output;
}
export function resolveCaptionStyle(global,override){return {...defaultCaptionStyle,...sanitizeCaptionStyle(global),...sanitizeCaptionStyle(override)};}
