#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="controlstrip-simulator"
SOURCE_BINARY="${CONTROLSTRIP_BINARY:-$ROOT_DIR/src-tauri/target/release/$APP_NAME}"
INSTALL_BINARY="$HOME/.local/bin/$APP_NAME"
DATA_DIR="$HOME/.local/share/control-strip"
SERVICE_SOURCE="$ROOT_DIR/packaging/systemd/user/controlstrip-simulator.service"
SERVICE_TARGET="$HOME/.config/systemd/user/controlstrip-simulator.service"

if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo was not found on PATH. Install Rust or add ~/.cargo/bin to PATH." >&2
  exit 1
fi

if [ ! -x "$SOURCE_BINARY" ]; then
  echo "Building release binary..."
  (cd "$ROOT_DIR" && npm run build:tauri)
fi

if [ ! -x "$SOURCE_BINARY" ]; then
  echo "Release binary was not found at $SOURCE_BINARY" >&2
  exit 1
fi

install -Dm755 "$SOURCE_BINARY" "$INSTALL_BINARY"
install -Dm755 "$ROOT_DIR/scripts/window-check.sh" "$DATA_DIR/scripts/window-check.sh"
install -Dm644 "$SERVICE_SOURCE" "$SERVICE_TARGET"

systemctl --user daemon-reload
systemctl --user enable --now controlstrip-simulator.service

cat <<EOF
Installed ControlStrip Simulator user service.

Binary:  $INSTALL_BINARY
Service: $SERVICE_TARGET
Script:  $DATA_DIR/scripts/window-check.sh

Check status:
  systemctl --user status controlstrip-simulator.service

View logs:
  journalctl --user -u controlstrip-simulator.service -f
EOF
