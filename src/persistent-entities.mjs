// Independent state preparation, not an application/renderer readiness proof.
// Events use original-scene milliseconds. Sampling replays from the same immutable
// manifest, so seeking backwards cannot keep a later completion or ownership.
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = s => typeof s === 'string' && s.trim().length > 0;
const sha = s => typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
const local = s => text(s) && !/^(?:[a-z]+:|\/|.*\.\.)/i.test(s) && !s.includes('\\');
const unique = a => new Set(a).size === a.length;
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const copy = v => structuredClone(v);
const fullNode = n => [n?.text, n?.detail, ...(n?.bullets ?? [])].filter(s => typeof s === 'string' && s.length).join('\n');
const rect = r => r && ['x', 'y', 'width', 'height'].every(k => finite(r[k])) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001;
const poseSame = (a, b) => a && b && ['x', 'y', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) < 1e-7);
const mix = (a, b, p) => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, a[k] + (b[k] - a[k]) * p]));
const progress = (m, t) => Math.max(0, Math.min(1, (t - m.atMs) / (m.endMs - m.atMs)));
const compose = (parent, child) => ({x: parent.x + child.x * parent.width, y: parent.y + child.y * parent.height, width: child.width * parent.width, height: child.height * parent.height});
const require = (ok, issue) => { if (!ok) throw new Error(issue); };
const illustration = p => p?.kind === 'illustration' && text(p.note);
const ownerSame = (a, b) => a === null && b === null || a && b && a.containerId === b.containerId && a.slotId === b.slotId;
const refKey = r => `${r?.kind}:${r?.id}`;

/** Full source inventory is separate from summary text; consumers must measure
 * and actually show every retained field, not just render a short summary. */
export function persistentEntitiesSourceCopy(context) {
 const s = context?.scene;
 return [s?.title, s?.body, s?.label, s?.sourceNote, ...(s?.tags ?? []).map(t => t?.text), ...(s?.links ?? []).map(l => l?.label), ...(s?.nodes ?? []).map(fullNode)].filter(s => typeof s === 'string' && s.length).join('\n');
}

/** Include absolute binding, current full source, assets and authored events.
 * This is a stale-input key, never a decoded-file/font/DOM proof. */
export function persistentEntitiesKey(timeline, context) {
 return JSON.stringify(stable({timeline, scene: context?.scene, sourceIdentity: context?.sourceIdentity, assets: context?.assets ?? []}));
}

