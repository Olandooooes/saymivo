import type {StoryScene} from './storyboard.mjs';
export type SceneMediaAsset = {
 src: string; kind: 'image' | 'video'; label?: string; sourceNote?: string;
 width?: number; height?: number; durationSec?: number;
};
export function sceneMediaBindingPatch(scene: StoryScene, asset: SceneMediaAsset): Partial<StoryScene>;
