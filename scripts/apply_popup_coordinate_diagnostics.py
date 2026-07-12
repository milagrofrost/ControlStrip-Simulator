from pathlib import Path

control = Path('src/ControlStrip.ts')
text = control.read_text()
text = text.replace(
    "    screenTop: number;\n",
    "    screenTop: number;\n    debugJson: string;\n",
    1,
)
text = text.replace(
    "          screenTop: anchorRect.screenTop,\n          width: anchorRect.width",
    "          screenTop: anchorRect.screenTop,\n          width: anchorRect.width,\n          debugJson: anchorRect.debugJson",
    1,
)
text = text.replace(
    "          screenTop: anchorRect.screenTop\n",
    "          screenTop: anchorRect.screenTop,\n          debugJson: anchorRect.debugJson\n",
    1,
)
old_anchor = '''      const anchorRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        bottom: rect.bottom,
        right: rect.right,
        viewportHeight: window.innerHeight,
        screenLeft: screenOriginX + rect.left,
        screenTop: screenOriginY + rect.top
      };'''
new_anchor = '''      const anchorRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        bottom: rect.bottom,
        right: rect.right,
        viewportHeight: window.innerHeight,
        screenLeft: screenOriginX + rect.left,
        screenTop: screenOriginY + rect.top,
        debugJson: JSON.stringify({
          pointer: {
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY
          },
          paneRect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          },
          calculated: {
            screenOriginX,
            screenOriginY,
            screenLeft: screenOriginX + rect.left,
            screenTop: screenOriginY + rect.top
          },
          window: {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            outerWidth: window.outerWidth,
            outerHeight: window.outerHeight,
            screenX: window.screenX,
            screenY: window.screenY,
            devicePixelRatio: window.devicePixelRatio
          },
          screen: {
            width: window.screen.width,
            height: window.screen.height,
            availWidth: window.screen.availWidth,
            availHeight: window.screen.availHeight
          }
        })
      };'''
if old_anchor not in text:
    raise SystemExit('ControlStrip anchor block not found')
text = text.replace(old_anchor, new_anchor, 1)
control.write_text(text)

