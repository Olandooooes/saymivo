import test from 'node:test';
import assert from 'node:assert/strict';
import {motionReferenceCatalog,motionReferenceSources,motionReferenceGroups,motionReferenceCoverage,localMotionPresetCoverage,motionReferenceImplementationState} from '../src/motion-reference-catalog.mjs';
import {dynamicMotionLibrary} from '../src/dynamic-motion-library.mjs';

test('all five studied source inventories survive consolidation into reuse groups',()=>{
 assert.deepEqual(motionReferenceSources.map(source=>source.episode),[77,75,74,73,72]);
 assert.deepEqual(motionReferenceSources.map(source=>motionReferenceCatalog.filter(entry=>entry.source.videoId===source.videoId).length),[18,18,10,12,8]);
 assert.equal(new Set(motionReferenceCatalog.map(entry=>entry.id)).size,66);
 assert.equal(motionReferenceGroups.length,19);
 for(const entry of motionReferenceCatalog){
  assert.ok(motionReferenceGroups.some(group=>group.id===entry.reusableClassId));
  assert.ok(entry.observation.rangesSec.length);
  for(const [from,to] of entry.observation.rangesSec)assert.ok(from>=0&&to>=from&&to<=entry.source.durationSec+1);
  assert.equal(entry.observation.range.exactStartSec,null);
  assert.equal(entry.observation.range.exactEndSec,null);
  assert.equal(entry.narration.audioVerified,false);
 }
});
test('public dates and temporal observations are distinct from production availability',()=>{
 assert.deepEqual(motionReferenceSources.map(source=>source.publishedAt),['2026-10-22 19:31','2026-10-17 18:48','2026-10-14 08:09','2026-10-13 10:35','2026-10-10 14:35']);
 assert.equal(motionReferenceCoverage.exhaustive,false);
 assert.ok(motionReferenceCatalog.find(entry=>entry.id==='e75-bounded-agent').phases.movement.description.includes('未见触边'));
 assert.ok(motionReferenceCatalog.find(entry=>entry.id==='e74-quantitative-comparison').phases.movement.description.includes('非线性'));
 for(const entry of motionReferenceCatalog){
  assert.ok(entry.implementation.status!=='implemented');
  for(const id of entry.implementation.presetIds)assert.ok(localMotionPresetCoverage.some(preset=>preset.id===id&&preset.available));
  for(const id of entry.implementation.preparedIds)assert.ok(!localMotionPresetCoverage.some(preset=>preset.id===id&&preset.available));
  assert.equal(entry.implementation.uiAccepted,false);
  assert.equal(entry.implementation.referenceEquivalent,false);
  for(const id of entry.implementation.entryIds)assert.ok(dynamicMotionLibrary.some(item=>item.id===id),'stale registered mapping '+id);
 }
 const publicData=JSON.stringify([motionReferenceCatalog,motionReferenceSources]);
 assert.doesNotMatch(publicData,/\/Users\/|inspection\/|native-\d|capture-log/);
});
test('registered primitives are mapped as experimental configuration, never as source-equivalent or UI accepted',()=>{
 const expected={
  'e77-paired-relation-layout':['paired-relations:correspondence','paired-relations:horizontal-alternate','paired-relations:bidirectional'],
  'e77-state-veil':['veil-state'],
  'e77-audio-synchronized-comparison':['audio-clock-ab'],
  'e72-full-picture-blur-zoom-transition':['full-frame-blur-zoom'],
  'e77-rolling-board':['field-roll-board'],
  'e77-set-boundary-and-barrier':['conditional-set','bounded-agent-runner'],
  'e75-elapsed-proof-receipt':['typed-data-clock'],
  'e73-task-checklist-summary':['persistent-entities']
 };
 for(const [id,entryIds] of Object.entries(expected)){
  const entry=motionReferenceCatalog.find(e=>e.id===id),state=motionReferenceImplementationState(entry,dynamicMotionLibrary.map(item=>item.id));
  assert.deepEqual(state.entryIds,entryIds);assert.equal(entry.implementation.status,'partial');assert.equal(state.label,'实验配置已接入 · 本场需核验');assert.equal(state.uiAccepted,false);assert.equal(state.referenceEquivalent,false);assert.match(entry.implementation.acceptance,/尚未.*UI/);
 }
 const veil=motionReferenceCatalog.find(e=>e.id==='e77-state-veil');assert.ok(!veil.implementation.missingParts.some(s=>s.includes('无独立状态')));
 const audio=motionReferenceCatalog.find(e=>e.id==='e77-audio-synchronized-comparison');assert.ok(audio.implementation.missingParts.some(s=>s.includes('实时累计')));
});
test('live registry removal, basic-only coverage and real material requirements do not create false launch readiness',()=>{
 const veil=motionReferenceCatalog.find(e=>e.id==='e77-state-veil'),missing=motionReferenceImplementationState(veil,[]);assert.deepEqual(missing.entryIds,[]);assert.deepEqual(missing.unregisteredIds,['veil-state']);assert.match(missing.label,/待接入/);
 const basic=motionReferenceImplementationState(motionReferenceCatalog.find(e=>e.id==='e77-person-depth-type'),[]);assert.match(basic.label,/相关基础预设/);assert.equal(basic.referenceEquivalent,false);
 for(const id of ['e72-interview-camera-editing','e72-physical-screen-evidence']){const state=motionReferenceImplementationState(motionReferenceCatalog.find(e=>e.id===id),dynamicMotionLibrary.map(e=>e.id));assert.deepEqual(state.entryIds,[]);assert.equal(state.label,'依赖实拍素材与剪辑');}
});
