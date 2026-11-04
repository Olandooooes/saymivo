# workbench-port / code — 手剪口播 参考实现（Python）

这是一次真实手剪（口播 → 去口误/重说/停顿 → 仿参考视频的动效）里实际用过的脚本，整理成**通用、参数化**的版本。
不含任何媒体、转写原文、个人内容；示例全部是占位文案。规范与经验见上一级 `手剪经验与风格规范.md`。

## 目录
```
config/cut_rules.json      剪辑阈值（VAD、语气词、起句失败、重说、停顿分档、词尾余量、交叉淡化、响度）
config/style.json          视觉规范（16:9 满版、无壁纸/窗口、人物不抠像、景别、动效时长、字号）
pipeline/00_prepare_audio.py   ffprobe 音视频起点差 → adelay 对齐；输出 aligned48.wav / aligned16.wav / probe.json
pipeline/01_transcribe_paraformer.py  Paraformer-zh（FunASR v2.0.4 + fsmn-vad）逐字时间戳 → chars.json
pipeline/02_speech_regions.py  能量 VAD（20 ms, -34 dB, 合并<0.25 s, 丢弃<0.12 s）→ speech_regions.json + energy_db.npy
pipeline/03_autocut.py         自动粗剪 → cutlist.json + 剪辑表.md（给用户审）；支持 overrides.json
pipeline/04_render_audio.py    30 ms 等功率交叉淡化 + 头 40 ms / 尾 300 ms 淡入淡出 + -16 LUFS
pipeline/05_cut_video.py       同一份按帧取整的 keep 列表切视频（select/between + setpts），校验帧数
pipeline/06_phrases.py         输出时间轴上的字幕意群 + 逐 token 时间（动效对口型用），错别字只走 corrections 映射
pipeline/tmap.py               s2o / o2s / joins
render/common.py layers.py     缓动、pop/fade_up、文字/胶囊/卡片/图标/运动模糊滑入/辉光背景
render/person.py               人物合成：不抠像，原背景镜像延展+轻模糊填边；景别关键帧平滑变焦；PiP 形变；跳切推拉
render/templates.py            14 个动效模板（9 个叠加在人物上，6 个页面层；见规范 §4）
render/render.py               scenes.json 驱动的渲染器（字幕、章节条+进度线、翻页、结尾淡出、静帧导出、--demo）
examples/make_example.py       生成 phrases.example.json + scenes.example.json（占位文案，展示所有模板与景别用法）
```

## 跑法
```bash
pip install -r requirements.txt            # + ffmpeg；字体放 code/fonts/ 或 export PORT_FONT_DIR=...
W=work/; mkdir -p $W
python pipeline/00_prepare_audio.py src.mp4 $W
python pipeline/01_transcribe_paraformer.py $W
python pipeline/02_speech_regions.py $W
python pipeline/03_autocut.py $W                     # → 剪辑表.md，给用户审
# 用户意见写进 $W/overrides.json 后重跑 03
python pipeline/04_render_audio.py $W
python pipeline/05_cut_video.py src.mp4 $W
python pipeline/06_phrases.py $W corrections.json
# 写 scenes.json（参考 examples/scenes.example.json），先出 20 s 预览 + 静帧
python render/render.py --scenes scenes.json --phrases $W/phrases.json --video $W/cut_video.mp4 \
       --audio $W/cut_audio.wav --cutlist $W/cutlist.json --out preview.mp4 --t0 0 --t1 20 --stills 3,8,15
# 无私有素材的自检：合成假人 + 示例 scenes
python render/render.py --demo --out demo.mp4          # 56.7 s, 1702 帧, CPU 约 0.18 s/帧
```

## scenes.json 要点
* 时间一律写成意群引用：`"@p3"` 起点，`"@p3.e"` 终点，`"@p3#4"` 第 4 个 token，`"@p3~关"` 第一个“关”，可加 `+0.2/-0.05`。
  这样改字幕/重剪后动效自动跟着口型走。
* `shots`：默认 `WIDE_L/WIDE_R`（0.80×，人在一侧，文字在另一侧），`PUSH`（1.08×）只给关键句且 ≤2.5 s，
  文字多的段落用 `PIP`，结尾 `END`。景别切换自动 0.7 s ease-in-out 平滑变焦，PiP 形变 0.6 s。
* `overlays`：叠加在人物画面上，模板自动取“人物对面那半边”作为文字栏（x0/x1）。
* `pages`：`bg` = offwhite / grey / dark_glow / dark_end；`enter: "slide"` 时把上一页整页推走；`layers` 里放页面模板。

## 与 saymivo 仓库（Remotion/TS）的对应建议（仅建议，未在 Remotion 中验证）
| 这里 | 仓库里可能的落点 |
|---|---|
| `pipeline/01_transcribe_paraformer.py` | `scripts/transcribe-local.py` 增加 Paraformer 后端（中文口播比 faster-whisper large-v3 稳，后者出现过幻听） |
| `pipeline/02/03` + `cut_rules.json` | 停顿/口误/重说规划（pause-plan 一类模块）：分档压缩、尾/头余量、按帧取整 |
| `pipeline/04` | 音频拼接：等功率 30 ms 交叉淡化 + -16 LUFS |
| `render/person.py` | `DynamicMattePerson.tsx` → 改成“不抠像 + 原背景延展模糊填边 + 景别关键帧”组件；matting 默认关 |
| `render.py` 字幕 / 章节条 | `CaptionTrack.tsx`、章节进度条组件 |
| `render/templates.py` | `src/motion-kit` 里的模板；`scenes.json` 结构可映射到 `src/plan-kit` 的计划格式 |
| `style.json` | 主题/常量（颜色、字号 px@1080、缓动、时长） |
