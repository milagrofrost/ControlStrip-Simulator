from pathlib import Path

path = Path('src-tauri/src/lib.rs')
text = path.read_text()
old = '''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    // The main native window is already shrink-wrapped to the Control Strip.
    // Anchor the popup directly to its top edge with a 1 px overlap so there
    // is no visible seam between the two windows.
    let mut y = parent_position.y - physical_height as i32 + 1;
'''
new = '''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    // Anchor to the pane's actual top edge inside the webview. The native
    // window may include transparent space above the visible Control Strip.
    let mut y = parent_position.y
        + (anchor_top * scale).round() as i32
        - physical_height as i32
        + 1;
'''
if old not in text:
    raise SystemExit('popup top-edge block not found')
path.write_text(text.replace(old, new, 1))
