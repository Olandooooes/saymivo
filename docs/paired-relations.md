# 成对对象对应与横向交替

这是原创可编辑原语，三个变体已接入统一动态库、中央 renderer 和单场结构化草稿。接线不会自动修改任何项目。入口是 `PairedRelationsScene`，纯合同在 `paired-relations.mjs/.d.mts`。当前完成参数、源时间、文本布局和合成渲染回归；真实字体、人物像素和完整循环的 UI 验收尚未进行。不能把注册前的代码说成参考视频全部效果已复现。

## 三个变体

| variant | 可见变化 | 明确语义 |
|---|---|---|
| `correspondence` | 双方持续在场，按显式阶段移位与改变焦点；连接线跟随双方边界 | 只展示配置声明的对应或对照，不推导相等、优劣或因果 |
| `horizontal-alternate` | 双方在各自水平轨道中移动，焦点交替 | a/b 与原 nodeId 始终不变；不把原对象换字成另一对象，不让两卡穿过彼此 |
| `bidirectional` | 双向箭头持续；移动阶段按显式方向显示一次抽象脉冲 | 只表示已声明的双向关系，不表示真实请求、数据数量或执行成功 |

没有计数、百分比、完成勾或推断的连线。`relation.provenance` 必须由调用方提供；原语不核验其事实正确性，也不会根据相似词猜双方关系。已有真实图片/录屏的场景会拒绝，避免用纯文字配对偷偷替掉资料。

## 独立配置

`kind` 为 `paired-relations`，`clock` 为 `scene-source-relative-ms`。所有矩形是输出归一坐标，所有时点相对完整原场起点。

- `binding`：原 sceneId、src、SHA256、raw startMs/endMs。
- `sides.a/b`：两个不同的真实原 nodeId 与起始 rect。
- `relation`：`type: correspondence | contrast | bidirectional`、provenance；可选 label 必须引用真实原 nodeId，并给出完整 label rect。
- `copyWindow`：完整正文的 atMs/endMs/rect；`graphicWindow` 给出图解的 atMs/endMs。全文窗口必须先结束，不能遮住首次图解动作。
- `titleRect`、`speakerRect` 与可选 `protectedAreas`：完整标题、真实人物槽和额外保护框。
- `phases`：稳定 id、atMs、moveMs、holdMs、双方完整目标 positions、active。双向变体还须明确 flow 为 a-to-b/b-to-a/both。

先显示完整原文，再给双方稳定总览，之后才做阶段运动。总览至少有 900ms 源时间；每阶段 moveMs 至少 200ms、holdMs 至少 900ms。实际阅读检查仍按字体、分页、当前保留区间和变速计算，这些最小值不保证长文可读。

`horizontal-alternate` 保持每方 y/width/height，必须有真实水平位移、焦点交替；别把这个变体称成角色互换。其他变体可显式改变双方框尺寸/位置，但稳定 a/b 与 nodeId 永远保留。

## 完整文字与人物

renderer-owned SourceCopyWindow 平面按现有完整原文清单绘制 title、body、全部节点 text/detail/bullets。它与九类专用 `SourceCopyWindow.tsx` 使用同一实际字体/完整分页原则，但拥有独立的原生字段计划，不修改九类 native 报告计数分派。未参与这对关系的节点也会在全文窗口完整出现。sourceNote 等来源元数据保留在工程，原语不擅自生成画面 footer。

`useMeasuredText` 等待所选字体后测量完整 copy、原生 title、双方完整原文及可选关系标签。双方文字用全运动过程中最小字框测一次，不随当前帧重测或删字；每个稳定阶段从该阶段第一页开始，移动时保留上一稳定阶段的末页。`pairedRelationsReadiness` 检查所有实际报告、原文完全相等、每一页及每个阶段的实际保留阅读时间。只保留末段或提高速度导致阅读不足时返回 blocked，不借用另一实例的时间。

人物必须由调用方提供 `renderSpeaker` 与同源 `speakerProof`。源路径/SHA/raw起止不符、槽为空或没有真实媒体组件时拒绝。这个 slot 合同不代替父级对实际 Video 解码、尺寸、时钟与可见性的检查；独立组件不新增音轨。

安全检查包括：字幕下方 `.86` 预留、人物原始窗及所有关键帧的完整包络、复制正文/标题/关系字、两方运动包络与连接通路。双方连续运动的碰撞用共同缓动进度上的解析线性不等式检查，避免只看两端而漏掉中途穿越。文字与人物的实际脸部关系仍需完整播放人工确认；native ready 不代表工作台已应用、成片已通过。

## 父级接入字段

统一接线已使用以下合同，真实逐场预览仍须完成：

1. Config union / registry 加入 `PairedRelationsConfig` 和 `pairedRelationsControls` 三个 variant。构造器必须取真实原节点、关系来源及显式阶段，不能自动编关系。
2. 中央 renderer 传入 `{scene: projectedScene, config, elapsed: sourceRelativeMs, projectionProof: {rawScene, clips, fps}, speakerProof, renderSpeaker, onReadiness}`。`speakerProof` 是 `{kind:'same-source-video',src,sha256,startMs,endMs}`；speaker callback 接收 `{width,height,elapsed,sourceMs,mode:'inset'}`。
3. `onReadiness` 返回 status/issues，以及独立原语固定的 canApply:false/uiAccepted:false/needsFaceReview:true。父级可用 native status 参与通用真实 DOM receipt；不能把这些独立标记直接当应用权限。
4. 通用保存合同须调用 `pairedRelationsIssues` 并继续保留旧稿签名、实际来源身份、每实例完整循环与一次撤销门槛。原语本身不写 store。
5. DOM 已提供 `data-measured-text`、可见页 aria-hidden、`data-paired-side`、`data-original-node`、`data-paired-phase`、`data-source-copy-window`。父级根仍负责 draftKey/projectionId/sourceMs/source readiness 绑定；若全源 Video 包在 slot 内，保留其实际原片标记。

纯函数导出包括 `pairedCompleteCopy`、`pairedRelationsFieldPlan`、`pairedRelationsMeasurementKey`、`pairedRelationsIssues`、`pairedRelationsReadiness`、`pairedRelationsState`、`pairedRelationsPage`、`pairedProjectionIssues`、`pairedProtectedRects` 与 `pairedSweptOverlap`。

回归：`node --test tests/paired-relations.test.mjs`。覆盖稳定身份、双向方向、连续碰撞、全文与分页、实际 cut/speed、同 src 不同实例、真实 renderer native readiness/reset、局部页时钟及空人物槽；字体测量使用合成 metrics，没有运行浏览器或修改私人项目。
