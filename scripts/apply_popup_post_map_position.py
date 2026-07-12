from pathlib import Path

path = Path('src-tauri/src/lib.rs')
text = path.read_text()

old_builder = '''    .always_on_top(true)
    .inner_size(logical_width, logical_height)
    .visible(false)
    .build()
'''
new_builder = '''    .always_on_top(true)
    .inner_size(logical_width, logical_height)
    // Give GTK/X11 the intended logical position at window creation, then
    // reinforce it after the native window has actually been mapped.
    .position(x as f64 / scale, y as f64 / scale)
    .visible(false)
    .build()
'''
if old_builder not in text:
    raise SystemExit('popup builder block not found')
text = text.replace(old_builder, new_builder, 1)

start = text.index('    menu.set_size(PhysicalSize::new(physical_width, physical_height))')
end_marker = '    eprintln!("CONTROL_STRIP_POPUP_DEBUG END");\n\n    Ok(())'
end = text.index(end_marker, start) + len(end_marker)

new_finish = '''    // The Linux webview reports 0x0 geometry until GTK/X11 maps the window.
    // Show it first, return control to the event loop, and then reinforce the
    // requested physical geometry twice in case the window manager adjusts it.
    menu.show().map_err(|error| format!("Failed to show window menu: {error}"))?;

    let positioned_menu = menu.clone();
    std::thread::spawn(move || {
        for delay_ms in [25_u64, 150_u64] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));

            if let Err(error) = positioned_menu.set_size(PhysicalSize::new(physical_width, physical_height)) {
                eprintln!("Control Strip: failed to size mapped window menu: {error}");
                return;
            }
            if let Err(error) = positioned_menu.set_position(PhysicalPosition::new(x, y)) {
                eprintln!("Control Strip: failed to position mapped window menu: {error}");
                return;
            }

            match (positioned_menu.outer_position(), positioned_menu.outer_size()) {
                (Ok(position), Ok(size)) => eprintln!(
                    "Control Strip: mapped window menu geometry position=({}, {}) size={}x{}",
                    position.x,
                    position.y,
                    size.width,
                    size.height
                ),
                (position, size) => eprintln!(
                    "Control Strip: mapped window menu geometry unavailable position={position:?} size={size:?}"
                ),
            }
        }

        if let Err(error) = positioned_menu.set_focus() {
            eprintln!("Control Strip: failed to focus mapped window menu: {error}");
        }
    });

    Ok(())'''

text = text[:start] + new_finish + text[end:]
path.write_text(text)
