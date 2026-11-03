import test from 'node:test';
import assert from 'node:assert/strict';
import {dynamicEditorFields,dynamicEditorFormValue,dynamicEditorConfigValue} from '../editor/dynamic-editor-fields.mjs';
const fields=[{key:'ticks',type:'number-list',label:'刻度'},{key:'lineIds',type:'stable-ref-list',source:'code.lines',label:'对应代码'},{key:'runSec',type:'source-seconds',label:'出发'},{key:'items',type:'list',label:'对象',itemFields:[{key:'id',type:'stable-id',readonly:true,label:'稳定ID'},{key:'nodeId',type:'node-ref',label:'原对象'},{key:'slots',type:'number-list',label:'数值'}]}];
test('number and stable-reference lists round trip through structured fields without raw JSON or invented data',()=>{
 const value={ticks:[1,10,100],lineIds:['code-A'],runSec:2.5,items:[{id:'keep',nodeId:'source-node',slots:[5,-3]}],code:{lines:[{id:'code-A'}]}};
 const adapted=dynamicEditorFields(fields,value),shown=dynamicEditorFormValue(fields,value);assert.equal(adapted[0].type,'list');assert.deepEqual(adapted[1].itemFields[0].options,['code-A']);assert.equal(adapted[2].type,'number');assert.ok(adapted[2].label.includes('秒'));assert.deepEqual(shown.ticks,[{value:1},{value:10},{value:100}]);assert.deepEqual(dynamicEditorConfigValue(fields,shown),value);
 assert.deepEqual(dynamicEditorConfigValue(fields,{ticks:[{}]}).ticks,[undefined],'blank data remains missing rather than becoming zero');
});
test('new list objects get hidden stable IDs once, and changing values preserves existing source references and full copy',()=>{
 let n=0;const value={items:[{nodeId:'source-node',slots:[{value:7}]}],body:'全部原文和限定条件'};const next=dynamicEditorConfigValue(fields,value,{newId:()=>`new-${++n}`});assert.equal(next.items[0].id,'new-1');assert.equal(next.items[0].nodeId,'source-node');assert.equal(next.body,value.body);assert.deepEqual(next.items[0].slots,[7]);const again=dynamicEditorConfigValue(fields,dynamicEditorFormValue(fields,next),{newId:()=>`new-${++n}`});assert.equal(again.items[0].id,'new-1');assert.equal(n,1);assert.equal(value.items[0].id,undefined);
});
