#!/bin/zsh
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"
node scripts/launch.mjs
