import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {kineticWholeLineEnvelope,tagAnimationEnvelope,tagLineEnvelope} from '../src/tag-animation.mjs';

// Exercise the actual SceneTags JSX without starting Remotion or a browser.
const source=fs.readFileSync(new URL('../src/StoryboardLayer.tsx',import.meta.url),'utf8');
const parsed=ts.createSourceFile('StoryboardLayer.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='SceneTags');
assert.ok(declaration);
const moduleSource=`import React from ${JSON.stringify(import.meta.resolve('react'))};
import {emphasisGeometry,emphasisLineGeometry} from ${JSON.stringify(import.meta.resolve('../src/emphasis-layout.mjs'))};
import {tagAnimationEnvelope,tagContextEnvelope,kineticWholeLineEnvelope} from ${JSON.stringify(import.meta.resolve('../src/tag-animation.mjs'))};
const AbsoluteFill='div',font='body',displayFont='display';
const useVideoConfig=()=>({width:1920,height:1080});
export ${declaration.getText(parsed)}`;
const compiled=ts.transpileModule(moduleSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const {SceneTags}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const tag={id:'task',text:'执行任务',x:.69,y:.12,atMs:1000,endMs:5000};
const tree=(tag,ms,tagTreatment='kinetic')=>SceneTags({scene:{id:'scene',startMs:0,tags:[tag],tagTreatment},ms}).props.children[0];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);

test('one complete kinetic line fades and rises once without clipping, scaling or child attenuation',()=>{
 const node=tree(tag,1130),[lines,underline]=node.props.children;
 assert.equal(node.props.style.left,.69*1920);assert.equal(node.props.style.textAlign,'right');
 assert.equal(node.props.style.clipPath,undefined);assert.equal(node.props.style.transform,'translateY(1.25px)');
 near(node.props.style.opacity,.875);assert.equal(lines[0].props.style.opacity,1);assert.equal(lines[0].props.style.transform,'translateY(0px)');
 assert.equal(lines[0].props.children,'执行任务');assert.equal(underline.props.style.opacity,1);
 near(node.props.style.opacity*lines[0].props.style.opacity,.875);
 assert.equal(tree(tag,1260).props.style.opacity,1);assert.equal(tree(tag,1260).props.style.transform,'translateY(0px)');
 const exit=tree(tag,4920);near(exit.props.style.opacity,.125);assert.equal(exit.props.style.transform,'translateY(0px)');
 assert.equal(tree(tag,999),null);assert.equal(tree(tag,5000),null);
});

test('authored timings, zero phases, short cues and optional single-line source anchor remain respected',()=>{
 const before=structuredClone(tag);
 assert.deepEqual([kineticWholeLineEnvelope(tag,1200).inMs,kineticWholeLineEnvelope(tag,1200).outMs],[260,160]);
 const authored={...tag,animation:{inMs:200,outMs:120}};
 near(tree(authored,1100).props.style.opacity,.875);near(tree(authored,4940).props.style.opacity,.125);
 assert.equal(tree({...tag,animation:{inMs:0,outMs:0}},1000).props.style.opacity,1);
 const tiny={...tag,endMs:1040,animation:{inMs:2000,outMs:2000}};
 const state=kineticWholeLineEnvelope(tiny,1020);assert.equal(state.opacity,1);assert.equal(state.y,0);assert.ok(state.inMs+state.outMs<40);
 const delayed={...tag,lineAtMs:[1400]};assert.equal(tree(delayed,1300).props.style.opacity,0);assert.equal(tree(delayed,1660).props.style.opacity,1);
 assert.deepEqual(tag,before);
});

test('independently timed multiline text keeps one envelope per line and its existing positions',()=>{
 const timed={...tag,text:'能执行\n≠ 可靠',lineAtMs:[1000,2600],animation:{inMs:220,outMs:180}};
 for(const ms of [1100,2500,2710,3000,4910]){
  const node=tree(timed,ms),[lines]=node.props.children;
  assert.equal(node.props.style.opacity,1);assert.equal(node.props.style.transform,'none');assert.equal(node.props.style.clipPath,undefined);
  for(const [index,line] of lines.entries()){
   const expected=tagLineEnvelope(timed,index,2,ms);
   assert.equal(line.props.style.opacity,expected.opacity);assert.equal(line.props.style.transform,`translateY(${expected.y}px)`);
  }
 }
 assert.equal(tree(timed,2500).props.children[0][1].props.style.opacity,0);
 assert.equal(tree(timed,3000).props.children[0][1].props.style.opacity,1);
});

test('context changes treatment without replaying entrance, while ordinary labels keep their original envelope',()=>{
 const held={...tag,contextAtMs:3000},node=tree(held,3140),[lines,underline]=node.props.children;
 assert.equal(node.props.style.opacity,1);assert.equal(node.props.style.transform,'translateY(0px)');
 const [fill,outline]=lines[0].props.children.props.children;
 assert.equal(fill.props.style.opacity,.125);near(outline.props.style.opacity,.28);assert.equal(outline.props.style.WebkitTextFillColor,'transparent');
 assert.equal(underline.props.style.opacity,.125);
 assert.equal(tree(held,3400).props.children[0][0].props.children.props.children[0].props.style.opacity,0);
 for(const ms of [1000,1130,2000,4920]){
  const label=tree(tag,ms,'label'),expected=tagAnimationEnvelope(tag,ms,'label');
  assert.equal(label.props.style.opacity,expected.opacity);assert.equal(label.props.style.transform,`translateY(${(1-expected.opacity)*20}px) rotate(0deg)`);
  assert.equal(label.props.children,tag.text);assert.equal(label.props.style.background,'#464950dc');
 }
});
