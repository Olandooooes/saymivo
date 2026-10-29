const finite=Number.isFinite;
const sameSource=(actual,src)=>{try{return decodeURIComponent(new URL(actual,'http://localhost/').pathname).endsWith('/'+src);}catch{return false;}};
/** Actual decoded preview video only. A declared expected time is not evidence. */
export function dynamicSourceSlotReport(video,identity,sourceMs,fps){
 const report={status:'waiting',src:identity.src,sha256:identity.sha256,width:video?.videoWidth??0,height:video?.videoHeight??0,sourceMs:video?.currentTime*1000,muted:video?.muted===true};
 if(!video)return report;
 if(video.error)return {...report,status:'blocked'};
 if(!video.currentSrc&&!video.src||video.readyState<2||!(report.width>0)||!(report.height>0))return report;
 if(!sameSource(video.currentSrc||video.src,identity.src)||report.width!==identity.width||report.height!==identity.height||!report.muted)return {...report,status:'blocked'};
 return {...report,status:finite(sourceMs)&&finite(fps)&&fps>0&&finite(report.sourceMs)&&Math.abs(report.sourceMs-sourceMs)<=1000/fps+.1?'ready':'waiting'};
}
/** OffthreadVideo's decoded image callback certifies a requested export frame,
 * not a browser playhead. No audio is rendered by this source visual. */
export function dynamicRenderedSourceSlotReport(image,identity,sourceMs){
 const width=image?.naturalWidth??image?.videoWidth??image?.displayWidth??image?.width??0,height=image?.naturalHeight??image?.videoHeight??image?.displayHeight??image?.height??0;
 return {status:finite(sourceMs)&&width===identity.width&&height===identity.height?'ready':'blocked',src:identity.src,sha256:identity.sha256,width,height,sourceMs,muted:true};
}
