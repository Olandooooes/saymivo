import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fitMeasuredText} from '../src/text-fit.mjs';
import {visualContentRect} from '../src/visual-presets.mjs';

const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64'),react=JSON.stringify(import.meta.resolve('react'));
const compile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.React}}).outputText;
// Keep the actual MeasuredText props, cue markup and page/line rendering. Only
// font loading/Canvas is replaced by explicit synthetic square-glyph metrics.
const measuredSource=fs.readFileSync(new URL('../src/MeasuredText.tsx',import.meta.url),'utf8');
const actual=measuredSource.slice(measuredSource.indexOf('export function MeasuredText(')).replace('export function MeasuredText(','function ActualMeasuredText(');
const measure=(text,size)=>({width:[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(text)].length*size,ascent:size*.8,descent:size*.2});
const measuredUrl=url(compile(`import React from ${react};import {fitMeasuredText} from ${JSON.stringify(new URL('../src/text-fit.mjs',import.meta.url).href)};export const calls=[];const measure=${measure.toString()};function useMeasuredText(text,width,height,options){const fit=fitMeasuredText(text,{width,height,...options,protectedPhrases:[...(options.protectedPhrases??[]),...(options.preferredPhrases??[])],measure});calls.push({text,width,height,options,fit});return {fit,family:'synthetic-square'};} ${actual} export const MeasuredText=ActualMeasuredText;`));
const {MeasuredText,calls}=await import(measuredUrl);
const remotionUrl=url(`import React from ${react};export const AbsoluteFill=({children,...p})=>React.createElement('div',p,children);export const useVideoConfig=()=>({width:1920,height:1080,fps:30});`);
const nullUrl=url('export const SceneMedia=()=>null;export const SpatialEvidenceScene=()=>null;');
const sceneUrl=new URL('../src/VisualPresetScene.tsx',import.meta.url),source=compile(fs.readFileSync(sceneUrl,'utf8')).replace(/from (["'])([^"']+)\1/g,(_,q,s)=>`from ${JSON.stringify(s==='remotion'?remotionUrl:s==='./MeasuredText'?measuredUrl:['./SceneMedia','./SpatialEvidenceScene'].includes(s)?nullUrl:s.startsWith('.')?new URL(s,sceneUrl).href:import.meta.resolve(s))}`);
const {VisualPresetScene}=await import(url(source));
const scene=text=>({id:'synthetic-line-choice',clipId:'source',src:'clips/synthetic.mp4',startMs:0,endMs:6000,title:'完整原话',nodes:[{id:'original-node',text}],visualPreset:{id:'clear-type',version:1,side:'left'}});

test('clear-type shrinks complete authored paragraphs instead of splitting the last character, within the same safe region',()=>{
 for(const text of ['未必知道','到底能做到\n哪一步？']){
  const s=scene(text),before=structuredClone(s),rect=visualContentRect(s,1920,1080),height=rect.height-1080*.15;
  const old=fitMeasuredText(text,{width:rect.width,height,minFont:1080*.034,maxFont:1080*.14,measure});
  assert.ok(old.lines.length>text.split('\n').length,'the pre-fix greedy maximum-size layout really splits this fixture');
  calls.length=0;const html=renderToStaticMarkup(React.createElement(VisualPresetScene,{scene:s,elapsed:1500})),measured=calls.find(c=>c.text===text);
  assert.ok(measured);assert.deepEqual(measured.options.preferredPhrases,text.split('\n'));assert.deepEqual(measured.fit.lines,text.split('\n'));assert.equal(measured.fit.pages.length,1);assert.equal(measured.fit.unplaceable,false);assert.ok(measured.fit.fontSize<old.fontSize);
  assert.equal(measured.width,rect.width);assert.equal(measured.height,height);assert.ok(measured.fit.width<=rect.width);assert.ok(measured.fit.height<=height);assert.deepEqual(s,before,'neither source words, node IDs nor the original layout are rewritten');
  for(const paragraph of text.split('\n'))assert.ok(html.includes('>'+paragraph+'</div>'));
 }
});

test('optional protection is additive with existing cues and does not change default arbitrary wrapping',()=>{
 const props={text:'未必知道',width:200,height:250,minFont:20,maxFont:100,elapsed:2000};
 calls.length=0;renderToStaticMarkup(React.createElement(MeasuredText,props));const ordinary=calls.at(-1),expected=fitMeasuredText(props.text,{width:props.width,height:props.height,minFont:props.minFont,maxFont:props.maxFont,measure});
 assert.deepEqual(ordinary.options.protectedPhrases,[]);assert.deepEqual(ordinary.fit,expected);assert.ok(ordinary.fit.lines.length>1,'the default still supports ordinary measured wrapping');
 const protectedPhrases=['未必知道'],cues=[{text:'哪一步？',atMs:1000}],before=structuredClone({protectedPhrases,cues});calls.length=0;
 const html=renderToStaticMarkup(React.createElement(MeasuredText,{...props,text:'未必知道\n哪一步？',protectedPhrases,cues}));
 assert.deepEqual(calls.at(-1).options.protectedPhrases,['哪一步？']);assert.deepEqual(calls.at(-1).options.preferredPhrases,['未必知道']);assert.deepEqual(calls.at(-1).fit.lines,['未必知道','哪一步？']);assert.deepEqual({protectedPhrases,cues},before);assert.ok(html.includes('text-decoration:underline'));assert.ok(html.includes('>哪一步？</span>'));
});

test('clear-type and type-relay opt into soft paragraphs while fine-process keeps its existing measurement inputs',()=>{
 const text='保留全文\n也保留条件';
 for(const id of ['clear-type','type-relay','fine-process']){
  calls.length=0;renderToStaticMarkup(React.createElement(VisualPresetScene,{scene:{...scene(text),visualPreset:{id,version:1,side:'left'}},elapsed:1500}));
  const input=calls.find(c=>c.text===text);assert.ok(input);assert.deepEqual(input.options.protectedPhrases,[]);assert.deepEqual(input.options.preferredPhrases,id==='fine-process'?[]:text.split('\n'));assert.equal(input.text,text);
 }
});
