// Remotion's shared audio pool owns the native element outside the composition.
// React-style callback properties are not native event subscriptions there.
// Always observe the forwarded, current element; never manufacture media time.
const events=['loadedmetadata','loadeddata','canplay','durationchange','seeking','seeked','timeupdate','playing','pause','ratechange','waiting','stalled','emptied','ended','error'];
export function observePreviewMedia(element,check){
 if(!element)return()=>{};
 let active=true;const sample=()=>{if(active)check();};
 for(const event of events)element.addEventListener(event,sample);
 sample();
 return()=>{active=false;for(const event of events)element.removeEventListener(event,sample);};
}
