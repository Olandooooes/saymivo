import type{StoryScene}from'./storyboard.mjs';import type{PersonMatte}from'./person-matte.mjs';import type{Clip}from'./timeline';
export type DynamicMatteFrame={index:number;src:string;sha256:string;sourceMs:number;width:number;height:number;alphaBounds:{x:number;y:number;width:number;height:number}};
export type DynamicMatteEvidence={version:1;kind:'same-source-rgba-sequence';sourceIdentity:{src:string;sha256:string;width:number;height:number;kind:'video';durationSec?:number};matte:PersonMatte;manifestIdentity:{src:string;sha256:string};sequenceSha256:string;frames:DynamicMatteFrame[]};
export function requiresDynamicMatte(config:any):boolean;
export function dynamicMatteDescriptor(matte:PersonMatte|undefined):any;
export function dynamicMatteEvidenceIssues(scene:StoryScene,config:any,environment:any):string[];
export function dynamicMatteFrameAt(evidence:DynamicMatteEvidence|undefined,sourceMs:number):DynamicMatteFrame|null;
export function bindDynamicMatteElement(element:HTMLImageElement|null,proof:any):()=>void;
export function dynamicMatteElementIssues(element:HTMLImageElement,evidence:DynamicMatteEvidence,sourceMs:number,draftKey:string):string[];
export function dynamicPersonFraming(raw:StoryScene,clip:Clip,baseSpeaker?:any,manual?:{x:number;y:number;scale:number}):{outer:any;image:any};

export function dynamicMatteVisibleBounds(image:HTMLImageElement,frame:DynamicMatteFrame,view:Window):{left:number;top:number;right:number;bottom:number;width:number;height:number}|null;
