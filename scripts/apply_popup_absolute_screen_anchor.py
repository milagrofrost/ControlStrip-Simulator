from pathlib import Path

control = Path('src/ControlStrip.ts')
text = control.read_text()
text = text.replace(
    "  onOpenWindowMenu?: (item: ControlStripItem, anchor: { left: number; top: number; width: number }) => void;",
    "  onOpenWindowMenu?: (item: ControlStripItem, anchor: { screenLeft: number; screenTop: number; width: number }) => void;",
    1,
)
text = text.replace(
    "    viewportHeight: number;\n",
    "    viewportHeight: number;\n    screenLeft: number;\n    screenTop: number;\n",
    1,
)
text = text.replace(
    "          left: anchorRect.left,\n          top: anchorRect.top,\n          width: anchorRect.width",
    "          screenLeft: anchorRect.screenLeft,\n          screenTop: anchorRect.screenTop,\n          width: anchorRect.width",
    1,
)
text = text.replace(
    "          right: anchorRect.right,\n          viewportHeight: anchorRect.viewportHeight",
    "          right: anchorRect.right,\n          viewportHeight: anchorRect.viewportHeight,\n          screenLeft: anchorRect.screenLeft,\n          screenTop: anchorRect.screenTop",
    1,
)
text = text.replace(
    "      const rect = pane.getBoundingClientRect();\n      const anchorRect = {\n        left: rect.left,\n        top: rect.top,\n        width: rect.width,",
    "      const rect = pane.getBoundingClientRect();\n      const screenOriginX = event.screenX - event.clientX;\n      const screenOriginY = event.screenY - event.clientY;\n      const anchorRect = {\n        left: rect.left,\n        top: rect.top,\n        width: rect.width,",
    1,
)
text = text.replace(
    "        right: rect.right,\n        viewportHeight: window.innerHeight",
    "        right: rect.right,\n        viewportHeight: window.innerHeight,\n        screenLeft: screenOriginX + rect.left,\n        screenTop: screenOriginY + rect.top",
    1,
)
control.write_text(text)

model = Path('src/controlStripModel.ts')
text = model.read_text()
text = text.replace(
    "export interface WindowMenuAnchor {\n  left: number;\n  top: number;\n  width: number;\n}",
    "export interface WindowMenuAnchor {\n  screenLeft: number;\n  screenTop: number;\n  width: number;\n}",
    1,
)
text = text.replace(
    "    anchorLeft: anchor.left,\n    anchorTop: anchor.top,\n    anchorWidth: anchor.width",
    "    screenLeft: anchor.screenLeft,\n    screenTop: anchor.screenTop,\n    anchorWidth: anchor.width",
    1,
)
model.write_text(text)

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
    "    anchor_left: f64,\n    anchor_top: f64,\n    anchor_width: f64,",
    "    screen_left: f64,\n    screen_top: f64,\n    anchor_width: f64,",
    1,
)
text = text.replace(
    '''    let parent_position = window
        .outer_position()
        .map_err(|error| format!("Failed to read Control Strip position: {error}"))?;
''',
    '',
    1,
)
old = '''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    // Anchor to the pane's actual top edge inside the webview. The native
    // window may include transparent space above the visible Control Strip.
    let mut y = parent_position.y
        + (anchor_top * scale).round() as i32
        - physical_height as i32
        + 1;
'''
new = '''    // screen_left/screen_top are absolute CSS screen coordinates captured
    // from the pointer event. Convert them once to native physical pixels.
    let mut x = (screen_left * scale).round() as i32;
    let mut y = (screen_top * scale).round() as i32 - physical_height as i32 + 1;
'''
if old not in text:
    raise SystemExit('existing pane-anchor positioning block not found')
text = text.replace(old, new, 1)
lib.write_text(text)
