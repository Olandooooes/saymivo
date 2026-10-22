# Saymivo

A local Chinese talking-head video workbench built on AutoBroll, React, TypeScript and Remotion. Editable captions, terminology correction, pause trimming, storyboard scenes, screen recordings, highlights and MP4 export.

[中文完整文档](README.md) · [Synthetic demo](docs/demo.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

![Actual render of the synthetic demo](docs/assets/demo.png)

The demo uses generated graphics and preset captions, with no person or voice. It demonstrates layout and animation, not transcription accuracy.

## Run on macOS

Validated platform: Apple Silicon macOS. Install Node.js 22+, npm, Python 3.10–3.12 (3.12 recommended), zsh, and FFmpeg with ffprobe. Windows/Linux installation remains unverified.

```sh
git clone https://github.com/Olandooooes/saymivo.git
cd saymivo
# If Homebrew is available and FFmpeg is missing:
brew install ffmpeg
npm run setup
npm start
```

Open http://127.0.0.1:5188/. Keep the terminal running. The built-in demo avoids speech-model downloads. First transcription downloads the multilingual small model; `AUTOBROLL_MODEL` can point to a local CTranslate2 model directory. Downloads and rendering can take time.

Default transcription and terminology rules run locally without API keys. Optional Gemini features transmit selected text and/or frames; Pexels search uses its external API. Media, transcripts, projects and local review history are ignored by Git. This is a trusted-local tool, not a public multi-user service.

## Develop

```sh
npm ci
npm run check
```

Checks cover types, unit tests and frontend build, not full speech/render pipelines. Review captions, names, numbers, edits and framing manually. No general face tracking, cross-video quality guarantee or claimed 95% reference match.

Derived from [AutoBroll](https://github.com/andriidrok1/autobroll), with original MIT notice preserved. See [LICENSE](LICENSE), [upstream snapshot](UPSTREAM.json) and [third-party notices](THIRD_PARTY_NOTICES.md). Models, fonts, dependencies and services have separate terms.
