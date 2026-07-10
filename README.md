# ControlStrip Simulator

ControlStrip Simulator is a Linux/X11 desktop utility inspired by the classic Mac OS Control Strip. It renders a small strip of image-based panes at the bottom-left of the screen, shows pinned apps from a YAML config file, detects visible running app windows, marks open apps with an arrow pane, and lets you launch or focus apps from the strip.

This is a retro desktop utility for small X11 sessions, Raspberry Pi builds, and classic Mac-inspired Linux environments. It is not a Wayland-first panel replacement and it is not a full desktop shell.

## What it does

- Runs as a Tauri 2 app with a TypeScript/Vite frontend and Rust backend.
- Uses a frameless transparent window so the strip can float on the desktop.
- Positions itself at the physical bottom-left of the current or primary monitor.
- Reads pinned apps from `~/.local/share/control-strip/config.yaml`.
- Parses Linux `.desktop` files for app name, icon, command validation, comments, and `StartupWMClass`.
- Launches pinned apps through `gio launch`, with `dex` as a fallback.
- Polls X11 every 2 seconds for normal application windows, including minimized windows.
- Matches running windows to pinned apps by config override, `StartupWMClass`, or a weak filename/name fallback.
- Adds temporary panes for running apps that are not pinned.
- Focuses open app windows through `wmctrl -ia`.
- Lets the strip collapse, scroll, tail-drag resize, and snap back to a configured pane count.
- Shrinks the transparent Tauri host window to hug the visible strip content so it does not swallow clicks over the desktop.
- Provides a long-press window list for open apps that have detected windows.

## Window exclusions

Exact, case-sensitive window titles can be excluded from task tracking in `config.yaml`:

```yaml
window_filters:
  exclude_titles:
    - "AtEase"
    - "Clippy"
    - "piforma-panel"
```

## Requirements

```bash
sudo apt update
sudo apt install -y xdotool x11-utils jq wmctrl libglib2.0-bin dex
```

## Development

```bash
npm install
npm run dev:tauri
```

Browser preview mode is available with `npm run dev`, but it cannot detect or focus real X11 windows because the Tauri backend is not running.
