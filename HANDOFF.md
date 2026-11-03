# Saymivo 交接文档（给接手的 AI agent）

> 更新：2026-11-03 20:15（Asia/Shanghai）。仓库：https://github.com/Olandooooes/saymivo
> 用户：冰纪（GitHub `Olandooooes`），中文沟通。拿到本仓库地址的 agent 请先读完本文件，再从「下一步」继续。

## 0. 最高优先级（先读）

用户看了 `样片_P1_v3.mp4`（89.3s，未入库），反馈效果很差。原话：

> (1) 口播剪得太多，很多语气词没了；词尾被吃掉，比如「agent」最后的 t 音被剪；句子硬接、声音拼凑，非常不连贯。(2) 动效和他用 Screen Studio 录的参考视频差距非常大。

这句话用户还没有改口。PR #4 上已经按它做了一版：`样片_P1_v4.mp4`（106.1s，未入库）。听感数字和对照帧在 [`docs/handoff/acceptance/P1-v4-听感放宽与画面核对.md`](docs/handoff/acceptance/P1-v4-听感放宽与画面核对.md)。画面以 [`docs/handoff/风格参考-ScreenStudio画面核对.md`](docs/handoff/风格参考-ScreenStudio画面核对.md) 为准，参考片的紧剪法不要学。v3 的 C1–C9 记录仍在 [`docs/handoff/acceptance/P1-v3-听感与风格未通过.md`](docs/handoff/acceptance/P1-v3-听感与风格未通过.md)。不要合并任何 PR，等用户看 v4。

## 1. 目标

把 saymivo 做成 **通用的中文口播自动剪辑工作台**：以后任何一条口播导入后，自动精剪 + 自动起草逐句分镜动效，用户只需几分钟审阅即可导出。
**一切改动必须通用**，测试素材只是验收标尺，禁止写针对某一份讲稿的规则/文案。

完整方案（P0/P1/P2、schema、组件表、验收标准）：[`docs/handoff/ROADMAP-改进方案.md`](docs/handoff/ROADMAP-改进方案.md)。

