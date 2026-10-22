# 安装、模型与排错

安装与首次模型下载需要网络；源码不含模型、依赖或个人素材。先按 [首页](../README.md) 安装。

| 组件 | 用途 | 是否必须 |
|---|---|---|
| Node.js 22+ / npm | 本地服务器、前端与 Remotion | 是 |
| Python 3.10–3.12 | faster-whisper、合成演示、音频工具 | 完整流程需要 |
| FFmpeg + ffprobe | 探测、转码、抽帧与音频处理 | 完整流程需要 |
| faster-whisper / small | 本地语音识别 | 识别时需要；首次下载 |
| Gemini API key | 可选字幕上下文校对、AI 编排/分析 | 否 |
| Pexels API key | 可选素材搜索 | 否 |

`.venv` 内的 imageio-ffmpeg 提供 FFmpeg，不能替代所有系统工具，尤其 ffprobe。运行 `ffmpeg -version` 和 `ffprobe -version` 检查。首次 Remotion 渲染还可能下载浏览器。可先使用已有本地浏览器配置。

## 配置

复制或编辑 `.env.example` 对应的本地 `.env`，不要提交密钥。`AUTOBROLL_LANGUAGE=zh`、`AUTOBROLL_DEVICE=cpu`、`AUTOBROLL_FACE_AWARE=0` 适合先跑本地中文流程。`AUTOBROLL_MODEL` 接受模型名称或已下载的 CTranslate2 模型目录，不能直接填任意 PyTorch 权重文件。GPU、额外对齐或人物分析依赖不属于基础安装保证。

## 常见问题

- 5188 / 3348 被占用：关闭已有 Saymivo 终端后重试，避免同时启动多份。
- Python 版本过新导致安装失败：安装 Python 3.12，保留旧环境供排查，使用 3.12 重新创建 `.venv` 后再 setup。
- 模型下载失败：检查网络，或设置本地模型目录。界面和图形演示不证明模型已经安装。
- 缺少 ffprobe：安装完整 FFmpeg 工具并重新打开终端。
- 导出失败：查看任务错误、磁盘空间、浏览器和 FFmpeg；先试短合成工程，勿反复重新识别原片。
- 编辑工程但画面不符：核对素材相对路径、原片版本和源时间，切勿把不同素材的校对历史混用。

只绑定本机不等于已完成安全审计。不要在共享、不可信机器上处理敏感素材，不要公开 `public/` 或转发服务端口。
