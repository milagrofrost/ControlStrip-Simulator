# Pin and unpin implementation

- Right-clicking an application pane opens a small context menu.
- Pinned panes offer **Unpin from Strip**.
- Temporary running panes offer **Pin to Strip** when a matching installed `.desktop` file can be resolved from WM_CLASS.
- Pin and unpin operations update `~/.local/share/control-strip/config.yaml` through Tauri commands and reload the model immediately.
- Pinned YAML entries accept an optional `icon` property that overrides the `.desktop` file icon.
