import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {sourceTokenTransferControls,sourceTokenTransferIssues} from '../src/source-token-transfer.mjs';
import {syncControlSourceFields} from '../editor/dynamic-control-values.mjs';

// Exercise the real form tree and its event closures without a browser or
// project store. This verifies draft values, not font/pixel/media readiness.
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
let nextId=0;
globalThis.__controlId=()=>`synthetic-control-${++nextId}`;
const fakeReact=url(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default React;export const useId=()=>globalThis.__controlId();export const useState=i=>[typeof i==='function'?i():i,()=>{}];`);
const file=new URL('../editor/DynamicParameterFields.tsx',import.meta.url);
const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(name==='react'?fakeReact:new URL(name,file).href)}`);
const {DynamicParameterFields}=await import(url(source));
function walk(element){
 if(element==null||typeof element==='boolean')return null;
 if(Array.isArray(element))return element.map(walk);
 if(!React.isValidElement(element))return element;
 if(element.type===React.Fragment)return walk(element.props.children);
 if(typeof element.type==='function')return walk(element.type(element.props));
 return {...element,props:{...element.props,children:walk(element.props.children)}};
}
function all(element,predicate){return element==null?[]:Array.isArray(element)?element.flatMap(child=>all(child,predicate)):React.isValidElement(element)?[...(predicate(element)?[element]:[]),...all(element.props.children,predicate)]:[];}
const text=element=>element==null||typeof element==='boolean'?'':Array.isArray(element)?element.map(text).join(''):React.isValidElement(element)?text(element.props.children):String(element);
const field=(tree,label)=>{const l=all(tree,e=>e.type==='label'&&text(e)===label)[0];assert.ok(l,`missing actual label ${label}`);const control=all(tree,e=>e.props.id===l.props.htmlFor)[0];assert.ok(control);return control;};
const fields=sourceTokenTransferControls.fields;
const scene={id:'scene',src:'clips/synthetic.mp4',startMs:0,endMs:30000,nodes:[{id:'node-a',text:'甲👨‍👩‍👧‍👦 e\u0301乙',detail:'完整条件'},{id:'node-b',text:'另一句完整原文'}]};
const complete=node=>[node.text,node.detail,...(node.bullets??[])].filter(Boolean).join('\n');
function fixture(tokens=[]){return {kind:'source-token-transfer',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,durationMs:30000},sources:scene.nodes.map((n,i)=>({id:`different-source-id-${i}`,nodeId:n.id,expectedText:complete(n),rect:{x:.05,y:.1+i*.2,width:.4,height:.1},atMs:0})),tokens};}
function host(value){return {value,tree(){// Match the real editor: each top-level group receives the whole config.
 return fields.map(f=>walk(React.createElement(DynamicParameterFields,{fields:[f],value:this.value,context:{scene},onChange:next=>{this.value=next;}})));
 },change(label,value){field(this.tree(),label).props.onChange({target:{value}});}};}

test('actual form adds a token, selects config.sources and derives readonly fields after nested range edits',()=>{
 const h=host(fixture()),snapshot=structuredClone(scene),tree=h.tree(),tokenList=all(tree,e=>e.type==='fieldset'&&text(e.props.children[0])==='从原句选择的同文标签')[0];
 all(tokenList,e=>e.type==='button'&&text(e)==='添加一项')[0].props.onClick();
 const tokenId=h.value.tokens[0].id;assert.equal(typeof tokenId,'string');assert.ok(tokenId.length);assert.equal(h.value.tokens[0].nodeId,undefined);
 const select=field(h.tree(),'来源原句');assert.equal(select.type,'select','the missing custom type must not fall through to a textarea');
 const options=all(select,e=>e.type==='option').map(e=>({value:e.props.value,text:text(e)}));
 assert.ok(options.some(o=>o.value==='different-source-id-0'&&o.text.includes('完整条件')));assert.ok(!options.some(o=>o.value==='node-a'),'node IDs cannot stand in for source IDs');
 h.change('来源原句','different-source-id-0');h.change('开始字素','1');h.change('结束字素','2');
 assert.equal(h.value.tokens[0].nodeId,'node-a');assert.equal(h.value.tokens[0].text,'👨‍👩‍👧‍👦');assert.equal(h.value.tokens[0].id,tokenId);
 assert.equal(field(h.tree(),'原节点ID').props.value,'node-a');assert.equal(field(h.tree(),'范围内完整同文').props.value,'👨‍👩‍👧‍👦');
 assert.ok(!sourceTokenTransferIssues(scene,h.value).some(issue=>['token-source-node-mismatch','token-grapheme-range-invalid','token-must-copy-identical-source-text'].includes(issue)));
 h.change('结束字素','4');assert.equal(h.value.tokens[0].text,'👨‍👩‍👧‍👦 e\u0301');assert.equal(h.value.tokens[0].id,tokenId);assert.deepEqual(scene,snapshot);
});

test('actual source-group edits update token copy atomically, while source deletion clears stale derived values',()=>{
 const h=host(syncControlSourceFields(fields,fixture([{id:'stable-token',sourceId:'different-source-id-0',range:{start:1,end:2}}]),scene)),ids=h.value.sources.map(s=>s.id);
 const firstNodeSelect=all(h.tree(),e=>e.type==='select'&&e.props.value==='node-a')[0];assert.ok(firstNodeSelect);firstNodeSelect.props.onChange({target:{value:'node-b'}});
 assert.deepEqual(h.value.sources.map(s=>s.id),ids);assert.equal(h.value.sources[0].expectedText,scene.nodes[1].text);assert.equal(h.value.tokens[0].sourceId,ids[0]);assert.equal(h.value.tokens[0].nodeId,'node-b');assert.equal(h.value.tokens[0].text,'一');assert.equal(h.value.tokens[0].id,'stable-token');
 const remove=all(h.tree(),e=>e.type==='button'&&e.props['aria-label']==='移除完整原句与条件第1项')[0];assert.ok(remove);remove.props.onClick();
 assert.equal(h.value.tokens[0].nodeId,undefined);assert.equal(h.value.tokens[0].text,undefined);assert.equal(h.value.tokens[0].sourceId,ids[0]);assert.deepEqual(h.value.tokens[0].range,{start:1,end:2});assert.equal(h.value.tokens[0].id,'stable-token');
 assert.equal(field(h.tree(),'范围内完整同文').props.value,'等待来源绑定');assert.ok(sourceTokenTransferIssues(scene,h.value).includes('token-source-node-mismatch'));
 const oldOption=all(field(h.tree(),'来源原句'),e=>e.type==='option'&&e.props.value===ids[0])[0];assert.equal(oldOption.props.disabled,true);
});

test('unknown source, invalid range and changed original text never display cached token text',()=>{
 const h=host(fixture([{id:'stable-token',sourceId:'unknown',nodeId:'node-a',text:'stale-token',range:{start:1,end:2}}]));
 assert.equal(field(h.tree(),'原节点ID').props.value,'等待来源绑定');assert.equal(field(h.tree(),'范围内完整同文').props.value,'等待来源绑定');
 h.change('来源原句','different-source-id-0');assert.equal(h.value.tokens[0].text,'👨‍👩‍👧‍👦');h.change('结束字素','999');assert.equal(h.value.tokens[0].text,undefined);assert.equal(h.value.tokens[0].nodeId,undefined);
 h.change('结束字素','2');assert.equal(h.value.tokens[0].text,'👨‍👩‍👧‍👦');
 h.value.sources[0].expectedText='旧原句';assert.equal(field(h.tree(),'范围内完整同文').props.value,'等待来源绑定','stale source text cannot present old derived copy as valid');
});
