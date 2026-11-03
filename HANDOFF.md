# Saymivo 交接文档（给接手的 AI agent）

> 更新：2026-11-03 19:30（Asia/Shanghai）。仓库：https://github.com/Olandooooes/saymivo
> 用户：冰纪（GitHub `Olandooooes`），中文沟通。拿到本仓库地址的 agent 请先读完本文件，再从「下一步」继续。

## 0. 最高优先级（先读）

用户看了 `样片_P1_v3.mp4`（89.3s，未入库），反馈效果很差。原话：

> (1) 口播剪得太多，很多语气词没了；词尾被吃掉，比如「agent」最后的 t 音被剪；句子硬接、声音拼凑，非常不连贯。(2) 动效和他用 Screen Studio 录的参考视频差距非常大。

下一轮只做这两件事：剪辑听感、动效风格。不要合并任何 PR。细节和数字在 [`docs/handoff/acceptance/P1-v3-听感与风格未通过.md`](docs/handoff/acceptance/P1-v3-听感与风格未通过.md)。C1–C9 的画面/流水线检查不能抵消这条反馈。

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
| `cursor/local-llm-plan-draft-2240` | 在 P1 之上加本机模型默认，[PR #4](https://github.com/Olandooooes/saymivo/pull/4)，base = P1 分支 | 开放，**未合并**。本轮模型稿未完成，不要当作验收 |
| `cursor/sync-local-koubo-667c` | PR #1，另一个 agent 的同步，与 local-wip 分叉 | 不要动 |

用户 Mac 上的本地仓库：`/Users/lht/Borumi Projects/koubo-studio`，当前检出 `local-wip-20261103`。Mac 没有命令行 git 凭据，推送需通过云端 agent 或其它有 GitHub 权限的环境。用户已授权直接推送本项目到 GitHub。

## 3. 阶段进度

### P0 剪口听感 — ✅ 完成并合并（PR #2）
`src/fine-cut.mjs`、`scripts/render-fine-cut.mjs`、`scripts/normalize-voice.mjs`、`editor/FineCutReview.tsx`。
- 气口收到 ~0.18s；重说 / 起句失败为候选，起句失败默认「待复核」，不接受不进成片。
- FFmpeg 整帧裁切（按源片 avg_frame_rate），音画同步 ≤1 帧，同步检查用解码样本数。
- 响度 −16 LUFS，TP ≤ −1.5 dBTP。
- 原片验收报告：[`docs/handoff/acceptance/P0-v7-通过.md`](docs/handoff/acceptance/P0-v7-通过.md)（128s → 86.4s）。

### P1 逐句分镜 + 组件库 — 🟡 进行中（PR #3）
已实现：`plan.json` schema（源时间，投影到剪后时间轴，带 words/cuts/face/clip）、`src/plan-kit/` 组件、`scripts/plan-draft.mjs`（规则底稿 + `--llm`）、`scripts/render-plan.mjs`、`scripts/face-detect.py`、编辑器「分镜审阅」`editor/PlanReview.tsx`、提示词 `prompts/plan-draft.txt`、Noto Sans SC 字体。
用户要求（已实现为 `style.talentFraming`，默认 `framed`）：**人物不全屏**——MacBook 摄像头画质偏软。中景为 ~66% 圆角窗口；人靠右 ~42%；推进在窗口内且源像素有效缩放 ≤1.1；全屏页只用圆形 PiP；`render-fine-cut --enhance` 轻度降噪锐化。

v2（1425f19）未通过：[`docs/handoff/acceptance/P1-v2-未通过.md`](docs/handoff/acceptance/P1-v2-未通过.md)。`2437829` 已在原片上复验 C1–C9，报告：[`docs/handoff/acceptance/P1-v3-听感与风格未通过.md`](docs/handoff/acceptance/P1-v3-听感与风格未通过.md)。C1–C9 的检查项大多通过，**用户否定成片**，P1 不能合并。

本机模型默认已实现（`src/plan-llm.mjs`、`server/plan-draft-routes.mjs`、`editor/PlanReview.tsx`、`scripts/setup-local-llm.sh`、`docs/setup.md`）：
- 有 `OPENAI_API_KEY` 用 OpenAI；否则探测 Ollama `http://127.0.0.1:11434/v1`。都没有则隐藏按钮，回退规则底稿，并提示运行安装脚本。`PLAN_LLM_PROVIDER=ollama|openai` 可强制。
- 本机默认模型 `qwen2.5:7b`（`PLAN_LLM_MODEL` 可覆盖）。OpenAI 未指定模型时仍是 `gpt-4o-mini`。请求带 JSON 输出和温度 0.2。长稿按句分批，每批超时 120s；失败重试一次，仍失败只让该批回到规则底稿。
- 编辑器按钮显示模型名，起草时按批显示进度。安装步骤写在 `docs/setup.md`。
- 这台环境已经拉起 Ollama 和 `qwen2.5:7b`。本轮按用户要求停止分批调试，没有一份可对照样片的完整模型稿。不要把中断的输出当成验收。
- 本机模型改动那次 `npm run check`：1229 项，1223 通过，0 失败，6 跳过。这不能代替原片验收，也不能代替听感。

### P2 默认审阅优先流程 — ⬜ 未开始（见路线图第 7 节）

## 4. 下一步（按顺序）

1. **剪辑听感（最高优先级）**。用户原话见文首。成片不是「36 条全部接受」：36 条候选里接受了 34 条、拒绝了 2 条，去掉约 38.6s，成片 89.3s。剪得多的主体是 32 条气口（约 34.9s，收到约 180ms）。词尾余量中位大约 130ms，每段还有 12ms 淡出后硬接。没有语气词这一类剪口；没被转写成词的语气词会掉进气口。校对记录没套用（wav 哈希不一致，而且 editorialCuts 不进这条流水线）。先读 v3 报告里的数字再改，改动必须通用。
2. **动效风格（最高优先级）**。向用户用 Screen Studio 录的那版参考靠拢。参考仍是 [`docs/handoff/sample-remotion-reference/`](docs/handoff/sample-remotion-reference/) 和 [`docs/handoff/风格参考-PANGMEN模板拆解.md`](docs/handoff/风格参考-PANGMEN模板拆解.md)。不要为这一条讲稿写死文案。
3. 听感和动效用户点头之前，**不要合并** PR #3、PR #4。
4. 本机模型稿与样片的对照本轮停下，未完成。听感修好后再做。
5. **用第二条不同主题的口播验收通用性**（向用户要素材）。
6. P2。
7. 最终把 `local-wip-20261103` 整理合入 `main`（先和用户确认）。

## 5. 测试素材与质量标尺（不在仓库里）

- 测试素材：用户 Mac 上 `public/clips/ai-agent-20261021-voice.mp4`（127.9s，1280×720，~30fps，sha256 `0993291b174ac22da82fe44676c322eaa1a003d9e39c68a7b4a16b6bb7cbebd0`）。私人素材，**不要提交到仓库**。需要时向用户索取。
- 质量标尺：用户非常满意的第一版样片（88s，PANGMEN.AI 风格：黄字黑边大字、章节卡、要点/对比页、圆形 PiP、橙色进度条）。参考源码：[`docs/handoff/sample-remotion-reference/`](docs/handoff/sample-remotion-reference/)；风格拆解：[`docs/handoff/风格参考-PANGMEN模板拆解.md`](docs/handoff/风格参考-PANGMEN模板拆解.md)。

## 6. 工作约定

- 每轮改动：合成回归测试 + `npm run check` 全绿 + **在真实素材上验收**（只有单测通过不算完成，过去多次是原片验收抓出的问题）。
- 不提交私人媒体、转写、密钥、模型文件。
- 不写针对某一份讲稿的规则或文案；LLM 只能填 schema，输出必须过 `validatePlan`，大字/条目文字必须来自保留下来的原话。
- 用户偏好：中文沟通；默认人物不全屏；不用付费 API；目标是省剪辑时间而不是一次性成片。
