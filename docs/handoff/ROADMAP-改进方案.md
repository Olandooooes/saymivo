# Saymivo 口播成片质量改进计划

只做规划，不改代码，不开 PR。诊断对象是当前仓库里真正会跑的代码（`main`，最新提交 `ad3394d`）。

## 0. 结论

成片差，不是 Remotion 或 React 版本的问题，而是默认流水线在做另一件事。

参考样片把一条 127.9 秒原片收成 88 秒，听感干净，画面是一小套互相配合的镜头：中景、人靠右加大字、1.36 倍推进加暗角、黄字弹出、章节条、灰字幕、圆气泡、词时间驱动的全屏页。Saymivo 的一键成片做的是：小模型转写、只剪足够长的静音、用正则决定「要不要盖一块板」，然后用 `veryfast` + JPEG 帧导出。口误和重说留在成片里，停顿要么留着要么被切成硬口，字和脸抢位置，动效又慢又轻，默认还不是样片那种黄字黑边。

要追上样片，不要再给现有 13 种版式加规则。先把「词 → 剪辑单 → 人审 → 逐句分镜 → 一小套组件」分成可停下来看的阶段。画面库等剪口听感过关再接。

本次核对范围：

- 仓库内读过 README、架构、路线图、2026-10-22 复盘、`src/`、`editor/`、`server/`、`scripts/`、`mcp/`。
- 你点名的 `AGENTS.md`、`PROJECT-WORKFLOW.md`、`STORYBOARD-75S.md`、`GOAL-PROGRESS.md`、`CURRENT-ACCEPTANCE.md` 不在这棵树上。复盘里提到的 `docs/retake-analysis.md`、`docs/experience/`、`src/text-fit.mjs`、`src/dynamic-motion-planner.mjs`、`src/motion-reference-catalog.mjs` 也不在。复盘写明那些是本机状态，不能当成主分支已经具备的能力。
- `uploads/ref_pipeline.tar.gz` 没有出现在工作区，参考侧按你给出的行为对照：`work/tr.py`、`work/cut.py`、`cutlist`、`plan.json`、`src/components/*.tsx`、Noto Sans SC、127.9s → 88s。没有对参考源码逐行引用。
- 本环境没有 `node_modules`、`.venv`、Whisper 权重，也没有你的原片，所以没有跑通识别和 Remotion 导出。用仓库里的 `pauseSegments` / `speechPauseGaps` 对合成时间轴做了对照，数字写在第 2.2 节。

## 1. 两条流水线实际差在哪

| 环节 | 你满意的样片 | Saymivo 一键成片 |
|---|---|---|
| 转写 | faster-whisper，中文，词时间戳 | 默认 `small` + CPU int8 + 2 线程；没有 medium 权重就走这条。见 `scripts/transcript-profile.mjs`、`scripts/transcribe-local.py` |
| 纠错 | 转写直接作为剪辑和分镜依据 | 内置词只有约 6 个专名；Gemini 可选且拒绝改写。见 `src/subtitle-terms.mjs`、`server/proofread.mjs` |
| 停顿 | 长于 0.4 秒的气口收到 0.1–0.25 秒，切在最静样本和帧边界上 | 先要 0.65 秒以上才检测，再整段挖掉，留下大约 0.24–0.4 秒硬切。见 `scripts/trim-silence.mjs`、`scripts/pause-plan.mjs` |
| 口误 / 重说 | 看转写删重说和起句失败 | 单条原片不会删。`arrange-clips.mjs` 只在「多段素材 + Gemini」时挑最好的一条，而且一键流程不调用它 |
| 声音 | 短淡化 + loudnorm −16 LUFS | 按峰值拉到大约 −3 dB，剪点没有淡化。`scripts/normalize-voice.mjs` 写了 −16 LUFS，一键流程不用它 |
| 分镜 | 逐句 `plan.json`：章节、景别、PunchText、卡片、气泡、CTA，高亮跟词走 | 正则分类 `none/emphasis/steps/compare/number/card`，再被 2.8 秒节流。见 `src/motion-rules.mjs`、`server/auto-plan.mjs`。横屏「录屏参考」另走一套写死口播例句的本地分镜 `src/auto-storyboard.mjs` |
| 画面 | 黄字、黑边、约 130ms 弹簧、1.36 倍推进加暗角、灰字幕 | 默认主题是科技靛蓝、描边被关掉；强调缩放是 1.035；入场 260–380ms 缓出。见 `editor/AutoEdit.tsx`、`src/emphasis-theme.mjs` |
| 导出 | 1080p，听感和字幕都过得去 | `imageFormat: jpeg`，`x264-preset=veryfast`，未写 CRF。见 `remotion.config.ts`、`server/auto-edit.mjs` |
| 人审 | 剪辑单和分镜都是独立文件，可以改完再渲染 | 首页默认「上传后自动剪辑并导出」，生成方式默认直接成片。见 `editor/Start.tsx`、`editor/AutoEdit.tsx` |

## 2. 现状问题诊断

### 2.1 转写和术语

