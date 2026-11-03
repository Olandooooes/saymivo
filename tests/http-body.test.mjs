import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {readHttpBody} from '../server/http-body.mjs';
async function read(chunks){const req=new EventEmitter(),promise=readHttpBody(req);for(const chunk of chunks)req.emit('data',chunk);req.emit('end');req.emit('close');const result=await promise;assert.equal(req.listenerCount('data'),0);assert.equal(req.listenerCount('error'),0);return result;}
const original={label:'测试-真人原片',title:'未必知道👩🏽‍💻',sourceText:'AI Agent 保留 English spaces、限定条件。',symbol:'𠮷文🤖'};
test('actual HTTP reader preserves every UTF8 split byte in Chinese, emoji and nested signature strings',async()=>{
 const baseSignature=JSON.stringify(original),draftKey=JSON.stringify({nonce:'test',baseSignature,config:{kind:'caret-phrase',expectedText:original.title}}),text=JSON.stringify({...original,baseSignature,draftKey}),bytes=Buffer.from(text);
 for(let split=0;split<=bytes.length;split++){const actual=await read([bytes.subarray(0,split),bytes.subarray(split)]);assert.equal(actual,text,'split '+split);assert.deepEqual(JSON.parse(actual),JSON.parse(text));}
 assert.equal(await read([...bytes].map(b=>Buffer.from([b]))),text,'one byte per network chunk');
 const at=bytes.indexOf(Buffer.from('人'))+1;assert.notEqual(bytes.subarray(0,at).toString()+bytes.subarray(at).toString(),text,'pre-fix per-chunk conversion actually corrupts this valid request');
});
test('large scene/draft/signature JSON keeps exact bytes and existing size behavior over network-sized chunks',async()=>{
 const source=original.sourceText.repeat(9000),text=JSON.stringify({captions:source,baseSignature:JSON.stringify({source,clips:[original]}),draftKey:JSON.stringify({baseSignature:JSON.stringify({source,clips:[original]})})}),bytes=Buffer.from(text);assert.ok(bytes.length>1024*1024);
 const chunks=[];for(let i=0;i<bytes.length;i+=65535)chunks.push(bytes.subarray(i,i+65535));assert.equal(await read(chunks),text);assert.equal(await read([Buffer.alloc(0),bytes,Buffer.alloc(0)]),text);
});
test('empty/already decoded text are preserved, transport aborts reject instead of producing partial JSON',async()=>{
 assert.equal(await read([]),'');assert.equal(await read(['中文','🤖',' text']),'中文🤖 text');assert.equal(await read([Buffer.from('{"original":"�"}')]),'{"original":"�"}','existing source replacement characters are not silently repaired');
 for(const event of ['error','aborted']){const req=new EventEmitter(),promise=readHttpBody(req);req.emit('data',Buffer.from('{"partial":'));req.emit(event,event==='error'?Error('transport failed'):undefined);await assert.rejects(promise,event==='error'?/transport failed/:/aborted/);req.emit('error',Error('ECONNRESET after abort'));req.emit('close');assert.equal(req.listenerCount('data'),0);assert.equal(req.listenerCount('error'),0);}
});
