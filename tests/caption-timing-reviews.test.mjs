import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCaptionTimingReviews} from '../src/caption-timing-review.mjs';

const caption=(id,text,startMs,endMs,clipId='source-cut1')=>({
 id,clipId,startMs,endMs,holdMs:700,topPct:91,scale:.65,
 words:[{text,startMs,endMs,accent:false}],
});
const review=(c,startMs,endMs,id='timing')=>({
 id,anchor:{startMs:c.startMs,endMs:c.endMs,text:c.words.map(w=>w.text).join('')},
 range:{startMs,endMs},holdMs:0,
});
const untouched=(before,result)=>{
 assert.deepEqual(result.captions,before);
 assert.ok(Array.isArray(result.report)&&result.report.length>0,'Rejected edits must be reported');
};

test('cue timing changes display bounds and hold without rewriting recognition words or mutating inputs',()=>{
 const input=[caption('page-20','所以我判断一个 ag ent，好不好用？',69330,71770)],before=structuredClone(input);
 const patch=review(input[0],69760,72120),patchBefore=structuredClone(patch);
 patch.anchor.text='所以我判断一个AGENT好不好用';patchBefore.anchor.text=patch.anchor.text;
 const result=applyCaptionTimingReviews(input,[patch],{sourceDurationMs:127940});
 assert.equal(result.captions[0].startMs,69760);assert.equal(result.captions[0].endMs,72120);
 assert.equal(result.captions[0].holdMs,0);assert.equal(result.captions[0].timingScope,'cue');
 assert.deepEqual(result.captions[0].words,before[0].words);
 assert.equal(result.captions[0].words[0].startMs,69330,'Cue bounds may differ from retained ASR word estimates');
 assert.deepEqual(result.captions[0].reviewOriginalTiming,patch.anchor);
 assert.deepEqual(input,before);assert.deepEqual(patch,patchBefore);
});

test('the complete original anchor distinguishes repeated wording without relying on caption ids',()=>{
 const first=caption('one','同一句。',1000,2000),second=caption('two','同一句。',4000,5000);
 const result=applyCaptionTimingReviews([first,second],[review(second,4200,5100)]);
 assert.deepEqual(result.captions[0],first);assert.equal(result.captions[1].startMs,4200);
 assert.equal(result.captions[1].endMs,5100);assert.deepEqual(result.captions[1].words,second.words);
});

test('an identical text and time anchor on two clips is ambiguous and cannot choose a caption by id',()=>{
 const input=[caption('one','同一句',1000,2000,'source-a'),caption('two','同一句',1000,2000,'source-b')];
 const before=structuredClone(input),result=applyCaptionTimingReviews(input,[review(input[0],1200,2200)]);
 untouched(before,result);assert.deepEqual(input,before);
});

test('two neighboring cues may move a shared boundary atomically without temporary overlap rejection',()=>{
 const input=[caption('first','前一句',1000,2000),caption('next','后一句',2000,3000)];
 const patches=[review(input[0],1000,2300,'first'),review(input[1],2300,3200,'next')];
 const before=structuredClone({input,patches});
 const forward=applyCaptionTimingReviews(input,patches,{sourceDurationMs:4000});
 const reverse=applyCaptionTimingReviews(input,[...patches].reverse(),{sourceDurationMs:4000});
 assert.deepEqual(forward.captions.map(c=>[c.startMs,c.endMs]),[[1000,2300],[2300,3200]]);
 assert.deepEqual(reverse.captions,forward.captions);
 assert.deepEqual(forward.captions.map(c=>c.words),input.map(c=>c.words));
 assert.deepEqual({input,patches},before);
});

test('consecutive identical text retains exclusive original anchors when moved into another cue old range',()=>{
 const input=[caption('first','同一句',1000,2000),caption('next','同一句',2000,3000)];
 const patches=[review(input[0],2000,3000,'first'),review(input[1],3000,4000,'next')];
 const forward=applyCaptionTimingReviews(input,patches),reverse=applyCaptionTimingReviews(input,[...patches].reverse());
 assert.deepEqual(forward.captions.map(c=>[c.startMs,c.endMs]),[[2000,3000],[3000,4000]]);
 assert.deepEqual(reverse.captions,forward.captions,'Review order must not make the moved first cue shadow the second original anchor');
 assert.ok(forward.report.every(r=>r.status==='applied'));
 const replay=applyCaptionTimingReviews(forward.captions,patches);
 assert.deepEqual(replay.captions,forward.captions);
 assert.ok(replay.report.every(r=>r.status==='unchanged'),'Existing original anchors must also remain exclusive on replay');
});

