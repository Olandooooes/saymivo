import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportRate, applyExportSpeed} from '../server/export-speed.mjs';
test('export speed defaults to original and rejects arbitrary filter input',()=>{
 assert.equal(exportRate(),1);assert.equal(exportRate(1.25),1.25);
 for(const value of [0,-1,3,'1.25','1;bad',null])assert.throws(()=>exportRate(value));
});
test('original-speed and failed exports do not transcode or publish a new URL',async()=>{
 const state={status:'done',file:'/exports/test.mp4'};
 assert.equal(await applyExportSpeed({state,rate:1}),state);
 const error={status:'error'};
 assert.equal(await applyExportSpeed({state:error,rate:1.25}),error);
});
