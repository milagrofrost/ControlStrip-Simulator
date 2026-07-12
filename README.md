# ControlStrip Simulator

ControlStrip Simulator is a Linux/X11 desktop utility inspired by the classic Mac OS Control Strip. It renders a small strip of image-based panes at the bottom-left of the screen, shows pinned apps from a YAML config file, detects visible running app windows, marks open apps with an arrow pane, and lets you launch or focus apps from the strip.

This is a retro desktop utility for small X11 sessions, Raspberry Pi builds, and classic Mac-inspired Linux environments. It is not a Wayland-first panel replacement and it is not a full desktop shell.

<img width="208" height="41" alt="image" src="https://github.com/user-attachments/assets/87228a87-12e0-4989-9dcf-b5a24046832c" />


## What it does

- Runs as a Tauri 2 app with a TypeScript/Vite frontend and Rust backend.
- Uses a frameless transparent window so the strip can float on the desktop.
- Positions itself at the physical bottom-left of the current or primary monitor.
- Reads pinned apps from `~/.local/share/control-strip/config.yaml`.
- Parses Linux `.desktop` files for app name, icon, command validation, comments, and `StartupWMClass`.
- Launches pinned apps through `gio launch`, with `dex` as a fallback.
- Polls X11 every 2 seconds for visible normal application windows.
- Matches running windows to pinned apps by config override, `StartupWMClass`, or a weak filename/name fallback.
- Adds temporary panes for running apps that are not pinned.
- Focuses open app windows through `wmctrl -ia`.
- Lets the strip collapse, scroll, tail-drag resize, and snap back to a configured pane count.
- Shrinks the transparent Tauri host window to hug the visible strip content so it does not swallow clicks over the desktop.
- Provides a long-press window list for open apps that have detected windows.

## Current limits

- X11 is the target. Wayland and XWayland may partly work, but detection and focusing are unreliable there.
- Window detection depends on `xdotool`, `xprop`, `jq`, and normal EWMH window properties.
- Focusing depends on `wmctrl` and on your window manager allowing focus or raise requests.
- The app launches only configured pinned `.desktop` files. Temporary running-app panes can be focused, but they are not launchers.
- Long-press currently shows detected windows, but choosing a specific row only closes the menu in the current frontend. Normal click on the app pane focuses the app's detected windows.
- A compositor is required for the transparent window to look correct.
- This is not a sandbox. A pinned `.desktop` file can run whatever its `Exec=` line runs.

## Requirements

Runtime packages for window detection, launching, and focusing:

```bash
sudo apt update
sudo apt install -y \
  xdotool \
  x11-utils \
  jq \
  wmctrl \
  libglib2.0-bin \
  dex
```

What those packages provide:

- `xdotool`: finds visible X11 windows.
- `xprop`: reads X11 window type, state, title, class, and PID. It is provided by `x11-utils` on Debian/Ubuntu.
- `jq`: builds and formats the JSON returned by `scripts/window-check.sh`.
- `wmctrl`: focuses or raises detected windows.
- `gio`: launches `.desktop` files. It is usually provided by `libglib2.0-bin`.
- `dex`: optional fallback launcher for `.desktop` files.

Development and build requirements:

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libxdo-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Install Rust if you do not already have it:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Install Node.js and npm. Node 20 or newer is a good baseline for this Tauri/Vite project.

## Install from source

Clone the repository:

```bash
git clone https://github.com/milagrofrost/ControlStrip-Simulator.git
cd ControlStrip-Simulator
```

Install JavaScript dependencies:

```bash
npm install
```

Run the real Tauri app:

```bash
npm run dev:tauri
```

Run only the browser/Vite frontend preview:

```bash
npm run dev
```

Browser preview mode is useful for visual work, but it cannot detect or focus real X11 windows because the Tauri backend is not running.

## Build and install a Debian package

Build the frontend and Tauri app:

```bash
npm run build:tauri
```

The Debian package is written under:

```text
src-tauri/target/release/bundle/deb/
```

