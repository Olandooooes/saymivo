export type ProfileFace={x:number;y:number;w:number;h:number;confidence?:number};
export type FaceProjection={sourceWidth:number;sourceHeight:number;width?:number;height?:number;x?:number;y?:number;scale?:number;shiftY?:number};
export function projectFaceRectangle(face:ProfileFace,projection:FaceProjection):ProfileFace|null;
export function suggestSideTextZones(rectangles:Array<ProfileFace|null>,options?:{margin?:number;minWidth?:number;maxWidth?:number}):{status:string;reason:string;zones:Array<{side:string;x:number;width:number}>;faceEnvelope?:{x:number;right:number};limits?:string};
