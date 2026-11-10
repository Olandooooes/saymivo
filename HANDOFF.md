# Saymivo 交接文档（给接手的 AI agent）

> 更新：2026-11-10（Asia/Shanghai）。仓库：https://github.com/Olandooooes/saymivo
> 用户：冰纪（GitHub `Olandooooes`），中文沟通。拿到本仓库地址的 agent 请先读完本文件，再从「下一步」继续。

## 1. 目标

把 saymivo 做成 **通用的中文口播自动剪辑工作台**：以后任何一条口播导入后，自动精剪 + 自动起草逐句分镜动效，用户只需几分钟审阅即可导出。
**一切改动必须通用**，测试素材只是验收标尺，禁止写针对某一份讲稿的规则/文案。

完整方案（P0/P1/P2、schema、组件表、验收标准）：[`docs/handoff/ROADMAP-改进方案.md`](docs/handoff/ROADMAP-改进方案.md)。

## 1.1 口播白板工作流（2026-11-10 用户确认）

用户确认的通用流程，不针对某一条讲稿：

**稿子 → 分镜 → 备素材 → 精剪 → 动效对齐 → 预览 → 导出**

参照已认可的白板样片气质：米白画布、左下角圆形人物小窗、大字回弹、重点词标红或荧光笔、印章贴纸、模拟界面打字、章节大编号转场。样片口播原文和私人素材不进仓库。

| 期 | 内容 | 状态 |
|---|---|---|
| 第一期 | 分镜表 + 素材库页面。转写或贴稿之后按句子拆镜头：原文、段落类型（开场/痛点/方案/结尾）、重点词（标红/荧光笔）、配图（素材库 id，空即缺素材）、动效（可多选）、备注。用本地关键词规则自动匹配，不调用付费 API。分镜写入项目旁的 `<id>.storyboard.json`，并预留字范围 `charRange`、词范围 `wordRange`、时间范围 `timeRange`（草稿里时间仍是 null）。素材从可配置的本机目录读取（默认 `~/saymivo-assets` 内的 `library.json`），不进仓库。 | **已在分支 `cursor/storyboard-library-a23b` 实现，待合并进 local-wip** |
| 第二期 | 动效时间线，按字时间自动对齐。用已留下的字/词范围，填上 `timeRange`。本期不做。 | 未开始 |
| 第三期 | 在工作台里生成插画和界面素材。本期不做。 | 未开始 |

第一期不替换已有转写、精剪、画面分镜（`presentation.scenes`）和导出。新的「分镜表」是稿子层面的镜头计划，和剪辑器里已有的画面分镜并存。

## 2. 分支现状（重要）

| 分支 | 内容 | 状态 |
|---|---|---|
| `main` | 旧版本 | 落后，**不要从 main 开工** |
| `local-wip-20261103` | 用户 Mac 本地工作区全部文件（380144f）+ 已合并的 P0（合并提交 `09c6861`） | **当前主线** |
| `cursor/p1-plan-components-7f55` | P1，[PR #3](https://github.com/Olandooooes/saymivo/pull/3)，base = local-wip，最新 `2437829` | 开放，**未合并、最新提交未经原片验收** |
| `cursor/storyboard-library-a23b` | 白板第一期：分镜表 + 素材库。base = local-wip | 待合并。不包含 P1 的 `validatePlan` |
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

最后一次原片验收（针对 1425f19）未通过：[`docs/handoff/acceptance/P1-v2-未通过.md`](docs/handoff/acceptance/P1-v2-未通过.md)。其 C1–C9 已在 `2437829` 修复，但 **尚未复验**。

### P2 默认审阅优先流程 — ⬜ 未开始（见路线图第 7 节）

## 4. 下一步（按顺序）

**当前优先：** 白板第一期已经做在 `cursor/storyboard-library-a23b` 上（见 1.1），等合并进 `local-wip-20261103`。不要从 `main` 开工。

Mac 上接现有素材目录：

1. 目录里要有 `library.json`，字段沿用现在的索引（`id`、文件路径、缩略图、类别、中文标题、关键词、适合用法、来源、生成提示词、`deprecated` 等）。停用项默认不显示，也不会被自动配上。
2. 把这个目录放在 `~/saymivo-assets`，工作台不用再改路径。
3. 目录在别处时，打开首页「服务配置」，把路径填进「白板素材目录」（可以写 `~/...`），保存后回到素材库页即可。配置写在仓库根目录的 `.saymivo.json`（已 gitignore）。
4. 若启动进程里设置了 `SAYMIVO_ASSETS_DIR`，它优先于上面两项。要改用配置文件或默认目录，先去掉这个环境变量再重启。

素材页在首页侧栏「白板素材」。分镜表在项目里，转写完成或贴上稿子之后点「分镜表」：按稿子生成，或从当前转写生成。配图留空的镜头会汇总成「缺素材」。

**产品上的下一步是第二期：** 动效时间线按字时间对齐。分镜已经留下 `charRange` 和 `wordRange`，`timeRange` 仍是 null。第二期用转写词的起止时间填上，再驱动大字回弹、标红、荧光笔、印章、打字界面、章节转场。仍不调用付费 API。第三期（在工作台里生成插画和界面）还没开始。

下面 1–7 仍是此前 P1 收尾，没有取消。本分支没有 `validatePlan`（它在未合并的 PR #3）。

1. **复验 PR #3 `2437829`**：在测试素材上按交付命令原样跑（不许绕过），逐项核对 `P1-v2-未通过.md` 表格与 C1–C9：
   ```bash
   python3 scripts/face-detect.py 原片.mp4 face.json
   node scripts/render-fine-cut.mjs render 原片.mp4 cutlist.json public/clips/fine.mp4 --enhance
   node scripts/plan-draft.mjs words.json cutlist.json plan.json face.json
   node scripts/render-plan.mjs plan.json public/clips/fine.mp4 out.mp4
   npm run check
   ```
2. **本地模型默认（用户无付费 API 预算）**——上次运行被中止，尚未实现：
   - provider 自动探测：有 `OPENAI_API_KEY` 用之；否则探测 Ollama `http://127.0.0.1:11434/v1`；都没有则隐藏按钮、回退规则底稿并提示安装。支持 `PLAN_LLM_PROVIDER=ollama|openai`。
   - 默认模型 `qwen2.5:7b`（`PLAN_LLM_MODEL` 可覆盖）；结构化 JSON 输出、低温度、长稿分批（每批超时 ~120s）、失败批次重试一次后仅该批回退规则底稿；编辑器显示模型和进度。
   - `scripts/setup-local-llm.sh`：检查/提示安装 Ollama、启动服务、`ollama pull qwen2.5:7b`；中文文档写清三步。
   - mock 测试：Ollama 可用/不可用、分批合并、批次回退。
3. 用本地模型在测试素材上起草，和样片质量比较（章节标题概括、关键短语 punch、要点页自动识别、景别节奏）。
4. P1 原片验收通过 → 合并 PR #3 到 `local-wip-20261103`。
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
