import type {DynamicSourceIdentity} from './DynamicMotionRenderer';
import type {FullFrameSourceSlotReport} from './FullFrameHandoffScene';
export function dynamicSourceSlotReport(video:HTMLVideoElement|null,identity:DynamicSourceIdentity,sourceMs:number,fps:number):FullFrameSourceSlotReport;
export function dynamicRenderedSourceSlotReport(image:CanvasImageSource,identity:DynamicSourceIdentity,sourceMs:number):FullFrameSourceSlotReport;
