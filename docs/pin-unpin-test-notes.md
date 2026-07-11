# Pin and unpin validation

1. Start Control Strip under X11/Openbox.
2. Right-click a temporary running application pane and choose **Pin to Strip**.
3. Confirm `~/.local/share/control-strip/config.yaml` gains a `pinned_apps` entry and the pane updates immediately.
4. Add an `icon:` path inside that pinned entry and refresh the model by pinning or unpinning another item.
5. Right-click the pinned pane and choose **Unpin from Strip**.
6. Confirm the YAML entry is removed. If the application is still running, its pane remains as a temporary running pane.