识别入口在 `scripts/lib-transcribe.mjs`。只有存在 `.venv/bin/faster-whisper-ready` 才走 `scripts/transcribe-local.py`，否则走 WhisperX。faster-whisper 这条路径是：`device=cpu`、`compute_type=int8`、`cpu_threads=2`、`beam_size=5`、`vad_filter=True`、`condition_on_previous_text=False`、`word_timestamps=True`。模型选择在 `scripts/transcript-profile.mjs`：本机没有 `whisper-medium/model.bin` 就用 `small`。

这和样片的差距不在「有没有词时间」，而在词时间能不能当剪辑依据：

- `small` + int8 对中文专名、英文产品名、数字的错字会直接进入剪辑和标题。标题不是另写的，是从字幕里切出来的（`server/auto-plan.mjs` 里 `title: captionText(c).slice(0, 32)`，章节再切到 18 字，`src/presentation.mjs`）。
- 中文词边界不稳定。校对把每个字按比例摊进词的起止（`server/proofread.mjs` 的 `flatten`）。剪口用这些时间做 ±150ms 保护区（`scripts/pause-plan.mjs`）。词尾若拖进气口，整段长停顿会被判定为「还在说话」而留下。合成例子：静音在 5.0–7.1 秒，词尾被标到 6.9 秒，`pauseSegments` 返回一整段，2 秒停顿一刀没剪。
- 术语表几乎是空的。`src/subtitle-terms.mjs` 只折叠 `Agent`、`ChatGPT`、`OpenAI`、`GitHub`、`Remotion`、`Whisper`。`server/proofread.mjs` 的默认表再加「齐民要术」和少量英文。近音替换要求置信度 ≥ 0.95，并且拒绝改数字、否定词和长度差太大的改写。不确定就留错字。这对避免胡改是对的，但没有一个让人逐条点选的纠错界面，错字会一路进标题。
- 一键流程把 `AUTOBROLL_FACE_AWARE=0`（`server/auto-edit.mjs`）。`scripts/captions-multiclip.mjs` 里本来可以用一张中帧估计脸的位置来放字幕，一键时关掉了。字幕默认 `topPct` 在 `scripts/captions-multiclip.mjs` 是 80，知识模板再改到 86 或 91（`src/presentation.mjs`）。复盘已经记录过字幕压到下半张脸。
- 个人词库能写在设置里，但只在自动校对时静默套用。首页能看到「改了几处」，不能在时间轴上听原句再决定留不留。

### 2.2 剪口

静音检测在 `scripts/trim-silence.mjs`：FFmpeg `silencedetect=noise=-42dB:d=0.65`，若装了 faster-whisper 再加 VAD，`min_silence_duration_ms=650`（`scripts/detect-speech-pauses.py`）。两路合并后交给 `pauseSegments`：

- 静音两端先各让出 0.12 秒。
- 每个词再向两侧扩 0.15 秒，扩到的区域不能剪。
- 剩下的洞要 ≥ 0.4 秒才真的挖掉。
- 挖掉的是整段，不是收成一口呼吸。拼回去没有音量淡化，也没有对齐到最静采样点或帧。
- 有词时间时，片头片尾最多留到首词前 0.45 秒、末词后 0.45 秒。样片把长气口收到 0.1–0.25 秒，开头 0.45 秒的空仍然发闷。
- 短于 0.65 秒的气口检测器根本不报。0.45 秒的停顿在合成测试里原样留下。

合成 30 秒单条口播（含一次 0.5 秒间隔的整句重说、几次 0.7–2.4 秒停顿、9 秒尾静音）：

- Saymivo 留下 17.45 秒，两遍「我们今天讲剪辑」都在。0.5 秒重说间隔低于 0.65 秒门槛。
- 按样片规则（删前一遍重说，长停顿收成约 0.18 秒气口）大约 15.1 秒，而且重说不在。
- 切点落在 2.67 秒、3.17 秒这种位置，乘 30fps 是 80.1 帧、95.1 帧，不是整帧。`src/timeline.ts` 的 `placeClips` 和 `src/MultiClipVideo.tsx` 的 `trimBefore = Math.round(inSec * fps)` 各算各的，剪点会再偏一帧。
- `acceptableTimeShiftInSeconds={0.5}` 写在 `src/MultiClipVideo.tsx` 和 `src/ClipFocusWindows.tsx`。Remotion 被允许为了找解码帧把画面相对声音挪最多半秒。样片要补的是音轨起始 PTS；这里把容差放得太大，口型会漂。

音轨起点这件事，识别侧其实做过。`scripts/source_audio.py` 用视频第一帧 PTS 当零点，记录 `audioOffsetFromVideoMs`，WAV 和词时间对齐的是这条时钟。剪辑侧没有沿用它：成片仍用 Remotion 对原文件做 `trimBefore`，剪点处没有采样级垫齐，也没有 10ms 级淡化。所以「识别时钟是准的」不能推出「剪完口型是准的」。

响度：一键流程用 `volumedetect` 的峰值，把增益钳在 0.5–2，目标大约 −3 dB 峰值（`server/auto-edit.mjs`）。这不是 −16 LUFS。安静的句子会被抬得很凶，已经很响的句子几乎不动，响度不齐。`scripts/normalize-voice.mjs` 已经实现两遍 `loudnorm=I=-16:TP=-1.5:LRA=11`，但没有任何调用方。

