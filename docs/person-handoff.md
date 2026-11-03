# 同源人物与房间交接

统一动态参数页的 Evidence `speakerMode=cutout / matchToLive` 和 Hub `matchToDiagram` 已接入本地真实 RGBA 序列、同源房间、预览凭证、保存与导出。它们不会生成脸、补全身体或补画真人挡住的房间，也不自动给工程套配置。圆窗与自由抠像之间的连续形态 morph 尚未实现；完整真实 UI 和成片观感仍须逐配置验收。

原场必须先绑定已有的人物分层。首版沿用每场最多十秒、源全画幅/整数帧率和完整 `timesMs` 的格式。只读 `GET /api/dynamic-matte?src=...&prefix=...&startMs=...&endMs=...` 核当前原片 SHA、真实首视频 PTS/帧率、生成 manifest、每个 PNG 的实际字节与 RGBA raster/透明区域。缺帧、时间间断、尺寸/源时钟不同、manifest 或 PNG 变更均拒绝。读取使用校验过的文件描述符及原始 stat，序列结束再核，不用新 stat 给旧 SHA 建新基线。

稳定 `matteEvidence` 单独保存在草稿和已保存动效中：来源身份、manifest SHA、完整帧表、序列 SHA 和实际源 PTS。加载状态不参与签名；没有 matte 的旧场保持原签名格式。Editor 应用前和 server 保存/导出前重新读取身份；离线渲染使用普通已核验资产，不请求 Vite API。修改源片、序列、当前配置、字幕/字体或保留实例须重新预览。

客户端先核 PNG 字节 SHA，再用同一份字节的 Blob 实际解码。当前可见 `Img` 必须有匹配的实际 currentSrc、自然尺寸、源帧索引/PTS及私有元素关联，才能作为人物凭证。诊断属性、挂载、`hasRealCutout` 能力标志或隐藏的 Video 均不能证明可见人物。等待时仍保留真实 RGB 人物，当前帧未就绪不能应用。全文、资料、实际字体、每个保留实例和人工人物安全核验仍是独立门槛。

RGBA 与 RGB 共用原片 `fit`、objectPosition、人物 framing 和源时间相机参数，不把 alpha 拉伸去掩盖偏移。房间端必须是完整源画布 `{x:0,y:0,width:1,height:1}`：Evidence 的 `to`、Hub 的 `from`。源时间为完整原场相位，剪口、重复素材实例与变速不重置序列。

房间平面使用同一实际 alpha 的反向遮罩，避免把旧位置的脸再显示一份。这会留下透明人形区域，**不是恢复了被遮挡的景物**。Evidence 要求 `backgroundDelayMs >= durationMs`，人物完成源平面对齐后才淡入房间；Hub 的原创安全节奏先用总时长前35%淡去房间，保持人物对齐，再用余下65%移动人物。Hub 不支持共用表单里的独立背景/旧图延时，填写这些字段会明确拒绝，不能声称它们有效。是否最终无缝、边缘有无 halo 仍需真实播放。

先行全文窗口使用单独的真实 RGB 人物位置，结束后才进入原生图解。它不是形态 morph。原图、标题/正文、全部节点/条件和原字幕不删。所有附加 Video/OffthreadVideo 都静音且 volume=0，声音仍归外层既有原片唯一调度；此功能不新增 Audio。

回归为 `tests/dynamic-matte.test.mjs`、`dynamic-matte-lifecycle.test.mjs` 和场景合同/中央集成测试。公开用例仅合成 PNG、字体与媒体回调，覆盖实际 raster 检查、文件变化、当前 Img 门、完整 DOM 会话到一次撤销及单声轨。它们不替代真实浏览器字体、人物边缘、每阶段动态、保存读回或最终编码 MP4 验收。
