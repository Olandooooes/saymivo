import type {DynamicControlField} from '../src/dynamic-mechanism-adapter.mjs';
export function dynamicEditorFields(fields:DynamicControlField[],config:Record<string,any>):DynamicControlField[];
export function dynamicEditorFormValue(fields:DynamicControlField[],value:Record<string,any>):Record<string,any>;
export function dynamicEditorConfigValue(fields:DynamicControlField[],value:Record<string,any>,options?:{newId?:()=>string}):Record<string,any>;

export function dynamicEditorBindSourceEvidence(config:Record<string,any>,scene:import('../src/storyboard.mjs').StoryScene,assets?:import('../src/scene-dynamic-motion.mjs').DynamicMotionAsset[]):Record<string,any>;
