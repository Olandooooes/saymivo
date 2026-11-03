/** Independent pure-state preparation. No UI, decoder, font, audio or apply proof. */
export type PersistentPose = {x:number;y:number;width:number;height:number};
export type PersistentIllustration = {kind:'illustration';note:string};
export type PersistentOwner = {containerId:string;slotId:string}|null;
export type PersistentSubject = {kind:'entity'|'container';id:string};
export type PersistentNodeRef = {nodeId:string;expectedText:string};
export type PersistentImageIdentity = {kind:'image';src:string;sha256:string;width:number;height:number};
export type PersistentBinding = {sceneId:string;src:string;sha256:string;startMs:number;endMs:number};
export type PersistentContext = {
 scene:{id:string;clipId?:string;src:string;startMs:number;endMs:number;title?:string;body?:string;label?:string;sourceNote?:string;tags?:{text:string}[];links?:{label?:string}[];media?:{src:string};nodes:{id:string;text:string;detail?:string;bullets?:string[];assetSrc?:string}[]};
 sourceIdentity:{kind:'video';src:string;sha256:string;width:number;height:number;durationSec:number};
 assets?:PersistentImageIdentity[];
};
export type PersistentEntity =
 |{id:string;kind:'media';sourceRef:{asset:PersistentImageIdentity;nodeId?:string;expectedText?:string}}
 |{id:string;kind:'text';sourceRef:PersistentNodeRef}
 |{id:string;kind:'task';sourceRef:PersistentNodeRef;initialStatus:'pending'|'done';provenance:PersistentIllustration}
 |{id:string;kind:'document';revisionId:string;lines:{id:string;sourceRef:PersistentNodeRef}[]}
 |{id:string;kind:'summary';text:string;provenance:PersistentIllustration};
export type PersistentContainer = {id:string;pose:PersistentPose;slots:{id:string;pose:PersistentPose}[]} & ({kind:'checklist';memberIds:string[]}|{kind:'stack'|'anchor'|'archive';memberIds?:never});
type EventBase = {id:string;atMs:number};
export type PersistentEvent =
 |(EventBase & {type:'spawn';instanceId:string;to:PersistentOwner;pose:PersistentPose})
 |(EventBase & {type:'clone';cloneOf:string;instanceId:string;to:PersistentOwner;pose:PersistentPose})
 |(EventBase & {type:'move'|'attach'|'detach'|'archive';subject:PersistentSubject;endMs:number;from:PersistentOwner;to:PersistentOwner;fromPose:PersistentPose;toPose:PersistentPose})
 |(EventBase & {type:'layout';containerId:string;endMs:number;slots:{id:string;fromPose:PersistentPose;toPose:PersistentPose}[]})
 |(EventBase & {type:'setStatus';instanceId:string;from:'pending'|'done';to:'pending'|'done';provenance:PersistentIllustration})
 |(EventBase & {type:'summarize';instanceId:string;containerId:string;memberIds:string[];expectedMembers:{instanceId:string;text:string;status:'pending'|'done'}[];completion:'all-done'|'mixed';provenance:PersistentIllustration;to:PersistentOwner;pose:PersistentPose})
 |(EventBase & {type:'revise';instanceId:string;fromRevisionId:string;toRevisionId:string;changedLineIds:string[];changes:{lineId:string;beforeText:string;afterText:string}[];provenance:PersistentIllustration})
 |(EventBase & {type:'retire';subject:PersistentSubject;reason:string});
export type PersistentTimeline = {
 version:1;clock:'scene-source-relative-ms';binding:PersistentBinding;provenance:PersistentIllustration;
 entities:PersistentEntity[];containers:PersistentContainer[];
 /** Explicit array order breaks equal-atMs ties; events must be source-ordered. */
 events:PersistentEvent[];
};
export type PersistentMotion = {eventId:string;atMs:number;endMs:number;from:PersistentPose;to:PersistentPose};
export type PersistentRevision = {revisionId:string;previousRevisionId?:string;atMs:number;eventId?:string;changedLineIds:string[];changes:{lineId:string;beforeText:string;afterText:string}[];provenance?:PersistentIllustration};
export type PersistentEntityState = {
 id:string;kind:PersistentEntity['kind'];sourceRef:PersistentNodeRef|{asset:PersistentImageIdentity;nodeId?:string;expectedText?:string}|null;text:string;
 active:boolean;spawned:boolean;owner:PersistentOwner;pose:PersistentPose|null;worldPose?:PersistentPose;motion:PersistentMotion|null;cloneOf:string|null;retiredAtMs?:number;
 status:'pending'|'done'|null;statusHistory:{eventId:string;atMs:number;from:'pending'|'done';to:'pending'|'done';provenance:PersistentIllustration}[];
 document:null|{revisionId:string;lines:{id:string;nodeId:string;sourceText:string;text:string}[];changedLineIds:string[];revisions:PersistentRevision[]};
 /** Every original complete member is persistent; rendering only text is unsafe. */
 summary:null|{containerId:string;memberIds:string[];members:{instanceId:string;sourceRef:PersistentNodeRef;text:string;status:'pending'|'done'}[];unresolvedMemberIds:string[];completion:'all-done'|'mixed';provenance:PersistentIllustration;atMs:number};
 history:{eventId:string;type:PersistentEvent['type'];atMs:number;endMs?:number;from?:PersistentOwner;to?:PersistentOwner;reason?:string}[];
};
export type PersistentContainerState = {
 id:string;kind:PersistentContainer['kind'];active:boolean;owner:PersistentOwner;pose:PersistentPose|null;worldPose?:PersistentPose;motion:PersistentMotion|null;retiredAtMs?:number;
 slots:Record<string,{id:string;pose:PersistentPose;motion?:PersistentMotion;occupant:PersistentSubject|null}>;
 memberIds:string[];history:{eventId:string;type:PersistentEvent['type'];atMs:number;endMs?:number;from?:PersistentOwner;to?:PersistentOwner;reason?:string}[];
};
export type PersistentSample = {
 status:'valid'|'blocked';issues:string[];canApply:false;uiAccepted:false;nativeReadiness:'unverified';sourceMs:number;
 elapsedMs?:number;duration?:number;key?:string;sourceCopy:string;eventsApplied:string[];
 entities:Record<string,PersistentEntityState>;containers:Record<string,PersistentContainerState>;
};
export function persistentEntitiesSourceCopy(context:PersistentContext):string;
export function persistentEntitiesKey(timeline:PersistentTimeline,context:PersistentContext):string;
export function persistentEntitiesIssues(timeline:PersistentTimeline,context:PersistentContext):string[];
/** Absolute original-file milliseconds; source phase is never reset at a cut.
 * Validate retained reading/speed, actual fonts/media/person/subtitles and one
 * audio owner in the future consuming renderer, before granting a UI receipt.
 * Revisions in this first slice are additive: deleting/rewording prior complete
 * conditions is rejected. The original and every changed version remain stored.
 * Original synthetic stack and five-task examples are in the companion tests. */
export function persistentEntitiesState(timeline:PersistentTimeline,context:PersistentContext,absoluteSourceMs:number):PersistentSample;
