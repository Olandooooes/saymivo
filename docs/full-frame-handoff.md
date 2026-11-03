# 整幅模糊缩放交接（独立实验）

`FullFrameHandoffScene` / `full-frame-handoff.mjs` 是原创过渡，已接入统一动态库、中央 renderer 与单场结构化草稿；不会自动选入方案或写入工程。它不声称重建参考作者的原工程、摄影机运动或新机位；曲线是原创 smoothstep，峰值、中心和时点须由编辑者明确填写。

- `target.kind=source-video`：同一条原片、同一个绝对源时点的整幅包装层清晰 → 模糊放大 → 恢复清晰。不冻结或重置原视频，不创造另一段摄影机素材。
- `target.kind=scene-image`：本场 `media` 或显式 `nodeId.assetSrc` 已存在的单份真实图片，使用其自己的路径、SHA、尺寸及实际加载结果。清晰状态 `object-fit:contain` 保留全图；峰值放大可能暂时越过画幅，必须前后各有实际保留、按速度核算的清晰停留。多份未呈现资料、视频冒充图片均拒绝。
- 整幅媒体是后平面；清晰真实人物窗持续位于前方。全文窗口实际绘制标题、正文、全部节点文字/detail/bullets，另保留 label、sourceNote、tags、link labels 和作者可编辑 annotation。没有固定生产角标或小字补漏。

## 调用合同

传 `scene` 为 `projectStoryboard` 的真实当前投影，`projectionProof={rawScene,clips,fps}` 为完整未重造的工程片段。内部重算并比较投影，`binding` 固定原场绝对 start/end、原视频路径、SHA、真实宽高及 durationSec。裸原场不能代替实际保留实例。每个实例都须保留完整阅读页、完整过渡及清晰停留；缺失时拒绝，不在剪口重新开始动画。

`elapsed` 是完整原场相对源毫秒，不能传当前片段局部毫秒。源位置恒为 `binding.startMs+elapsed`。`sourceProof` 需匹配当前原片身份、绝对时点、fps、已加载状态，明确 `muted:true, audioOwner:'external-single-track', preservesFraming:true`。

`renderSpeaker(request)` 的两个可能请求为 `slotId:'speaker' / 'full-frame'`；图片模式仅请求 speaker。保留完整原 framing，不改变源时点，静音且 volume=0。调用方给每个真实视频包装层接 `onSourceStatus({status,src,sha256,width,height,sourceMs,muted})`，实际解码、时钟和尺寸核验后报告。各槽未报告、时点陈旧、尺寸/身份不同都不能 ready。回调返回 null/空壳会 blocked。不得用固定图片、占位演员或伪造 loaded 回调证明真实人物。

本组件不创建 Audio 或视频音轨；原声只由外层既有原片轨道保留。两层同源视觉均须静音，不能让复制视觉包装层复制原声。

图片还须传来自当前只读素材身份接口的 `assetIdentity`；本组件实际 `Img.onLoad` 再核对解码自然宽高，身份相符但图片尚未解码仍 waiting。

## 字体、人物与时点

`copyWindow` 是显式的独立完整阅读时段，不能与 transition 重叠。实际加载当前字体后测量完整文字；每页按真正保留范围和速度独立核算阅读时间。窗口、字幕下方14%保留区、持续清晰人物窗、全部已知人物关键帧及其保守包络、手动保护区冲突即拒绝。未知人物位置仍需真实审阅；`needsFaceReview=true`，不冒充人脸追踪。

媒体、正文和动效必须等全部当前字体、当前源槽及真实图片解码后才显示。等待中保留能提供的当前清晰人物窗；旧配置或字体不能闪出旧效果。`onReadiness` 报 waiting/blocked/ready，解绑和卸载清理旧 ready。所有入口保持 `canApply=false, uiAccepted=false, automaticAllowed=false`。

独立结构化控件元数据在 `fullFrameHandoffControls`，源时间 UI 仍按秒显示，内部保存毫秒；身份只读。接线需要中央真实 source wrapper 的按槽状态、资产身份读取、正式完整循环 receipt 及单次撤销应用，这些入口已接入，但尚未宣称真实 UI 验收通过。

## 验证和不足

`node --test tests/full-frame-handoff.test.mjs` 覆盖真实中间状态、回跳、原绝对时间/SHA/实例 stale、切口和变速曝光、全文分页、横竖布局、所有已知人物路径、图片独立身份/加载门、空回调与旧 ready 清理、视觉静音和外层原声所有权。

测试采用明确合成的可变字宽和解码报告；SSR 只核分支、实际页选择及媒体层/时间请求，不作为浏览器像素验收。真实视频包装层的逐帧解码、当前字体最终像素、模糊强度/边缘、人物安全、声音单轨和导出仍须接线后实际预览/媒体检查。没有生成截图、录屏或声称已完成像素 QA。
