# 给 Codex 的实测接续

只使用本仓库，加上用户当场给出的当期稿和原片。不要向用户重新索要已经在仓库里的通用规则。不要从 `main` 开工。

## 1. 先核对检出

`main`（`bf7c50de9102448e5e16e6dc2e32662a4371a2fc`）落后，没有本制作包。
尚未合并本 PR 的 `local-wip-20261103`（`b3d039b7765718b90ff073481fd2802abad71869`）也没有本包。
PR #8 的 `cursor/picture-making-skill-737a`（`5f18b30fd61ef54c00a9ed894f933f68b249f5c8`）只有技能第 1–8 节，不要用它重建。

```bash
git fetch origin cursor/picture-making-pack-94e7
git checkout cursor/picture-making-pack-94e7
git rev-parse HEAD
git status -sb
```

`status` 必须显示 `cursor/picture-making-pack-94e7`。`rev-parse` 的结果与本 PR 的 head 一致后再继续。不要改用 `main`。制作包正文提交是 `357637edf8c968093c347d0dccb16f4a46cd069b`；本说明若在其后的提交里，用下面的命令确认正文仍是当前 head 的祖先：

```bash
git merge-base --is-ancestor 357637edf8c968093c347d0dccb16f4a46cd069b HEAD
```

## 2. 按这个顺序读

1. [README.md](README.md)
2. [project-config.md](project-config.md)
3. [../../.cursor/skills/saymivo-picture-making/SKILL.md](../../.cursor/skills/saymivo-picture-making/SKILL.md) 全文，并按第 12 节核对
4. [../../.cursor/skills/skill-1795151255813/SKILL.md](../../.cursor/skills/skill-1795151255813/SKILL.md)
5. [rules/制作执行清单-公开版.md](rules/制作执行清单-公开版.md) 与 [rules/效力与来源映射.md](rules/效力与来源映射.md)
6. [style/](style/)：字幕和圆窗以 JSON / ASS 为准，不要改技能正文，也不要另猜像素
7. [参考视频拆解模板.md](参考视频拆解模板.md)、[动画验收要求.md](动画验收要求.md)、[assets/缺项与权利索引.md](assets/缺项与权利索引.md)

私有 CHARTER-v1.13 全文不在仓库。按项目配置把公开快照当作可读副本，把「没有私有全文」和「t86 核验记录原文不在仓库」写进缺项。不要停在 box 路径上，也不要编造主档里没公开的句子。用户若另外给了文件，先核 SHA256 `ad691aa296b45ec85cca832c5b8b524e14ebcf914ea8bcd57c3723c323efd5a7`。不符就停。

拆解第 1–9 节仍是待填。不要写成已经逐帧研究，也不要去补官方后台或第三方原片。

## 3. 先做仓库里的技术关卡

在仓库根目录、且不使用用户原片：

```bash
python3 scripts/picture-making/verify-package.py
python3 scripts/picture-making/render-neutral-preview.py
```

依赖：Python 3、Pillow、NumPy、FFmpeg（需 libass 与 libx264）。字体在 `docs/picture-making/style/fonts/NotoSansSC-Bold.otf`，OFL 1.1，随仓库分发。第二条会在新建的临时目录里重建中性关键帧并烧录示例字幕。

这两条通过，只说明文件、规则链接、字体和夹具管线。不是审美通过，也不是当期样片。脚本输出里的「未看视频 / 未听」保持为真，除非你自己另外播放并写明。

## 4. 再用当期输入做最小样片

用户会另行提供当期稿和原片。那些文件不要提交进公共仓库。

按关卡做，不要自动往下冲：

1. 核对当期文件是否真的在手头。没有原声就只做稿件版，声音时间写 `null`，不要伪称逐字或词级对齐。
2. 先做逐句映射、检索和必要静帧或关键状态。解释层和字幕分开。对象按语义留下，不用整页推拉代替内容。
3. 真实动态短样要等用户授权，并保留原声、真人圆窗和实拍背景。圆窗几何用项目配置里的示例，不要把它写成所有项目的默认。
4. 把样片交给用户实际看、听。技术问题和审美分开，状态只用：通过、未通过、未检查、待用户确认。
5. 缺项照实写。至少包括：私有主档全文未随仓库提供、可公开插画库未建立、参考拆解未实测、当期若缺音频或授权则写明。样式文件在仓库里，不等于素材库已授权。

不要做：全片、发布、改写已锁定的旧段、用旧的 18 页包或技能第 1–8 节重做、把某一版样式认可扩大成全部素材可公开。未再得到明确许可，不要做后面的段落。

## 5. 提交指针

- 分支：`cursor/picture-making-pack-94e7`
- PR：[https://github.com/Olandooooes/saymivo/pull/9](https://github.com/Olandooooes/saymivo/pull/9)（未合并）
- 基线：`local-wip-20261103` @ `b3d039b7765718b90ff073481fd2802abad71869`
- 制作包正文提交：`357637edf8c968093c347d0dccb16f4a46cd069b`
- 请检出本分支的 PR head（含本指针的最新提交），不要检出 `main`
- 本 PR 未合并。`main` 未更新。
