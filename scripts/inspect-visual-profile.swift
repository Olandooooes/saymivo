import Foundation
import Vision
import ImageIO
import CoreGraphics

// Local rectangle detection only: no identity recognition or face embeddings.
let args=CommandLine.arguments
guard args.count>=3 else {fatalError("Usage: inspect-visual-profile.swift REPORT.json IMAGE...")}
func linear(_ n:Double)->Double {let s=n/255;return s<=0.04045 ? s/12.92 : pow((s+0.055)/1.055,2.4)}
var frames:[[String:Any]]=[]
for file in args.dropFirst(2) {
 try autoreleasepool {
  let url=URL(fileURLWithPath:file)
  guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {fatalError("Cannot decode image")}
  let request=VNDetectFaceRectanglesRequest();request.usesCPUOnly=true
  try VNImageRequestHandler(cgImage:image,orientation:.up,options:[:]).perform([request])
  let faces=(request.results ?? []).map {face->[String:Any] in
   let b=face.boundingBox
   return ["x":b.minX,"y":1-b.maxY,"w":b.width,"h":b.height,"confidence":face.confidence]
  }
  let w=image.width,h=image.height
  var pixels=[UInt8](repeating:0,count:w*h*4)
  var regions:[[String:Any]]=[]
  pixels.withUnsafeMutableBytes {bytes in
   let rgba=bytes.bindMemory(to:UInt8.self)
   guard let space=CGColorSpace(name:CGColorSpace.sRGB),let context=CGContext(data:bytes.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue|CGBitmapInfo.byteOrder32Big.rawValue) else {fatalError("Cannot sample image")}
   context.draw(image,in:CGRect(x:0,y:0,width:w,height:h))
   for (name,x0,x1) in [("left",0.03,0.33),("right",0.67,0.97)] {
    var values:[Double]=[]
    for y in stride(from:Int(Double(h)*0.08),to:Int(Double(h)*0.64),by:3) {
     for x in stride(from:Int(Double(w)*x0),to:Int(Double(w)*x1),by:3) {
      let i=(y*w+x)*4
      values.append(0.2126*linear(Double(rgba[i]))+0.7152*linear(Double(rgba[i+1]))+0.0722*linear(Double(rgba[i+2])))
     }
    }
    let mean=values.reduce(0,+)/Double(max(1,values.count)),variance=values.reduce(0){$0+pow($1-mean,2)}/Double(max(1,values.count))
    regions.append(["side":name,"x":x0,"y":0.08,"w":x1-x0,"h":0.56,"meanLuminance":mean,"stdLuminance":sqrt(variance),"samples":values.count])
   }
  }
  frames.append(["file":url.lastPathComponent,"width":w,"height":h,"faces":faces,"regions":regions])
 }
}
let result:[String:Any]=["version":1,"coordinateSpace":"source image, normalised top-left; not final camera crop","method":"Local Apple Vision face rectangles plus CoreGraphics colour-managed sRGB luminance; no identity recognition","frames":frames]
try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:args[1]))
print("Inspected \(frames.count) local frames")
