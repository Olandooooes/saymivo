# Saymivo 交接文档（给接手的 AI agent）

> 更新：2026-11-03 18:10（Asia/Shanghai）。仓库：https://github.com/Olandooooes/saymivo
> 用户：冰纪（GitHub `Olandooooes`），中文沟通。拿到本仓库地址的 agent 请先读完本文件，再从「下一步」继续。

## 1. 目标

把 saymivo 做成 **通用的中文口播自动剪辑工作台**：以后任何一条口播导入后，自动精剪 + 自动起草逐句分镜动效，用户只需几分钟审阅即可导出。
**一切改动必须通用**，测试素材只是验收标尺，禁止写针对某一份讲稿的规则/文案。

完整方案（P0/P1/P2、schema、组件表、验收标准）：[`docs/handoff/ROADMAP-改进方案.md`](docs/handoff/ROADMAP-改进方案.md)。

## 2. 分支现状（重要）

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 旧版本 | 落后，**不要从 main 开工** |
| `local-wip-20261103` | 用户 Mac 本地工作区全部文件（380144f）+ 已合并的 P0（合并提交 `09c6861`） | **当前主线** |
| `cursor/p1-plan-components-7f55` | P1，[PR #3](https://github.com/Olandooooes/saymivo/pull/3)，base = local-wip，最新 `2437829`（文档提交 `f4d9975`） | 开放，**未合并、未经原片复验** |
| `cursor/local-llm-plan-draft-2240` | 在 P1 之上加本机模型默认 | 见下方「下一步」；PR base = P1 分支 |
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

最后一次原片验收（针对 1425f19）未通过：[`docs/handoff/acceptance/P1-v2-未通过.md`](docs/handoff/acceptance/P1-v2-未通过.md)。其 C1–C9 已在 `2437829` 修复，但 **尚未复验**。本环境没有测试原片，不能代跑那四步交付命令。

本机模型默认已实现（`src/plan-llm.mjs`、`server/plan-draft-routes.mjs`、`editor/PlanReview.tsx`、`scripts/setup-local-llm.sh`、`docs/setup.md`）：
- 有 `OPENAI_API_KEY` 用 OpenAI；否则探测 Ollama `http://127.0.0.1:11434/v1`。都没有则隐藏按钮，回退规则底稿，并提示运行安装脚本。`PLAN_LLM_PROVIDER=ollama|openai` 可强制。
- 本机默认模型 `qwen2.5:7b`（`PLAN_LLM_MODEL` 可覆盖）。OpenAI 未指定模型时仍是 `gpt-4o-mini`。请求带 JSON 输出和温度 0.2。长稿按句分批，每批超时 120s；失败重试一次，仍失败只让该批回到规则底稿。
- 编辑器按钮显示模型名，起草时按批显示进度。安装步骤写在 `docs/setup.md`。
- 还没用真实 `qwen2.5:7b` 跑测试素材（这台环境没有 Ollama，也没有原片）。
- 本轮 `npm run check`：1229 项，1223 通过，0 失败，6 跳过。这不能代替原片验收。

### P2 默认审阅优先流程 — ⬜ 未开始（见路线图第 7 节）

## 4. 下一步（按顺序）

1. **原片复验仍被卡住**：需要用户把测试素材放到可访问的位置（Mac 上 `public/clips/ai-agent-20261021-voice.mp4`，sha256 `0993291b174ac22da82fe44676c322eaa1a003d9e39c68a7b4a16b6bb7cbebd0`）。不要提交进仓库。拿到后按交付命令原样跑，核对 `P1-v2-未通过.md` 的表格和 C1–C9，并加上本机模型起草：
   ```bash
   bash scripts/setup-local-llm.sh
   python3 scripts/face-detect.py 原片.mp4 face.json
   node scripts/render-fine-cut.mjs render 原片.mp4 cutlist.json public/clips/fine.mp4 --enhance
   node scripts/plan-draft.mjs words.json cutlist.json plan.json face.json
   node scripts/plan-draft.mjs --llm words.json cutlist.json plan-llm.json face.json
   node scripts/render-plan.mjs plan.json public/clips/fine.mp4 out.mp4
   npm run check
   ```
2. 用本地模型稿和样片比：章节标题是否在概括、关键短语 punch、要点页是否自动出现、景别节奏。这一步之前不要合并。
3. P1 原片验收通过 → 合并 PR #3 与本机模型改动到 `local-wip-20261103`。
4. **用第二条不同主题的口播验收通用性**（向用户要素材）。
5. P2。
6. 最终把 `local-wip-20261103` 整理合入 `main`（先和用户确认）。

## 5. 测试素材与质量标尺（不在仓库里）

- 测试素材：用户 Mac 上 `public/clips/ai-agent-20261021-voice.mp4`（127.9s，1280×720，~30fps，sha256 `0993291b174ac22da82fe44676c322eaa1a003d9e39c68a7b4a16b6bb7cbebd0`）。私人素材，**不要提交到仓库**。需要时向用户索取。
- 质量标尺：用户非常满意的第一版样片（88s，PANGMEN.AI 风格：黄字黑边大字、章节卡、要点/对比页、圆形 PiP、橙色进度条）。参考源码：[`docs/handoff/sample-remotion-reference/`](docs/handoff/sample-remotion-reference/)；风格拆解：[`docs/handoff/风格参考-PANGMEN模板拆解.md`](docs/handoff/风格参考-PANGMEN模板拆解.md)。

## 6. 工作约定

- 每轮改动：合成回归测试 + `npm run check` 全绿 + **在真实素材上验收**（只有单测通过不算完成，过去多次是原片验收抓出的问题）。
- 不提交私人媒体、转写、密钥、模型文件。
- 不写针对某一份讲稿的规则或文案；LLM 只能填 schema，输出必须过 `validatePlan`，大字/条目文字必须来自保留下来的原话。
- 用户偏好：中文沟通；默认人物不全屏；不用付费 API；目标是省剪辑时间而不是一次性成片。
