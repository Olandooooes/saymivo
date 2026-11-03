export type CaptionStyle={font:'system'|'pingfang'|'song';fontSize:number;weight:number;color:string;accentColor:string;strokeColor:string;strokeWidth:number;shadow:number;backgroundColor:string;backgroundOpacity:number;topPct:number;lineHeight:number};
export const captionFonts:Record<CaptionStyle['font'],string>;
export const defaultCaptionStyle:CaptionStyle;
export const captionStylePresets:Array<{id:string;name:string;style:CaptionStyle}>;
export function sanitizeCaptionStyle(input:unknown):Partial<CaptionStyle>;
export function resolveCaptionStyle(global?:Partial<CaptionStyle>,override?:Partial<CaptionStyle>):CaptionStyle;