Install it with:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb
```

After package installation, the binary is expected to be available as:

```text
/usr/bin/controlstrip-simulator
```

Run it manually with:

```bash
controlstrip-simulator
```

## Local binary install

For a user-local install from source:

```bash
npm run build:tauri
mkdir -p ~/.local/bin
install -m 755 src-tauri/target/release/controlstrip-simulator ~/.local/bin/controlstrip-simulator
```

Make sure `~/.local/bin` is on your `PATH`, or run it by absolute path:

```bash
~/.local/bin/controlstrip-simulator
```

## Autostart with systemd user service

For a Debian package install, create:

```text
~/.config/systemd/user/controlstrip-simulator.service
```

With:

```ini
[Unit]
Description=ControlStrip Simulator
Documentation=https://github.com/milagrofrost/ControlStrip-Simulator
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/controlstrip-simulator
Restart=on-failure
RestartSec=2
WorkingDirectory=%h/.local/share/control-strip

[Install]
WantedBy=default.target
```

For a local source install, use this `ExecStart` instead:

```ini
ExecStart=%h/.local/bin/controlstrip-simulator
```

Enable and start the user service:

```bash
systemctl --user daemon-reload
systemctl --user enable --now controlstrip-simulator.service
```

Check status:

```bash
systemctl --user status controlstrip-simulator.service
```

View logs:

```bash
journalctl --user -u controlstrip-simulator.service -f
```

Important: the included `scripts/install-user-service.sh` copies the binary to `~/.local/bin/controlstrip-simulator`, but the included service file currently uses `/usr/bin/controlstrip-simulator`. For now, either install the Debian package so `/usr/bin/controlstrip-simulator` exists, or use the manual user-service file above with `%h/.local/bin/controlstrip-simulator`.

## First run behavior

On startup, ControlStrip Simulator creates this config directory if it does not exist:

```text
~/.local/share/control-strip/
```

It also creates this file if it does not exist:

```text
~/.local/share/control-strip/config.yaml
```

Default generated config:

```yaml
# ControlStrip Simulator config
# Window placement is native Tauri window geometry in physical screen pixels.
window:
  left: 71
  width: 600
  height: 200

# Optional strip sizing behavior. Omit visible_icons to show all panes and expand
# as new panes appear. Set it to snap back to that many icons after tail dragging.
# strip:
#   visible_icons: 3
#   snap_back_seconds: 10
#
# Add pinned Linux .desktop files here.
# Most apps only need desktop_file. Use match only when automatic matching fails.
#
# pinned_apps:
#   - desktop_file: "/usr/share/applications/firefox.desktop"
#   - desktop_file: "/usr/share/applications/chromium.desktop"
#     match:
#       wm_class: "chromium"
#       title_contains: "Weather"
pinned_apps: []
```

Restart the app after editing config.

## Configuration reference

### `window`

`window` controls the initial native Tauri window geometry in physical screen pixels.

```yaml
window:
  left: 71
  width: 600
  height: 200
```

- `left`: pixels from the left edge of the current or primary monitor.
- `width`: initial native window width.
- `height`: initial native window height.

The backend anchors the strip to the physical bottom of the monitor. The frontend then measures the actual visible strip and asks Tauri to resize the transparent window to the content footprint.

### `screenCorner`

`screenCorner` controls the visual mask used when the strip sits against a rounded bottom-left display corner.

```yaml
screenCorner:
  enabled: true
  position: bottom-left
  radius: 18
  color: "#000000"
```

- `enabled`: show or hide the visual corner overlay.
- `position`: currently supports `bottom-left`.
- `radius`: corner radius in CSS pixels.
- `color`: overlay color.

### `strip`

`strip` controls how many panes are visible and how tail-drag resizing behaves.

```yaml
strip:
  visible_icons: 3
  snap_back_seconds: 10
```

- `visible_icons`: optional. When omitted, all panes are shown and the strip grows as apps appear. When set, that many panes are shown by default.
- `snap_back_seconds`: how long after tail dragging before the strip returns to `visible_icons`. Default is `10`.

Set `snap_back_seconds: 0` if you want snap-back to happen immediately after dragging.

### `pinned_apps`

Pinned apps are listed in config order.

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/firefox.desktop"
  - desktop_file: "/usr/share/applications/xfce4-terminal.desktop"
```

Each pinned app usually only needs `desktop_file`.

