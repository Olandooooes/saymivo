import {test} from 'node:test';
import assert from 'node:assert/strict';
import {balancedEmphasisTags,emphasisGeometry} from '../src/emphasis-layout.mjs';
test('paired emphasis uses both speaker side zones without changing words or source timing',()=>{
 const tags=['找资料','核对信息','整理表格'].map((text,i)=>({id:String(i),text,x:.04,y:.1,atMs:i*400,endMs:4000})),before=structuredClone(tags);
 const result=balancedEmphasisTags(tags);
 assert.deepEqual(result.map(t=>t.x),[.04,.69,.04]);assert.equal(result[2].y,.43);
 assert.deepEqual(result.map(t=>[t.text,t.atMs,t.endMs]),tags.map(t=>[t.text,t.atMs,t.endMs]));assert.deepEqual(tags,before);
});
test('right emphasis fits its remaining width and exits before its source endpoint',()=>{
 const tag={text:'执行一项任务',x:.69,y:.12,atMs:1000,endMs:4000};
 const mid=emphasisGeometry(tag,1920,1080,2000),out=emphasisGeometry(tag,1920,1080,3900);
 assert.ok(mid.size*6*1.02<=1920*(.96-tag.x)+.01);assert.equal(mid.opacity,1);
 assert.ok(out.opacity<mid.opacity&&out.x>0);assert.equal(emphasisGeometry(tag,1920,1080,4000).opacity,0);
 assert.equal(emphasisGeometry(tag,1920,1080,1000).opacity,0);
});
test('multiline emphasis reveals in reading order and settles before exit even in short source windows',async()=>{
 const {emphasisLineGeometry}=await import('../src/emphasis-layout.mjs');
 for(const duration of [300,1330,4000])for(const lines of [2,3,5]){
  const tag={atMs:1000,endMs:1000+duration};
  const first=emphasisLineGeometry(tag,0,lines,1020),last=emphasisLineGeometry(tag,lines-1,lines,1020);
  assert.ok(first.opacity>=last.opacity);assert.ok(first.y<=last.y);
  assert.deepEqual(emphasisLineGeometry(tag,lines-1,lines,1000+duration*.6),{opacity:1,y:0});
 }
 assert.deepEqual(emphasisLineGeometry({atMs:1000,endMs:2000},0,1,1000),{opacity:1,y:0});
});
test('comparison line break enlarges the subject while preserving original characters and source timing',()=>{
 const tag={id:'comparison',text:'当代的齐民要术',x:.69,y:.12,atMs:480,endMs:3100};
 const wrapped=balancedEmphasisTags([tag],'right')[0];assert.equal(wrapped.text,'当代的\n齐民要术');assert.equal(wrapped.text.replaceAll('\n',''),tag.text);
 assert.deepEqual([wrapped.atMs,wrapped.endMs],[480,3100]);
 assert.ok(emphasisGeometry(wrapped,1920,1080,1500).size>emphasisGeometry(tag,1920,1080,1500).size*1.5);
 for(const text of ['HowToLiveBetter','究竟是什么呢','核对信息','当代的\n齐民要术'])assert.equal(balancedEmphasisTags([{...tag,text}])[0].text,text);
});
