# ControlStrip Simulator

ControlStrip Simulator is a Linux/X11 desktop utility inspired by the classic Mac OS Control Strip. It renders a small strip of image-based panes at the bottom-left of the screen, shows pinned apps from a YAML config file, detects running app windows including minimized windows, marks open apps with an arrow pane, and lets you launch or focus apps from the strip.

## Configuration

The application reads:

```text
~/.local/share/control-strip/config.yaml
```

Exclude exact, case-sensitive window titles from Control Strip task tracking with:

```yaml
window_filters:
  exclude_titles:
    - "AtEase"
    - "Clippy"
    - "piforma-panel"
```

These exclusions are intended for PiForma shell components that should remain visible but should not appear as regular running applications in Control Strip.

Pinned applications remain configured under `pinned_apps`:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/firefox.desktop"
```

## Requirements

```bash
sudo apt install xdotool x11-utils jq wmctrl libglib2.0-bin dex
```

## Development

```bash
npm install
npm run dev:tauri
```

Use `npm run dev` only for browser-based visual work. Real X11 window detection and activation require the Tauri backend.
