export function personMatteFrame(matte,sourceMs){
 if(!matte||!Number.isFinite(sourceMs)||!Number.isFinite(matte.sourceStartMs)||!Number.isFinite(matte.fps)||matte.fps<=0||!Number.isInteger(matte.count)||matte.count<=0)return null;
 let index=Math.floor((sourceMs-matte.sourceStartMs)*matte.fps/1000+1e-5);
 if(Array.isArray(matte.timesMs)&&matte.timesMs.length===matte.count){
  const times=matte.timesMs;
  const end=Number.isFinite(matte.endMs)?Math.min(matte.endMs,times.at(-1)+1000/matte.fps):times.at(-1)+500/matte.fps;
  if(sourceMs<times[0]-500/matte.fps||(Number.isFinite(matte.endMs)?sourceMs>=end:sourceMs>end))return null;
  let lo=0,hi=times.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(times[mid]<sourceMs)lo=mid+1;else hi=mid;}
  index=lo>0&&sourceMs-times[lo-1]<times[lo]-sourceMs?lo-1:lo;
 }
 if(index<0||index>=matte.count)return null;
 return {index,src:matte.prefix+String(index).padStart(5,'0')+'.png'};
}
