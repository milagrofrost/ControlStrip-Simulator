from pathlib import Path

control = Path('src/ControlStrip.ts')
text = control.read_text()
text = text.replace('const longPressDelayMs = 1000;', 'const longPressDelayMs = 500;', 1)
control.write_text(text)

main = Path('src/main.ts')
text = main.read_text()
needle = '''  const strip = createControlStrip(items, {
'''
if needle not in text:
    raise SystemExit('strip creation marker not found')
# Close any existing native hold menu before a new interaction begins in the main strip.
insert_after = '''  });

'''
marker = text.index(needle)
end = text.index(insert_after, marker) + len(insert_after)
addition = '''  // The hold menu lives in a separate native window. A click anywhere in the
  // main Control Strip should dismiss that popup before handling the new action.
  strip.addEventListener(
    'pointerdown',
    () => {
      void hideWindowMenu();
    },
    { capture: true }
  );

'''
text = text[:end] + addition + text[end:]
main.write_text(text)

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
    'use std::process::{Command, Stdio};\nuse std::{thread, time::Duration};',
    'use std::process::{Command, Stdio};\nuse std::sync::{\n    atomic::{AtomicBool, Ordering},\n    Arc,\n};\nuse std::{thread, time::Duration};',
    1,
)
needle = '''    .build()
    .map_err(|error| format!("Failed to create window menu: {error}"))?;

    // GTK/X11 may ignore geometry set before a transparent popup is mapped.
'''
replacement = '''    .build()
    .map_err(|error| format!("Failed to create window menu: {error}"))?;

    // WebKit focus notifications are inconsistent for this small transparent
    // popup on Raspberry Pi OS. Arm dismissal only after the native window has
    // actually received focus, then close it on the next native focus loss.
    let focus_dismiss_armed = Arc::new(AtomicBool::new(false));
    let focus_dismiss_state = Arc::clone(&focus_dismiss_armed);
    let focus_dismiss_menu = menu.clone();
    menu.on_window_event(move |event| match event {
        tauri::WindowEvent::Focused(true) => {
            focus_dismiss_state.store(true, Ordering::Release);
        }
        tauri::WindowEvent::Focused(false)
            if focus_dismiss_state.swap(false, Ordering::AcqRel) =>
        {
            if let Err(error) = focus_dismiss_menu.close() {
                eprintln!("Control Strip: failed to close unfocused window menu: {error}");
            }
        }
        _ => {}
    });

    // GTK/X11 may ignore geometry set before a transparent popup is mapped.
'''
if needle not in text:
    raise SystemExit('popup build marker not found')
text = text.replace(needle, replacement, 1)
lib.write_text(text)
