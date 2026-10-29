import type {StoryScene,SceneNode,SceneMedia} from './storyboard.mjs';
export type StageRect={x:number;y:number;width:number;height:number};
export type FlipBoardConfig={kind:'flip-board';columns?:number;rows?:number;atMs?:number;nodeAtMs?:Record<string,number>;fillMs?:number;holdMs?:number;flipMs?:number;staggerMs?:number};
export type NumberCounterConfig={kind:'number-counter';from:number;to:number;unit?:string;decimals?:number;direction?:'up'|'down';grouping?:boolean;locale?:string;atMs?:number;countMs?:number;rect?:StageRect};
export type EvidenceFocusCue={nodeId:string;atMs:number;travelMs?:number;holdMs?:number;returnMs?:number;origin?:StageRect;target?:StageRect};
export type MatchToLive={atMs:number;durationMs?:number;from?:StageRect;to:StageRect;backgroundDelayMs?:number;backgroundFadeMs?:number;graphicsDelayMs?:number;graphicsFadeMs?:number};
export type EvidenceHandoffConfig={kind:'evidence-handoff';mediaNodeId?:string;columns?:number;cues?:EvidenceFocusCue[];boardRect?:StageRect;focusBoardRect?:StageRect;speakerRect?:StageRect;focusSpeakerRect?:StageRect;focusRect?:StageRect;speakerMode?:'cutout'|'inset';matchToLive?:MatchToLive};
export type GlassCapsulesConfig={kind:'glass-capsules';side?:'left'|'right';rect?:StageRect;atMs?:number[];endMs?:number;inMs?:number;outMs?:number;gap?:number};
export type DynamicMechanismConfig=(FlipBoardConfig|NumberCounterConfig|EvidenceHandoffConfig|GlassCapsulesConfig|OrbitFlowConfig|BarGroupConfig|HubBranchFlowConfig|ScreenshotFocusConfig|BilingualBoardConfig)&{sourceCopyWindow?:import('./complete-source-copy.mjs').CompleteSourceCopyWindow};
export const dynamicMechanismResearch:{complete:boolean;source:{episode:number;url:string;publishedAt:string};observedRanges:number[][];boundaryPrecision:string;method:string;note:string};
export function dynamicSceneDuration(scene:StoryScene):number;
export type BoardCell={id:string;row:number;column:number;nodeId:string;glyph:string};
export function flipBoardPages(scene:StoryScene,config?:Partial<FlipBoardConfig>):{columns:number;rows:number;pages:{lines:{nodeId:string;field:number;text:string;glyphs:string[]}[];cells:BoardCell[]}[];entries:{nodeId:string;field:number;text:string}[]};
export function flipBoardState(scene:StoryScene,config:FlipBoardConfig,elapsed:number):ReturnType<typeof flipBoardPages>&{pageIndex:number;cells:(BoardCell&{finalGlyph:string;settled:boolean;frontGlyph:string;backGlyph:string;rotationDeg:number})[];pageMs:number;fillMs:number;holdMs:number;opacity:number;phase:string};
export function formatCounterValue(value:number,config:NumberCounterConfig):string;
export function counterMeasurementSpec(config:NumberCounterConfig):{samples:string[];glyphs:string;numericSlots:number;unit:string;key:string};
export function counterState(scene:StoryScene,config:NumberCounterConfig,elapsed:number):{value:number;text:string;progress:number;phase:string;measurement:ReturnType<typeof counterMeasurementSpec>;opacity:number};
export function evidenceHandoffItems(scene:StoryScene,config?:Partial<EvidenceHandoffConfig>):{node:SceneNode;media:SceneMedia}[];
export function evidenceHandoffState(scene:StoryScene,config:EvidenceHandoffConfig,elapsed:number):{items:ReturnType<typeof evidenceHandoffItems>;cues:EvidenceFocusCue[];activeNodeId:string|null;phase:string;focusAmount:number;boardRect:StageRect;cardRect:StageRect;speakerRect:StageRect;backgroundMix:number;oldGraphicsOpacity:number;matchProgress:number;requiresRealCutout:boolean;cardOpacity:number};
export function glassCapsuleState(scene:StoryScene,config:GlassCapsulesConfig,elapsed:number):{items:{node:SceneNode;atMs:number;rect:StageRect;opacity:number;offsetX:number;rotateY:number}[];groupOpacity:number;automaticAllowed:false;requiresFaceReview:true;phase:string};
export type OrbitFlowConfig={kind:'orbit-flow-variant';gatherAtMs?:number;gatherMs?:number;openAtMs:number;flowAtMs:number;openMs?:number;flowMs?:number;gapDegrees?:number;count?:number;center?:{x:number;y:number};radius?:number;target?:{x:number;y:number};mediaRect?:StageRect;viewport?:{width:number;height:number}};
export function orbitFlowState(config:OrbitFlowConfig,elapsed:number):{phase:string;gapDegrees:number;startDegrees:number;endDegrees:number;dots:{id:number;x:number;y:number;opacity:number}[];progress:number;gatherProgress:number;center:{x:number;y:number};radiusX:number;radiusY:number};
export function orbitFlowIssues(scene:StoryScene,config:OrbitFlowConfig):string[];
export function dynamicMechanismIssues(scene:StoryScene,config:DynamicMechanismConfig,viewport?:{width:number;height:number}):string[];
export type BarGroupConfig={kind:'bar-group-variant';scale:{min:0;max:number};unit?:string;decimals?:number;grouping?:boolean;items:{nodeId:string;from:number;to:number;atMs:number;countMs:number}[]};
export function barGroupIssues(scene:StoryScene,config:BarGroupConfig):string[];
export function barGroupState(scene:StoryScene,config:BarGroupConfig,elapsed:number):{issues:string[];items:{nodeId:string;label:string;detail:string;value:number;text:string;unit:string;fraction:number;progress:number;phase:string;measurement:ReturnType<typeof counterMeasurementSpec>}[]};
// Independently rendered by HubFlowScene; not registered into workbench presets.
// evidenceRelay is reserved and rejected until an explicit adapter is provided.
export type GraphEdgeSpec={id:string;from:string;to:string;route:'orthogonal'|'bezier';points?:{x:number;y:number}[]};
export type GraphNodeStateEvent={atMs:number;nodeId:string;state:'active'|'dim'|'hidden';durationMs:number;explicitValue?:{from:number;to:number;unit:string;scale:{min:number;max:number}};trend?:'up'|'down'|'flat'};
export type GraphGateEvent={atMs:number;edgeId:string;enabled:boolean;drainMs:number};
export type GraphRearrangement={atMs:number;durationMs:number;nodes:{nodeId:string;rect:StageRect;fromRect?:StageRect;assetNodeId?:string}[];edges:GraphEdgeSpec[]};
export type QuotedLineCue={nodeId:string;lines:{text:string;atMs:number;highlightText?:string;highlightAtMs?:number}[];provenance:string};
export type HubBranchFlowConfig={kind:'hub-branch-flow';hubNodeId:string;inputNodeIds:string[];outputNodeIds:string[];positions?:{nodeId:string;x:number;y:number;width?:number;height?:number}[];branchesAtMs:number;branchDrawMs:number;nodeStaggerMs:number;flowAtMs:number;flowMs:number;particleCount:number;edges?:GraphEdgeSpec[];edgeGates?:GraphGateEvent[];nodeStates?:GraphNodeStateEvent[];rearrangements?:GraphRearrangement[];quotedLineCues?:QuotedLineCue[];evidenceRelay?:EvidenceFocusCue[];matchToDiagram?:MatchToLive};
// Independently rendered by ScreenshotFocusScene/BilingualBoardScene, without
// automatic selection. ROI bounds are source pixels; dimming stays on its asset.
export type ScreenshotFocusConfig={kind:'screenshot-region-focus';mediaNodeId?:string;sourceKind:'screenshot'|'illustration';provenance:string;sourceWidth:number;sourceHeight:number;focusRegion:{x:number;y:number;width:number;height:number};regionUnits:'source-pixels';maskScope:'asset-only';atMs:number;expandMs:number;holdMs:number;returnMs:number;assetRect?:StageRect;focusRect:StageRect;dimOpacity:number;explanationRect?:StageRect;explanationCues:QuotedLineCue[]};
export type BilingualBoardConfig={kind:'bilingual-board-transition';columns?:number;pairs:{nodeId:string;fromText:string;toText:string;fromLanguage:string;toLanguage:string;atMs:number;rollMs:number}[];provenance:string};
export function bilingualBoardState(scene:StoryScene,config:BilingualBoardConfig,elapsed:number):{items:{node:SceneNode;pair:BilingualBoardConfig['pairs'][number]|null;progress:number;rotationDeg:number;phase:string;fromText:string;toText:string;fromLanguage:string;toLanguage:string;frontDuration:number;backDuration:number}[]};
export function bilingualBoardIssues(scene:StoryScene,config:BilingualBoardConfig):string[];
