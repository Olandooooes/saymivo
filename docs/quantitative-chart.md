# 独立定量图表原语

`quantitative-chart.mjs/.d.mts` 与 `QuantitativeChartScene.tsx` 的三个变体已列入统一动效参数页的22项实验机制，并接入中央预览。原生组件的 `canApply/uiAccepted/automaticAllowed` 仍均为 false，本身不写工程；统一参数页的最终应用另需实际完整循环、DOM核验及不透明会话凭证（opaque receipt）。合成回归检查数据、源时钟、页面实际可见状态及阻断逻辑，不等于真实字体像素、原片解码与本类型UI应用已验收。

## 三个显式变体

- `horizontal-bars`：`axis.scale` 明确为 `linear` 或 `log10`。线性横条从显式零线起；对数横条从显式正数 `min` 起，所有值必须大于零。`1/10/100` 在 log10 轴上等距，不能用线性长度替代。项目 `from/to/decimals/atMs/durationMs`、完整原节点、标题框和数值框逐项提供。
- `signed-columns`：共同线性轴必须有负端、零刻度与正端，正负柱从同一零线伸展，数值保留正负号与单位。可选 `depth:{x,y}` 是原创的右上侧面位移，整个厚度包络参与安全检查。
- `annotated-line`：`xAxis/yAxis`、有稳定 ID 的数据点及出现时点、系列原节点、解释代码原文行、条件数据坐标区域与对应代码行 ID 全部明确给出。仅连显式点；不推断阈值、因果或真实执行结果。代码区域是中性解释板，不能冒充软件运行截图。

数据性质 `dataKind:'explicit'|'illustration'` 与来源 `provenance` 必填，供素材合同及库界面说明。无数据不会生成默认统计。来源说明不是固定烧入角标；需出现在成片的限定条件应写入可编辑原节点或 `annotation`。带截图素材的场景保守阻断，交给真实资料截图原语。

## 可编辑合同

共同字段：`kind:'quantitative-chart'`、`clock:'scene-source-relative-ms'`、`binding:{sceneId,src,sha256,startMs,endMs}`、`copyWindow:{atMs,endMs,rect}`、`chartWindow:{atMs,endMs}`、`plotRect`、`speakerRect`、可选 `protectedAreas/annotation`。矩形使用输出归一坐标，底部 14% 为字幕保护区。轴包含明确的 `scale/min/max/ticks/unit/label/decimals`，`axisLayout` 分别给刻度带与完整轴名框。没有隐式阈值、默认数据或偷偷缩短动作。

`quantitativeChartControls` 已供统一参数页使用，包含列表稳定 ID、源节点引用、轴范围、数值时点、保护框与代码行映射。现有表单适配已支持 `number-list` 和 `stable-ref-list`；仍需实际操作核验三个变体的字段往返、原文/ID保持及完整预览，不能将控件元数据存在当成UI验收。

## 时间、全文与人物

完整正文窗口由渲染器内部收集本场 title/body/label/sourceNote/tags/links、所有节点 text/detail/bullets 及 annotation；不能用外部自报字段代替。说明窗与图表时窗分开，真人插槽和原声持续。真正当前字体加载后逐页实测，每页按保留原片范围与速度核算曝光。代码与轴名需单页完整，条件长文从其真实入场时点第一页开始。无足够阅读时间或动画/终态被剪去则阻断，不重置原场相位。

原场绑定绝对源起止与 SHA。投影场必须额外提供 `projectionProof:{rawScene,clips,fps}`；内部从原场重新投影并对比整个投影内容/时钟，不能用几何缓存冒充源身份。数值使用最终数字、最大位数、符号、单位的稳定字形 atlas；动画当前值不会逐帧重测文字。

调用者必须提供匹配身份的 `speakerProof:{kind:'same-source-video',src,sha256,startMs,endMs}` 和真实渲染回调，回调收到绝对 `sourceMs`。空输出、缺证明、陈旧测量、未加载字体会清理 ready，图表不闪旧图；字体等待期间保留已验证的说话人输出。所有文本框、图表厚度、已知人物关键帧包络与保护区均检查冲突。自定义组件内部是否真的解码正确原片，仍须正式 trusted speaker 链与实际 UI 像素验收；声明或 DOM 标记本身不是视频证明。未知脸部位置仍需真实预览。

## 验证

`node --test tests/quantitative-chart.test.mjs` 覆盖 log10 定位、数值中间态、共同零线、折线局部推进、条件/代码对应、数据缺失、源绝对时间/SHA/投影、剪切和变速、完整正文与晚入多页实际可见页、横竖布局、安全区和 ready 清理。测试字体与 speaker 为明确合成替身，不宣称实际浏览器或内容验收。

机制参考为近期公开视频中已动态复核的对数横条与代码图表对应；本实现曲线/排版/厚度为原创估计，不声称源帧精确复刻，也不覆盖全部图表与代码多窗联动。

当前真实UI保存记录仅覆盖 emphasis、cumulative、ROI 三类，共8场；三个定量图表变体的真实参数编辑、字体/人物、完整循环及凭证应用/撤销仍待各自验收，整片也未因此通过验收。