口误和重说：`server/auto-edit.mjs` 的 `execute()` 顺序是识别 → 校对 → `trim-silence` → `applySourceEditDecisions` → 动效。`applySourceEditDecisions`（`server/source-edit-decisions.mjs`）只重放 `public/clips/reviews/<源>.json` 里人已经存过的 `editorialCuts`。没有这份文件就不会删重说。`scripts/arrange-clips.mjs` 的提示词确实会让 Gemini 在多段素材里挑「没有起句失败的一遍」，但那是另一个按钮（`/api/arrange`），而且判断单位是整段文件，不是一条长口播里的半句重说。首页一键不走它。复盘第 3.1 节写过：识别重复和判断哪一遍更好不能混成一件事；近义改说、被识别并到一起的重说、故意重复的强调，现有逻辑都处理不好。当前仓库里连「候选」都没有，只有「以前人删过的再套一次」。

硬切还有字幕副作用。`server/auto-plan.mjs` 的 `applyTrimPlan` 按剪点把词切开。词时间若跨过剪点，后半句可能只剩半个字，或整页被丢掉。复盘把这叫做已经修过的跨剪口字幕问题；代码现在会滤掉覆盖不足的词，但没有「剪点前后各听 1 秒」的验收，滤错了听不出来。

### 2.3 没有逐句分镜，只有关键词触发器

不存在样片那种 LLM 逐句 `plan.json`。

本地导演是 `src/motion-rules.mjs` 的 `suggestMotion`：句子里出现「以前/对比」→ compare，「第一/步骤」→ steps，数字+单位 → number，英文词加「叫做/工具」→ card，「关键/一定/记住」→ emphasis，否则 none。同一片段 2.2 秒内只许命中一次。`automaticMotionPlan` 再砍一刀：字幕短于 1.1 秒，或离上一处动效不到 2.8 秒，动效删掉。留下的 emphasis 缩放被写成 `zoom: 1.035`。3.5% 的推进在 1080p 上几乎看不出，更没有暗角。

Gemini 模式（一键默认还不是这个，`editor/AutoEdit.tsx` 的 `start()` 写死 `mode:'local'`）只让模型给每句选同一个 enum，不写章节、不写景别、不写要打在画面上的句子、不写卡片条目、不跟词时间绑定高亮。

横屏且模板为「录屏参考」时，`src/presentation.mjs` 的 `knowledgePlan` 会改走 `src/auto-storyboard.mjs`。这份分镜看起来像导演，实际是为某一条讲稿写的规则：

- 分句边界写死了「搜索资料|打开网页|提取信息|再整理成|关键的变化|安排画面|标出重点|找错资料|理解错要求」。
- 强调词写死了「竞品分析|分析框架|差在哪里|能自己执行|每一步都可靠」（`src/auto-source-tags.mjs`）。
- 标题只有在「介绍/聊聊…岗位/工具…叫做 X」这种句式里才抽一个短标题（`src/source-headline.mjs`）。对不上就用逗号前的原文，或「原声讲解」。
- 两项到三项带「第一/第二/第三」就变 cards；两个以上「搜索/打开/整理」就变 flow。其它句子大多是 speaker 或一块 headline。
- 卡片高亮若词时间不唯一，`focusMs` 改成平均切开，并注明「焦点时间为估计」。样片是词时间驱动当前项。估计焦点会和嘴上说的不是同一条。

所以换一条口播，要么几乎没有画面（关键词没碰上，再被 2.8 秒节流），要么套上为另一条讲稿准备的板式。复盘第 3.4 节已经把这个写成根因：局部规则被期待承担整片导演，结果是相似的资料板反复出现。

`src/scene-draft.mjs` 的「重生成一镜」用的是同一套正则，不是新的导演。

### 2.4 组件观感

样片的组件少，而且每个都有明确的时间性格。Saymivo 的画面散在 `MotionLayer`、`KnowledgeLayer`、`ReferenceLayer`、`StoryboardLayer`、`AiryTitle`、`StructuredScene`、`EditorialFlow`、`EditorialCriteria`、`FolderScene` 里，默认模板还会同时走故事板和字幕两层。

具体差在：

