#!/usr/bin/env bash
# 安装并启动本机分镜模型。默认 Ollama 的 qwen2.5:7b，不调用付费接口。
set -u
MODEL="${PLAN_LLM_MODEL:-qwen2.5:7b}"
HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"

steps() {
  cat <<EOF
分三步装好本地分镜模型：
1. 安装 Ollama：https://ollama.com/download （macOS 也可以 brew install ollama）
2. 在项目目录重新运行：bash scripts/setup-local-llm.sh
3. 启动工作台，打开「分镜审阅」，点「用 ${MODEL} 起草分镜」
EOF
}

if ! command -v ollama >/dev/null 2>&1; then
  echo "还没有找到 ollama 命令。"
  steps
  exit 1
fi

if ! curl -fsS --max-time 2 "${HOST}/api/tags" >/dev/null 2>&1; then
  echo "Ollama 未在运行，正在启动…"
  ollama serve >"${TMPDIR:-/tmp}/saymivo-ollama.log" 2>&1 &
  ready=0
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if curl -fsS --max-time 1 "${HOST}/api/tags" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "Ollama 没有启动成功。可以打开 Ollama 应用，或另开一个终端运行 ollama serve，然后再执行本脚本。"
    steps
    exit 1
  fi
fi

echo "正在拉取 ${MODEL}（只需一次）。"
if ! ollama pull "$MODEL"; then
  echo "模型没有拉取成功。确认网络后重新运行本脚本。"
  exit 1
fi
echo "本地模型已就绪：${MODEL}。"
echo "下一步：启动工作台，打开分镜审阅，点「用 ${MODEL} 起草分镜」。"
