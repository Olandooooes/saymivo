import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToString} from 'react-dom/server';

const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (file, overrides = {}) => {
  const url = new URL(file, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
  }).outputText.replace(/from (["'])([^"']+)\1/g, (_, quote, specifier) => {
    const target = overrides[specifier] ?? (specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier));
    return `from ${JSON.stringify(target)}`;
  });
  return dataUrl(source);
};
const {useAutoEdit} = await import(compile('../editor/AutoEdit.tsx'));
const timelineUrl = compile('../src/timeline.ts');
const storeUrl = compile('../editor/store.ts', {'../src/timeline': timelineUrl});
const {useEditor} = await import(storeUrl);
const startStub = dataUrl('let props; export function Start(p){props=p;return null;} export function currentProps(){return props;}');
const {currentProps} = await import(startStub);
const {App} = await import(compile('../editor/App.tsx', {
  './store': storeUrl, './Start': startStub, './Editor': dataUrl('export function Editor(){return null;}'),
}));

function savedPreferences(values) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map(Object.entries(values));
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => entries.get(key) ?? null, setItem: (key,value) => entries.set(key,String(value)), removeItem: key => entries.delete(key),
  }});
  let result;
  function Probe(){result=useAutoEdit();return null;}
  try {renderToString(React.createElement(Probe));return result;}
  finally {if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
}

test('first use opens a storyboard while an explicit direct-video choice remains direct video', () => {
  assert.equal(savedPreferences({}).delivery,'storyboard');
  assert.equal(savedPreferences({'koubo-auto-delivery':'storyboard'}).delivery,'storyboard');
  assert.equal(savedPreferences({'koubo-auto-delivery':'video'}).delivery,'video');
});

test('saved regular typography, alternate fonts and colors are not replaced by defaults', () => {
  const regular=savedPreferences({'koubo-display-font':'','koubo-emphasis-theme':'reference-yellow',
    'koubo-template':'classic','koubo-format':'portrait','koubo-motion-pace':'calm'});
  assert.equal(regular.displayFont,'');assert.equal(regular.emphasisTheme,'reference-yellow');
  assert.equal(regular.template,'classic');assert.equal(regular.format,'portrait');assert.equal(regular.motionPace,'calm');
  const chosen=savedPreferences({'koubo-display-font':'smiley','koubo-emphasis-theme':'tech-violet'});
  assert.equal(chosen.displayFont,'smiley');assert.equal(chosen.emphasisTheme,'tech-violet');
});

test('the real manual-new-project callback inherits all selected presentation settings', () => {
  const clips=[{id:'source',src:'clips/synthetic.mp4',inSec:0,outSec:8,sourceDurationSec:8}];
  const meta={durationInFrames:240,fps:30,width:1080,height:1920};
  const cases=[
    {format:'landscape',template:'reference',displayFont:'source-han',emphasisTheme:'tech-indigo',motionPace:'brisk',theme:'knowledge',style:'reference'},
    {format:'portrait',template:'knowledge',displayFont:'smiley',emphasisTheme:'tech-violet',motionPace:'calm',theme:'knowledge',style:'clean'},
    {format:'portrait',template:'classic',displayFont:'',emphasisTheme:'reference-yellow',motionPace:'balanced',theme:'classic',style:'clean'},
  ];
  for(const choice of cases){
    useEditor.getState().init(meta,[],undefined,clips);
    renderToString(React.createElement(App));
    currentProps().onNew(choice);
    const state=useEditor.getState(),p=state.presentation;
    for(const key of ['format','theme','style','emphasisTheme','motionPace'])assert.equal(p[key],choice[key],key);
    assert.equal(p.displayFont,choice.displayFont||undefined);
    assert.equal(state.meta.width,choice.format==='landscape'?1920:1080);
    assert.deepEqual(state.clips,clips);assert.deepEqual(state.captions,[]);
  }
});
