# 单场独立动效的保存与应用合同

`src/scene-dynamic-motion.mjs` 管理独立配置与当前原场的绑定，`editor/apply-dynamic-motion.mjs` 是写入入口。它们不生成文案，不调整剪口、原声或作者的人物窗，也不替换已有媒体。本文描述代码合同与合成回归；真实工作台的播放、字体、人物边缘和成片观感仍需实际验收。

## 保存与失效

`createSceneDynamicMotionDraft(rawScene, config, environment)` 只能从原始源时间场景创建，不能使用 `projectStoryboard` 的投影对象。`previewSceneDynamicMotion(draft)` 生成同形的预览配置，不授予应用权限。

保存的 `scene.dynamicMotion` 含：

- `version: 1`、`clock: 'scene-source-relative-ms'`、独立 `config`；
- `binding`：sceneId、src、SHA、原 clipId、raw startMs/endMs，以及本场相交的每个保留 clip 实例及速度；
- `baseSignature`：完整作者场景（排除两个动效选择字段）、全部 clips 顺序和变速、输出尺寸/FPS、字体 ID、外观与上下文快照、原片及资料身份；
- `draftKey` 与 `configSignature`：绑定这次草稿和实际参数，避免改参数后沿用旧审阅；
- 原片 `sourceIdentity` 与 `assetIdentities`：本地相对路径、SHA、实际解码宽高、种类、可选时长，供离线导出重新核验；
- `contextSnapshot`：字幕、插入资料与声音上下文。实际编辑器 state 中已有这些字段时，统一环境 builder 使用实时值覆盖外部快照。

环境统一从 `dynamicMotionEnvironmentFromState(state, evidence)` 构造。外观为 `{presentationWithoutScenes, accentColor, meta}`，字体签名取配置 ID 或 `none`。加载状态不进入签名；实际字体和媒体是否可见由下面的 DOM 观察确认。导出服务仍须重新检查文件 SHA 与解码尺寸，不能把保存时的身份当成当前磁盘身份，也不在离线渲染时访问 Vite API。

独立动效与 `visualPreset` 互斥。草稿额外保留当前动效选择签名，预览期间改选也会失效；保存后检查排除自身选择，避免正常应用立即使配置过期。原文、节点、资产、剪口、速度、字体、外观或上下文变化后须重新建立草稿与预览。

## 实际预览凭证

`createDynamicMotionRenderSession(draft, rawScene, environment)` 创建本地会话。播放器实际播放并完成帧绘制后调用：

```js
session.recordFrame(root, projection.id, absoluteSourceMs, nativeReadiness);
const progress = session.getProgress();
const result = session.finish({reviewed: true, personSafe: true, reviewedDraftKey: key});
```

根 DOM 必须绑定 `data-dynamic-draft-key`、`data-dynamic-projection-id`、绝对原片 `data-dynamic-source-ms`、机制 kind 和原生 readiness。时钟、实例和原生/原片/资料 readiness 不一致时不记录。本场每个保留实例分别检查首尾及中间覆盖，普通帧采样间距上限为 250ms 源时间（低帧率或变速按帧容差扩展）；两个相同 src 的实例不能互借证明。

观察器读取实际绘制的文本节点及 Range 边界、可见性、文字实际填色/可见描边、遮罩、字幕安全区、已加载 FontFace 和计算字体。隐藏分页、aria 标记、data 文案属性、被截掉的字和调用者填写的 `displayedFields` 都不能替代可见原文。完整正文按现有 `completeSourceCopyInventory` 检查 title/body/节点 text、detail、bullets；可跨实际分页累积，保留英文空格和短词。

真人须在真实 DOM 中存在同一源路径、尺寸和源时钟的已解码可见 Video；资料须实际显示相应来源及尺寸，不能仅通过后台预加载。文字机制若不绘制本场已有媒体会拒绝应用，要求选证据类或保留原编排；ROI 只显示一张原图时也不能悄悄遗漏其他节点图片。

`finish` 还要求人工确认完整动态、文字可读及真人避让。这个确认不代替 DOM 证据；DOM 也不声称自动识别脸部、逐源帧审阅或证明审美效果。关键运动、素材语义、脸部遮挡与原声仍需实际复看。未成功时可继续采样再确认；参数变化则必须新建会话。

