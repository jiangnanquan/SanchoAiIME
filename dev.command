#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DMG_PATH="$ROOT_DIR/dist/menubar-app/SanchoAiIME-arm64.dmg"
APP_PATH="$ROOT_DIR/dist/menubar-app/mac-arm64/SanchoAiIME.app"
DASHBOARD_PREVIEW="$ROOT_DIR/data/dashboard-preview.html"

print_menu() {
  cat <<'MENU'

SanchoAiIME 开发测试

1) 启动菜单栏开发版（推荐）
2) 跑全部测试
3) 跑发布检查
4) 重新打 macOS 包
5) 打开已打包 App
6) 打开 DMG 安装包
7) 生成并打开 Dashboard 预览
8) 打开 Rime 配置目录
9) 打开 macOS 输入法设置
q) 退出

MENU
}

ask() {
  local prompt="$1"
  local default_value="${2:-}"
  local answer
  read -r -p "$prompt" answer
  echo "${answer:-$default_value}"
}

quit_existing_sancho() {
  if ! pgrep -x "SanchoAiIME" >/dev/null 2>&1; then
    return
  fi

  local answer
  answer="$(ask "检测到 SanchoAiIME 正在运行。先退出它，避免打开旧窗口？[Y/n] " "Y")"
  case "$answer" in
    y|Y|yes|YES|Yes)
      osascript -e 'tell application "SanchoAiIME" to quit' >/dev/null 2>&1 || true
      sleep 1
      pkill -x "SanchoAiIME" >/dev/null 2>&1 || true
      ;;
    *)
      echo "继续运行；如果看到旧窗口，请先退出菜单栏里的 SanchoAiIME。"
      ;;
  esac
}

open_if_exists() {
  local path="$1"
  local missing_message="$2"
  if [[ ! -e "$path" ]]; then
    echo "$missing_message"
    return 1
  fi
  open "$path"
}

run_choice() {
  local choice="$1"
  case "$choice" in
    ""|1)
      quit_existing_sancho
      echo "启动菜单栏开发版。停止时按 Ctrl+C。"
      npm run menubar:dev
      ;;
    2)
      npm test
      ;;
    3)
      npm run release:check
      ;;
    4)
      npm run menubar:package:mac
      ;;
    5)
      open_if_exists "$APP_PATH" "还没有打包 App，请先选 4。"
      ;;
    6)
      open_if_exists "$DMG_PATH" "还没有 DMG，请先选 4。"
      ;;
    7)
      mkdir -p "$ROOT_DIR/data"
      node packages/dashboard/bin/sancho-dashboard.js render \
        --state packages/dashboard/examples/dashboard-state.example.json \
        --output "$DASHBOARD_PREVIEW"
      open "$DASHBOARD_PREVIEW"
      ;;
    8)
      mkdir -p "$HOME/Library/Rime"
      open "$HOME/Library/Rime"
      ;;
    9)
      open "x-apple.systempreferences:com.apple.Keyboard-Settings.extension"
      ;;
    q|Q)
      exit 0
      ;;
    *)
      echo "未知选择：$choice"
      return 1
      ;;
  esac
}

print_menu
choice="$(ask "请选择 [默认 1]: " "1")"
run_choice "$choice"
