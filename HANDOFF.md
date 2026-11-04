# Saymivo 交接文档（给接手的 AI agent）

> 更新：2026-11-04（Asia/Shanghai）。仓库：https://github.com/Olandooooes/saymivo
> 用户：冰纪（GitHub `Olandooooes`），中文沟通。拿到本仓库地址的 agent 请先读完本文件，再从「下一步」继续。

## 0. 最高优先级（先读）

用户在工作台外手剪了同一条口播，并认可那一版的剪辑和动效。必须留下的标准：

- G1：没有重复半句，没有「嗯/呃」，不切在词中间；每个接点都是交叉淡化；停顿自然。
- G2：画面元素在对应词出口前 0.03–0.10 秒出现；任何一屏静止不超过 3 秒。
- B1：默认拉远 0.80×（0.75–0.85），脸在 0.30W 或 0.70W，文字在另一侧；推近最多 1.10×、每次不超过 2.5 秒，推近总长不超过 15%，默认景不少于 60%；文字多的段落用小窗；景别变化是 0.7 秒平滑变焦。
- B2：16:9 满版，没有壁纸、窗口、圆角外框。
- B3：不抠像，保留原背景。拉远露出的边用原画面镜像加轻模糊填充。

手剪里被否决、不能再出现的三件事：人物太大、外圈壁纸边框、抠掉人物背景。完整阈值、14 个动效模板和流程在 [`docs/handoff/手剪经验与风格规范.md`](docs/handoff/手剪经验与风格规范.md)。

v3 的原话仍作历史记录，不要删：

> (1) 口播剪得太多，很多语气词没了；词尾被吃掉，比如「agent」最后的 t 音被剪；句子硬接、声音拼凑，非常不连贯。(2) 动效和他用 Screen Studio 录的参考视频差距非常大。

v4（壁纸加圆角窗口、气口放宽到 106.1 秒）之后用户认为效果很差。v5（一张圆角卡片、在 JS 里另写语气词规则）没渲完，也没提交，这一轮已经放弃，不要捡回来。