成功结果中的 receipt 是模块内部 WeakMap 认可的临时对象。伪造 JSON、复制 receipt、换草稿或改参数都不能应用。刷新页面后需要重新预览；保存工程中的配置无需保存临时 receipt，但导出仍要重新核验 binding、参数签名和文件身份。

## 一次撤销

`applyDynamicMotionToStore(store, draft, environment, receipt)` 在提交前重新读取实际 store，并重建 clips、外观与当前上下文；旧调用参数不能覆盖新剪辑。检查通过后只进行一次 `setPresentation`，仅给目标场附加 `dynamicMotion`、移除互斥的 `visualPreset`。其他场、节点引用、人物窗、字幕与声音保持原值。

`clearDynamicMotionFromStore(store, sceneId)` 只移除独立配置，一次撤销可恢复。重复清除不增加历史记录。应用的撤销恢复原先的动效选择与作者场景。

回归入口：`node --test tests/scene-dynamic-motion.test.mjs`。测试使用合成 DOM 几何和实际 Zustand store，覆盖完整可用路径、伪凭证、隐藏页/空格、缺中段、重复源实例、过期依赖、资料遗漏与一次撤销；不是浏览器字体或真实素材验收。


## 配对、对象遮蔽和整幅过渡

统一库现有 27 个参数入口：既有 22 项，加上 `paired-relations` 的三个变体、`veil-state` 和 `full-frame-blur-zoom`。新项有可编辑构造器和结构控件，不只是目录名称。它们不推断原节点之间的关系、冻结时点或模糊强度；缺失值保留 `requiredData`，填写后仍需完整预览。所有新配置保留原片 SHA 和 raw 起止绑定，纯校验逐一重算实际保留实例。未完整保留正文/动作或速度使阶段成为闪现会拒绝，不用其他实例的曝光补足。

配对双方由真实原 nodeId 选择，阶段 ID 固定，关系来源和方向必须明确。遮蔽对象的只读 `expectedText` 在换节点时同步 `text + detail + bullets`，不会只保留标题。两类不绘制本场已有资料时直接拒绝；原资料保留在工程。

整幅过渡只接受同一原视频或一份已绑定真实图片。图片身份通过当前只读素材接口绑定，切换原节点会重新选取对应图片身份，不能在表单手写 SHA，也不能借用另一图片尺寸。多份尚未呈现的媒体会拒绝。保存和导出仍会检查实际文件身份。

`DynamicMotionRenderer` 为整幅原视频背景和持续清晰人物分别创建静音视觉 slot；两个 slot 各自用真实 Video 解码尺寸、路径、`currentTime`、静音状态和帧容差报告加载情况。未解码的新槽保持 waiting，不被错误解释成尺寸伪造，也不能成为 ready。离线渲染只在 OffthreadVideo 的实际解码图像回调后检查像素尺寸，报告对应请求的源帧时点。没有复制音轨或新增 Audio，原声仍由外层原片轨道唯一持有。

新原生 copy 平面加入同一 DOM 字体/可见文字观察；hidden 分页或不匹配的展示字体仍不能拿凭证。独立 renderer 的 `canApply:false` 是局部能力标记；真正应用权限来自既有 opaque receipt，不会把全部新项永久锁死，也不会把 native ready 当人工验收。

定向回归：`node --test tests/three-dynamic-integration.test.mjs tests/scene-dynamic-motion.test.mjs`。测试包含真实 central 分支与媒体包装层、明确合成解码对象及 SSR，不代表实际浏览器像素、观感或私人成片验收。


选择身份只保存当前选择：解析当前 dynamicMotion.draftKey 时，仅排除其顶层历史 selectionSignature，保留当前 nonce、baseSignature、config、其余 key 字段及外层 dynamicMotion 的全部字段。这样反复预览/应用不会递归嵌入上一代全文快照；配置、来源、上下文或当前 nonce 改变仍使旧 receipt 失效。无法解析、数组、null 和其它非对象 key 保留原字符串参与失效检查。旧 saved 格式仍可读取，不自动改写工程、修复旧字符或迁移凭证；需要消除旧祖先链时，由新完整预览再应用。