test('a conflicting batch rejects every proposed cue edit including an otherwise valid earlier edit',()=>{
 const input=[caption('first','前一句',1000,2000),caption('next','后一句',2000,3000),caption('third','另一句',4000,5000)];
 const patches=[review(input[2],4100,5100,'valid'),review(input[0],1000,2400,'first'),review(input[1],2300,3200,'next')];
 const before=structuredClone(input);untouched(before,applyCaptionTimingReviews(input,patches,{sourceDurationMs:6000}));
 assert.deepEqual(input,before);
});

test('an unchanged neighboring cue in the same clip protects its boundary even when input order differs',()=>{
 const first=caption('first','前一句',1000,2000),next=caption('next','后一句',2000,3000);
 const input=[next,first],before=structuredClone(input);
 untouched(before,applyCaptionTimingReviews(input,[review(first,1000,2100)]));
});

test('captions from different clips do not create a false neighboring-boundary conflict',()=>{
 const first=caption('first','当前素材',1000,2000,'source-a'),other=caption('other','另一素材',2200,3200,'source-b');
 const result=applyCaptionTimingReviews([other,first],[review(first,1000,2600)]);
 assert.deepEqual(result.captions[0],other);assert.equal(result.captions[1].endMs,2600);
 assert.equal(result.captions[1].timingScope,'cue');assert.deepEqual(result.captions[1].words,first.words);
});

test('replaying the same timing review is idempotent after caption ids have changed',()=>{
 const source=caption('old-id','所以我判断一个Agent好不好用',69330,71770);
 const patch=review(source,69760,72120),first=applyCaptionTimingReviews([source],[patch]);
 const renamed=first.captions.map(c=>({...c,id:'new-pagination-id'}));
 const result=applyCaptionTimingReviews(renamed,[patch]);
 assert.deepEqual(result.captions,renamed);assert.deepEqual(result.captions[0].words,source.words);
 assert.deepEqual(result.captions[0].reviewOriginalTiming,patch.anchor);
});

test('a later range correction may match stored original timing without losing the original anchor or words',()=>{
 const source=caption('cue','同一句',1000,2000),firstPatch=review(source,1200,2100);
 const first=applyCaptionTimingReviews([source],[firstPatch]);
 const nextPatch={...firstPatch,id:'later',range:{startMs:1300,endMs:2200}};
 const result=applyCaptionTimingReviews(first.captions,[nextPatch]);
 assert.equal(result.captions[0].startMs,1300);assert.equal(result.captions[0].endMs,2200);
 assert.deepEqual(result.captions[0].reviewOriginalTiming,firstPatch.anchor);
 assert.deepEqual(result.captions[0].words,source.words);
});

test('the source-duration limit permits its exact endpoint and rejects ranges outside the original media',()=>{
 const input=[caption('cue','原话',1000,1800)],before=structuredClone(input);
 const valid=applyCaptionTimingReviews(input,[review(input[0],1200,2000)],{sourceDurationMs:2000});
 assert.equal(valid.captions[0].endMs,2000);
 untouched(before,applyCaptionTimingReviews(input,[review(input[0],1200,2001)],{sourceDurationMs:2000}));
 assert.equal(applyCaptionTimingReviews(input,[review(input[0],1200,2600)]).captions[0].endMs,2600);
});

test('retained clip limits allow exact endpoints while rejecting a cue that crosses either cut',()=>{
 const input=[caption('cue','原话',1200,2000)],before=structuredClone(input);
 const options={sourceDurationMs:5000,clipRanges:{'source-cut1':{startMs:1000,endMs:2500}}};
 const valid=applyCaptionTimingReviews(input,[review(input[0],1000,2500)],options);
 assert.deepEqual([valid.captions[0].startMs,valid.captions[0].endMs],[1000,2500]);
 untouched(before,applyCaptionTimingReviews(input,[review(input[0],999,2400)],options));
 untouched(before,applyCaptionTimingReviews(input,[review(input[0],1100,2501)],options));
 assert.deepEqual(input,before);
});

test('negative, empty and non-finite display ranges leave recognition and cue state untouched',()=>{
 const input=[caption('cue','原话',1000,2000)],before=structuredClone(input);
 for(const [startMs,endMs] of [[-1,1500],[2000,2000],[2300,2100],[NaN,2100],[1100,Infinity]]){
  untouched(before,applyCaptionTimingReviews(input,[review(input[0],startMs,endMs)]));
 }
 assert.deepEqual(input,before);
});