- **字体。** 样片是 Noto Sans SC Black / Bold / Medium。仓库可选字体是抖音美好体、思源黑体 Heavy、得意黑（`src/display-fonts.mjs`）。默认选中思源 Heavy（`editor/AutoEdit.tsx`），但大量标题写的是 `fontWeight: 400`（`src/AiryTitle.tsx`、`src/StoryboardLayer.tsx`）。单字重文件还能看出 Heavy，和 Black 的字面、黑边、投影不是同一套。字幕在参考模式下写死 `PingFang SC, Microsoft YaHei`（`src/CaptionTrack.tsx`），不用已加载的展示字体。非 Mac 上 PingFang 不存在，字幕会掉到系统无衬线。
- **颜色。** 默认重点色是 `tech-indigo`，描边是 `0px transparent`（`src/emphasis-theme.mjs`）。样片那套黄字黑边对应的是 `reference-yellow`（`#efff24`，描边 `#213027`），要人手改下拉框。没改的成片是蓝字、没有黑边。
- **弹出。** 样片 PunchText 大约 130ms 弹簧。这边 kinetic 入场默认 260–380ms 三次缓出（`src/tag-animation.mjs`），Airy 标题 350–430ms，MotionLayer 350ms 上移（`src/MotionLayer.tsx`）。慢，而且是缓出不是弹簧，没有「砸上去」的重量。
- **景别。** `speakerBox`（`src/presentation.mjs`）里 headline 把人挤到右半 55% 宽；slide 是右下角直径约 20.5% 画宽的圆。没有「1.36 倍推进 + 暗角」这个景别。emphasis 只在原画面上乘 1.035，300ms 淡入淡出（`src/MultiClipVideo.tsx`）。人如果本来就偏左，左侧重字会盖住脸：人物避让只在 macOS、且模板是横屏 reference 时跑 `scripts/build-visual-profile.py`，其它平台直接 `local-profile-platform-unavailable`。
- **字幕。** 样片是灰、半透明、按短语拆。参考模板字幕是白字、黑描边、深色胶囊，字号大约 68×0.65 到 68×0.72，贴在 91% 高度（`src/CaptionTrack.tsx`、`src/presentation.mjs`）。底部还有 74px 章节条（`src/KnowledgeLayer.tsx` 的 `ChapterBar`）。两层叠在下巴和下胸。
- **卡片。** `MotionLayer` 的角标是英文：`KEY TAKEAWAY`、`STEP BY STEP`、`BY THE NUMBERS`、`CONCEPT NOTE`。数字会从 0 跳到终值。compare 把一句按逗号切成 A/B。这不是样片的全屏对照页，也没有「说到哪一项，哪一项亮」。
- **章节。** `ChapterBar` 有分段和橙色进度，方向对。标题来自动效标题的前 18 字，最多大约 5 章再加「开场」，不是按内容切的章节。
- **安全区。** 没有统一的「脸的包围盒禁入」。标签默认贴在 `x:0.04, y:0.13`（`src/auto-source-tags.mjs`）。圆窗位置写死在右下。全屏板用 `overflow: hidden`，长标题靠 `headlineLines(..., limit=8 或 9)` 折行，折不完就缩小字号；复盘记录过按字数估宽、外层裁切。现在有一部分测量，但仍不是「先保证全文和阅读时间，再选构图」。

### 2.5 渲染

- `remotion.config.ts`：`Config.setVideoImageFormat('jpeg')`。口播脸和细字边会先被 JPEG 伤一次。
- 一键导出：`server/auto-edit.mjs` 使用 `--concurrency=2 --x264-preset=veryfast`，没有 CRF、没有音频滤镜。
- 编辑器导出：`server/index.mjs` 的 `/api/render` 同样 `veryfast`，草稿再降到 `ultrafast` + `--scale=0.5`。
- 导入非 H.264/yuv420 的原片会用 `veryfast` 重编码再识别（`/api/add-clip`）。画质在进时间轴之前就掉一档。H.264 原片是 `-c copy`，这条还好。
- 浏览器路径只找 Mac arm 的 headless shell（`remotion.config.ts`）。Linux 上会另找浏览器，和「主要在 Apple Silicon 上验证」一致，但也说明现在没有一条固定的高质量导出配置。

### 2.6 编辑器和架构

首页（`editor/Start.tsx`）默认勾着「上传后自动剪辑并导出」，生成方式默认「直接生成成片」（`editor/AutoEdit.tsx` 只有 localStorage 里存过 `storyboard` 才先看分镜）。上传完就会跑完识别、剪停顿、铺故事板、导出 MP4。用户第一次看到的是成片，不是剪辑单。

剪口没有审阅界面。编辑器里的「剪停顿」拿到 `trim-silence.json` 就 `applyAutocut`（`editor/Editor.tsx`、`editor/store.ts`），直接把一条素材切成多段。没有「这段是气口 / 重说 / 起句失败、证据句、听前后 1 秒、接受或拒绝」。一键结束后若复用过旧的人工剪辑，面板能展开原因；机器新产生的静音剪没有逐条原因。

分镜审阅是另一个极端：`editor/StoryboardTools.tsx`、`Inspector.tsx`、`MotionTools.tsx`、`PresentationTools.tsx`、`TagAnimationFields.tsx`、`WindowKeyframes.tsx` 把 13 种 layout、标签动画、透视、素材框选都摊开。用户要改的是「这句用推进还是左字右人、这四个字打多大」，界面给的是场景图结构。

工程是一份大 JSON：`clips`、`captions`、`presentation`、`brolls`（`docs/architecture.md`、`src/timeline.ts`）。没有 `words.json` → `cutlist.json` → `plan.json` 这种可单独重跑的阶段。改一个景别往往要动故事板场景；改一个剪点会换 clip id（`clip-cut1`），字幕和场景靠前缀重新绑定，容易断。

MCP（`mcp/server.mjs`）仍写着 AutoBroll，默认 API `http://localhost:3333`。实际后端在 `scripts/dev.mjs` 里是 3348，编辑器是 5188。MCP 不能当成现在的审片入口。