model = Path('src/controlStripModel.ts')
text = model.read_text()
text = text.replace(
    "  screenTop: number;\n  width: number;",
    "  screenTop: number;\n  width: number;\n  debugJson: string;",
    1,
)
text = text.replace(
    "    screenTop: anchor.screenTop,\n    anchorWidth: anchor.width",
    "    screenTop: anchor.screenTop,\n    anchorWidth: anchor.width,\n    debugJson: anchor.debugJson",
    1,
)
model.write_text(text)

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
    "    anchor_width: f64,\n) -> Result<(), String> {",
    "    anchor_width: f64,\n    debug_json: String,\n) -> Result<(), String> {",
    1,
)
text = text.replace(
    '''    let scale = window
        .scale_factor()
        .map_err(|error| format!("Failed to read scale factor: {error}"))?;
''',
    '''    let scale = window
        .scale_factor()
        .map_err(|error| format!("Failed to read scale factor: {error}"))?;
    let parent_position = window.outer_position()
        .map_err(|error| format!("Failed to read Control Strip position: {error}"))?;
    let parent_size = window.outer_size()
        .map_err(|error| format!("Failed to read Control Strip size: {error}"))?;
''',
    1,
)
old_position = '''    // screen_left/screen_top are absolute CSS screen coordinates captured
    // from the pointer event. Convert them once to native physical pixels.
    let mut x = (screen_left * scale).round() as i32;
    let mut y = (screen_top * scale).round() as i32 - physical_height as i32 + 1;

    if let Some(monitor) = window.current_monitor().map_err(|error| error.to_string())? {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_position.x + monitor_size.width as i32 - physical_width as i32;
        let max_y = monitor_position.y + monitor_size.height as i32 - physical_height as i32;
        x = x.clamp(monitor_position.x, max_x.max(monitor_position.x));
        y = y.clamp(monitor_position.y, max_y.max(monitor_position.y));
    }
'''
new_position = '''    // screen_left/screen_top are absolute CSS screen coordinates captured
    // from the pointer event. Convert them once to native physical pixels.
    let raw_x = (screen_left * scale).round() as i32;
    let raw_y = (screen_top * scale).round() as i32 - physical_height as i32 + 1;
    let mut x = raw_x;
    let mut y = raw_y;
    let mut monitor_debug = String::from("none");

    if let Some(monitor) = window.current_monitor().map_err(|error| error.to_string())? {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_position.x + monitor_size.width as i32 - physical_width as i32;
        let max_y = monitor_position.y + monitor_size.height as i32 - physical_height as i32;
        monitor_debug = format!(
            "position=({}, {}) size={}x{} max=({}, {})",
            monitor_position.x,
            monitor_position.y,
            monitor_size.width,
            monitor_size.height,
            max_x,
            max_y
        );
        x = x.clamp(monitor_position.x, max_x.max(monitor_position.x));
        y = y.clamp(monitor_position.y, max_y.max(monitor_position.y));
    }

    eprintln!("CONTROL_STRIP_POPUP_DEBUG BEGIN");
    eprintln!("frontend={debug_json}");
    eprintln!(
        "native parent_position=({}, {}) parent_size={}x{} scale_factor={scale}",
        parent_position.x,
        parent_position.y,
        parent_size.width,
        parent_size.height
    );
    eprintln!(
        "native received screen_left={screen_left} screen_top={screen_top} anchor_width={anchor_width}"
    );
    eprintln!(
        "native popup logical={}x{} physical={}x{} raw_position=({}, {}) clamped_position=({}, {})",
        logical_width,
        logical_height,
        physical_width,
        physical_height,
        raw_x,
        raw_y,
        x,
        y
    );
    eprintln!("native monitor {monitor_debug}");
'''
if old_position not in text:
    raise SystemExit('Rust popup positioning block not found')
text = text.replace(old_position, new_position, 1)
old_finish = '''    menu.set_size(PhysicalSize::new(physical_width, physical_height))
        .map_err(|error| format!("Failed to size window menu: {error}"))?;
    menu.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("Failed to position window menu: {error}"))?;
    menu.show().map_err(|error| format!("Failed to show window menu: {error}"))?;
    menu.set_focus().map_err(|error| format!("Failed to focus window menu: {error}"))?;

    Ok(())
'''
new_finish = '''    menu.set_size(PhysicalSize::new(physical_width, physical_height))
        .map_err(|error| format!("Failed to size window menu: {error}"))?;
    menu.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("Failed to position window menu: {error}"))?;

    match (menu.outer_position(), menu.outer_size()) {
        (Ok(position), Ok(size)) => eprintln!(
            "native before_show actual_position=({}, {}) actual_size={}x{}",
            position.x,
            position.y,
            size.width,
            size.height
        ),
        (position, size) => eprintln!("native before_show geometry_error position={position:?} size={size:?}"),
    }

    menu.show().map_err(|error| format!("Failed to show window menu: {error}"))?;
    menu.set_focus().map_err(|error| format!("Failed to focus window menu: {error}"))?;
    std::thread::sleep(std::time::Duration::from_millis(100));

    match (menu.outer_position(), menu.outer_size()) {
        (Ok(position), Ok(size)) => eprintln!(
            "native after_show actual_position=({}, {}) actual_size={}x{}",
            position.x,
            position.y,
            size.width,
            size.height
        ),
        (position, size) => eprintln!("native after_show geometry_error position={position:?} size={size:?}"),
    }
    eprintln!("CONTROL_STRIP_POPUP_DEBUG END");

    Ok(())
'''
if old_finish not in text:
    raise SystemExit('Rust popup finish block not found')
text = text.replace(old_finish, new_finish, 1)
lib.write_text(text)
