import type {StoryScene} from './storyboard.mjs';
import type {Clip} from './timeline';
import type {TextFit} from './text-fit.mjs';

export type ConditionalRect={x:number;y:number;width:number;height:number};
export type ConditionalPoint={x:number;y:number};
export type ConditionalSourceRef={nodeId:string;expectedText:string};
export type ConditionalSourceIdentity={kind:'video';src:string;sha256:string;width:number;height:number;durationSec:number};
export type ConditionalImageIdentity={kind:'image';src:string;sha256:string;width:number;height:number};
export type ConditionalBoundary={kind:'ellipse'|'rect';rect:ConditionalRect};
export type ConditionalWindow={atMs:number;endMs:number};
export type ConditionalSet={id:string;sourceRef:ConditionalSourceRef;parentId?:string;boundary:ConditionalBoundary;labelRect:ConditionalRect;atMs:number;drawMs:number};
export type ConditionalGate={id:string;sourceRef:ConditionalSourceRef;fromSetId:string;toSetId:string;boundary:{axis:'x'|'y';position:number;min:number;max:number};labelRect:ConditionalRect;atMs:number;condition:
 |{kind:'authored';result:'allowed'|'blocked'}
 |{kind:'membership';setId:string;mode:'inside'|'outside'}
 |{kind:'capacity';factKey:string;operator:'lt'|'lte';limit:number;unit:string}};
export type ConditionalActor={id:string;sourceRef:ConditionalSourceRef;assetIdentity?:ConditionalImageIdentity;initialSetId:string;initialPoint:ConditionalPoint;size:{width:number;height:number};labelRect:ConditionalRect;atMs:number;facts?:{key:string;value:number;unit:string;sourceRef:ConditionalSourceRef}[]};
export type ConditionalPath={from:ConditionalPoint;control1:ConditionalPoint;control2:ConditionalPoint;to:ConditionalPoint};
export type ConditionalEvent=({id:string;actorId:string;gateId:string;atMs:number}) & (
 |{type:'evaluate';expectedResult:'allowed'|'blocked'}
 |{type:'travel';phase:'approach'|'retreat'|'pass'|'reroute';endMs:number;path:ConditionalPath;blockedGateId?:string});
export type ConditionalSetConfig={version:1;kind:'conditional-set';clock:'scene-source-relative-ms';binding:{sceneId:string;src:string;sha256:string;startMs:number;endMs:number};provenance:{kind:'illustration';note:string};copyWindow:ConditionalWindow&{rect:ConditionalRect};graphicWindow:ConditionalWindow;sets:ConditionalSet[];gates:ConditionalGate[];actors:ConditionalActor[];events:ConditionalEvent[];annotation?:string;protectedAreas?:{rect:ConditionalRect}[]};
export type ConditionalSetContext={rawScene:StoryScene;sourceIdentity:ConditionalSourceIdentity;assets?:ConditionalImageIdentity[];clips:Clip[];fps:number;captions:{clipId?:string;startMs:number;endMs:number;holdMs?:number;holdMaxMs?:number;topPct:number;scale?:number}[];viewport:{width:number;height:number};speaker:{known:true;rect:ConditionalRect};projection?:StoryScene};
export type ConditionalField=ConditionalWindow&{id:string;role:'copy'|'set'|'gate'|'actor';text:string;rect:ConditionalRect};
export type ConditionalExposure={projectionId:string;clipId:string;startMs:number;endMs:number;speed:number};
export type ConditionalMeasurement={key:string;fontKey:string;fields:{id:string;text:string;fit:TextFit|null}[]};
export type ConditionalReadiness={status:'waiting'|'blocked'|'ready';issues:string[];canApply:false;nativeReadiness:'unverified'};
export type ConditionalEvaluation=Extract<ConditionalEvent,{type:'evaluate'}>&{result:'allowed'|'blocked';approachEventId:string;condition:ConditionalGate['condition'];sourceRef:ConditionalSourceRef;provenance:ConditionalSetConfig['provenance']};
export type ConditionalActorState={id:string;sourceRef:ConditionalSourceRef;assetIdentity:ConditionalImageIdentity|null;point:ConditionalPoint;rect:ConditionalRect;memberSetId:string;effectiveSetIds:string[];visible:boolean;motion:null|{eventId:string;gateId:string;phase:'approach'|'retreat'|'pass'|'reroute';progress:number};outcomes:ConditionalEvaluation[]};
export type ConditionalSample={status:'valid'|'blocked';issues:string[];canApply:false;uiAccepted:false;nativeReadiness:'unverified';sourceMs?:number;elapsedMs?:number;sourceCopy?:string;copyVisible?:boolean;sets:{id:string;parentId:string|null;sourceRef:ConditionalSourceRef;boundary:ConditionalBoundary;visible:boolean;drawProgress:number;directMemberIds:string[];effectiveMemberIds:string[]}[];gates:{id:string;sourceRef:ConditionalSourceRef;condition:ConditionalGate['condition'];visible:boolean;outcomes:ConditionalEvaluation[]}[];actors:ConditionalActorState[]};
export function conditionalSetSourceCopy(context:ConditionalSetContext,config:ConditionalSetConfig):string;
/** Input identity only; cannot mint opaque render receipts. */
export function conditionalSetKey(config:ConditionalSetConfig,context:ConditionalSetContext,fontKey?:string):string;
export function conditionalSetBezier(path:ConditionalPath,progress:number):ConditionalPoint;
export function conditionalSetPathEnvelope(path:ConditionalPath,size:{width:number;height:number}):ConditionalRect;
export function conditionalSetBoundaryBands(shape:ConditionalBoundary,stroke?:number):ConditionalRect[];
export function conditionalSetFieldPlan(config:ConditionalSetConfig,context:ConditionalSetContext):ConditionalField[];
export function conditionalSetIssues(config:ConditionalSetConfig,context:ConditionalSetContext):string[];
export function conditionalSetExposure(context:ConditionalSetContext):ConditionalExposure[];
export function conditionalSetTextReadiness(field:ConditionalField,fit:TextFit|null,exposures:ConditionalExposure[]):Pick<ConditionalReadiness,'status'|'issues'>;
/** Font reports are caller-supplied; real font/DOM/media/person and receipt
 * acceptance remain in a future trusted renderer and actual UI session. */
export function conditionalSetReadiness(config:ConditionalSetConfig,context:ConditionalSetContext,measurement:ConditionalMeasurement|null):ConditionalReadiness;
/** Absolute source-file milliseconds. No reset at cuts, no random physics. */
export function conditionalSetState(config:ConditionalSetConfig,context:ConditionalSetContext,absoluteSourceMs:number):ConditionalSample;
