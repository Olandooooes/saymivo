# 18 秒图形演示 · 无真人、无声音

<p align="center">
  <img src="assets/demo.png" alt="实际渲染帧：字幕、重点字与图形背景" width="300" />
</p>

上图是 `MultiClip` 实际组件第 130 帧，不是概念设计稿。预设字幕展示文字排版和动效；合成波形不是音频识别结果。本演示不含人像、私人录音、转写或聊天截图，不用来证明自动口播质量。

## 在界面体验

按 [安装步骤](../README.md) 启动后，打开首页的「演示工程」或「打开演示工程」。工作台创建 18 秒图形视频和带预设文字的可编辑工程，可以预览、改字幕与镜头，然后导出。无需 Gemini / Pexels 密钥，也无需语音模型。生成图形需基础 Python 依赖。

## 开发者复现这张图

```sh
npm run setup
node scripts/create-open-demo.mjs
npx remotion still src/index.ts MultiClip docs/assets/demo.png --props=public/open-demo.json --frame=130
```

生成器复用生产 `/api/demo` 处理函数，输出 `public/open-demo.json`，原素材在 `public/clips/studio-demo.mp4`。这些运行文件被忽略，其他个人工程不会被读取或修改。已有同名图形素材会复用，首次运行才生成；如要重新生成，请先把旧合成素材改名保留。

用 `npm run studio` 可打开同一 `MultiClip` 组件；将 `public/open-demo.json` 用作 props。也可在工作台直接导出合成演示 MP4。首次渲染可能下载浏览器，速度依赖电脑与网络。

## 演示范围

已检查：合成工程生成、实际视频组件单帧渲染、可公开画面内容。没有重新运行语音识别、私人样片或完整口播渲染。有关自动布局、不同背景与长片的限制见 [首页](../README.md)。