Accepted path styles:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/firefox.desktop"
  - desktop_file: "~/.local/share/applications/my-kiosk.desktop"
```

The path must resolve to an actual `.desktop` file.

## `.desktop` file rules

A pinned launcher is enabled when the `.desktop` file has:

```ini
[Desktop Entry]
Type=Application
Name=Some App
Exec=some-command
```

Validation rules:

- `Name=` is required.
- `Exec=` is required.
- `Type=Application` is required.
- `Hidden=true` disables the item.
- `NoDisplay=true` is allowed because the config is curated.
- The configured path must resolve to a file ending in `.desktop`.

ControlStrip reads these keys when present:

- `Name`: pane label.
- `Comment`: optional hover/help text source.
- `Icon`: pane icon.
- `Exec`: validated before launch, then launch is delegated to `gio` or `dex`.
- `StartupWMClass`: preferred matching hint for running windows.
- `Hidden`: disables the item when true.
- `NoDisplay`: allowed.

## Icons

ControlStrip reads the `.desktop` file's `Icon=` value.

Good icon values:

```ini
Icon=utilities-terminal
```

```ini
Icon=/home/YOUR_USER/.local/share/control-strip/icons/weather.png
```

Icon lookup checks:

```text
~/.local/share/icons/
/usr/share/pixmaps/
/usr/share/icons/
```

Supported icon file extensions for icon-name lookup:

```text
.png
.svg
.xpm
```

If the icon cannot be resolved, the pane displays a text placeholder using the first letter of the app label.

## Window matching

ControlStrip matches running windows to pinned apps in this order:

1. `match.wm_class` from `config.yaml`.
2. `StartupWMClass` from the `.desktop` file.
3. Weak fallback using the `.desktop` filename stem and app `Name` against `wm_class` and `wm_class_instance`.
4. Optional `match.title_contains`, when configured, must also match the window title.

Example override for Chromium kiosk windows:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/chromium.desktop"
    match:
      wm_class: "chromium"
      title_contains: "Weather"
```

Use `match` only when automatic matching is wrong or too broad.

## Control Strip behavior

- Closed pinned apps use the normal pane asset.
- Open pinned apps use the arrow pane asset.
- Running apps that are not pinned appear as temporary panes on the right.
- The head collapses the strip down to head and tail.
- Clicking the head while collapsed opens the strip again.
- The left and right controls scroll through panes when there are more apps than visible panes.
- Dragging the tail changes the visible pane count.
- After `snap_back_seconds`, the strip returns to the configured `visible_icons` count.
- Clicking a closed pinned app launches its `.desktop` file.
- Clicking an open app focuses its detected windows.
- Long-pressing an open app for 1 second opens a window list menu.
- Pressing Escape closes the open window list menu.

## Window detection

ControlStrip polls this project-local script:

```bash
bash scripts/window-check.sh
```

The script:

- Uses `xdotool search --onlyvisible --name .` to get visible windows.
- Uses `xprop` to read window type, state, title, class, and PID.
- Keeps only `_NET_WM_WINDOW_TYPE_NORMAL` windows.
- Skips windows with `_NET_WM_STATE_SKIP_TASKBAR`.
- Skips windows with `_NET_WM_STATE_SKIP_PAGER`.
- Returns JSON with `id`, `title`, `wm_class_instance`, `wm_class`, and optional `pid`.

Run it manually when matching does not make sense:

```bash
bash scripts/window-check.sh
```

Example output shape:

```json
[
  {
    "id": "0x03e00007",
    "title": "Mozilla Firefox",
    "wm_class_instance": "Navigator",
    "wm_class": "firefox",
    "pid": 1234
  }
]
```

Compare `wm_class` and `wm_class_instance` with your `.desktop` file's `StartupWMClass`.

## Useful commands

Run in development:

```bash
npm run dev:tauri
```

Run frontend preview only:

```bash
npm run dev
```

Build frontend only:

```bash
npm run build
```

Build Tauri package:

```bash
npm run build:tauri
```

Preview built frontend:

```bash
npm run preview
```

Inspect current config:

```bash
cat ~/.local/share/control-strip/config.yaml
```

Inspect detected windows:

