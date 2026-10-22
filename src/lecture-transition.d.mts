type Pose={rotateY?:number;rotateZ?:number;perspective?:number};
export function closingTextTransition(previousLayout:string|undefined,currentLayout:string,progress:number):{separate:boolean;outgoing:number;incoming:number};
export function lectureTransition(progress:number,from?:Pose,to?:Pose):{outgoing:number;incoming:number;pose:{rotateY:number;rotateZ:number;perspective:number}};
export function withLecturePageTransitions<T extends import('./storyboard.mjs').StoryScene>(scenes:T[]):T[];
