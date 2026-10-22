export type DisplayFontId='douyin'|'source-han'|'smiley';
export const displayFontChoices:Array<{id:DisplayFontId;label:string;family:string;file:string;license:string}>;
export function displayFontConfig(id?:string):typeof displayFontChoices[number]|undefined;
export function displayFontFamily(id?:string):string;
