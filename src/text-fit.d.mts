export type TextFit={fontSize:number;rowHeight:number;lines:string[];height:number;width:number;pages:string[][];fits:boolean;unplaceable:boolean};
export function fitMeasuredText(text:string,options:{width:number;height:number;minFont?:number;maxFont?:number;lineHeight?:number;protectedPhrases?:string[];measure:(text:string,size:number)=>{width:number;ascent?:number;descent?:number}}):TextFit;
