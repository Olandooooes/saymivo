import type {StoryScene} from './storyboard.mjs';
import type {Clip} from './timeline';
type ReviewProject={name?:string;presentation?:{title?:string;scenes?:StoryScene[]};clips?:Clip[]};
export function reviewTime(ms:number):string;
export function storyboardReviewMarkdown(project:ReviewProject,fps?:number):string;