这一轮（P1-v6）把规范里的 Python 粗剪和渲染接进了 PR #4。产物在工作台外的 `p1-v6/`：`cut_list.md`、`cut_audio.wav`（91.37 秒）、`样片_P1_v6_前20秒.mp4`，以及拉远偏侧、推近、小窗三帧。数字在 [`docs/handoff/acceptance/P1-v6-手剪规则与前20秒.md`](docs/handoff/acceptance/P1-v6-手剪规则与前20秒.md)。用户还没看这 20 秒。不要渲全片，不要合并 PR #3 或 PR #4。

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
| `cursor/local-llm-plan-draft-2240` | 在 P1 之上接入手剪规范的粗剪和画面，[PR #4](https://github.com/Olandooooes/saymivo/pull/4)，base = P1 分支 | 开放，**未合并**。v6 只出了前 20 秒，等用户看。模型稿仍未完成 |
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
- v4 之后用户认为效果很差。壁纸、窗口和「气口尽量留着」不再是成片规格。报告留着，不要按它继续改。

P1-v6（进行中，同一 PR）：粗剪和画面改走 `tools/koubo-port/` 里的 Python，工作台用 `scripts/rough-cut.mjs` 当子进程调用。规则在 `config/cut_rules.json` 和 `config/style.json`，说明在 [`docs/handoff/手剪经验与风格规范.md`](docs/handoff/手剪经验与风格规范.md)。

- 粗剪：Paraformer 逐字时间、能量 VAD、语气词、起句失败、重说只留最后一遍、停顿分档、词尾余量、30 ms 等功率交叉淡化、−16 LUFS / 真峰值 ≤ −1 dBTP。编辑器里这些删除仍是建议，不接受不进时间线。试听用的 `cut_audio.wav` 是粗剪已经做完的结果。
- 这条原片：5 处删除（起句失败 ×2、语气词 ×1、重说 ×2），停顿压缩 18 处，成片 91.37 秒。规范记载的自动粗剪是 5 处、17 处停顿、91.7 秒，手剪成片 90.4 秒。差 0.33 秒是多压了一处停顿。句中卡顿压到 0.30 秒仍要用户在剪辑表里用 `gap_targets` 指定，不要把这一条的时间写进代码。
- 能量区向后保持 40 ms（`hangover_ms`）。不保持时，同一套 −34 dB 阈值在这套解码上得到 50 个语音区、4 处删除、89.37 秒：一处约 0.10 秒的无文字发声被 0.12 秒下限丢掉。这是通用尾音保持，不是按这一句加的。
- 画面样片走 Python 渲染器，不走 Remotion。16:9 满版，不抠像，默认 0.80× 偏一侧，推近 1.08×（上限 1.10）且这一次 2.2 秒，文字多时用圆形小窗。只渲了前 20 秒。整段草稿里拉远约 86%，推近约 2.4%，小窗约 8%。
- `src/plan-kit/PlanVideo.tsx` 仍是 v4 的壁纸加窗口。有人跑 `render-plan.mjs` 会得到已被否决的画面。成片画面以 `tools/koubo-port/render/` 为准，在用户点头之前不要改 Remotion，也不要渲全片。
- 报告：[`docs/handoff/acceptance/P1-v6-手剪规则与前20秒.md`](docs/handoff/acceptance/P1-v6-手剪规则与前20秒.md)。

本机模型默认已实现（`src/plan-llm.mjs`、`server/plan-draft-routes.mjs`、`editor/PlanReview.tsx`、`scripts/setup-local-llm.sh`、`docs/setup.md`）：
- 有 `OPENAI_API_KEY` 用 OpenAI；否则探测 Ollama `http://127.0.0.1:11434/v1`。都没有则隐藏按钮，回退规则底稿，并提示运行安装脚本。`PLAN_LLM_PROVIDER=ollama|openai` 可强制。
- 本机默认模型 `qwen2.5:7b`（`PLAN_LLM_MODEL` 可覆盖）。OpenAI 未指定模型时仍是 `gpt-4o-mini`。请求带 JSON 输出和温度 0.2。长稿按句分批，每批超时 120s；失败重试一次，仍失败只让该批回到规则底稿。
- 编辑器按钮显示模型名，起草时按批显示进度。安装步骤写在 `docs/setup.md`。
- 这台环境已经拉起 Ollama 和 `qwen2.5:7b`。本轮按用户要求停止分批调试，没有一份可对照样片的完整模型稿。不要把中断的输出当成验收。
- 本机模型改动那次 `npm run check`：1229 项，1223 通过，0 失败，6 跳过。听感改动之后再跑一次：1231 项，1226 通过，0 失败，5 跳过。v6 再跑一次：1233 项，1228 通过，0 失败，5 跳过，vite build 成功。这不能代替用户听成片。

### P2 默认审阅优先流程 — ⬜ 未开始（见路线图第 7 节）

## 4. 下一步（按顺序）

1. **等用户看 P1-v6 的剪辑表、粗剪音频、前 20 秒和三帧。** 用户点头之前不要渲全片，不要合并 PR #3、PR #4，也不要再改景别阈值。
2. 用户若指出某一处句中卡顿，写进 `overrides.json` 的 `gap_targets`（建议 0.30 秒）后重跑 03。不要把这条原片的时间写进规则。
3. 画面方向被接受之后，再用 `tools/koubo-port/render/render.py` 渲全片。不要用 Remotion 的壁纸窗口交差。
4. 本机模型稿与样片的对照仍未做完。等这版听感和画面被接受后再做，不要提前分批重跑。
5. **用第二条不同主题的口播验收通用性**（向用户要素材）。
6. P2。
7. 最终把 `local-wip-20261103` 整理合入 `main`（先和用户确认）。

## 5. 测试素材与质量标尺（不在仓库里）

- 测试素材：用户 Mac 上 `public/clips/ai-agent-20261021-voice.mp4`（127.9s，1280×720，~30fps，sha256 `0993291b174ac22da82fe44676c322eaa1a003d9e39c68a7b4a16b6bb7cbebd0`）。私人素材，**不要提交到仓库**。需要时向用户索取。
- 剪辑和画面的标尺是手剪规范：[`docs/handoff/手剪经验与风格规范.md`](docs/handoff/手剪经验与风格规范.md)。同一条原片上，规范记载自动粗剪为 5 处删除、边界误差不超过 0.12 秒、约 91.7 秒；手剪成片 90.4 秒。仓库里没有手剪时间点，不能在代码里把某一秒写死。
- Screen Studio 参考片（sha256 `9d4b31772075bd91900cb1b0bad2c398bdd5e819ba04699095e2c3a39b0ff5e6`，630.6s，不入库）只作早先的抽帧记录：[`docs/handoff/风格参考-ScreenStudio画面核对.md`](docs/handoff/风格参考-ScreenStudio画面核对.md)。不要再把它的壁纸外框当成成片。较早拆解仍在 [`docs/handoff/风格参考-PANGMEN模板拆解.md`](docs/handoff/风格参考-PANGMEN模板拆解.md)。
- 本机跑这套粗剪需要 `tools/koubo-port/.venv`（torch CPU、funasr、opencv-python-headless 4.10、kaldi-native-fbank）和 `tools/koubo-port/fonts/` 里的 Noto Sans SC / Noto Serif SC。虚拟环境和字体都不入库。Paraformer 权重在本机 modelscope 缓存里，也不入库。OpenCV 5 的 CascadeClassifier 会崩，人脸用 4.10。

## 6. 工作约定

- 每轮改动：合成回归测试 + `npm run check` 全绿 + **在真实素材上验收**（只有单测通过不算完成，过去多次是原片验收抓出的问题）。
- 不提交私人媒体、转写、密钥、模型文件。
- 不写针对某一份讲稿的规则或文案；LLM 只能填 schema，输出必须过 `validatePlan`，大字/条目文字必须来自保留下来的原话。
- 用户偏好：中文沟通；默认人物不全屏；不用付费 API；目标是省剪辑时间而不是一次性成片。
