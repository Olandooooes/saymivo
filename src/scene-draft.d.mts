import type {StoryScene} from './storyboard.mjs';import type {Caption} from './captions';import type {Clip} from './timeline';
export type SceneProposal={sourceText:string;captionIds:string[];method:'local-rules';scene:StoryScene};
export function proposeScene(scene:StoryScene,captions:Caption[],clips:Clip[]):SceneProposal|{error:string};
