#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
[ -d node_modules ] || npm ci --no-audit --no-fund
if [ ! -x .venv/bin/python ]; then
  PYTHON_BIN="$(command -v python3.12 || command -v python3)"
  "$PYTHON_BIN" -m venv .venv
fi
.venv/bin/pip install -r requirements-local.txt
.venv/bin/python -c 'import faster_whisper,imageio_ffmpeg'
touch .venv/bin/faster-whisper-ready
mkdir -p .tools/bin
FFMPEG_LOCAL=$(.venv/bin/python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')
ln -sf "$FFMPEG_LOCAL" .tools/bin/ffmpeg
[ -f .env ] || printf 'AUTOBROLL_LANGUAGE=zh\nAUTOBROLL_DEVICE=cpu\nAUTOBROLL_FACE_AWARE=0\n' > .env
echo '依赖已就绪。双击「启动Saymivo.command」即可打开工作台。'
