import type {Clip} from './timeline';
export type SceneLayout='speaker'|'headline'|'chapter'|'slide'|'spotlight'|'cards'|'flow'|'demo'|'outro'|'overview'|'stack'|'route'|'gallery';
export type SceneNode={id:string;text:string;assetSrc?:string;category?:string;icon?:import('./SceneIcon').SceneIconName;bullets?:string[];x?:number;y?:number;width?:number;detail?:string;atMs?:number;focusMs?:number;color?:string;textCues?:{text:string;atMs:number}[]};
export type SceneCameraPoint={atMs:number;scale:number;x:number;y:number};
export type SceneCursorPoint={atMs:number;x:number;y:number;click?:boolean};
export type SceneMedia={switchMs?:number;sequence?:Array<{id:string;src:string;kind?:'image';atMs:number;width?:number;height?:number;camera?:SceneCameraPoint[]}>;windowKeyframes?:Array<{atMs:number;x:number;y:number;width:number;height:number}>;src:string;kind:'image'|'video';width?:number;height?:number;durationSec?:number;startSec?:number;freezeAtSec?:number;rate?:number;fit?:'contain'|'cover';scale?:number;x?:number;y?:number;camera?:SceneCameraPoint[];cursor?:SceneCursorPoint[]};
export type SceneHighlight={id:string;x:number;y:number;w:number;h:number;atMs:number;endMs?:number;color?:string;mode?:'highlight'|'spotlight'|'selection'|'underline'};
export type SceneLink={id:string;from:string;to:string;label?:string;atMs?:number};
export type SceneTag={id:string;text:string;x:number;y:number;atMs:number;endMs:number;rotate?:number;scale?:number;width?:number;animation?:{inMs?:number;outMs?:number;lineDelayMs?:number};lineAtMs?:number[];contextAtMs?:number};
export type SceneWindowPoint={atMs:number;x:number;y:number;size:number};
export type StoryScene={clipInstanceId?:string;imageWindow?:{version:1;matchedTerms:string[];zoom:number;transitionMs:number;reason:string};id:string;clipId:string;src?:string;startMs:number;endMs:number;layout:SceneLayout;dynamicMotion?:import('./scene-dynamic-motion.mjs').SceneDynamicMotion;visualPreset?:{id:import('./visual-presets.mjs').VisualPresetId;version:1;side?:'left'|'right';primaryNodeId?:string;primaryNodeIds?:string[]};titleTreatment?:'airy'|'embedded';embeddedText?:{backdrop:string;headline:string};personMatte?:import('./person-matte.mjs').PersonMatte;containerPose?:{rotateY?:number;rotateZ?:number;perspective?:number};overviewMode?:'preview';overviewComparison?:import('./overview-comparison.mjs').OverviewComparison;overviewSourceSceneId?:string;chapterTypography?:{entry?:'sweep';delayMs?:number;labelScale?:number;lineScales?:number[]};stackStyle?:'cards'|'folder';folderCloseMs?:number;iconDrawMs?:number;transitionMs?:number;headlinePosition?:'left'|'top'|'bottom'|'split';window?:{x:number;y:number;size:number;keyframes?:SceneWindowPoint[]};title:string;label?:string;body?:string;sourceText?:string;summarySourceSceneId?:string;sourceCaptionIds?:string[];planningMethod?:'local-rules';activeNodeId?:string;tagTreatment?:'kinetic';tags?:SceneTag[];nodes?:SceneNode[];links?:SceneLink[];highlights?:SceneHighlight[];media?:SceneMedia;sourceNote?:string;illustrative?:boolean;missing?:string;speaker?:{x?:number;y?:number;scale?:number;shiftY?:number};phaseStartMs?:number;phaseEndMs?:number;sourceOffsetMs?:number;speed?:number;sourceId?:string};
export const sceneLayouts:SceneLayout[];
export const sceneLabels:Record<SceneLayout,string>;
export function matchingSource(scene:StoryScene,clip:Clip):boolean;
export function activeStoryboard(scenes:StoryScene[]|undefined,ms:number,clip?:Clip):StoryScene|undefined;
export function projectStoryboard(scenes:StoryScene[]|undefined,clips:Clip[],fps?:number):StoryScene[];
export function validateStoryboard(scenes:StoryScene[]|undefined,clips:Clip[]):Array<{id:string;message:string}>;

export function sceneSpeakerLayout(scene:StoryScene|undefined):string;

export function sampleSceneWindow(scene:StoryScene|undefined,elapsed?:number):{x:number;y:number;size:number}|undefined;
export function focusedNodeId(scene:StoryScene,elapsed?:number):string|undefined;
export function nodeFocusAmount(scene:StoryScene,id:string,elapsed?:number):number;

export function previousStoryboardScene(scenes:StoryScene[],current:StoryScene|undefined):StoryScene|undefined;

export function storyboardFrameRange(scene:StoryScene,fps?:number):{from:number;durationInFrames:number};
