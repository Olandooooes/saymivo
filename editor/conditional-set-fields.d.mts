import type{StoryScene}from'../src/storyboard.mjs';import type{ConditionalSourceIdentity,ConditionalImageIdentity}from'../src/conditional-set.mjs';import type{DynamicControlField}from'../src/dynamic-mechanism-adapter.mjs';
export const conditionalSetViewControls:{kind:'conditional-set';label:string;uiAccepted:false;automaticAllowed:false;fields:DynamicControlField[]};
export function bindConditionalSetViewDraft(value:Record<string,unknown>,scene:StoryScene,assets?:ConditionalImageIdentity[]):Record<string,unknown>;
export function conditionalSetReferenceOptions(field:DynamicControlField,value:Record<string,unknown>):{value:string;label:string}[];
export function conditionalSetVisibleFields(fields:DynamicControlField[],siblings:Record<string,unknown>):DynamicControlField[];
export function createConditionalSetViewDraft(scene:StoryScene,identity?:ConditionalSourceIdentity):Record<string,unknown>;
