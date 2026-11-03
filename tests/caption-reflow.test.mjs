import test from 'node:test';import assert from 'node:assert/strict';import {reflowCaptionPages} from '../src/build-caption-pages.mjs';
const cue=(id,words,extra={})=>({id,clipId:'a',topPct:88,startMs:words[0].startMs,endMs:words.at(-1).endMs,words,...extra});
const words=text=>[...text].map((text,i)=>({text,startMs:i*100,endMs:(i+1)*100,accent:i===3}));
test('reflow repairs previously split words and preserves all exact words/times/styles, with stable repeat results',()=>{
 const ws=words('我们需要调用工具完成任务然后继续检查'),caps=[cue('old1',ws.slice(0,5)),cue('old2',ws.slice(5))],before=structuredClone(caps);
 const result=reflowCaptionPages(caps);assert.deepEqual(result.flatMap(c=>c.words),ws);assert.deepEqual(caps,before);
 assert.ok(!result.some(c=>c.words.map(w=>w.text).join('').endsWith('调')));assert.deepEqual(reflowCaptionPages(result),result);
});
test('motion, reviewed cue timing, styles and source clips are hard boundaries',()=>{
 const ws=words('调用工具');for(const extra of [{motion:{kind:'emphasis'}},{timingScope:'cue'},{reviewOriginalTiming:{startMs:0,endMs:200,text:'调用'}}]){
  const first=cue('a',ws.slice(0,2),extra),result=reflowCaptionPages([first,cue('b',ws.slice(2))]);assert.equal(result.length,2);assert.deepEqual(result[0].words,first.words);assert.equal(result[0].endMs,first.endMs);
 }
 const styles=[cue('a',ws.slice(0,2),{styleOverride:{font:'song'}}),cue('b',ws.slice(2),{clipId:'other'})];assert.equal(reflowCaptionPages(styles).length,2);
});
