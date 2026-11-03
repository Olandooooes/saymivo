import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {editFieldRollControl,fieldRollControlSources,fieldRollControlMedia,fieldRollControlAssessment,newFieldRollControlCard,newFieldRollControlField,parseFieldRollControlNumber} from '../editor/field-roll-control-values.mjs';

const scene={id:'roll-scene',clipId:'voice',src:'clips/synthetic.mp4',startMs:1000,endMs:21000,layout:'slide',title:'完整标题',body:'保留原声与否定：并未实测。',label:'明确范围',sourceNote:'原创合成映射，不是软件执行结果',nodes:[{id:'a',text:'教程 AI Agent 👩🏽‍💻 e\u0301',detail:'完整条件',bullets:['保留所有前后空格与标点。']},{id:'b',text:'另一字段完整值'}],tags:[{id:'tag',text:'不能推断统计',x:.1,y:.1,atMs:0,endMs:1000}],links:[{id:'relation',from:'a',to:'b',label:'只表示人工对应'}]};
const rect={x:.05,y:.2,width:.7,height:.4};
const fixture=()=>({kind:'field-roll-board',clock:'scene-source-relative-ms',binding:{sceneId:scene.id,src:scene.src,sha256:'a'.repeat(64),startMs:1000,endMs:21000},copyWindow:{atMs:0,endMs:4000,rect:{x:.05,y:.2,width:.7,height:.6}},titleRect:{x:.05,y:.04,width:.7,height:.1},speakerRect:{x:.82,y:.33,width:.15,height:.24},cards:[{id:'card-a',rect:{...rect},enterAtMs:4000,enterMs:400,exitAtMs:18000,exitMs:400,fields:[{id:'field-a',sourceRef:'node:a:text',label:'类别',from:scene.nodes[0].text,to:'  Tutorial AI Agent 👩🏽‍💻 e\u0301  ',rect:{x:.07,y:.3,width:.65,height:.08},labelRect:{x:.07,y:.22,width:.65,height:.05},rollAtMs:8500,cellRollMs:350,staggerMs:30,direction:'up',provenance:{kind:'translation',citation:'完整原创合成对照说明',fromLanguage:'zh',toLanguage:'en'}}]}]});
const proof={rawScene:scene,clips:[{id:'voice',src:scene.src,inSec:1,outSec:21,speed:1}],fps:30,captions:[]};

