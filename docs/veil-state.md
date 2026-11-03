# 对象遮蔽、冻结与解除原语

`VeilStateScene` 是实验图层，已接入统一动态库与单场结构化草稿，不会自动应用。它用原创的中性线纹、透明度和模糊说明“暂时不可见/暂时冻结，再解除”的视觉关系。它不检测、宣称或改变账号、工具、服务器或真实任务的状态，也不暂停原片、人物、声音或字幕。

每个对象始终绑定原节点 ID 和 `text + detail + bullets` 的完整 `expectedText`，保持同一个 React key、位置和边框。阶段依次为 `clear → veiling → frozen → releasing → restored`。冻结期间保持冻结前最后一页，解除完成后从第一页重新完整阅读。整个状态由原场相对毫秒计算，回退和跳转不会遗留 CSS 动画状态。模糊与遮层裁在对象框内，没有全画幅滤镜或素材占位。

## 数据与接线

新文件为 `src/veil-state.mjs/.d.mts`、`src/VeilStateScene.tsx`。纯模块导出 `veilStateIssues`、`veilStateFieldPlan`、`veilStateMeasurementKey`、`veilStateReadiness`、`veilStateState` 和 `veilStateControls`。

`VeilStateConfig` 必填：

- `kind:'veil-state'`、`clock:'scene-source-relative-ms'`。
- `binding:{sceneId,src,sha256,startMs,endMs}`：本地原片的完整 SHA256 和原场绝对时间，不能只凭同 src/同长度绑定。
- `sourceKind:'illustration'`、`provenance`：作者明确给出的示意含义。可选 `annotation` 会进入真正显示的完整原文。
- `copyWindow:{atMs,endMs,rect}`：先实际显示标题、正文、所有节点（含未选节点）、detail/bullets，以及原有 label/sourceNote/tag/link 文字。
- `objects[]:{id,nodeId,expectedText,rect,atMs,freezeAtMs,freezeMs,releaseAtMs,releaseMs,endMs,appearance}`。每个对象必须有独立的完整清晰阅读前窗和解除后的阅读后窗。
- `appearance:{dimOpacity,veilOpacity,blurPxAt1080}`：三个值都显式给出；透明度/模糊范围由 schema 校验。模糊 px 按输出高度相对 1080 缩放。

`veilStateControls` 提供稳定对象 ID、只读原文、原节点引用、原场毫秒、归一化矩形和外观参数的结构化字段。时间字段沿用 `source-ms`，通用表单以秒展示并换算为毫秒保存。没有默认数值、假状态、翻译或自动造事实。更换原节点时，调用者必须重新绑定其完整 `expectedText`，不能保留旧文案。控件的 `scene-node-complete-text` 是完整原文来源标识；统一控件已为它补齐 `text/detail/bullets` 的同步和稳定对象 ID 创建，不能只同步 `node.text`。

原始场景可直接调用 `<VeilStateScene scene={rawScene} config={config} elapsed={originalElapsedMs} onReadiness={callback}/>`。投影场景还必须传 `projectionProof={{rawScene,clips,fps}}`；纯函数重新运行 `projectStoryboard` 并核对精确保留实例。整场挪时、不同实例或过期投影均不可借同素材绕过。`elapsed` 是原场源时钟，不是成片局部时钟。

这是 native overlay：调用者保留真实同源人物与字幕，图层不替换人物。按 central 相同算法保护默认圆窗，并保守避让所有 authored 人物关键帧矩形的整体包络、额外 `protectedAreas` 和底部 14% 字幕区。未知全幅人物通常没有可用侧区，会拒绝冲突图解；`needsFaceReview:true` 不代表已经确认脸部安全。遮层、正文、边框都限制在校验的对象完整包络里。

## 文字、曝光和未验证边界

所有原文与对象均使用 `useMeasuredText`，等待真实字体加载后测字，不截字、不省略条件。字体、完整原文、布局、配置和源绑定变化会清掉旧测量。整场先汇总测量与阅读结果，只有 ready 才画完整文案或图解，不会等待一部分字时先闪现遮层。

每一页都按真实保留的源区间与速度检查阅读时长，完整对象的冻结前与解除后分别检查。动作、冻结停留、解除和全部后窗必须实际保留；跨剪口缺前窗或后窗时保守拒绝。连续冻结态至少保留 600ms，遮蔽和解除各至少有 120ms 实际曝光。现阶段不跨几个投影拼凑一次阅读证据。已有真实图片或视频的场景交给支持媒体的 renderer，禁止悄悄丢弃资料后只画文字。

`onReadiness` 返回 `waiting | blocked | ready` 与 issues，同时始终 `canApply:false`、`uiAccepted:false`、`needsFaceReview:true`。非法参数会主动发 blocked，字体/测量重建发 waiting，不能遗留旧 ready。它不提供应用或项目写入接口；统一接线仍要求逐场真实预览凭证和一次撤销应用协议。

回归入口：`node --test tests/veil-state.test.mjs`。合成测试执行真实组件分支，覆盖冻结/解除、完整正文、页曝光、人物路径、源实例、空测量和旧 ready 清理。这些结果不等于真实浏览器字体像素、模糊合成、真人面部或成片观感验收。