复盘第 6 节提出的顺序是对的：先纯口播精剪，再导演分镜，再调用已验证组件，再 45–60 秒样片，再全片。当前代码没有把这个顺序做成默认路径。默认路径仍是一键到 MP4。

## 3. 目标架构

保留 Remotion 4.0.380 做预览和成片，保留现有工程壳和撤销。在它前面加三份可审文件。每一份失败都可以停，不必重跑后面的阶段。

```text
原片
  │  source_audio.py（保留现有视频零点时钟）
  ▼
words.json          识别 + 术语候选
  │  人审错字（可跳过，但要看得见）
  ▼
cutlist.json        气口收缩、重说/起句失败候选、帧对齐、淡化
  │  人审剪辑单，只应用 accepted
  ▼
plan.json           逐句景别和组件，时间仍用词的源时间
  │  人审这一句用哪种镜头
  ▼
Remotion props      只读前三份文件的投影
  ▼
MP4                 1080p，CRF 18 左右，响度 −16 LUFS
```

### 3.1 `words.json`

```json
{
  "sourceSha256": "…",
  "audioClock": { "audioOffsetFromVideoMs": 0 },
  "model": "medium",
  "language": "zh",
  "words": [
    { "id": "w12", "text": "口播", "startMs": 1200, "endMs": 1680, "confidence": 0.81 }
  ],
  "corrections": [
    {
      "id": "c1",
      "range": ["w12", "w13"],
      "before": "口波",
      "after": "口播",
      "reason": "个人词库",
      "status": "proposed"
    }
  ]
}
```

约定：

- 时间是源视频零点上的毫秒，和现在的 `audioClock` 同一套，不在这里改成成片时间。
- 中文按词或按字保存都可以，但必须是模型给出的时间，禁止再按字数把一个词的时间摊匀。摊匀的时间不能拿去剪。
- `corrections.status` 只有 `proposed | accepted | rejected`。只有 accepted 改写后文。rejected 留下，避免下次又提同一条。

### 3.2 `cutlist.json`

```json
{
  "sourceSha256": "…",
  "fps": 30,
  "audioOffsetMs": 40,
  "removes": [
    {
      "id": "r1",
      "kind": "pause",
      "startMs": 8200,
      "endMs": 10400,
      "keepMs": 180,
      "snapInMs": 8380,
      "snapOutMs": 10220,
      "reason": "停顿 2.2s，收到 180ms",
      "evidence": ["w40", "w41"],
      "status": "proposed"
    },
    {
      "id": "r2",
      "kind": "retake",
      "startMs": 400,
      "endMs": 2500,
      "reason": "与后句重复，后句更完整",
      "evidenceText": ["我们今天讲剪辑", "我们今天讲剪辑"],
      "keep": "later",
      "status": "proposed"
    }
  ]
}
```

约定：

- `kind` 只使用 `pause | retake | false-start | manual`。故意重复的强调不要自动标成 retake；标了也默认 `proposed`，不能默认 accepted。
- `pause` 不删除气口。源上长于 400ms 的静音，输出留 100–250ms（建议默认 160–180ms）。切点先在静音内部找最静的采样，再挪到最近的帧（`Math.round(ms / 1000 * fps) / fps`）。词区间及其前后 80–120ms 禁止切入。
- 应用时用 FFmpeg `atrim/aconcat` 或等价滤镜做 8–15ms 音量淡化，并把 `audioOffsetMs` 补进每段的音频起点。视频帧和音频采样一起算，不要只靠 Remotion 的 `trimBefore` 碰运气。
- 成片响度用现成的 `normalize-voice.mjs`：两遍 loudnorm，I=−16，TP=−1.5，LRA=11。不要再用峰值增益。

### 3.3 `plan.json`

一句（或一个意群）一条，时间用源时间，渲染时再投影到剪完的时间轴。

```json
{
  "chapters": [
    { "id": "ch1", "title": "先剪干净", "startMs": 2600 }
  ],
  "sentences": [
    {
      "id": "s3",
      "startMs": 5000,
      "endMs": 8200,
      "text": "先把口误和停顿拿掉",
      "chapterId": "ch1",
      "shot": "shift-right",
      "punch": { "text": "先剪干净", "atMs": 5200 },
      "labels": [],
      "slide": null,
      "pip": false,
      "cta": false
    },
    {
      "id": "s8",
      "startMs": 40000,
      "endMs": 52000,
      "text": "对比一下两种做法",
      "shot": "pip",
      "slide": {
        "kind": "comparison",
        "items": [
          { "id": "a", "title": "留着重说", "atWordId": "w80" },
          { "id": "b", "title": "只留完整的一遍", "atWordId": "w92" }
        ]
      }
    }
  ]
}
```

`shot` 只有三种，和样片一致：

- `medium`：人居中，安全区留给底部字幕。
- `shift-right`：人在右，左侧大字。脸的包围盒必须落在右半，否则降级成 `medium` 并标 `faceConflict`。
- `punch`：在 medium 上放大到约 1.36，加暗角，持续这句。不是 1.035。