test('editable controls use the renderer complete inventory, preserving extra text, English spaces and graphemes',()=>{
 const original=structuredClone(scene),sources=fieldRollControlSources(scene);
 for(const text of [scene.title,scene.body,scene.label,scene.sourceNote,scene.nodes[0].text,scene.nodes[0].detail,scene.nodes[0].bullets[0],scene.tags[0].text,scene.links[0].label])assert.ok(sources.some(item=>item.text===text),text);
 assert.equal(sources.find(item=>item.id==='node:a:text').graphemeCount,[...new Intl.Segmenter('zh-CN',{granularity:'grapheme'}).segment(scene.nodes[0].text)].length);
 assert.deepEqual(scene,original);
});
test('draft patches preserve complete target strings and all source identity, media and unknown saved context',()=>{
 const value=fixture(),original=structuredClone(value),source=structuredClone(scene),full='  '+('目标 👩🏽‍💻 AI Agent e\u0301 ').repeat(30)+'\n完整尾部  ';
 value.privateFutureContext={same:true};
 const changed=editFieldRollControl(value,{type:'field',cardId:'card-a',fieldId:'field-a',key:'to',value:full},scene);
 assert.equal(changed.cards[0].fields[0].to,full);assert.deepEqual(changed.binding,value.binding);assert.deepEqual(changed.privateFutureContext,{same:true});assert.equal(changed.cards[0].fields[0].from,scene.nodes[0].text);assert.deepEqual(scene,source);assert.equal(value.cards[0].fields[0].to,original.cards[0].fields[0].to);
 for(const action of [{type:'board',key:'binding',value:{}},{type:'card',cardId:'card-a',key:'id',value:'changed'},{type:'field',cardId:'card-a',fieldId:'field-a',key:'from',value:'伪造原文'},{type:'field',cardId:'card-a',fieldId:'field-a',key:'sourceRef',value:'body'}])assert.equal(editFieldRollControl(value,action,scene),value);
 assert.ok(fieldRollControlAssessment(scene,changed,undefined,proof).issues.length,'unfittable/newline string is retained for correction, never silently shortened');
});
test('source selection atomically binds the full original and invalidates the old mapping; explicit stale rebind is possible',()=>{
 const value=fixture(),changed=editFieldRollControl(value,{type:'select-source',cardId:'card-a',fieldId:'field-a',sourceRef:'body'},scene),field=changed.cards[0].fields[0];
 assert.equal(field.from,scene.body);assert.equal(field.sourceRef,'body');assert.equal(field.to,'');assert.equal(field.provenance.citation,'');assert.equal(field.provenance.fromLanguage,undefined);assert.equal(field.id,'field-a');assert.equal(changed.cards[0].id,'card-a');
 assert.equal(editFieldRollControl(value,{type:'select-source',cardId:'card-a',fieldId:'field-a',sourceRef:'missing'},scene),value);
 const newer={...scene,nodes:[{...scene.nodes[0],text:'改过的完整原文'},scene.nodes[1]]},rebound=editFieldRollControl(value,{type:'select-source',cardId:'card-a',fieldId:'field-a',sourceRef:'node:a:text'},newer);
 assert.equal(rebound.cards[0].fields[0].from,newer.nodes[0].text);assert.equal(rebound.cards[0].fields[0].to,'');assert.equal(value.cards[0].fields[0].from,scene.nodes[0].text);
 const cleared=editFieldRollControl(value,{type:'select-source',cardId:'card-a',fieldId:'field-a',sourceRef:''},scene);assert.equal(cleared.cards[0].fields[0].from,'');assert.equal(cleared.cards[0].fields[0].to,'');
});
test('adding, moving and removing stable cards/fields never fabricate values or duplicate identifiers',()=>{
 let value=fixture();assert.equal(newFieldRollControlField('new').to,'');assert.equal(newFieldRollControlField('new').provenance.citation,'');assert.equal(newFieldRollControlCard('new').fields.length,0);
 value=editFieldRollControl(value,{type:'add-card',id:'card-b'},scene);value=editFieldRollControl(value,{type:'add-field',cardId:'card-b',id:'field-b'},scene);
 assert.equal(value.cards[1].fields[0].from,'');assert.equal(value.cards[1].fields[0].to,'');assert.ok(fieldRollControlAssessment(scene,value,undefined,proof).issues.length);
 assert.equal(editFieldRollControl(value,{type:'add-field',cardId:'card-b',id:'field-a'},scene),value);assert.equal(editFieldRollControl(value,{type:'add-card',id:'card-a'},scene),value);
 value=editFieldRollControl(value,{type:'move-card',cardId:'card-b',delta:-1},scene);assert.equal(value.cards[0].id,'card-b');assert.equal(value.cards[1].fields[0].from,scene.nodes[0].text);
 value=editFieldRollControl(value,{type:'add-field',cardId:'card-b',id:'field-c'},scene);value=editFieldRollControl(value,{type:'move-field',cardId:'card-b',fieldId:'field-c',delta:-1},scene);assert.equal(value.cards[0].fields[0].id,'field-c');
 value=editFieldRollControl(value,{type:'remove-field',cardId:'card-b',fieldId:'field-c'},scene);value=editFieldRollControl(value,{type:'remove-card',cardId:'card-b'},scene);assert.deepEqual(value.cards,fixture().cards);
});
test('all timing/geometry edits and extra protections are draft-only, retaining explicit ms without rounding',()=>{
 let value=fixture();
 for(const action of [{type:'board',key:'copyWindow',value:{...value.copyWindow,atMs:100.125}},{type:'card',cardId:'card-a',key:'exitAtMs',value:18000.125},{type:'field',cardId:'card-a',fieldId:'field-a',key:'rollAtMs',value:8500.125},{type:'field',cardId:'card-a',fieldId:'field-a',key:'rect',value:{x:.123456,y:.3,width:.5,height:.08}},{type:'add-protection'},{type:'protection',index:0,key:'label',value:'完整的保护区说明'},{type:'protection',index:0,key:'rect',value:{x:.8,y:.1,width:.1,height:.1}}])value=editFieldRollControl(value,action,scene);
 assert.equal(value.copyWindow.atMs,100.125);assert.equal(value.cards[0].exitAtMs,18000.125);assert.equal(value.cards[0].fields[0].rollAtMs,8500.125);assert.equal(value.cards[0].fields[0].rect.x,.123456);assert.equal(value.protectedAreas[0].label,'完整的保护区说明');
 assert.deepEqual(editFieldRollControl(value,{type:'remove-protection',index:0},scene).protectedAreas,[]);
 for(const input of ['', 'Infinity','NaN','-Infinity','1e999'])assert.equal(parseFieldRollControlNumber(input).ok,false);
 assert.equal(parseFieldRollControlNumber('8.500125',{seconds:true}).value,8500.125);
});
test('existing media and complete source settings remain intact and explicitly block this text-only draft',()=>{
 const s={...scene,media:{src:'broll-assets/synthetic.png',kind:'image',camera:[{atMs:1234.5,scale:1.25,x:.3,y:.7}],fit:'contain'},nodes:[{...scene.nodes[0],assetSrc:'broll-assets/other.png'},scene.nodes[1]]},original=structuredClone(s),value=fixture();
 const result=fieldRollControlAssessment(s,value,undefined,{...proof,rawScene:s});
 assert.equal(result.media.length,2);assert.equal(result.canApply,false);assert.equal(result.rendererMeasured,false);assert.ok(result.issues.includes('field-roll-first-text-only-build-cannot-discard-existing-media'));assert.equal(fieldRollControlMedia(s)[1].src,s.nodes[0].assetSrc);
 editFieldRollControl(value,{type:'field',cardId:'card-a',fieldId:'field-a',key:'to',value:'只是编辑目标'},s);assert.deepEqual(s,original);
 assert.ok(fieldRollControlAssessment(scene,value).issues.some(issue=>issue.includes('projection-required')),'no inferred empty caption inventory');
});

