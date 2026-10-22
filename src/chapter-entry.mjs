const ease=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
export function chapterSweep(elapsedMs,{delayMs=100,durationMs=600,overshoot=30}={}){
 const t=(elapsedMs-delayMs)/Math.max(200,durationMs);
 if(t<=0)return {x:-420,opacity:0,blurX:36,blurY:1.5};
 if(t>=1)return {x:0,opacity:1,blurX:0,blurY:0};
 const keys=[{t:0,x:-420,a:0,b:36},{t:1/3,x:Math.max(0,Math.min(60,overshoot)),a:1,b:0},{t:.6,x:8,a:1,b:0},{t:1,x:0,a:1,b:0}];
 const i=keys.findIndex(k=>k.t>=t),a=keys[i-1],b=keys[i],p=ease((t-a.t)/(b.t-a.t));
 return {x:a.x+(b.x-a.x)*p,opacity:a.a+(b.a-a.a)*p,blurX:a.b+(b.b-a.b)*p,blurY:1.5*(1-Math.min(1,t*3))};
}