全屏页 `slide.kind` 先做三种：`comparison`、`checklist`、`workflow`。当前亮的那一项由 `atWordId` 对应的词的 `startMs` 决定，不平均分配。没有词时间的项保持 `proposed`，不准假装已经对齐。

LLM 可以起草 `plan.json`，但只能填这个 schema。它不能改 `words.json` 的时间，不能发明原片没说的数字和否定，不能把 `removes` 标成 accepted。标题允许短于原句，必须另存 `punch.text`，字幕仍用原话。

### 3.4 渲染投影

Remotion 只吃投影结果：剪完的片段列表、已接受的纠错、已接受的 plan。投影要可重复，同一份三个 JSON 得到同一条时间轴。预览和导出共用这一份，禁止预览用一套切点、导出再静默重剪。

## 4. 保留、替换、停用

### 保留

- `scripts/source_audio.py` 的视频零点时钟、`audioOffsetFromVideoMs`、SHA 校验。识别和剪口都继续用它。
- 词时间锚定在源上、再投影到时间轴（`src/captions.ts` 的方向）。不要改成「字幕时间就是成片时间」这种存法。
- 工程壳：Vite 编辑器、Zustand 撤销、本地工程 JSON、Remotion Player 预览、`npm run check` 这套测试。
- 校对的保守底线：数字、否定、跨长停顿的替换不自动生效。把它们留在 `corrections` 里让人点。
- `pauseSegments` 里「词区间不能剪掉」的测试（`tests/pauses.test.mjs`）。改的是停顿策略，不是把说话剪掉。
- `ChapterBar` 的结构：底栏、章节分段、橙色进度。换标题来源和安全区，不删组件。
- `scripts/normalize-voice.mjs` 的响度目标。接到剪完的成片上。
- 故事板校验（空标题、高亮出界）仍用于导出前拦截。`src/storyboard.mjs` 的 `validateStoryboard` 留下。
- 本地优先：没有 API key 也要能完成转写、剪气口、导出。LLM 分镜是可选增强。

### 替换

- 用第 3 节的三份文件替换「一键里临时的 `trim-silence.json` + 直接改 clips」。
- 停顿策略换成「收到 100–250ms + 最静采样 + 整帧」。`d=0.65` 和「整段挖掉」退出默认路径。
- 默认模型至少 medium；CPU 上也优先 int8_float16 或 float32，线程数按机器来，不要写死 2。`small` 只作为显式降级。
- 峰值增益换成 loudnorm。
- 默认重点色改为 `reference-yellow`，默认展示字体改为 Noto Sans SC Black/Bold/Medium（思源 Heavy 可留作备选）。字幕跟这套字体，不再写死 PingFang。
- 默认生成方式改为先停在剪辑单，而不是直接 MP4。
- `acceptableTimeShiftInSeconds` 降到接近 0（或只在无法解码时告警），剪点以帧和采样为准。

### 默认路径停用，代码先留着

不要在 P0 做大删除，避免把还能用的手工时间轴弄坏。下面这些退出一键和默认模板：

- `src/auto-storyboard.mjs` 里为特定讲稿写死的分句和标题。它不能再当「录屏参考」的导演。
- `src/motion-rules.mjs` 的关键词景别，以及 `automaticMotionPlan` 的 1.035 缩放。
- `src/MotionLayer.tsx` 的英文角标卡片。经典模板若还要保留，改成不自动铺上。
- `scripts/arrange-clips.mjs` 作为重说删除器。多段素材排序可以以后单独做；单条口播的重说以 `cutlist.json` 为准。
- 首页「上传后自动剪辑并导出」默认勾选。可以留成高级选项，默认关闭。
- JPEG + `veryfast` 作为正式导出。草稿可以继续 ultrafast。

P2 再考虑删除没人走到的 layout（`stack`、`route`、`gallery`、`folder` 等）和对应编辑控件。P0/P1 不要边追样片边拆编辑器。

## 5. 组件库

只做样片里已经证明有效的几件。每一件都要能单独预览：给定一句词时间和一个 plan 条目，渲染 2 秒，不依赖整片工程。

| 组件 | 行为 | 不要做成 |
|---|---|---|
| `Talking` | 三种景别：`medium`、`shift-right`、`punch`（约 1.36 倍，暗角，入场约 200ms）。人脸盒与左字、底字幕、底章节条不相交 | 13 种 layout 切换；1.035 的假推进 |
| `PunchText` | Noto Sans SC Black，黄底黑边（约 4px 量级的描边），130ms 弹簧弹出，停在这句的词上。位置在脸盒之外 | 350ms 缓出；`fontWeight: 400`；蓝字无描边 |
| `ChapterCard` | 章节开始时全屏或大半屏停留约 0.6–1.0 秒，然后回到口播。标题来自 `chapters`，不从字幕硬切 18 字 | 每句都来一张板 |
| `Label` | 小胶囊，跟着某个词出现，短句，不挡嘴 | 一整句原文当标签 |
| `Slides` | 全屏 comparison / checklist / workflow。当前项由 `atWordId` 点亮，未说到的项降对比度 | 按条目数把时长均分 |
| `PiP` | 全屏页期间，圆形口播气泡，直径大约画宽的 18–22%，默认右下，若与字幕重叠则上移 | 和全屏板各播各的、出现第二张脸 |
| `ProgressBar` | 沿用章节分段 + 橙色播放头。高度收进安全区，字幕在它上方 | 和 91% 高度的字幕叠在一起 |
| `Subtitles` | 灰字、半透明底、按短语而不是按 16 字硬切。短语边界用词间停顿和标点。字号固定，不随模板缩到 0.65 还压在下巴上 | 白字重描边胶囊；卡拉 OK 逐词放大 |
| `CTA` | 片尾一句行动号召，大字 + 口播，不新增原片没说的承诺 | 自动从最后一句提取「关注」 |

