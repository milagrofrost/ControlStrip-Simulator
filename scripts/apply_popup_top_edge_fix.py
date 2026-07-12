from pathlib import Path

path = Path('src-tauri/src/lib.rs')
text = path.read_text()
old = '''    let parent_size = window
        .outer_size()
        .map_err(|error| format!("Failed to read Control Strip size: {error}"))?;
'''
text = text.replace(old, '', 1)
old = '''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    let strip_height = (24.0 * scale).round() as i32;
    let mut y = parent_position.y + parent_size.height as i32 - strip_height - physical_height as i32;
'''
new = '''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    // The main native window is already shrink-wrapped to the Control Strip.
    // Anchor the popup directly to its top edge with a 1 px overlap so there
    // is no visible seam between the two windows.
    let mut y = parent_position.y - physical_height as i32 + 1;
'''
if old not in text:
    raise SystemExit('popup positioning block not found')
path.write_text(text.replace(old, new, 1))
