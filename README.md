# ControlStrip Simulator

ControlStrip Simulator is a Linux/X11 Control Strip-style dock. It shows pinned apps from a YAML config file, detects visible application windows, marks running apps with an arrow pane, and lets you launch or focus apps from the strip.

This is still an in-progress desktop app. It is currently aimed at small X11 desktop sessions and retro-style Linux environments, not Wayland-first desktop shells.

## Assumptions

Control Strip currently assumes:

- Linux desktop session using X11.
- An EWMH-compatible window manager.
- Visible normal application windows expose standard X11 properties through `xprop`.
- `.desktop` launchers exist under normal Linux application paths such as `/usr/share/applications`.
- App launching can be done through `gio launch`, with `dex` as an optional fallback.
- App focusing can be done through `wmctrl -ia`.
- A compositor is enabled if you want the frameless transparent window to look correct.

Wayland sessions are not a target yet. Some windows may appear through XWayland, but window detection and focusing should be treated as unreliable there.

## Runtime Requirements

For window detection and app control, install:

```sh
sudo apt install xdotool x11-utils jq wmctrl libglib2.0-bin
```

Optional fallback launcher:

```sh
sudo apt install dex
```

Package names vary by distribution:

- `xdotool` is used to find visible windows.
- `x11-utils` provides `xprop`.
- `jq` parses the discovery script output.
- `wmctrl` focuses or raises detected windows.
- `gio` is usually provided by GLib packages such as `libglib2.0-bin` on Debian/Ubuntu.
- `dex` can launch `.desktop` files if `gio launch` is unavailable.

## Development Requirements

To build or run from source, install Node.js, npm, Rust, and the Tauri Linux dependencies.

On Debian/Ubuntu-style systems, the Tauri v2 development packages are typically:

```sh
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Then install project dependencies:

```sh
npm install
```

Run the Tauri app:

```sh
npm run dev:tauri
```

Build:

```sh
npm run build
npm run build:tauri
```

## Config File

Control Strip reads:

```sh
~/.local/share/control-strip/config.yaml
```

If the file does not exist, the app creates it.

Example:

```yaml
window:
  left: 71
  width: 600
  height: 200

# Optional. Omit visible_icons to show all panes and expand as apps appear.
strip:
  visible_icons: 3
  snap_back_seconds: 10

pinned_apps:
  - desktop_file: "/usr/share/applications/firefox.desktop"
  - desktop_file: "/usr/share/applications/xfce4-terminal.desktop"
```

The normal pinned app entry only needs `desktop_file`.

### Window Placement

`window` controls the native Tauri window in physical screen pixels.

- `left`: pixels from the monitor’s left edge.
- `width`: native transparent window width.
- `height`: native transparent window height.

The backend keeps the window aligned to the physical bottom of the monitor. For example, `left: 71` places the strip window 71 pixels from the left edge.

### Strip Size

`strip.visible_icons` controls how many panes are shown by default.

- If `visible_icons` is omitted, Control Strip shows all panes and expands as new running apps appear.
- If `visible_icons` is set, you can pull the tail to show more or fewer panes.
- After `snap_back_seconds`, the strip returns to the configured pane count.

### Window Matching Overrides

Use `match` only when automatic matching fails or needs to be narrowed:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/chromium.desktop"
    match:
      wm_class: "chromium"
      title_contains: "Weather"
```

For each pinned app, Control Strip reads `Name`, `Icon`, `Exec`, and `StartupWMClass` from the `.desktop` file. `Name` becomes the pane label, `Icon` is used when resolvable, `Exec` is validated for launching but is not exposed to the frontend, and `StartupWMClass` is used to match running windows when available.

`match.wm_class` is usually not required if the `.desktop` file has `StartupWMClass`. Add it only for apps where automatic matching fails. `match.title_contains` is optional and can narrow a match for browser, kiosk, or multi-profile apps.

## Behavior

- Pinned apps always appear in config order.
- Closed pinned apps use `pane.png`.
- Open pinned apps use `pane_arrow.png`.
- Running apps that are not pinned appear temporarily on the right.
- Temporary running apps use `pane_arrow.png`.
- Hovering a pane shows the app/window class label.
- Click the head to collapse the strip down to just the head and tail.
- Click the head again while collapsed to fully open the strip.
- Pull the tail to temporarily resize the number of visible panes.
- Long-press an open app for 1 second to pick a specific window.
- Click an open app to bring its detected windows forward.
- Click a closed pinned app to launch its `.desktop` file.

## Window Detection

Control Strip polls the project-local script:

```sh
bash scripts/window-check.sh
```

The script intentionally filters to visible, normal application windows and skips panels, docks, desktop windows, hidden utility windows, skip-taskbar windows, and skip-pager windows.

Pinned app matching uses this order:

1. `match.wm_class` from config.
2. `StartupWMClass` from the `.desktop` file.
3. A weak fallback comparing the `.desktop` filename stem and app `Name` to `wm_class` and `wm_class_instance`.
4. If `match.title_contains` is configured, the window title must also contain that text.

## Troubleshooting

### Inspect Detected Windows

Run:

```sh
bash scripts/window-check.sh
```

Compare the returned `wm_class` and `wm_class_instance` fields with the app’s `.desktop` `StartupWMClass`. If they do not line up, add a `match.wm_class` override.

### Inspect X11 Geometry

If the strip exists but is not visible:

```sh
wmctrl -lG
```

Look for `ControlStrip Simulator` and check its `x`, `y`, `width`, and `height`.

### Transparent Window

The Tauri window is frameless and transparent so the Control Strip appears to float on the desktop. On Linux, transparency depends on the active compositor and window manager settings. If the window appears as an opaque rectangle, enable compositing in your desktop session.

### Apps Do Not Launch

Check that the configured `.desktop` file exists and has `Type=Application`, `Name`, and `Exec`. Control Strip uses `gio launch /path/to/app.desktop`, with `dex /path/to/app.desktop` as a fallback if installed.

### Apps Do Not Focus

Focus/raise currently uses:

```sh
wmctrl -ia <window_id>
```

If your window manager blocks focus stealing or you are on Wayland, focusing may fail or behave inconsistently.
