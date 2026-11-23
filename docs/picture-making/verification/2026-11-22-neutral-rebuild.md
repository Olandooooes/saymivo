# 2026-11-22 中性夹具技术核验

这是一次仓库内技术核验记录。退出码 0 不是审美通过。当时没有播放视频，没有听音频。

## 命令

在仓库根目录、新建的临时目录中执行（脚本自己创建临时目录，不写用户原片）：

```bash
python3 scripts/picture-making/verify-package.py
python3 scripts/picture-making/render-neutral-preview.py --artifact-dir /opt/cursor/artifacts/picture-making-neutral
```

依赖当时为：Python 3.12、Pillow 13.0.0、NumPy 1.26.4、FFmpeg 6.1.1、libass 0.17.1。字体文件是仓库内 `docs/picture-making/style/fonts/NotoSansSC-Bold.otf`。

## verify-package.py 实际输出

```text
OK hash .cursor/skills/saymivo-picture-making/SKILL.md
OK hash .cursor/skills/skill-1795151255813/SKILL.md
OK hash docs/picture-making/rules/制作执行清单-公开版.md
OK hash docs/picture-making/rules/效力与来源映射.md
OK hash docs/picture-making/rules/阅读入口-公开版.md
OK hash docs/picture-making/style/caption-style.example.ass
OK hash docs/picture-making/style/camera-and-caption.example.json
OK hash docs/picture-making/fixture/build_preview.py
OK hash docs/picture-making/fixture/picture_compositor.py
OK hash docs/picture-making/style/fonts/NotoSansSC-Bold.otf
OK skill sections 1-12 and startup items 1-7
OK checklist items 1-64
OK project-config adapter and entry links
OK relative links checked: 140
OK privacy scan
OK font family Noto Sans SC Bold
OK style example still matches fixture geometry
OK deps Pillow numpy ffmpeg/libass
watched_video=no listened=no aesthetic=not-claimed
RESULT technical=pass
```

相对链接 140 条均能在树内找到目标。技能与公开清单哈希与附件一致。

## render-neutral-preview.py 实际输出

临时目录：`/tmp/saymivo-neutral-qzr7mp7m`（跑完即弃，不入库）。

```text
wrote /tmp/saymivo-neutral-qzr7mp7m/fixture/fixtures/preview-key-state.png
rebuild bytes_match=True max_abs=0 mean_abs=0.0000
caption_vs_nofont upper_mean=0.000 lower_mean=6.768
font_loaded=NotoSansSC-Bold.otf family=Noto Sans SC
temp_dir /tmp/saymivo-neutral-qzr7mp7m
watched_video=no listened=no aesthetic=not-claimed
RESULT technical=pass
artifacts /opt/cursor/artifacts/picture-making-neutral
```

重建出的关键帧与仓库里的 `docs/picture-making/fixture/fixtures/preview-key-state.png` 字节相同，像素最大差为 0。对照实验把同一张静帧烧进 ASS：加载该 Bold 字体时，字幕带（y 960–1080）平均绝对差 6.768；其上区域平均差 0.000。空的 fontsdir 不会画出这条字幕。libass 日志记录加载了临时目录中的 `NotoSansSC-Bold.otf`。

编码出的文件是 3.000 秒、1920×1080、H.264 + AAC。音轨是 `anullsrc` 静音，不是人口播。ffprobe 只读了封装信息。

## 看过的静帧

看过三张静帧，没有播放这段 3 秒文件：

- 关键帧：米色底、「示例主题」、「示例重点」、三扇空窗口线稿、左下灰色圆，圆内只有字母 PIP。没有人脸。
- 1.2 秒静帧：同一画面下方出现灰底白字「这是一条示例字幕，」。
- 2.2 秒静帧及字幕条裁切：白字「黄字只标」，黄字「示例名词。」。黄像素集中在整行锚点 x=1180 的右侧，与 ASS 里 `\1c&H0060DAF4&`（`#F4DA60`）标在「示例名词」上一致。

这些静帧只说明夹具和字幕样式能画出来。没有做审美验收，也没有把它当成某一期口播样片。

## 这次没有覆盖的能力

- 私有 CHARTER-v1.13 全文不在仓库。
- t86 接线核验记录原文不在仓库。
- 没有可公开的已认可插画库、19 页界面、人像、原声或逐字稿。
- 王百能参考的第 1–9 节仍是待填。没有逐帧研究。
- 没有用户当期原片，没有做第三段或全片。
- 没有启动 Codex。
- 脚本通过不等于画面或听感通过。
