# 口播视觉制作包

给后续 agent 的开工入口。本页只导航，不另写一套规则。

当前 skill 版本：`2026.11.23.1`。从[技能执行导航](../../.cursor/skills/saymivo-picture-making/SKILL.md#执行导航)承接SOP；涉及封面、平台草稿或归档时读取技能内的[交付参考](../../.cursor/skills/saymivo-picture-making/references/delivery-and-archive.md)。变更与回退依据见[版本记录](verification/2026-11-23-skill-update.md)。

## 这份检出是哪一版

| 项 | 值 |
| --- | --- |
| 标识 | `picture-making-pack-20261122` |
| 分支 | `cursor/picture-making-pack-94e7`，[PR #9](https://github.com/Olandooooes/saymivo/pull/9) |
| 基线 | `local-wip-20261103` @ `b3d039b7765718b90ff073481fd2802abad71869` |
| 正文提交 | `357637edf8c968093c347d0dccb16f4a46cd069b`。请用本分支最新 head，并确认该提交是祖先 |
| 状态 | **未合并**。默认分支 `main`（`bf7c50de9102448e5e16e6dc2e32662a4371a2fc`）没有本包。合并前工作线的上述提交也没有本包 |

不要从 `main` 的 HANDOFF 开工，也不要读取 PR #8 里只到第 8 节的技能。PR #8 仍 open（head `cursor/picture-making-skill-737a` @ `5f18b30fd61ef54c00a9ed894f933f68b249f5c8`）。本包没有合并它，也没有改 PR #1、#3、#4、#5、#6。

产品工作台的剪辑、分镜和导出仍以仓库原有代码为准。本包不改那些功能。

## 优先顺序

1. 本页，确认分支和未合并状态。
2. [项目配置](project-config.md)。私有错题本全文不在仓库；配置说明公开快照如何作为可读副本，以及什么时候必须停。
3. [技能第 1–12 节](../../.cursor/skills/saymivo-picture-making/SKILL.md)。调用时执行第 12 节。目录说明见 [.cursor/skills/README.md](../../.cursor/skills/README.md)。
4. [开工检查](../../.cursor/skills/skill-1795151255813/SKILL.md)。
5. [公开执行清单](rules/制作执行清单-公开版.md) 与 [效力映射](rules/效力与来源映射.md)。先分清通用、项目限定、历史、待定。清单原文里的相对链接有落点页，那些页不是主档全文。
6. [阅读入口-公开版](rules/阅读入口-公开版.md)（公开导航，不增设规则）。
7. [风格配置](style/camera-and-caption.example.json)、[示例 ASS](style/caption-style.example.ass)、[字体许可与分发](style/fonts/FONT-LICENSE-AND-SOURCE.md)。参数留在配置里。
8. [参考视频拆解模板](参考视频拆解模板.md) 与 [动画验收要求](动画验收要求.md)。拆解第 1–9 节待填。[可公开事实](参考/可公开事实与方法.md)、[待填索引](参考/待填与缺项索引.md)。
9. [素材权利与缺项](assets/缺项与权利索引.md)。
10. 用户当期给出的新稿和原片。仓库里没有用户原片。

冲突时以项目配置写明的效力顺序为准。用户当次明确原话只覆盖它写明的范围。

## 素材四类（不是完整素材库）

| 类别 | 本仓库里有什么 |
| --- | --- |
| 在库可复用 | [中性夹具](fixture/README.md)：背景、示例字、窗口线稿、合成函数、示例关键帧。另有项目配置用的字幕样式和 OFL 字体文件 |
| 外链有许可 | 字体上游 release 与 OFL；王百能公开页面只留在拆解模板的链接里，无视频、无截图 |
| 私有不可公开 | 已认可插画源、19 页界面、人像、原声、逐字稿、产品历史数据。见缺项索引，文件不在树里 |
| 缺项 | 参考逐帧实测、可公开的插画库、用户当期原片、私有 CHARTER 全文、t86 核验记录原文 |

夹具图是虚构的「示例主题 / 示例重点 / 窗口线稿 / PIP 占位圆」。它不是产品成片，也不是已认可插画。

## 最小可重建入口

在仓库根目录：

```bash
python3 scripts/picture-making/verify-package.py
python3 scripts/picture-making/render-neutral-preview.py
```

第二条在系统临时目录里重做关键帧，并烧录示例 ASS。依赖：Python 3、Pillow、NumPy、FFmpeg（libass、libx264）。字体已在 `style/fonts/NotoSansSC-Bold.otf`。

退出码 0 是技术检查。看过的若只是导出的静帧，交付写「看过静帧」；没有播放视频就写「未看视频」；没有听音频就写「未听」。不要把脚本通过写成审美通过。2026-11-22 的一次实际输出记在 [verification/2026-11-22-neutral-rebuild.md](verification/2026-11-22-neutral-rebuild.md)：当时看过静帧，未看视频，未听。

当期口播不要用本夹具冒充样片。Codex 实测步骤：[CODEX-实测接续.md](CODEX-实测接续.md)。

## 追踪

技能与清单哈希：[rules/来源与哈希.txt](rules/来源与哈希.txt)。附件原件副本在 [snapshot/](snapshot/README.md)，那里的任务书不是现行开工规则。
