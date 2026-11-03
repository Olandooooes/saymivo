# 本机人物遮挡层

“人物与背景文字分层”使用 macOS Apple Vision，从原视频像素生成 RGBA 前景帧。脸、眼镜、动作和衣服的 RGB 来自原片；只增加透明通道，不生成面容、声音或补画身体。全程本地，后端只写普通媒体与 manifest，工程绑定由编辑器完成并可撤销。

`POST /api/person-matte/analyze` 接受 `{src,startMs,endMs,fps:30,sourceSha256?}`，其中时间为原片视频 presentation 时钟，每段不超过 10 秒；`src` 只能为素材库本地 MP4。首版保留源全画幅与名义整数帧率，不缩放、不重采样；不支持的帧率、旋转元数据或超过 4K 的输入会明确报错。返回 `202 {jobId}`。

`GET /api/person-matte/:id` 返回 `status/progress/label`，进度 0–1。完成结果位于 `result.personMatte`：

```json
{"prefix":"broll-assets/person-matte-ID/frame-","sourceStartMs":0,"fps":30,"count":180,
 "timesMs":[],"src":"clips/source.mp4","sourceSha256":"64位SHA256",
 "width":1920,"height":1080,"endMs":6000}
```

`timesMs` 存每张真实源帧的时间；实际返回的长度等于 `count`，且严格递增。`sourceStartMs` 与第一帧一致，`endMs` 为最后帧时间加一个源帧周期。渲染器在该有效区间内使用最近原帧，最多持有一帧时长，不在剪口后重新从第零帧开始。素材分辨率和相机裁切必须与原片一致。

后端在生成前后验证完整源 SHA；还核验视频起点、尺寸、帧率、逐帧原片时间、PNG 尺寸与 RGBA、非空且非全屏的人物 mask。每个作业生成独立的 `public/broll-assets/person-matte-ID/`，内含 `frame-00000.png` 等帧与 `manifest.json`。`proof` 记录源身份和实际源时钟；不是从播放器灰色占位帧截图制作。

`POST /api/person-matte/:id/cancel` 停止该作业的本机进程组并清理尚未完成的生成媒体。异常和重启中断同样保留原片，已完成且可能被工程引用的媒体不会因关闭面板删除。

头发、透明眼镜边、手指和快速动作仍需要预览核查。人物与后景字应处于同一相机变换内；若边缘不理想，可以撤销人物层或换用其他排版。AVFoundation 需要能正常解码本地视频的 macOS 进程环境；缺少此系统能力时报错，不切换云端，不用假人物层代替。

已有分层还可用于统一动效参数页的[同源人物与房间交接](person-handoff.md)。这条链另核每帧字节/源时钟、实际可见 Img、保存及离线导出；基础后景字的成功不能替代动态交接的真实 UI 验收。
