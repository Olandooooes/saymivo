import Foundation
import AVFoundation
import Vision
import CoreImage
import ImageIO

// Local video processing only. The output preserves source sample timestamps.
let args=CommandLine.arguments
guard args.count==7,let first=Int(args[3]),let count=Int(args[4]),let fps=Int32(args[5]),fps>0 else {
 fatalError("Usage: person-matte.swift INPUT OUTPUT_DIR FIRST_FRAME COUNT FPS REPORT.json")
}
let input=URL(fileURLWithPath:args[1]),dest=URL(fileURLWithPath:args[2])
try FileManager.default.createDirectory(at:dest,withIntermediateDirectories:true)
let asset=AVURLAsset(url:input)
guard let track=asset.tracks(withMediaType:.video).first else {fatalError("No video track")}
let reader=try AVAssetReader(asset:asset)
let output=AVAssetReaderTrackOutput(track:track,outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData=false
reader.add(output)
reader.timeRange=CMTimeRange(start:CMTime(value:Int64(first),timescale:fps),duration:CMTime(value:Int64(count),timescale:fps))
guard reader.startReading() else {fatalError("Cannot read source")}
let request=VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat=kCVPixelFormatType_OneComponent8
request.usesCPUOnly=true
let context=CIContext(options:[.useSoftwareRenderer:true])
let space=CGColorSpace(name:CGColorSpace.sRGB)!
var timestamps:[Double]=[]
while timestamps.count<count, let sample=output.copyNextSampleBuffer(){
 try autoreleasepool {
  guard let pixel=CMSampleBufferGetImageBuffer(sample) else {fatalError("Missing decoded frame")}
  try VNImageRequestHandler(cvPixelBuffer:pixel,orientation:.up,options:[:]).perform([request])
  guard let mask=request.results?.first?.pixelBuffer else {fatalError("No segmentation result")}
  let source=CIImage(cvPixelBuffer:pixel),matte=CIImage(cvPixelBuffer:mask)
  let scaled=matte.transformed(by:CGAffineTransform(scaleX:source.extent.width/matte.extent.width,y:source.extent.height/matte.extent.height))
  let clear=CIImage(color:.clear).cropped(to:source.extent)
  let person=source.applyingFilter("CIBlendWithMask",parameters:[kCIInputBackgroundImageKey:clear,kCIInputMaskImageKey:scaled])
  let target=dest.appendingPathComponent(String(format:"frame-%05d.png",timestamps.count))
  try context.writePNGRepresentation(of:person,to:target,format:.RGBA8,colorSpace:space)
  timestamps.append(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)))
 }
}
guard timestamps.count==count else {fatalError("Incomplete source decode: \(timestamps.count) / \(count), \(String(describing:reader.error))")}
reader.cancelReading()
let report:[String:Any]=["input":input.path,"directory":dest.path,"firstFrame":first,"count":count,"fps":fps,"sourceTimestamps":timestamps,"method":"Local Apple Vision accurate person segmentation, original RGB plus alpha; no generated face or voice."]
try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:args[6]))
print("Wrote \(timestamps.count) source-aligned person frames")