```bash
bash scripts/window-check.sh
```

Inspect window geometry:

```bash
wmctrl -lG
```

## Troubleshooting

### The strip shows `No pinned apps`

Edit:

```text
~/.local/share/control-strip/config.yaml
```

Add at least one pinned app:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/xfce4-terminal.desktop"
```

Restart the app.

### A pinned app is disabled

Check the `.desktop` file:

```bash
grep -E '^(Type|Name|Exec|Hidden|NoDisplay|StartupWMClass|Icon)=' /usr/share/applications/xfce4-terminal.desktop
```

Make sure it has:

```ini
Type=Application
Name=...
Exec=...
```

And make sure it does not have:

```ini
Hidden=true
```

### An app launches but does not show as open

Run:

```bash
bash scripts/window-check.sh
```

Find the window's `wm_class` or `wm_class_instance`, then add a match override:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/my-app.desktop"
    match:
      wm_class: "actual-wm-class"
```

Restart the app.

### Chromium, kiosk apps, or browser profiles match too broadly

Use both `wm_class` and `title_contains`:

```yaml
pinned_apps:
  - desktop_file: "/usr/share/applications/chromium.desktop"
    match:
      wm_class: "chromium"
      title_contains: "Weather"
```

### Apps do not launch

Try launching the `.desktop` file directly:

```bash
gio launch /usr/share/applications/xfce4-terminal.desktop
```

Then try the fallback:

```bash
dex /usr/share/applications/xfce4-terminal.desktop
```

If both fail, fix the `.desktop` file or install the target app.

### Apps do not focus

Try focusing a detected window manually:

```bash
wmctrl -ia 0x03e00007
```

Replace the window id with one from:

```bash
bash scripts/window-check.sh
```

Some window managers block focus stealing. Wayland sessions are especially unreliable for this.

### The strip is visible as a black or opaque rectangle

The Tauri window is transparent, but Linux transparency depends on your compositor. Enable compositing in XFCE, Openbox with a compositor, or your chosen X11 session.

### The strip is in the wrong place

Edit:

```text
~/.local/share/control-strip/config.yaml
```

Change:

```yaml
window:
  left: 71
  width: 600
  height: 200
```

Restart the app. The app anchors to the bottom of the monitor and uses `left` as the horizontal offset.

### The strip window blocks clicks outside the visible strip

The frontend measures the visible content and calls the backend `resize_strip_window` command. If the transparent window still blocks clicks, check the logs:

```bash
journalctl --user -u controlstrip-simulator.service -f
```

Or run manually from a terminal:

```bash
controlstrip-simulator
```

Look for `resize_strip_window` messages and window geometry logs.

### The systemd service is not found

Use the exact service name:

```bash
systemctl --user status controlstrip-simulator.service
```

Not:

```bash
systemctl status controlstrip-simulator
```

Systemd user services require `--user` unless you intentionally installed a system-level service.

## Project structure

```text
src-tauri/src/
  main.rs        Rust binary entrypoint
  lib.rs         Tauri setup, config creation, .desktop parsing, window matching,
                 launch/focus commands, X11 polling bridge, and window placement

src/
  main.ts              Frontend bootstrap
  ControlStrip.ts      Strip rendering, collapse, scrolling, tail drag, long press menu
  controlStripModel.ts Tauri command wrappers, polling, running-window merge logic
  ControlStrip.css     Strip layout and pixel-art pane styling
  style.css            App/global styling
  assets/control-strip Classic-style strip PNG parts

scripts/
  window-check.sh           X11 visible-window discovery script
  install-user-service.sh   Helper for building and installing a user service

packaging/systemd/user/
  controlstrip-simulator.service
```

## Security model

The frontend does not send arbitrary command strings to Rust. It sends selected app ids and window ids.

The Rust backend reloads config, resolves the app id back to a pinned `.desktop` file, validates the launcher, and delegates launch to `gio` or `dex`.

Window focusing validates the requested app id, resolves matching detected X11 window ids, validates window id format, and calls `wmctrl -ia`.

This is safer than accepting raw commands from the webview, but the trust boundary is still the user's config and `.desktop` files. Only pin launchers you trust.

## License

No explicit license file is currently present in this repository.
