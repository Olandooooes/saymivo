export type EmphasisTheme='reference-yellow'|'tech-indigo'|'tech-violet';
export const emphasisThemes:Array<{id:EmphasisTheme;label:string}>;
export function validEmphasisTheme(id?:string):boolean;
export function emphasisThemeVars(id?:string):Record<string,string>;
