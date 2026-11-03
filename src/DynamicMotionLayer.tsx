import React from 'react';
import {Sequence,useCurrentFrame,useVideoConfig} from 'remotion';
import {DynamicMotionRenderer} from './DynamicMotionRenderer';
import {dynamicMotionEnvironmentFromState,validateSavedSceneDynamicMotion} from './scene-dynamic-motion.mjs';
import {projectStoryboard,storyboardFrameRange,type StoryScene} from './storyboard.mjs';
import type {Presentation} from './presentation.mjs';
import type {Clip} from './timeline';

/** One foreground renderer; the original clip keeps the sole audible source. */
export function DynamicMotionLayer({scenes,clips,presentation,accentColor,meta,context}:{scenes:StoryScene[];clips:Clip[];presentation:Presentation;accentColor?:string;meta:{fps:number;width:number;height:number;durationInFrames:number};context:{captions:unknown[];brolls:unknown[];music:unknown;brollAssets?:unknown[]}}){
 const {fps}=useVideoConfig(),frame=useCurrentFrame(),projected=projectStoryboard(scenes,clips,fps),active=projected.filter(scene=>frame>=storyboardFrameRange(scene,fps).from&&frame<storyboardFrameRange(scene,fps).from+storyboardFrameRange(scene,fps).durationInFrames).at(-1);
 if(!active?.dynamicMotion)return null;
 const raw=scenes.find(scene=>scene.id===active.sourceId);if(!raw?.dynamicMotion)return null;
 const saved=raw.dynamicMotion,environment=dynamicMotionEnvironmentFromState({clips,presentation,accentColor,meta,...context},{sourceIdentity:saved.sourceIdentity,assets:saved.assetIdentities,...(saved.audioEvidence?{audioEvidence:saved.audioEvidence}:{}),...(saved.matteEvidence?{matteEvidence:saved.matteEvidence}:{}),contextSnapshot:saved.contextSnapshot,font:{status:'ready'}}),validation=validateSavedSceneDynamicMotion(raw,environment),range=storyboardFrameRange(active,fps);
 return <Sequence from={range.from} durationInFrames={range.durationInFrames} premountFor={fps}><DynamicMotionRenderer scene={active} rawScene={raw} config={saved.config} clips={clips} identity={saved.sourceIdentity} assetIdentities={saved.assetIdentities} matteEvidence={saved.matteEvidence} draftKey={saved.draftKey} baseSpeaker={presentation.speaker} unavailableIssues={validation.ok?[]:validation.issues}/></Sequence>;
}