脸的安全区是这套库的硬约束，不是可选分析：

- 没有脸盒时，只用 `medium` + 底部字幕，不放左侧大字。
- 有脸盒时，`shift-right` 和 `PunchText` 的矩形与脸盒至少留出约 4% 画宽。冲突则改文案位置或降级景别，并在 plan 里写 `faceConflict`，给编辑器一个红点。
- macOS 上现有的 `build-visual-profile.py` 可以产生脸盒。其它系统先用手动框，或抽 3 帧做本地检测。不要为了等检测去挡 P0 的剪口。

字体文件用 Noto Sans SC 的 OFL 字体，放进 `public/fonts/`，和现有思源、抖音体一样带许可证。不要用系统 PingFang 当成片字体，否则换一台电脑字就不一样。

## 6. 编辑器里怎么审

不要新做一个复杂 NLE。在现有预览旁边加两个清单。时间轴仍负责听和微调。

### 6.1 转写页

打开工程后第一步是词，不是成片。

- 整篇字幕按句展开，低置信度的词用底色标出。
- 每条 `corrections` 有「采用 / 保持原识别」。采用后只改文字，不改时间。
- 个人词库的命中也走同一张表，禁止静默替换后只在角落写「已修正 N 处」。
- 一句可以改文字。保存时若字数变了，这句的词时间标成 `unaligned`，剪口和 PunchText 不使用这句，直到人重新标起止，或重新识别这一小段。

### 6.2 剪辑单

第二步，视频仍是原片，清单浮在旁边。

- 每一条 remove 显示种类、起止、原因、证据句。
- 点一条就从 `startMs-800` 播到 `endMs+800`，先听「删了会怎样」的前后文，再听被删的那一段。现有 `editor/SourceAudition.tsx` 可以承担播放，不要只在成片时间轴上听已经切过的结果。
- 三个动作：接受、拒绝、改切点。改切点时吸附到帧，并显示「会不会切进某个词」。
- 气口类可以提供「全部接受停顿」；重说和起句失败必须逐条接受。拒绝的条目留在文件里。
- 只有按「应用已接受的剪辑」才改 `clips`。应用后仍能撤销到原片（现有 undo 栈加上一份 cutlist 快照）。
- 顶部写清：原片时长、接受后时长、已接受 / 待定 / 已拒绝条数。样片那种 127.9 → 88 要在这里就能看见，而不是等导出。

### 6.3 分镜单

第三步，左列句子，右列预览只渲染当前句前后各 1 秒。

- 每句一个景别选择：中景 / 人靠右 / 推进。
- 大字是一个输入框，默认可空。空就是不加 PunchText。
- 若这句有 slide，条目可改字、可改绑定到哪个词。拖动绑定点时预览里的高亮跟着走。
- 脸冲突显示为一句红字：「大字压住脸，已改回中景」，并允许人改位置。
- 「重算这一句」只重写这一条 plan，不重跑转写，不重剪。
- 整片节奏用一条章节色带看：连续三句都是全屏页时提示「板式太密」，连续二十秒都是中景时提示「可以加一句大字」。提示不自动改。

### 6.4 然后才导出

导出按钮在剪辑单仍有 `proposed` 的重说时要写明「还有 N 条重说没处理」，但不要禁止导出。正式导出使用 CRF 18、`medium` 或 `slow`、PNG 或高质量帧、loudnorm 后的声音。草稿导出可以保持现在的 ultrafast 半分辨率。

首页文案改成三步的状态，而不是「一键剪辑并导出」：转写完成 → 剪辑单待审 → 分镜待审 → 可以导出。默认停在剪辑单。

## 7. 里程碑和验收

验收看的是同一条你已经满意的原片（127.9 秒那条），外加一条内容完全不同的口播，避免规则又写死在一句讲稿上。技术测试通过不算过关。

### P0 剪口听感，先不要新画面

做：`words.json`、`cutlist.json`、气口收缩、帧和采样对齐、音轨偏移、短淡化、loudnorm、重说/起句失败候选、剪辑单审阅、正式导出参数。画面先保持现在的中景加人声字幕，或干脆先出一条无包装的精剪。

不要做：新组件、LLM 分镜、删除旧故事板代码。

验收：

