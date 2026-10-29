import React,{useContext,useLayoutEffect,useState}from'react';
import{delayRender,continueRender,cancelRender}from'remotion';
import{DisplayFontContext,loadDisplayFont}from'./DisplayFont';
import{displayFontFamily}from'./display-fonts.mjs';
import{typedClockGlyphFit,type TypedClockGlyphLayout,type TypedClockNumberPlan}from'./typed-clock-motion.mjs';
export function useTypedClockGlyphLayout(plan:TypedClockNumberPlan,width:number,height:number){
 const id=useContext(DisplayFontContext),family=displayFontFamily(id),key=JSON.stringify([plan,width,height,id]),[state,setState]=useState<{key:string;fit:TypedClockGlyphLayout}|null>(null);
 useLayoutEffect(()=>{let active=true,done=false;const handle=delayRender('Measure current clock digit ink boxes'),finish=()=>{if(!done){done=true;continueRender(handle);}};loadDisplayFont(id).then(()=>{const ctx=document.createElement('canvas').getContext('2d');if(!ctx)throw Error('无法测量当前数字字体');ctx.textAlign='left';ctx.textBaseline='alphabetic';const minFont=Math.max(plan.minFont,height*.18),fit=typedClockGlyphFit({glyphs:plan.glyphs,slots:plan.slots,unit:plan.unit,width,height,minFont,maxFont:Math.max(minFont,height*.9),measure:(text:string,size:number)=>{ctx.font=`700 ${size}px ${family}`;return ctx.measureText(text);}});if(active)setState({key,fit:{...fit,family}});finish();}).catch(error=>{if(active)cancelRender(error);else finish();});return()=>{active=false;finish();};},[key,family]);return state?.key===key?state.fit:null;
}
export function TypedClockDigits({text,plan,fit}:{text:string;plan:TypedClockNumberPlan;fit:TypedClockGlyphLayout}){
 const digits=[...text],slots=Array(Math.max(0,plan.slots-digits.length)).fill(' ').concat(digits);
 return<svg data-clock-stable-digits="true" width="100%" height="100%" style={{overflow:'visible',fontFamily:fit.family,fontSize:fit.fontSize,fontWeight:700,color:'#edf5ff',fontKerning:'none'}}>{slots.map((s,i)=><text key={i} x={i*fit.advance+fit.leftInset} y={fit.ascent} fill="currentColor">{s}</text>)}{plan.unit&&<text x={fit.unitX+fit.unitLeftInset} y={fit.ascent} fill="currentColor">{plan.unit}</text>}</svg>;
}
