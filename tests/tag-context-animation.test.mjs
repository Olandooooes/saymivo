import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import ts from 'typescript';
import {tagAnimationEnvelope,tagContextEnvelope,tagLineEnvelope} from '../src/tag-animation.mjs';
import {emphasisGeometry} from '../src/emphasis-layout.mjs';

const tag={id:'answer',text:'回答问题',x:.04,y:.12,width:.28,atMs:1000,endMs:5000,animation:{inMs:220,outMs:180}};
test('held context crossfades fill to a faint outline over280ms inside the original tag window',()=>{
 const held={...tag,contextAtMs:3000};
 assert.deepEqual(tagContextEnvelope(held,2999),{enabled:true,progress:0,fillOpacity:1,outlineOpacity:0,underlineOpacity:1});
 assert.equal(tagContextEnvelope(held,3000).progress,0);
 const halfway=tagContextEnvelope(held,3140);assert.equal(halfway.progress,.875);assert.equal(halfway.fillOpacity,.125);assert.equal(halfway.outlineOpacity,.28);assert.equal(halfway.underlineOpacity,.125);
 assert.deepEqual(tagContextEnvelope(held,3280),{enabled:true,progress:1,fillOpacity:0,outlineOpacity:.32,underlineOpacity:0});
 assert.equal(tagContextEnvelope(held,4999).outlineOpacity,.32);
 for(const ms of [999,5000,6000]){const value=tagContextEnvelope(held,ms);assert.equal(value.fillOpacity,0);assert.equal(value.outlineOpacity,0);assert.equal(value.underlineOpacity,0);}
});
test('context never changes entry/exit, geometry or explicit line anchors and never mutates a tag',()=>{
 const held={...tag,text:'能执行\n≠ 可靠',lineAtMs:[1000,2600],contextAtMs:3000},before=structuredClone(held);
 for(const ms of [999,1000,1100,2000,2600,3000,3140,3400,4900,5000]){
  const {contextAtMs,...plain}=held;
  for(const kind of ['label','kinetic'])assert.deepEqual(tagAnimationEnvelope(held,ms,kind),tagAnimationEnvelope(plain,ms,kind));
  assert.deepEqual(emphasisGeometry(held,1920,1080,ms),emphasisGeometry(plain,1920,1080,ms));
  assert.deepEqual(tagLineEnvelope(held,1,2,ms),tagLineEnvelope(plain,1,2,ms));
 }
 assert.deepEqual(held,before);assert.equal(tagLineEnvelope(held,1,2,2500).opacity,0);assert.equal(tagLineEnvelope(held,1,2,3400).opacity,1);
});
test('ordinary tags and invalid context values preserve the original solid treatment exactly',()=>{
 const solid={enabled:false,progress:0,fillOpacity:1,outlineOpacity:0,underlineOpacity:1};
 for(const contextAtMs of [undefined,null,NaN,Infinity,999,5000,6000])for(const ms of [999,1000,3000,5000])assert.deepEqual(tagContextEnvelope({...tag,contextAtMs},ms),solid);
 assert.equal(tagContextEnvelope({...tag,contextAtMs:tag.atMs},tag.atMs).progress,0);
 const tiny={...tag,endMs:1040,contextAtMs:1020};assert.ok(tagContextEnvelope(tiny,1039).outlineOpacity>0);assert.equal(tagContextEnvelope(tiny,1040).outlineOpacity,0);
});

const fieldSource=fs.readFileSync(new URL('../editor/TagAnimationFields.tsx',import.meta.url),'utf8').replace("from 'react'",`from ${JSON.stringify(import.meta.resolve('react'))}`);
const compiled=ts.transpileModule(fieldSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {TagAnimationFields}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function findField(node,label){
 if(!node||typeof node!=='object')return;
 if(node.props?.['aria-label']===label)return node;
 for(const child of [node.props?.children].flat(Infinity)){const result=findField(child,label);if(result)return result;}
}
test('the real editor context field is optional, clearable and clamps to the existing visible window',()=>{
 const calls=[],before=structuredClone(tag),props={tag,kinetic:true,onChange:()=>{},onLineTimingsChange:()=>{}};
 const unconnected=findField(TagAnimationFields(props),'转为轮廓秒 answer');assert.equal(unconnected.props.disabled,true);assert.equal(unconnected.props.value,'');
 const field=findField(TagAnimationFields({...props,onContextTimingChange:value=>calls.push(value)}),'转为轮廓秒 answer');
 assert.equal(field.props.disabled,false);assert.equal(field.props.min,1);assert.equal(field.props.max,4.999);
 for(const value of ['3.125','99','-1','','bad'])field.props.onChange({target:{value}});
 assert.deepEqual(calls,[3125,4999,1000,undefined]);assert.deepEqual(tag,before);
 const restored=findField(TagAnimationFields({...props,tag:{...tag,contextAtMs:3125},onContextTimingChange:()=>{}}),'转为轮廓秒 answer');assert.equal(restored.props.value,3.125);
});