## 2. 分支现状（重要）

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 旧版本 | 落后，**不要从 main 开工** |
| `local-wip-20261103` | 用户 Mac 本地工作区全部文件（380144f）+ 已合并的 P0（合并提交 `09c6861`） | **当前主线** |
| `cursor/p1-plan-components-7f55` | P1，[PR #3](https://github.com/Olandooooes/saymivo/pull/3)，base = local-wip，代码 `2437829`（文档 `f4d9975`） | 开放，**未合并**。原片上 C1–C9 已复验，用户否定听感和动效 |
| `cursor/local-llm-plan-draft-2240` | 在 P1 之上加本机模型默认，并改了听感和画面，[PR #4](https://github.com/Olandooooes/saymivo/pull/4)，base = P1 分支 | 开放，**未合并**。v4 样片等用户看。模型稿仍未完成 |
| `cursor/sync-local-koubo-667c` | PR #1，另一个 agent 的同步，与 local-wip 分叉 | 不要动 |

用户 Mac 上的本地仓库：`/Users/lht/Borumi Projects/koubo-studio`，当前检出 `local-wip-20261103`。Mac 没有命令行 git 凭据，推送需通过云端 agent 或其它有 GitHub 权限的环境。用户已授权直接推送本项目到 GitHub。

## 3. 阶段进度

### P0 剪口听感 — ✅ 完成并合并（PR #2）
`src/fine-cut.mjs`、`scripts/render-fine-cut.mjs`、`scripts/normalize-voice.mjs`、`editor/FineCutReview.tsx`。
- 气口收到 ~0.18s（这是已经合并进主线的 P0。PR #4 上的听感改动把阈值放宽了，数字见下面 P1，不要把 0.18s 当成那个分支现在的行为）。重说 / 起句失败为候选，起句失败默认「待复核」，不接受不进成片。
- FFmpeg 整帧裁切（按源片 avg_frame_rate），音画同步 ≤1 帧，同步检查用解码样本数。
- 响度 −16 LUFS，TP ≤ −1.5 dBTP。
- 原片验收报告：[`docs/handoff/acceptance/P0-v7-通过.md`](docs/handoff/acceptance/P0-v7-通过.md)（128s → 86.4s）。

### P1 逐句分镜 + 组件库 — 🟡 进行中（PR #3）
已实现：`plan.json` schema（源时间，投影到剪后时间轴，带 words/cuts/face/clip）、`src/plan-kit/` 组件、`scripts/plan-draft.mjs`（规则底稿 + `--llm`）、`scripts/render-plan.mjs`、`scripts/face-detect.py`、编辑器「分镜审阅」`editor/PlanReview.tsx`、提示词 `prompts/plan-draft.txt`、Noto Sans SC 字体。
用户要求（已实现为 `style.talentFraming`，默认 `framed`）：**人物不全屏**——MacBook 摄像头画质偏软。中景为 ~66% 圆角窗口；人靠右 ~42%；推进在窗口内且源像素有效缩放 ≤1.1；全屏页只用圆形 PiP；`render-fine-cut --enhance` 轻度降噪锐化。

v2（1425f19）未通过：[`docs/handoff/acceptance/P1-v2-未通过.md`](docs/handoff/acceptance/P1-v2-未通过.md)。`2437829` 已在原片上复验 C1–C9，报告：[`docs/handoff/acceptance/P1-v3-听感与风格未通过.md`](docs/handoff/acceptance/P1-v3-听感与风格未通过.md)。C1–C9 的检查项大多通过，**用户否定成片**，P1 不能合并。

PR #4 在这之上改了听感和画面，报告：[`docs/handoff/acceptance/P1-v4-听感放宽与画面核对.md`](docs/handoff/acceptance/P1-v4-听感放宽与画面核对.md)。

- 句中气口长于约 1.05 秒收到约 0.55 秒；句末标点后长于约 0.85 秒收到约 0.42 秒。更短的留下。词尾按能量延长，转写空洞里仍响的部分留下。缺口够长时用 32ms 等功率交叉淡化。
- 测试成片只接受了 9 条气口（去掉 21.8s），重说和起句失败留在候选里。成片 106.1s。响度 −16.11 LUFS，真峰值 −1.85 dBTP，音画在 1 帧内。
- 画面改成深蓝紫壁纸、黄字黑边、无底白字幕、橙色进度条加白刻度。章节胶囊只在标题非空时画。默认仍是不全屏圆角窗口（`windowScale: 0.66`）。规则稿没有幻灯片，圆形人像在这版成片里没有出现。
- 用户还没看这版。看过之前不要合并。

本机模型默认已实现（`src/plan-llm.mjs`、`server/plan-draft-routes.mjs`、`editor/PlanReview.tsx`、`scripts/setup-local-llm.sh`、`docs/setup.md`）：
- 有 `OPENAI_API_KEY` 用 OpenAI；否则探测 Ollama `http://127.0.0.1:11434/v1`。都没有则隐藏按钮，回退规则底稿，并提示运行安装脚本。`PLAN_LLM_PROVIDER=ollama|openai` 可强制。
- 本机默认模型 `qwen2.5:7b`（`PLAN_LLM_MODEL` 可覆盖）。OpenAI 未指定模型时仍是 `gpt-4o-mini`。请求带 JSON 输出和温度 0.2。长稿按句分批，每批超时 120s；失败重试一次，仍失败只让该批回到规则底稿。
- 编辑器按钮显示模型名，起草时按批显示进度。安装步骤写在 `docs/setup.md`。
- 这台环境已经拉起 Ollama 和 `qwen2.5:7b`。本轮按用户要求停止分批调试，没有一份可对照样片的完整模型稿。不要把中断的输出当成验收。
- 本机模型改动那次 `npm run check`：1229 项，1223 通过，0 失败，6 跳过。听感改动之后再跑一次：1231 项，1226 通过，0 失败，5 跳过，vite build 成功。这不能代替用户听成片。

### P2 默认审阅优先流程 — ⬜ 未开始（见路线图第 7 节）

## 4. 下一步（按顺序）

1. **等用户看 `样片_P1_v4.mp4`。** 听感和画面的改动已经在 PR #4 上，数字在 v4 报告。用户点头之前不要再改阈值，也不要合并 PR #3、PR #4。
2. 用户若仍觉得词尾紧或接点假，先听 `joins/` 里那 7 段，再改通用规则。最短的词尾余量在 v4 报告里是 220ms（pause-4）。
3. 本机模型稿与样片的对照仍未做完。等听感被接受后再做，不要提前分批重跑。
4. **用第二条不同主题的口播验收通用性**（向用户要素材）。
5. P2。
6. 最终把 `local-wip-20261103` 整理合入 `main`（先和用户确认）。

## 5. 测试素材与质量标尺（不在仓库里）

- 测试素材：用户 Mac 上 `public/clips/ai-agent-20261021-voice.mp4`（127.9s，1280×720，~30fps，sha256 `0993291b174ac22da82fe44676c322eaa1a003d9e39c68a7b4a16b6bb7cbebd0`）。私人素材，**不要提交到仓库**。需要时向用户索取。
- 画面标尺：用户用 Screen Studio 录的参考片（sha256 `9d4b31772075bd91900cb1b0bad2c398bdd5e819ba04699095e2c3a39b0ff5e6`，630.6s，不入库）。核对结果：[`docs/handoff/风格参考-ScreenStudio画面核对.md`](docs/handoff/风格参考-ScreenStudio画面核对.md)。同一文件的较早拆解仍在 [`docs/handoff/风格参考-PANGMEN模板拆解.md`](docs/handoff/风格参考-PANGMEN模板拆解.md)，源码在 [`docs/handoff/sample-remotion-reference/`](docs/handoff/sample-remotion-reference/)。听感以用户对 v3 的原话为准，不要把参考片的紧剪法学过来。默认人物不全屏。

## 6. 工作约定

- 每轮改动：合成回归测试 + `npm run check` 全绿 + **在真实素材上验收**（只有单测通过不算完成，过去多次是原片验收抓出的问题）。
- 不提交私人媒体、转写、密钥、模型文件。
- 不写针对某一份讲稿的规则或文案；LLM 只能填 schema，输出必须过 `validatePlan`，大字/条目文字必须来自保留下来的原话。
- 用户偏好：中文沟通；默认人物不全屏；不用付费 API；目标是省剪辑时间而不是一次性成片。
