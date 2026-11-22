# 字幕字体：许可、来源与是否随仓库分发

## 附件原约束（保留）

附件说明写明：实际使用的家族是 **Noto Sans SC**，libass 选择 `NotoSansSC-Bold`；许可是 SIL Open Font License 1.1；附件本身不打包字体二进制。字体和字号留在项目配置，不写进通用 skill，也不升成所有项目的默认。

附件原文副本：[snapshot/FONT-LICENSE-AND-SOURCE.attachment.md](../../snapshot/FONT-LICENSE-AND-SOURCE.attachment.md)。

## 本仓库的分发决定

本 PR **随仓库分发一份未修改的 Bold 文件**，这样只克隆仓库就能命中示例 ASS 里的 `Fontname`。没有改名字，没有做子集，没有把其他字重一起放进来。

| 项 | 值 |
| --- | --- |
| 文件 | `NotoSansSC-Bold.otf`（同目录） |
| 名称表 | Family `Noto Sans SC`，Subfamily `Bold`，PostScript `NotoSansSC-Bold`，usWeightClass 700 |
| SHA256 | `c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0` |
| 取自 | [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004) 标签 `Sans2.004` 的 `18_NotoSansSC.zip` 内 `NotoSansSC-Bold.otf` |
| 版权 | 字体名称表 Copyright：© 2014-2021 Adobe（http://www.adobe.com/） |
| 商标 | Noto 是 Google Inc. 的商标 |
| 许可全文 | 同目录 [OFL.txt](OFL.txt)（来自上述 zip 的 `LICENSE`，SHA256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`） |
| 家族页面 | https://fonts.google.com/specimen/Noto+Sans+SC |
| 许可说明 | https://openfontlicense.org |

OFL 允许把字体和软件放在一起分发，条件是保留许可、不单独售卖字体。本文件按原样附上。渲染脚本复制到临时 `fontsdir` 时只复制这个 `.otf`，不把 `OFL.txt` 或本说明放进 `fontsdir`。

示例 ASS 使用该家族、64 号、白字与黄色 `#F4DA60`。这些是项目配置示例，不是跨项目默认。