function prepare(timeline, context) {
 const s = context?.scene, b = timeline?.binding, source = context?.sourceIdentity;
 require(timeline?.version === 1 && timeline.clock === 'scene-source-relative-ms', 'explicit-version-and-original-source-clock-required');
 require(s && !s.sourceId && s.phaseStartMs === undefined && s.phaseEndMs === undefined && text(s.id) && local(s.src) && finite(s.startMs) && finite(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs, 'raw-absolute-source-scene-required');
 require(b?.sceneId === s.id && b.src === s.src && b.startMs === s.startMs && b.endMs === s.endMs && sha(b.sha256), 'raw-source-binding-mismatch');
 require(source?.kind === 'video' && source.src === b.src && source.sha256 === b.sha256 && finite(source.width) && source.width > 0 && finite(source.height) && source.height > 0 && finite(source.durationSec) && source.durationSec * 1000 + .001 >= b.endMs, 'current-source-identity-required');
 require(illustration(timeline.provenance), 'explicit-original-illustration-provenance-required');
 require(Array.isArray(s.nodes) && unique(s.nodes.map(n => n?.id)) && s.nodes.every(n => text(n?.id) && text(n.text) && (n.detail === undefined || typeof n.detail === 'string') && (n.bullets === undefined || Array.isArray(n.bullets) && n.bullets.every(b => typeof b === 'string'))), 'unique-source-nodes-with-complete-text-required');
 const duration = b.endMs - b.startMs, nodes = new Map(s.nodes.map(n => [n.id, n])), assets = context.assets ?? [];
 require(Array.isArray(assets) && unique(assets.map(a => a?.src)), 'unique-current-asset-identities-required');
 const nodeRef = r => {
  const n = nodes.get(r?.nodeId);
  require(n && r.expectedText === fullNode(n), 'source-node-fulltext-mismatch');
  return fullNode(n);
 };
 require(Array.isArray(timeline.entities) && timeline.entities.length > 0 && timeline.entities.length <= 32 && Array.isArray(timeline.containers) && timeline.containers.length <= 16 && Array.isArray(timeline.events) && timeline.events.length <= 160, 'bounded-explicit-entities-containers-and-events-required');
 const ids = [...timeline.entities, ...timeline.containers].map(x => x?.id);
 require(ids.every(text) && unique(ids), 'stable-unique-instance-and-container-ids-required');
 const entities = Object.create(null), containers = Object.create(null);
 for (const c of timeline.containers) {
  require(['stack', 'anchor', 'checklist', 'archive'].includes(c.kind) && rect(c.pose) && Array.isArray(c.slots) && c.slots.length > 0 && c.slots.length <= 32 && unique(c.slots.map(x => x?.id)) && c.slots.every(x => text(x?.id) && rect(x.pose)), 'explicit-container-slots-and-normalized-poses-required');
  require(c.kind !== 'checklist' || Array.isArray(c.memberIds) && c.memberIds.length > 0 && c.memberIds.every(text) && unique(c.memberIds), 'checklist-needs-explicit-complete-member-ids');
  containers[c.id] = {id: c.id, kind: c.kind, active: true, owner: null, pose: copy(c.pose), slots: Object.fromEntries(c.slots.map(x => [x.id, {id: x.id, pose: copy(x.pose), occupant: null}])), memberIds: copy(c.kind === 'checklist' ? c.memberIds : []), motion: null, history: []};
 }
 for (const e of timeline.entities) {
  require(['media', 'text', 'task', 'document', 'summary'].includes(e.kind), 'unsupported-entity-kind');
  let content = '', document = null;
  if (e.kind === 'media') {
   const r = e.sourceRef, a = r?.asset, actual = assets.find(x => x.src === a?.src), n = nodes.get(r?.nodeId);
   require(a?.kind === 'image' && local(a.src) && sha(a.sha256) && finite(a.width) && a.width > 0 && finite(a.height) && a.height > 0 && actual?.kind === 'image' && ['src', 'sha256', 'width', 'height'].every(k => actual[k] === a[k]) && (n ? n.assetSrc === a.src && r.expectedText === fullNode(n) : s.media?.src === a.src && r.nodeId === undefined), 'verified-current-source-image-and-node-binding-required');
   content = n ? fullNode(n) : '';
  } else if (e.kind === 'document') {
   require(text(e.revisionId) && Array.isArray(e.lines) && e.lines.length > 0 && unique(e.lines.map(l => l?.id)), 'stable-document-lines-and-initial-revision-required');
   const lines = e.lines.map(l => ({id: l.id, nodeId: l.sourceRef?.nodeId, sourceText: nodeRef(l.sourceRef), text: nodeRef(l.sourceRef)}));
   require(lines.every(l => text(l.id)), 'document-line-id-required');
   document = {revisionId: e.revisionId, lines, changedLineIds: [], revisions: [{revisionId: e.revisionId, atMs: 0, changedLineIds: [], changes: []}]};
   content = lines.map(l => l.text).join('\n');
  } else if (e.kind === 'summary') {
   require(text(e.text) && illustration(e.provenance), 'explicit-authored-summary-and-provenance-required');
   content = e.text;
  } else content = nodeRef(e.sourceRef);
  if (e.kind === 'task') require(['pending', 'done'].includes(e.initialStatus) && illustration(e.provenance), 'explicit-illustrative-initial-task-status-required');
  entities[e.id] = {id: e.id, kind: e.kind, sourceRef: copy(e.sourceRef ?? null), text: content, active: false, spawned: false, owner: null, pose: null, motion: null, cloneOf: null, status: e.kind === 'task' ? e.initialStatus : null, statusHistory: [], document, summary: null, history: []};
 }
 const memberIds = Object.values(containers).flatMap(c => c.memberIds);
 require(unique(memberIds) && memberIds.every(id => entities[id]?.kind === 'task'), 'checklist-members-must-be-known-distinct-task-instances');
 let previous = -1;
 require(unique(timeline.events.map(e => e?.id)), 'stable-unique-event-ids-required');
 for (const e of timeline.events) {
  require(text(e?.id) && finite(e.atMs) && e.atMs >= previous && e.atMs >= 0 && e.atMs <= duration, 'events-must-be-explicit-source-ordered-with-stable-ids');
  previous = e.atMs;
  if (['move', 'attach', 'detach', 'archive', 'layout'].includes(e.type)) require(finite(e.endMs) && e.endMs > e.atMs && e.endMs <= duration, 'explicit-motion-end-inside-source-scene-required');
 }
 return {entities, containers, duration, eventsApplied: [], sourceCopy: persistentEntitiesSourceCopy(context)};
}

function subject(state, ref) {
 const result = ref?.kind === 'entity' ? state.entities[ref.id] : ref?.kind === 'container' ? state.containers[ref.id] : null;
 require(result?.active, 'active-subject-required');
 return result;
}
function parent(state, owner) {
 const c = state.containers[owner?.containerId], slot = c?.slots[owner?.slotId];
 require(c?.active && slot, 'existing-active-container-slot-required');
 return {c, slot};
}
function slotPose(slot, t) { return slot.motion ? mix(slot.motion.from, slot.motion.to, progress(slot.motion, t)) : slot.pose; }
function world(state, object, t, seen = new Set()) {
 require(!seen.has(object.id), 'container-cycle-rejected');
 seen.add(object.id);
 if (object.motion && t < object.motion.endMs) return mix(object.motion.from, object.motion.to, progress(object.motion, t));
 if (!object.owner) return copy(object.pose);
 const {c, slot} = parent(state, object.owner);
 return compose(world(state, c, t, seen), slotPose(slot, t));
}
function ancestors(state, object) {
 const result = [];
 while (object.owner) { object = parent(state, object.owner).c; require(!result.includes(object.id), 'container-cycle-rejected'); result.push(object.id); }
 return result;
}
function assertIdleFamily(state, ref, atMs) {
 const o = subject(state, ref), lineage = ancestors(state, o);
 for (const item of [...Object.values(state.entities), ...Object.values(state.containers)].filter(x => x.active)) {
  if (item.id === o.id || lineage.includes(item.id) || ancestors(state, item).includes(o.id)) {
   require(!item.motion || item.motion.endMs <= atMs, 'overlapping-subject-or-ancestor-motion-rejected');
   if (item.slots) require(Object.values(item.slots).every(s => !s.motion || s.motion.endMs <= atMs), 'overlapping-container-layout-rejected');
  }
 }
}
function acquire(state, ref, target, pose, t) {
 const o = subject(state, ref);
 if (target === null) { require(rect(pose), 'explicit-stage-pose-required'); o.owner = null; o.pose = copy(pose); return; }
 const {c, slot} = parent(state, target);
 require(!slot.occupant || refKey(slot.occupant) === refKey(ref), 'destination-slot-already-owned');
 require(ref.kind !== 'container' || c.id !== o.id && !ancestors(state, c).includes(o.id), 'container-cycle-rejected');
 require(poseSame(pose, compose(world(state, c, t), slotPose(slot, t))), 'destination-pose-must-match-authored-slot');
 slot.occupant = copy(ref); o.owner = copy(target); o.pose = null;
 // Membership is an authored inventory, not just today's visible descendants.
 // Omitting a spawn or retiring a pending row cannot shrink a later summary.
 for (const task of Object.values(state.entities).filter(x => x.active && x.kind === 'task')) {
  for (const id of ancestors(state, task)) { const checklist = state.containers[id]; require(checklist.kind !== 'checklist' || checklist.memberIds.includes(task.id), 'checklist-membership-must-be-authored'); }
 }
}
function release(state, ref) {
 const o = subject(state, ref);
 if (o.owner) { const {slot} = parent(state, o.owner); require(refKey(slot.occupant) === refKey(ref), 'ownership-history-mismatch'); slot.occupant = null; }
 o.owner = null;
}
function apply(state, event) {
 const e = event, ref = e.subject;
 if (e.type === 'spawn' || e.type === 'clone') {
  let o;
  if (e.type === 'clone') {
   const original = subject(state, {kind: 'entity', id: e.cloneOf});
   require(['media', 'text'].includes(original.kind) && text(e.instanceId) && !state.entities[e.instanceId] && !state.containers[e.instanceId], 'clone-needs-new-id-and-immutable-media-or-text-source');
   assertIdleFamily(state, {kind: 'entity', id: original.id}, e.atMs);
   o = copy(original); Object.assign(o, {id: e.instanceId, cloneOf: original.id, active: false, spawned: false, owner: null, motion: null, history: []}); state.entities[o.id] = o;
  } else { o = state.entities[e.instanceId]; require(o && o.kind !== 'summary' && !o.spawned, 'entity-can-spawn-once-summary-needs-members'); }
  o.active = true; o.spawned = true;
  acquire(state, {kind: 'entity', id: o.id}, e.to, e.pose, e.atMs);
  o.history.push({eventId: e.id, type: e.type, atMs: e.atMs});
 } else if (['move', 'attach', 'detach', 'archive'].includes(e.type)) {
  const o = subject(state, ref); assertIdleFamily(state, ref, e.atMs);
  require(ownerSame(o.owner, e.from), 'explicit-current-owner-must-match');
  require(rect(e.fromPose) && rect(e.toPose) && poseSame(world(state, o, e.atMs), e.fromPose), 'motion-origin-must-match-current-instance');
  require(e.type !== 'detach' || e.to === null, 'detach-must-explicitly-return-to-stage');
  require(e.type !== 'attach' || e.to !== null, 'attach-needs-explicit-slot');
  if (e.to) {
   const target = parent(state, e.to); assertIdleFamily(state, {kind: 'container', id: target.c.id}, e.atMs);
   require(e.type !== 'archive' || target.c.kind === 'archive', 'archive-needs-declared-archive-container');
  } else require(e.type !== 'archive', 'archive-needs-declared-archive-container');
  release(state, ref); acquire(state, ref, e.to, e.toPose, e.atMs);
  o.motion = {eventId: e.id, atMs: e.atMs, endMs: e.endMs, from: copy(e.fromPose), to: copy(e.toPose)};
  o.history.push({eventId: e.id, type: e.type, atMs: e.atMs, endMs: e.endMs, from: copy(e.from), to: copy(e.to)});
 } else if (e.type === 'layout') {
  const c = subject(state, {kind: 'container', id: e.containerId}); assertIdleFamily(state, {kind: 'container', id: c.id}, e.atMs);
  require(Array.isArray(e.slots) && unique(e.slots.map(s => s?.id)) && e.slots.length === Object.keys(c.slots).length, 'layout-must-explicitly-preserve-every-slot');
  for (const item of e.slots) {
   const s = c.slots[item.id]; require(s && rect(item.fromPose) && rect(item.toPose) && poseSame(slotPose(s, e.atMs), item.fromPose), 'layout-origin-or-stable-slot-mismatch');
   s.motion = {eventId: e.id, atMs: e.atMs, endMs: e.endMs, from: copy(item.fromPose), to: copy(item.toPose)}; s.pose = copy(item.toPose);
  }
  c.history.push({eventId: e.id, type: e.type, atMs: e.atMs, endMs: e.endMs});
 } else if (e.type === 'setStatus') {
  const o = subject(state, {kind: 'entity', id: e.instanceId});
  require(o.kind === 'task' && o.status === e.from && ['pending', 'done'].includes(e.to) && e.to !== e.from && illustration(e.provenance), 'task-status-needs-explicit-current-state-and-illustration');
  o.status = e.to; o.statusHistory.push({eventId: e.id, atMs: e.atMs, from: e.from, to: e.to, provenance: copy(e.provenance)});
 } else if (e.type === 'summarize') {
  const o = state.entities[e.instanceId], c = subject(state, {kind: 'container', id: e.containerId});
  require(o?.kind === 'summary' && !o.spawned && c.kind === 'checklist' && illustration(e.provenance), 'explicit-unspawned-summary-and-checklist-required');
  const members = c.memberIds.map(id => state.entities[id]);
  require(members.every(m => m?.active && ancestors(state, m).includes(c.id)), 'summary-cannot-hide-retired-or-detached-member-tasks');
  require(Array.isArray(e.memberIds) && e.memberIds.length > 0 && unique(e.memberIds) && same([...e.memberIds].sort(), members.map(x => x.id).sort()), 'summary-must-reference-all-active-member-tasks');
  require(Array.isArray(e.expectedMembers) && unique(e.expectedMembers.map(x => x?.instanceId)) && e.expectedMembers.length === members.length && members.every(m => e.expectedMembers.some(x => x.instanceId === m.id && x.text === m.text && x.status === m.status)), 'summary-cannot-drop-fulltext-conditions-or-pending-status');
  const pending = members.filter(m => m.status !== 'done').map(m => m.id);
  require(e.completion === (pending.length ? 'mixed' : 'all-done'), 'summary-completion-must-match-explicit-member-statuses');
  o.summary = {containerId: c.id, memberIds: [...e.memberIds], members: e.memberIds.map(id => { const m = state.entities[id]; return {instanceId: id, sourceRef: copy(m.sourceRef), text: m.text, status: m.status}; }), unresolvedMemberIds: pending, completion: e.completion, provenance: copy(e.provenance), atMs: e.atMs};
  o.active = true; o.spawned = true; acquire(state, {kind: 'entity', id: o.id}, e.to, e.pose, e.atMs);
  o.history.push({eventId: e.id, type: e.type, atMs: e.atMs});
 } else if (e.type === 'revise') {
  const o = subject(state, {kind: 'entity', id: e.instanceId}), doc = o.document;
  require(doc && e.fromRevisionId === doc.revisionId && text(e.toRevisionId) && !doc.revisions.some(r => r.revisionId === e.toRevisionId) && illustration(e.provenance), 'revision-needs-current-version-new-id-and-illustration');
  require(Array.isArray(e.changes) && e.changes.length > 0 && unique(e.changes.map(x => x?.lineId)) && Array.isArray(e.changedLineIds) && unique(e.changedLineIds) && same([...e.changedLineIds].sort(), e.changes.map(x => x.lineId).sort()), 'changed-line-ids-must-exactly-match-revision-changes');
  for (const ch of e.changes) {
   const line = doc.lines.find(l => l.id === ch.lineId);
   // This minimal slice only permits an explicit additive revision. Rewriting a
   // condition is intentionally unsupported until it has a separate review UI.
   require(line && ch.beforeText === line.text && text(ch.afterText) && ch.afterText !== ch.beforeText && ch.afterText.includes(ch.beforeText), 'revision-cannot-delete-or-rewrite-existing-conditions');
   line.text = ch.afterText;
  }
  doc.revisionId = e.toRevisionId; doc.changedLineIds = [...new Set([...doc.changedLineIds, ...e.changedLineIds])];
  doc.revisions.push({eventId: e.id, revisionId: e.toRevisionId, previousRevisionId: e.fromRevisionId, atMs: e.atMs, changedLineIds: [...e.changedLineIds], changes: copy(e.changes), provenance: copy(e.provenance)});
  o.text = doc.lines.map(l => l.text).join('\n');
 } else if (e.type === 'retire') {
  const o = subject(state, ref); assertIdleFamily(state, ref, e.atMs);
  require(text(e.reason) && (ref.kind !== 'container' || Object.values(o.slots).every(s => s.occupant === null)), 'explicit-retirement-cannot-implicitly-consume-members');
  release(state, ref); o.active = false; o.retiredAtMs = e.atMs; o.history.push({eventId: e.id, type: e.type, atMs: e.atMs, reason: e.reason});
 } else require(false, 'unsupported-persistent-event');
 state.eventsApplied.push(e.id);
}

function replay(timeline, context, elapsed) {
 const state = prepare(timeline, context);
 for (const e of timeline.events) {
  if (e.atMs > elapsed) break;
  try { apply(state, e); } catch (error) { throw new Error(`event:${e.id}:${error.message}`); }
 }
 for (const o of [...Object.values(state.entities), ...Object.values(state.containers)]) if (o.active) o.worldPose = world(state, o, elapsed);
 return state;
}

/** Check the entire authored sequence, including future illegal ownership. */
export function persistentEntitiesIssues(timeline, context) {
 try { const initial = prepare(timeline, context); replay(timeline, context, initial.duration); return []; }
 catch (error) { return [error instanceof Error ? error.message : 'invalid-persistent-timeline']; }
}

/** absoluteSourceMs is the actual original-file clock, never the output clock.
 * The returned state is semantic/geometry preparation only. A future consumer
 * must additionally verify every retained projection, font page, asset decode,
 * person/subtitle envelope and single audio owner before its opaque UI receipt. */
export function persistentEntitiesState(timeline, context, absoluteSourceMs) {
 const issues = persistentEntitiesIssues(timeline, context), b = timeline?.binding;
 if (!finite(absoluteSourceMs) || !b || absoluteSourceMs < b.startMs || absoluteSourceMs > b.endMs) issues.push('absolute-source-sample-outside-bound-scene');
 const base = {status: issues.length ? 'blocked' : 'valid', issues, canApply: false, uiAccepted: false, nativeReadiness: 'unverified', sourceMs: absoluteSourceMs};
 if (issues.length) return {...base, entities: {}, containers: {}, eventsApplied: [], sourceCopy: ''};
 return {...base, ...replay(timeline, context, absoluteSourceMs - b.startMs), elapsedMs: absoluteSourceMs - b.startMs, key: persistentEntitiesKey(timeline, context)};
}
