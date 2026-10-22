# 第三方来源与许可

Saymivo 基于 [AutoBroll](https://github.com/andriidrok1/autobroll)，原作者 Andrii Drok 的 MIT 声明保留在 [LICENSE](LICENSE)。快照信息见 [UPSTREAM.json](UPSTREAM.json)，不宣称与上游有官方合作关系。

随仓库字体保留原始许可文本，字体不因源码采用 MIT 而改变许可：

| 文件 | 来源项目 | 许可文件 |
|---|---|---|
| material-symbols.ttf | [Google Material Symbols](https://github.com/google/material-design-icons) | [Apache 2.0](public/fonts/LICENSE.txt) |
| source-han-sans-sc-heavy.otf | [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans) | [SIL OFL 1.1](public/fonts/source-han-sans-LICENSE.txt) |
| SmileySans-Oblique.ttf | [Smiley Sans / 得意黑](https://github.com/atelier-anchor/smiley-sans) | [SIL OFL 1.1](public/fonts/smiley-sans-OFL.txt) |
| douyin-sans-bold.ttf | [抖音美好体](https://www.douyin.com/) / Beijing Zitiao Network Technology | [随附 OFL](public/fonts/douyin-sans-OFL.txt) |
| zcool-qingke-huangyou.ttf | [ZCOOL QingKe HuangYou](https://github.com/googlefonts/zcool-qingke-huangyou) | [SIL OFL 1.1](public/fonts/zcool-qingke-huangyou-OFL.txt) |

依赖的准确版本见 package-lock.json / requirements-local.txt；各依赖保留自己的许可。特别是 [Remotion](https://www.remotion.dev/docs/license) 有单独适用条件，使用前按自身情况核对。FFmpeg 的许可取决于实际安装的构建；Python 工具和系统二进制不随源码分发。

faster-whisper 下载的模型、Gemini 与 Pexels 服务/素材适用其各自条款。仓库不打包语音模型或第三方素材，不授权未经许可的人像、音频或视频使用。

`docs/assets/` 中的开源演示由本仓库 `scripts/make-demo.py` 的抽象图形与预设演示文字生成，无真人、私人录音或外部素材；适用本仓库 MIT（渲染所用字体仍适用上述许可）。