// Exercise the actual new form and its event closures. No browser, font pixels,
// renderer readiness, store, save/undo, source decoding or UI receipt is faked.
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
let id=0;
globalThis.__fieldRollControlId=()=>`field-roll-control-${++id}`;
const react=data(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default React;export const useId=()=>globalThis.__fieldRollControlId();export const useState=i=>[typeof i==='function'?i():i,()=>{}];export const useEffect=()=>{};`);
const file=new URL('../editor/FieldRollBoardFields.tsx',import.meta.url),compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,name)=>`from ${JSON.stringify(name==='react'?react:new URL(name,file).href)}`);
const {FieldRollBoardFields}=await import(data(compiled));
function walk(element){if(element==null||typeof element==='boolean')return null;if(Array.isArray(element))return element.map(walk);if(!React.isValidElement(element))return element;if(element.type===React.Fragment)return walk(element.props.children);if(typeof element.type==='function')return walk(element.type(element.props));return {...element,props:{...element.props,children:walk(element.props.children)}};}
function all(element,predicate){return element==null?[]:Array.isArray(element)?element.flatMap(item=>all(item,predicate)):React.isValidElement(element)?[...(predicate(element)?[element]:[]),...all(element.props.children,predicate)]:[];}
const text=element=>element==null||typeof element==='boolean'?'':Array.isArray(element)?element.map(text).join(''):React.isValidElement(element)?text(element.props.children):String(element);
function control(tree,label){const l=all(tree,e=>e.type==='label'&&text(e)===label)[0];assert.ok(l,'missing actual label '+label);const result=all(tree,e=>e.props.id===l.props.htmlFor)[0];assert.ok(result);return result;}
function host({value=fixture(),s=scene,disabled=false,p=proof}={}){return {value,count:0,tree(){return walk(React.createElement(FieldRollBoardFields,{scene:s,value:this.value,projectionProof:p,disabled,newId:()=>`new-${++id}`,onChange:next=>{this.value=next;this.count++;}}));},change(label,value){control(this.tree(),label).props.onChange({target:{value}});},click(label){const button=all(this.tree(),e=>e.type==='button'&&text(e)===label)[0];assert.ok(button,'missing actual button '+label);button.props.onClick();}};}

test('actual form exposes full readonly source/binding and complete before/after, including long strings and spaces',()=>{
 const h=host(),tree=h.tree(),before=control(tree,'滚动前完整值（来源锁定）'),after=control(tree,'滚动后完整值');
 assert.equal(before.props.value,scene.nodes[0].text);assert.equal(before.props.readOnly,true);assert.equal(before.props.onChange,undefined);assert.equal(after.props.value,fixture().cards[0].fields[0].to);assert.equal(after.props.maxLength,undefined);
 const binding=control(tree,'原片身份绑定（只读；由父级实际素材身份创建）');assert.equal(binding.props.readOnly,true);assert.ok(binding.props.value.includes('a'.repeat(64)));
 const full=control(tree,'完整源文案：标题、正文、全部节点与附加说明').props.value;for(const item of fieldRollControlSources(scene))assert.ok(full.includes(item.text));
 h.change('滚动后完整值','  '+('完整 👩🏽‍💻 AI Agent ').repeat(25)+'完整尾部  ');assert.ok(h.value.cards[0].fields[0].to.endsWith('完整尾部  '));assert.equal(h.value.cards[0].fields[0].from,scene.nodes[0].text);
});
test('actual form source changes clear the previous mapping, new items stay blank, and provenance/languages are editable',()=>{
 const h=host(),snapshot=structuredClone(scene);h.change('来源完整字段','body');assert.equal(h.value.cards[0].fields[0].from,scene.body);assert.equal(h.value.cards[0].fields[0].to,'');assert.equal(h.value.cards[0].fields[0].provenance.citation,'');
 h.change('滚动后完整值','Explicit authored target');h.change('完整映射来源 / 引用 / 人工编写说明（必填）','全文来源 https://example.test/source\n人工对照');h.change('原语言','zh-CN');h.change('目标语言','en-US');h.change('字形滚动方向','down');
 const field=h.value.cards[0].fields[0];assert.equal(field.provenance.citation,'全文来源 https://example.test/source\n人工对照');assert.equal(field.provenance.toLanguage,'en-US');assert.equal(field.direction,'down');
 h.click('添加空字段');assert.equal(h.value.cards[0].fields[1].from,'');assert.equal(h.value.cards[0].fields[1].to,'');assert.equal(h.value.cards[0].fields[1].provenance.citation,'');h.click('添加空卡片');assert.equal(h.value.cards[1].fields.length,0);assert.deepEqual(scene,snapshot);
});
test('actual form timing retains source precision and invalid input does not publish NaN or reset the clock',()=>{
 const h=host();h.change('开始滚动（原场景相对秒）','8.500125');assert.equal(h.value.cards[0].fields[0].rollAtMs,8500.125);h.change('退场开始（原场景相对秒）','18.000125');assert.equal(h.value.cards[0].exitAtMs,18000.125);
 const before=structuredClone(h.value),count=h.count;h.change('开始滚动（原场景相对秒）','');h.change('开始滚动（原场景相对秒）','Infinity');assert.deepEqual(h.value,before);assert.equal(h.count,count);
 h.click('添加保护区');h.change('保护区1说明','不要遮住原字幕');assert.equal(h.value.protectedAreas[0].label,'不要遮住原字幕');
});
test('actual stale and missing source UI stays explicit, offers rebind, and disabled controls cannot emit drafts',()=>{
 const changed={...scene,nodes:[{...scene.nodes[0],text:'改变后的完整原文'},scene.nodes[1]]},h=host({s:changed,p:{...proof,rawScene:changed}});
 assert.equal(control(h.tree(),'滚动前完整值（来源锁定）').props.value,scene.nodes[0].text);assert.equal(control(h.tree(),'当前来源完整原文（只读）').props.value,changed.nodes[0].text);h.click('重新绑定当前原文并清空目标与映射说明');assert.equal(h.value.cards[0].fields[0].from,changed.nodes[0].text);assert.equal(h.value.cards[0].fields[0].to,'');
 const absent=fixture();absent.cards[0].fields[0].sourceRef='missing';const missing=host({value:absent});assert.ok(all(control(missing.tree(),'来源完整字段'),e=>e.type==='option'&&e.props.value==='missing'&&e.props.disabled).length);assert.equal(control(missing.tree(),'滚动前完整值（来源锁定）').props.value,scene.nodes[0].text);
 const disabled=host({disabled:true}),saved=structuredClone(disabled.value);disabled.change('滚动后完整值','不得写入');disabled.click('添加空卡片');assert.deepEqual(disabled.value,saved);assert.equal(disabled.count,0);
});
test('actual media warning shows complete original assets/settings and no apply or preview action',()=>{
 const s={...scene,media:{src:'broll-assets/original.png',kind:'image',camera:[{atMs:1234.5,scale:1.234,x:.345,y:.456}],cursor:[{atMs:2345.6,x:.123,y:.234,click:true}],fit:'contain'},nodes:[{...scene.nodes[0],assetSrc:'broll-assets/node-full.png'},scene.nodes[1]]},h=host({s,p:{...proof,rawScene:s}}),tree=h.tree();
 const assets=control(tree,'已有资料完整设置（只读）');assert.equal(assets.props.readOnly,true);const actual=JSON.parse(assets.props.value);assert.deepEqual(actual.media,s.media);assert.deepEqual(actual.nodes,[s.nodes[0]]);assert.ok(text(tree).includes('field-roll-first-text-only-build-cannot-discard-existing-media'));assert.ok(!all(tree,e=>e.type==='button').some(e=>/应用|播放|导出/.test(text(e))));assert.ok(text(tree).includes('不能作为应用凭证'));
});
