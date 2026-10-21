# Saymivo

A local talking-head video workbench. Turn your recording into an edited video with Chinese captions, conservative terminology correction, pause trimming and animated layouts.

本地口播视频工作台：上传真人原片，一键完成字幕、术语纠错、保护语音的停顿裁剪、内容动效和 1080p MP4 导出。

## Features

- 本地 faster-whisper 中文语音识别，个人术语词库与纠错对照。
- 保留源时间戳的剪辑与字幕，镜头缩放、重点弹字、信息卡片、圆形小窗。
- 简洁口播、知识讲解、动态讲义三种模板；横屏和竖屏输出。
- 实时预览、工程保存、后台任务进度、取消与失败重试。
- 可选 Gemini 上下文校对与上游 AI 功能；基本本地流程无需 API 密钥。

## Quick start (macOS)

目前在 Apple Silicon macOS 上验证；尚未完成 Windows/Linux 安装验证。需要 Node.js 20.11+（建议 22+）、npm、Python 3.10–3.12（建议 3.12）和 zsh。首次安装需要网络。

```sh
git clone https://github.com/Olandooooes/saymivo.git
cd saymivo
npm run setup
npm start
```

打开 http://127.0.0.1:5188/ 。安装后也可以双击 `启动 Saymivo.command`。保持启动窗口运行，关闭浏览器不会停止后台剪辑。

安装脚本会创建 `.venv`，安装 faster-whisper 和 FFmpeg，并创建本地 `.env`。首次识别默认下载多语言 small 模型，下载速度取决于网络；已有模型可通过 `AUTOBROLL_MODEL` 指定本地目录。识别速度取决于电脑性能和原片长度。

若提示缺少 ffprobe 或视频引擎，在 macOS 安装 FFmpeg（例如已有 Homebrew 时运行 `brew install ffmpeg`），重启工作台。启动端口为 5188 和 3348，均仅监听本机。

## Workflow

1. 选择模板、横竖屏和字幕校对方式。
2. 拖入 MP4/MOV/WebM，默认自动开始一键剪辑。
3. 完成后预览、查看纠错对照，必要时打开工程微调。
4. 下载 MP4；刷新页面可继续查看当前任务。

## Data and optional services

原片、工程、字幕和导出保存在 `public/`；后台任务在 `.auto-jobs/`，个人词库在 `.proofread.json`。这些均被 Git 忽略。语音模型、依赖、密钥和用户素材不随源码分发。

默认本地识别与术语纠错。选择 Gemini 校对会发送字幕文字与术语信息；其他可选 AI 功能可能发送选定文本或画面，请先查看服务配置。Pexels 素材搜索也需要网络。参考 `.env.example` 配置可选密钥，勿提交 `.env`。

## Development

React + TypeScript + Vite UI, local Node.js server, FFmpeg, faster-whisper, Remotion preview/rendering.

```sh
npm run check
```

包含类型检查、单元测试与前端构建。语音识别和完整视频渲染还需要本地依赖与实际素材。自动纠错可能遗漏或误判，重要人名、数字与专有名词应听原声核对。讲义图片需自行提供；没有自动生成任意专业配图、抠像或完整人脸跟踪。当前不是独立桌面安装包，也不是面向公网的多用户服务。

## Credits and license

Saymivo is derived from [AutoBroll](https://github.com/andriidrok1/autobroll). Original MIT copyright notice is preserved in `LICENSE`; upstream snapshot information is in `UPSTREAM.json`. Local modifications add the Chinese workflow, one-click pipeline, proofreading and presentation templates.

Bundled Material Symbols font retains its Apache 2.0 license in `public/fonts/LICENSE.txt`. Third-party dependencies, models and media retain their own terms; Remotion licensing should be reviewed for your intended usage. MIT covers this repository's applicable source code, not a blanket license for external services or assets.
