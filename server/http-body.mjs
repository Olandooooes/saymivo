/** Decode HTTP text once after collecting bytes. Buffer.toString() on each
 * network chunk corrupts a multibyte character split across chunk boundaries.
 * This preserves the existing reader's body-size contract (no new ceiling);
 * upload/route-specific limits remain with their existing handlers. */
export function readHttpBody(req){
 return new Promise((resolve,reject)=>{
  const chunks=[];let bytes=0,settled=false;
  const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('aborted',aborted);};
  const finish=problem=>{if(settled)return;settled=true;cleanup();if(problem){reject(problem);return;}try{resolve(Buffer.concat(chunks,bytes).toString('utf8'));}catch(problem){reject(problem);}};
  const data=chunk=>{const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);chunks.push(buffer);bytes+=buffer.length;};
  const end=()=>finish(),error=problem=>finish(problem),aborted=()=>finish(Error('HTTP request body aborted')),closed=()=>{if(!settled)finish(Error('HTTP request body closed'));req.off('error',error);};
  req.on('data',data);req.once('end',end);// IncomingMessage can emit error after aborted; retain this listener until
  // close so a rejected request cannot become an uncaught transport error.
  req.on('error',error);req.once('aborted',aborted);req.once('close',closed);
 });
}
