import {retakeClipSnapshot} from '../src/retake-plan.mjs';

// Cloud use is an explicit choice for this request, never a fallback.
export function retakeRequest(clips,{mode='local',allowCloudText=false}={}){
 if(!['local','codex','gemini'].includes(mode))throw Error('请选择本地识别或语义精剪。');
 if(mode!=='local'&&allowCloudText!==true)throw Error('使用语义精剪前，需要明确同意发送转写文字。');
 return {clips:retakeClipSnapshot(clips),mode,policy:'conservative',...(mode!=='local'?{allowCloudText:true}:{})};
}
