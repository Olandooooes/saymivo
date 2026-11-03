import type {StoryScene} from '../src/storyboard.mjs';
import type {Clip} from '../src/timeline';
import type {Presentation} from '../src/presentation.mjs';
export type EditorAssetIdentity={src:string;sha256:string;width:number;height:number;kind:'image'|'video';durationSec?:number;status:'ready'};
export function dynamicEditorRawScene(scene:StoryScene|undefined):StoryScene|null;
export function dynamicEditorAppearance(state:{presentation:Presentation;accentColor:string;meta?:unknown}):{presentationWithoutScenes:Omit<Presentation,'scenes'>;accentColor:string;meta:unknown};
export function dynamicEditorAssetSources(scene:StoryScene|undefined):string[];
export function fetchDynamicEditorAssets(scene:StoryScene,options:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<{assets:EditorAssetIdentity[];errors:{src:string;message:string}[]}>;
export function dynamicEditorProjectionWindow(scene:StoryScene|undefined,clips:Clip[],fps:number):{inFrame:number;outFrame:number;durationInFrames:number;projections:StoryScene[]}|null;
