from pathlib import Path

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
'''    let parent_position = window
        .outer_position()
        .map_err(|error| format!("Failed to read Control Strip position: {error}"))?;
''',
'''    let parent_position = window
        .outer_position()
        .map_err(|error| format!("Failed to read Control Strip position: {error}"))?;
    let parent_size = window
        .outer_size()
        .map_err(|error| format!("Failed to read Control Strip size: {error}"))?;
''',
1,
)
text = text.replace(
'''    let logical_width = ((longest_title_chars as f64 * 7.0) + 24.0)
        .max(anchor_width)
        .clamp(100.0, 360.0);
    let logical_height = ((payload.windows.len().max(1) as f64) * 21.0) + 4.0;
''',
'''    let logical_width = ((longest_title_chars as f64 * 5.0) + 16.0)
        .max(anchor_width)
        .clamp(72.0, 300.0);
    let logical_height = ((payload.windows.len().max(1) as f64) * 15.0) + 2.0;
''',
1,
)
text = text.replace(
'''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    let mut y = parent_position.y + (anchor_top * scale).round() as i32 - physical_height as i32 - 3;
''',
'''    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    let strip_height = (24.0 * scale).round() as i32;
    let mut y = parent_position.y + parent_size.height as i32 - strip_height - physical_height as i32;
''',
1,
)
lib.write_text(text)

css = Path('src/WindowMenu.css')
css_text = css.read_text()
css_text = css_text.replace('  min-width: 100px;', '  min-width: 72px;', 1)
css_text = css_text.replace('  height: 21px;', '  height: 15px;', 1)
css_text = css_text.replace('  padding: 2px 6px;', '  padding: 1px 4px;', 1)
css_text = css_text.replace('  font: 12px/17px Geneva, Arial, sans-serif;', '  font: 8px/13px Geneva, Arial, sans-serif;', 1)
css.write_text(css_text)
