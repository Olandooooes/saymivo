# 样片 Remotion 参考实现（视觉质量标尺）

这是用户认可的第一版样片（88 秒，PANGMEN.AI 风格）所用的独立 Remotion 组件源码，仅作 **视觉参数参考**：
1.36x punch-in + 暗角、黄字黑边 PunchText（~130ms 弹簧）、章节卡、要点/对比全屏页、圆形 PiP、橙色分段进度条、灰底短语字幕、片尾 CTA，字体 Noto Sans SC。

- 原 `plan.json` 含用户私人讲稿转写，**未入库**；`Root.tsx` 里 `import plan from './plan.json'` 因此无法直接运行。
- 正式实现已移植到 saymivo 的 `src/plan-kit/`（见 PR #3）。注意用户要求默认 **人物不全屏**（见 HANDOFF.md），这里的全屏 1.36x 推进不再是默认。
