# 字段滚动的独立参数控件

[FieldRollBoardFields](../editor/FieldRollBoardFields.tsx) 是未接入运行编辑器的受控子组件。它只调用 `onChange` 返回新草稿；不导入 store，不创建素材、翻译、计数或音轨，也不保存、播放、应用或导出。

```tsx
<FieldRollBoardFields
  scene={rawScene}
  value={config}
  onChange={setDraftConfig}
  projectionProof={{rawScene, clips, fps, captions}}
  viewport={{width, height}}
  disabled={busy}
/>
```

`config` 使用现有 `FieldRollBoardConfig`。父级须先依据实际源身份创建完整 `binding`；控件不生成 SHA 或重新绑定项目。`newId?: () => string` 可用于父级统一创建稳定卡片、字段标识，默认 `crypto.randomUUID()`。

来源列表与渲染器共用完整文案清单：标题、正文、所有节点正文、详情、条目、标签、来源注记及关系说明。来源引用、完整旧值、源身份和时钟只读。目标完整值、标签、映射类型、完整引用、翻译语言、方向、逐字段时点、入退场和所有矩形均可编辑；没有省略号或 `maxLength` 截断。切换来源会同时清空旧目标和映射说明；原文变更后显示两份完整文本，须明确重绑。新增空卡和空字段保留必填缺项，不能凭默认空值应用。

原场已有媒体和节点素材保持在原 scene 中，控件显示来源及完整设置。当前文字机制不绘制这些素材，因此明确显示阻断，不通过清空素材来绕过。时间输入以原场景相对秒显示，草稿仍保存原毫秒，不按预览倍速重算或舍入。参数检查调用现有 `fieldRollBoardIssues`；它不是字体、DOM、媒体或应用凭证。

最小父级接线还包括：

1. 在正式支持该类型时才接入库入口、类型联合、统一 renderer 和保存合同；此组件尚未在运行界面中 import。
2. 每次 `onChange` 按现有草稿流程生成新 `draftKey`，清除旧测量、完整循环与人工审阅凭证。不要立即写 scene 或改变原文、剪口、字幕、资产、人物布局。
3. 预览传当前真实源身份、`projectionProof` 和同源人物槽；实际字体加载、全字素测量、完整旧/新阅读窗、字幕与人物包络和媒体解码必须仍经过 renderer 与 DOM 门。
4. 全部通过后使用统一当前草稿凭证完成保存、读回、一次撤销和实际导出验证。保留原片唯一音轨，参数检查的 `canApply: false` 不能替代后续真实验证后的统一应用路径。

定向检查：

```sh
node --test tests/field-roll-controls.test.mjs tests/field-roll-board.test.mjs
npm run typecheck
```

表单测试执行实际 TSX 事件闭包和纯编辑逻辑，使用原创合成内容。没有真实浏览器、字体像素、媒体播放或保存/撤销验收；不表示运行工作台已支持本机制。
