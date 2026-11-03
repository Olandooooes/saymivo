import type{StoryScene}from'./storyboard.mjs';import type{Clip}from'./timeline';import type{ConditionalSetContext}from'./conditional-set.mjs';
type Identity={kind:'image'|'video';src:string;sha256:string;width:number;height:number;durationSec?:number};
export function conditionalSetCurrentContext(scene:StoryScene,projection:StoryScene|undefined,sourceIdentity:Identity|undefined,assets:Identity[],clips:Clip[],fps:number,captions:ConditionalSetContext['captions'],viewport:{width:number;height:number}):ConditionalSetContext;
