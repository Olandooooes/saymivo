// Project source rectangles through the same cover/position/zoom model as ClipMedia.
// This is geometry support, not continuous face tracking or a layout guarantee.
export function projectFaceRectangle(face,{sourceWidth,sourceHeight,width=1920,height=1080,x=50,y=50,scale=1,shiftY=0}={}){
 if(![sourceWidth,sourceHeight,width,height,scale].every(n=>Number.isFinite(n)&&n>0)||![x,y,shiftY].every(Number.isFinite)||!face||!['x','y','w','h'].every(k=>Number.isFinite(face[k]))||face.w<=0||face.h<=0)return null;
 const cover=Math.max(width/sourceWidth,height/sourceHeight),rw=sourceWidth*cover,rh=sourceHeight*cover;
 const left=((face.x*rw+(width-rw)*x/100-width/2)*scale+width/2)/width;
 const top=((face.y*rh+(height-rh)*y/100-height/2)*scale+height/2)/height+shiftY/100;
 const right=left+face.w*rw*scale/width,bottom=top+face.h*rh*scale/height;
 if(right<=0||bottom<=0||left>=1||top>=1)return null;
 return {x:Math.max(0,left),y:Math.max(0,top),w:Math.min(1,right)-Math.max(0,left),h:Math.min(1,bottom)-Math.max(0,top),confidence:face.confidence};
}
export function suggestSideTextZones(rectangles,{margin=.04,minWidth=.18,maxWidth=.36}={}){
 const faces=rectangles.filter(f=>f&&Number.isFinite(f.confidence)&&f.confidence>=.6);
 if(!faces.length)return {status:'needs-review',reason:'no-confident-visible-face',zones:[]};
 const left=Math.min(...faces.map(f=>f.x)),right=Math.max(...faces.map(f=>f.x+f.w));
 const zones=[];
 const leftWidth=Math.min(maxWidth,left-margin-.04),rightX=right+margin,rightWidth=Math.min(maxWidth,.96-rightX);
 if(leftWidth>=minWidth)zones.push({side:'left',x:.04,width:leftWidth});
 if(rightWidth>=minWidth)zones.push({side:'right',x:.96-rightWidth,width:rightWidth});
 return {status:zones.length?'suggestion':'needs-review',reason:zones.length?'sampled-face-envelope':'insufficient-side-space',zones,faceEnvelope:{x:left,right},limits:'Sparse sampled face rectangles only; validate motion, hands and text height in the actual scene'};
}
