import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {motionReferenceCatalog} from '../src/motion-reference-catalog.mjs';

// Actual reference-list event closures, with only filter state initialized to
// all episodes. No browser, render/apply receipt or actual scene UI is claimed.
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const react=data(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default React;export const useState=i=>[i==='77'?'all':i,()=>{}];`);
const file=new URL('../editor/ReferenceMechanisms.tsx',import.meta.url),compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='react'?react:new URL(s,file).href)}`);
const {ReferenceMechanisms}=await import(data(compiled));
function all(e,predicate){return e==null?[]:Array.isArray(e)?e.flatMap(child=>all(child,predicate)):React.isValidElement(e)?[...(predicate(e)?[e]:[]),...all(e.props.children,predicate)]:[];}
const text=e=>e==null||typeof e==='boolean'?'':Array.isArray(e)?e.map(text).join(''):React.isValidElement(e)?text(e.props.children):String(e);
test('actual reference rows launch registered entries and keep their experimental/non-equivalent language',()=>{
 const chosen=[],tree=ReferenceMechanisms({onTry:()=>{},onTryDynamic:id=>chosen.push(id)}),articles=all(tree,e=>e.type==='article'&&e.props['data-reference-mechanism']);assert.equal(articles.length,66);
 for(const id of ['e77-paired-relation-layout','e77-state-veil','e77-audio-synchronized-comparison','e77-rolling-board','e77-set-boundary-and-barrier','e75-elapsed-proof-receipt','e72-full-picture-blur-zoom-transition']){
  const row=articles.find(e=>e.props['data-reference-mechanism']===id),buttons=all(row,e=>e.type==='button'&&text(e).startsWith('实验配置与预览：'));
  assert.ok(text(row).includes('实验配置已接入 · 本场需核验'));assert.ok(!text(row).includes('已归类 · 待实现'));assert.equal(buttons.length,motionReferenceCatalog.find(e=>e.id===id).implementation.entryIds.length);
  const before=chosen.length;buttons.forEach(button=>button.props.onClick());assert.deepEqual(chosen.slice(before),motionReferenceCatalog.find(e=>e.id===id).implementation.entryIds);
 }
 const physical=articles.find(e=>e.props['data-reference-mechanism']==='e72-physical-screen-evidence');assert.equal(all(physical,e=>e.type==='button').length,0);assert.ok(text(physical).includes('依赖实拍素材与剪辑'));
 assert.ok(text(tree).includes('本场验证：'));assert.ok(!text(tree).includes('UI已通过'));
});
