import type {StoryScene} from '../src/storyboard.mjs';
import type {DynamicControlField} from '../src/dynamic-mechanism-adapter.mjs';
export type ControlSourceContext={scene?:StoryScene;siblings?:Record<string,unknown>;rootValue?:Record<string,unknown>};
export function sourceTokenControlOptions(rootValue:unknown,scene?:StoryScene):{value:string;label:string;text:string;nodeId:string;graphemeCount:number}[];
export function controlFieldValue(field:DynamicControlField,value:unknown,context?:ControlSourceContext):unknown;
export function newControlValue(field:DynamicControlField,context?:ControlSourceContext&{newId?:()=>string}):unknown;
export function syncControlSourceFields(fields:DynamicControlField[],value:unknown,scene?:StoryScene,context?:Pick<ControlSourceContext,'rootValue'>):unknown;
export function parseControlNumber(text:string,options?:{seconds?:boolean;integer?:boolean}):{ok:boolean;value?:number;message?:string};
export function patchControlRecord(fields:DynamicControlField[],value:unknown,key:string,nextValue:unknown,scene?:StoryScene,context?:Pick<ControlSourceContext,'rootValue'>):Record<string,unknown>;
