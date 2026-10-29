import {projectedTalkingCaptions} from './talking-motion.mjs';
export const localWindowImage=src=>typeof src==='string'&&/^broll-assets\/[\w\u3400-\u9fff./-]+\.(?:png|jpe?g|webp)$/i.test(src)&&!src.includes('..');
const textOf=c=>c.words.map(w=>w.text).join('');
const termPresent=(text,term)=>{if(!term?.trim())return false;const at=text.toLowerCase().indexOf(term.toLowerCase());if(at<0)return false;if(/^[a-z0-9]+$/i.test(term)){return !/[a-z0-9]/i.test(text[at-1]??'')&&!/[a-z0-9]/i.test(text[at+term.length]??'');}return true;};
const overlap=(a,b)=>a.startMs<b.endMs&&a.endMs>b.startMs;
export function imageWindowMedia(assets,duration,{zoom=1.22,transitionMs=420,switchTimes=[]}={}){
 if(!assets.length||!Number.isFinite(duration)||duration<=0)throw Error('图片序列需要有效图片和正时长');
 const z=Math.max(1,Math.min(1.5,zoom)),transition=Math.max(160,Math.min(900,transitionMs));
 const sequence=assets.slice(0,3).map((a,i)=>{const atMs=i?switchTimes[i-1]??duration*i/assets.length:0,endMs=switchTimes[i]??duration,span=endMs-atMs;return {id:a.id,src:a.src,kind:'image',width:a.width,height:a.height,atMs,camera:[{atMs:0,scale:1,x:0,y:0},{atMs:Math.min(650,span*.18),scale:1,x:0,y:0},{atMs:span*.42,scale:z,x:0,y:Math.min(3,(z-1)*50)},{atMs:span*.74,scale:z,x:-Math.min(2,(z-1)*50),y:-Math.min(3,(z-1)*50)},{atMs:Math.max(span*.8,span-transition),scale:1,x:0,y:0}]};});
 return {...assets[0],kind:'image',fit:'contain',sequence,switchMs:transition,windowKeyframes:[{atMs:0,x:.12,y:.13,width:.72,height:.70},{atMs:650,x:.02,y:.04,width:.96,height:.9},{atMs:Math.max(650,duration-1000),x:.02,y:.04,width:.96,height:.9},{atMs:duration,x:.06,y:.12,width:.78,height:.72}]};
}
export function imageWindowSignature(state){return JSON.stringify([state.projectId,state.clips,state.captions,state.presentation,state.brollAssets,state.meta?.fps]);}
export function matchImageWindows(state,{startMs=0,endMs=20000,zoom=1.22,transitionMs=420}={}){
 const captions=projectedTalkingCaptions(state.captions??[],state.clips??[],state.meta?.fps??30).filter(c=>c.at>=startMs&&c.until<=endMs);
 const assets=(state.brollAssets??[]).filter(a=>a.kind==='image'&&localWindowImage(a.src)&&a.width>=480&&a.height>=200).filter((a,i,all)=>all.findIndex(x=>x.src===a.src)===i).map(a=>({...a,keywords:(Array.isArray(state.presentation?.windowAssetTags?.[a.src]??a.keywords)?(state.presentation?.windowAssetTags?.[a.src]??a.keywords):[]).filter(t=>typeof t==='string'&&t.trim())}));
 const scenes=[],issues=[];
 for(const clip of state.clips??[]){
  const caps=captions.filter(c=>c.clipId===clip.id),all=caps.map(textOf).join('');if(!caps.length)continue;
  const scored=assets.map(asset=>({asset,terms:asset.keywords.filter(t=>termPresent(all,t))})).filter(a=>a.terms.length).sort((a,b)=>b.terms.length-a.terms.length);
  if(!scored.length)continue;
  const first=caps.find(c=>scored[0].terms.some(t=>termPresent(textOf(c),t)));if(!first)continue;
  // Only mutually related image tags may share one window sequence.
  const relevant=scored.filter(a=>a.terms.some(t=>scored[0].terms.some(u=>u.toLowerCase()===t.toLowerCase()))),following=caps.filter(c=>c.startMs>=first.startMs&&c.endMs<=first.startMs+12000*(clip.speed??1));
  const last=following.at(-1);if(!last||last.until-first.at<3200)continue;
  const start=first.startMs,end=last.endMs,duration=end-start,maxImages=Math.min(3,Math.floor((last.until-first.at)/3200)),selected=relevant.slice(0,maxImages).map(a=>a.asset);
  const switchTimes=selected.slice(1).map((_,i)=>{const ideal=start+duration*(i+1)/selected.length;return following.filter(c=>c.startMs>start+1000&&c.startMs<end-1000).sort((a,b)=>Math.abs(a.startMs-ideal)-Math.abs(b.startMs-ideal))[0]?.startMs-start||duration*(i+1)/selected.length;});
  // Insufficient real time for a switch is handled as one image, never sped up.
  while(selected.length>1&&[0,...switchTimes,duration].some((t,i,a)=>i&&((t-a[i-1])/(clip.speed??1)<2800))){selected.pop();switchTimes.pop();}
  const scene={id:`image-window-${clip.id}-${start}`,clipId:clip.id,clipInstanceId:clip.id,src:clip.src,startMs:start,endMs:end,layout:'demo',title:scored[0].terms.join(' · '),window:{x:.80,y:.52,size:.15},transitionMs:300,nodes:[],imageWindow:{version:1,matchedTerms:scored[0].terms,zoom,transitionMs,reason:'字幕明确提及素材登记词；仅使用同组已登记图片。'},media:imageWindowMedia(selected,duration,{zoom,transitionMs,switchTimes})};
  const occupied=(state.presentation?.scenes??[]).some(s=>!s.imageWindow&&s.src===clip.src&&overlap(s,scene));if(occupied){issues.push('有已编排分镜占用该时段，保留已有分镜。');continue;}scenes.push(scene);
 }
 return {scenes,issues:scenes.length?issues:[...issues,'这段没有清晰且明确匹配的图片（至少480×200）；请在素材库导入图片并登记关键词。']};
}
export function imageSequenceState(media,elapsed){
 const sequence=media.sequence??[],transition=Math.max(160,Math.min(900,media.switchMs??420));
 return sequence.map((item,i)=>{if(elapsed<item.atMs)return null;const next=sequence[i+1],fadeIn=i?Math.min(1,(elapsed-item.atMs)/transition):1,fadeOut=next?Math.max(0,Math.min(1,1-(elapsed-next.atMs)/transition)):1;const opacity=fadeOut>0?fadeIn:0;return opacity>0?{item,index:i,opacity,elapsed:elapsed-item.atMs,shift:(1-fadeIn)*.018}:null;}).filter(Boolean);
}
