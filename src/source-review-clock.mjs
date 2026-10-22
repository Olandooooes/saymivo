// Review anchors may only be reused inside the clock that produced them. Extra
// receipt metadata (paths, extraction diagnostics) is not part of that identity.
const keys=['version','timestampBasis','sourceSha256','wavSha256','sampleRate','channels','sampleWidthBytes'];
const complete=clock=>clock!==null&&typeof clock==='object'&&!Array.isArray(clock)&&clock.version==='source-zero-v1'&&clock.timestampBasis==='source-video-presentation-ms'&&['sourceSha256','wavSha256'].every(key=>typeof clock[key]==='string'&&/^[a-f0-9]{64}$/.test(clock[key]))&&clock.sampleRate===16000&&clock.channels===1&&clock.sampleWidthBytes===2;

export function reviewClockMatches(a,b){
 if(a===undefined&&b===undefined)return true;
 return complete(a)&&complete(b)&&keys.every(key=>a[key]===b[key]);
}

export function sourceCaptionClock(project,src){
 const ids=new Set((project.clips??[]).filter(clip=>clip.src===src).map(clip=>clip.id));
 const captions=(project.captions??[]).filter(caption=>ids.has(caption.clipId));
 if(!captions.length||captions.every(caption=>caption.audioClock===undefined))return undefined;
 if(!complete(captions[0].audioClock))return null;
 const clock=captions[0].audioClock;
 if(!captions.every(caption=>reviewClockMatches(clock,caption.audioClock)))return null;
 return {...clock};
}
