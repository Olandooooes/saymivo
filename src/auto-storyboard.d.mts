import type {Caption} from './captions';
import type {Clip} from './timeline';
import type {StoryScene} from './storyboard.mjs';
import type {Chapter} from './presentation.mjs';
export function automaticStoryboard(captions:Caption[],clips:Clip[]):{scenes:StoryScene[];chapters:Chapter[]};