- 在那条 127.9 秒原片上，接受全部合理气口和重说之后，成片时长落在样片 88 秒的大约 ±8 秒以内。差得远就要逐条对 cutlist，而不是调编码器。
- 连续听完精剪：没有切掉字头字尾，气口像呼吸不是跳切，重说不在，故意重复的强调还在。
- 剪点前后口型不漂。抽 5 个剪点，画面切换和爆破音对齐，误差在 1 帧内。
- 成片集成响度约 −16 LUFS，真峰值不高于 −1.5 dBTP。
- 字幕错字在审阅里能逐条改；未接受的纠正不会出现在字幕里。
- `tests/pauses.test.mjs` 更新为新策略：长停顿变成留下约 0.18 秒，词内仍剪不掉，0.45 秒气口会被收到上限以内而不是整段保留。合成测试不依赖私人原片。

### P1 逐句分镜和小组件库

做：`plan.json`、第 5 节的组件、脸安全区、分镜审阅、默认黄字黑边和 Noto Sans SC。LLM 只作为「起草 plan」的按钮。

不要做：把旧的 13 种 layout 映射进新 schema。对不上的句子就是 `medium`。

验收：

- 用同一条原片做出 45–60 秒样片，景别里能指出中景、左字右人、1.36 推进加暗角，至少各出现一次，并且都是 plan 里写明的，不是正则碰上来的。
- PunchText 从出现到到位约 130ms，黄字黑边，不盖住眼睛和嘴。
- 至少一页 checklist 或 comparison，高亮切换时间与对应词的 `startMs` 相差不超过 150ms。
- 底部字幕是灰底短语，不和章节条、下巴重叠。
- 关掉 LLM，只用手工 plan，预览和导出一致。
- 另一条不同主题的口播不会出现「竞品分析 / 搜索资料」这类写死文案，除非原话里就有。

### P2 把默认产品收成这条流水线

做：首页默认停在剪辑单；一键导出改为显式高级动作；正式/草稿两套渲染预设；MCP 端口和名字改到实际服务；旧的自动故事板从默认模板断开；为三份 JSON 加回归夹具。

不要做：再增加景别种类，除非 P1 样片你点头之后仍缺某一种，并且能用现有组件组合不出来。

验收：

- 新用户上传后，第一次看见的是转写和剪辑单，不是一条已经铺满卡片的 MP4。
- 改一个剪点、改一句景别、改一个大字，都不重新识别整段。
- `npm run check` 仍通过。另有一组合成夹具覆盖：气口收缩、重说候选默认不自动接受、脸冲突降级、词时间驱动的高亮。
- 你用第二条口播独立看完，不需要开发者在旁边解释哪块板是规则碰出来的。

## 8. 风险

- **词时间仍然是上限。** medium 也有把气口标进词尾的时候。P0 必须保留「词内不剪」和人工改切点。若保护把长停顿整个留下来，剪辑单里要标 `blocked-by-word`，让人看见，而不是静默留下。
- **重说会误伤强调。** 「很重要，很重要」可以是修辞。所以 retake 默认 proposed。若以后要把高相似度重说默认接受，先用你这条样片和至少三条别的口播对过误伤，再改默认。
- **LLM 分镜会编事实。** 限制它只重排已有的词和已有的数字。plan 里出现的数字必须能在 `words.json` 里找到原文，否则整条标 `rejected-hallucination`。
- **脸盒在 Linux 上没有。** 没有脸盒就不要做 `shift-right`。不要用「标题放左边、人随机在哪」冒充样片构图。
- **Remotion 拼接和 FFmpeg 拼接两套时钟。** P0 建议精剪音频和视频都由 FFmpeg 按 cutlist 输出一条中间文件，Remotion 只负责包装。这样口型和淡化只在一个地方算。代价是预览切点调整要重出中间文件的相关段，可以用片段缓存，不要因此退回 `trimBefore` 硬切。
- **不要重写编辑器。** 现有时间轴、撤销、字幕编辑是资产。P0 加清单，不替换 `editor/store.ts` 的整份状态模型。三份 JSON 可以放在工程 JSON 里当字段，但逻辑上分开，避免又合成一个改不动的对象。
- **写死规则会复发。** `auto-storyboard.mjs` 就是前车。新组件的文案只能来自 plan 或原话。代码里不再出现某条讲稿的例句。
- **许可证。** Noto Sans SC 用 OFL，和现有字体一样放许可证全文。Remotion 的商用条款仍按你的用途单独看，这个仓库的 README 已经提醒过。
- **这棵公开树和你本机树可能不一致。** 若本机还有未提交的重说分析或动效库，先对照本计划第 2 节：那些能力只要没进默认 `execute()`，就不会改变用户看到的成片。以默认路径为准，不以文档里的「本地已有」为准。

## 9. 建议的第一刀

下一轮实现只做 P0，并且只用你已经满意的那条原片当听感标尺：

1. 固定 medium（或你样片用的那个尺寸）出 `words.json`，词时间禁止摊匀。
2. 用新的 cutlist 把长停顿收到约 0.18 秒，重说只列候选。
3. 做一个剪辑单页面：听、接受、拒绝。
4. 导出一条没有新包装的精剪，响度 −16 LUFS，剪点有短淡化。
5. 你听完再决定 P1 要不要开工。听感没过关之前，不加 PunchText，也不要再跑现在的一键故事板。
