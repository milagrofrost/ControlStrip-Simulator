from pathlib import Path

# 1. Add Rust popup commands and window construction.
lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
    'use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};',
    'use base64::{\n    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD},\n    Engine as _,\n};',
    1,
)
text = text.replace(
    'use tauri::{Manager, PhysicalPosition, PhysicalSize};',
    'use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};',
    1,
)
text = text.replace(
    '#[derive(Debug, Serialize)]\n#[serde(rename_all = "camelCase")]\nstruct ControlStripWindow {',
    '#[derive(Clone, Debug, Deserialize, Serialize)]\n#[serde(rename_all = "camelCase")]\nstruct ControlStripWindow {',
    1,
)
marker = '#[tauri::command]\nfn focus_app_windows(app_id: String) -> Result<(), String> {'
helper = r'''#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowMenuPayload {
    app_id: String,
    label: String,
    windows: Vec<ControlStripWindow>,
}

#[tauri::command]
fn show_window_menu(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    app_id: String,
    label: String,
    windows: Vec<ControlStripWindow>,
    anchor_left: f64,
    anchor_top: f64,
    anchor_width: f64,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("window-menu") {
        existing.close().map_err(|error| format!("Failed to close existing window menu: {error}"))?;
    }

    let payload = WindowMenuPayload {
        app_id,
        label,
        windows,
    };
    let payload_json = serde_json::to_vec(&payload)
        .map_err(|error| format!("Failed to encode window menu payload: {error}"))?;
    let encoded_payload = URL_SAFE_NO_PAD.encode(payload_json);
    let url = format!("index.html?windowMenu={encoded_payload}");

    let scale = window
        .scale_factor()
        .map_err(|error| format!("Failed to read scale factor: {error}"))?;
    let parent_position = window
        .outer_position()
        .map_err(|error| format!("Failed to read Control Strip position: {error}"))?;

    let longest_title_chars = payload
        .windows
        .iter()
        .map(|entry| entry.title.chars().count())
        .max()
        .unwrap_or_else(|| payload.label.chars().count());
    let logical_width = ((longest_title_chars as f64 * 7.0) + 24.0)
        .max(anchor_width)
        .clamp(100.0, 360.0);
    let logical_height = ((payload.windows.len().max(1) as f64) * 21.0) + 4.0;
    let physical_width = (logical_width * scale).ceil().max(1.0) as u32;
    let physical_height = (logical_height * scale).ceil().max(1.0) as u32;

    let mut x = parent_position.x + (anchor_left * scale).round() as i32;
    let mut y = parent_position.y + (anchor_top * scale).round() as i32 - physical_height as i32 - 3;

    if let Some(monitor) = window.current_monitor().map_err(|error| error.to_string())? {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_position.x + monitor_size.width as i32 - physical_width as i32;
        let max_y = monitor_position.y + monitor_size.height as i32 - physical_height as i32;
        x = x.clamp(monitor_position.x, max_x.max(monitor_position.x));
        y = y.clamp(monitor_position.y, max_y.max(monitor_position.y));
    }

    let menu = WebviewWindowBuilder::new(
        &app,
        "window-menu",
        WebviewUrl::App(url.into()),
    )
    .title("Window menu")
    .decorations(false)
    .transparent(true)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .build()
    .map_err(|error| format!("Failed to create window menu: {error}"))?;

    menu.set_size(PhysicalSize::new(physical_width, physical_height))
        .map_err(|error| format!("Failed to size window menu: {error}"))?;
    menu.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("Failed to position window menu: {error}"))?;
    menu.show().map_err(|error| format!("Failed to show window menu: {error}"))?;
    menu.set_focus().map_err(|error| format!("Failed to focus window menu: {error}"))?;

    Ok(())
}

#[tauri::command]
fn hide_window_menu(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(menu) = app.get_webview_window("window-menu") {
        menu.close().map_err(|error| format!("Failed to close window menu: {error}"))?;
    }
    Ok(())
}

'''
if marker not in text:
    raise SystemExit('focus command marker not found')
text = text.replace(marker, helper + marker, 1)
text = text.replace(
    '            focus_app_windows,\n            resize_strip_window',
    '            focus_app_windows,\n            show_window_menu,\n            hide_window_menu,\n            resize_strip_window',
    1,
)
lib.write_text(text)

# 2. Allow the popup label in Tauri capabilities.
cap = Path('src-tauri/capabilities/default.json')
cap_text = cap.read_text().replace('"windows": ["main"]', '"windows": ["main", "window-menu"]', 1)
cap.write_text(cap_text)

# 3. Add popup API to the frontend model.
model = Path('src/controlStripModel.ts')
model_text = model.read_text()
append = r'''

export interface WindowMenuAnchor {
  left: number;
  top: number;
  width: number;
}

export async function showWindowMenu(
  item: ControlStripItem,
  anchor: WindowMenuAnchor
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke('show_window_menu', {
    appId: item.id,
    label: item.label,
    windows: item.windows ?? [],
    anchorLeft: anchor.left,
    anchorTop: anchor.top,
    anchorWidth: anchor.width
  });
}

export async function hideWindowMenu(): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke('hide_window_menu');
}
'''
if 'export async function showWindowMenu(' not in model_text:
    model_text += append
model.write_text(model_text)

# 4. Route long presses to an external popup callback when provided.
control = Path('src/ControlStrip.ts')
control_text = control.read_text()
control_text = control_text.replace(
    '  onFocusAppWindows?: (item: ControlStripItem) => void;\n',
    '  onFocusAppWindows?: (item: ControlStripItem) => void;\n  onOpenWindowMenu?: (item: ControlStripItem, anchor: { left: number; top: number; width: number }) => void;\n  onCloseWindowMenu?: () => void;\n',
    1,
)
old_open = '''      longPressTriggered = true;
      openWindowMenu = {
        itemId: item.id,
        anchorRect: {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width,
          bottom: anchorRect.bottom,
          right: anchorRect.right,
          viewportHeight: anchorRect.viewportHeight
        }
      };
      renderMenu();
'''
new_open = '''      longPressTriggered = true;

      if (options.onOpenWindowMenu) {
        options.onOpenWindowMenu(item, {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width
        });
        return;
      }

      openWindowMenu = {
        itemId: item.id,
        anchorRect: {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width,
          bottom: anchorRect.bottom,
          right: anchorRect.right,
          viewportHeight: anchorRect.viewportHeight
        }
      };
      renderMenu();
'''
if old_open not in control_text:
    raise SystemExit('long press open block not found')
control_text = control_text.replace(old_open, new_open, 1)
control_text = control_text.replace(
    '  const closeWindowMenu = (): void => {\n    if (!openWindowMenu) {\n      return;\n    }',
    '  const closeWindowMenu = (): void => {\n    options.onCloseWindowMenu?.();\n    if (!openWindowMenu) {\n      return;\n    }',
    1,
)
control.write_text(control_text)

# 5. Main window calls Rust popup commands; popup page gets separate bootstrap.
main = Path('src/main.ts')
main_text = main.read_text()
main_text = main_text.replace(
    "import { createControlStrip } from './ControlStrip';",
    "import { createControlStrip } from './ControlStrip';\nimport { bootstrapWindowMenu } from './windowMenu';",
    1,
)
main_text = main_text.replace(
    '  resolveDesktopFile,\n  setAppPinned,',
    '  resolveDesktopFile,\n  setAppPinned,\n  showWindowMenu,\n  hideWindowMenu,',
    1,
)
main_text = main_text.replace(
    'void bootstrap();',
    "const isWindowMenu = new URLSearchParams(window.location.search).has('windowMenu');\n\nif (isWindowMenu) {\n  void bootstrapWindowMenu();\n} else {\n  void bootstrap();\n}",
    1,
)
main_text = main_text.replace(
    '    onFocusAppWindows: (item) => {\n      window.setTimeout(() => {\n        void focusAppWindows(item.id);\n      }, 0);\n    },\n    onContentResize:',
    '    onFocusAppWindows: (item) => {\n      window.setTimeout(() => {\n        void focusAppWindows(item.id);\n      }, 0);\n    },\n    onOpenWindowMenu: (item, anchor) => {\n      void showWindowMenu(item, anchor);\n    },\n    onCloseWindowMenu: () => {\n      void hideWindowMenu();\n    },\n    onContentResize:',
    1,
)
main.write_text(main_text)

# 6. Add isolated popup renderer.
Path('src/windowMenu.ts').write_text(r'''import { getCurrentWindow } from '@tauri-apps/api/window';
import { focusAppWindows } from './controlStripModel';
import './WindowMenu.css';

interface WindowMenuEntry {
  id: string;
  title: string;
  isActive?: boolean;
}

interface WindowMenuPayload {
  appId: string;
  label: string;
  windows: WindowMenuEntry[];
}

function decodePayload(encoded: string): WindowMenuPayload {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as WindowMenuPayload;
}

export async function bootstrapWindowMenu(): Promise<void> {
  document.documentElement.classList.add('window-menu-document');
  document.body.classList.add('window-menu-body');

  const app = document.querySelector<HTMLDivElement>('#app');
  const encoded = new URLSearchParams(window.location.search).get('windowMenu');
  if (!app || !encoded) {
    await getCurrentWindow().close();
    return;
  }

  const payload = decodePayload(encoded);
  app.replaceChildren();
  app.className = 'window-menu-app';

  const menu = document.createElement('div');
  menu.className = 'popup-window-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `${payload.label} windows`);

  for (const windowItem of payload.windows) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = ['popup-window-menu__row', windowItem.isActive && 'is-active']
      .filter(Boolean)
      .join(' ');
    row.textContent = windowItem.title;
    row.addEventListener('click', async () => {
      await focusAppWindows(payload.appId);
      await getCurrentWindow().close();
    });
    menu.append(row);
  }

  app.append(menu);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      void getCurrentWindow().close();
    }
  });

  const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      unlisten();
      void getCurrentWindow().close();
    }
  });
}
''')

Path('src/WindowMenu.css').write_text(r'''.window-menu-document,
.window-menu-body,
.window-menu-app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: transparent;
}

.window-menu-body {
  font-family: Geneva, Arial, sans-serif;
  user-select: none;
}

.popup-window-menu {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 1px;
  border: 1px solid #111;
  background: #fff;
  box-shadow: 2px 2px 0 rgb(0 0 0 / 45%);
}

.popup-window-menu__row {
  display: block;
  width: 100%;
  height: 21px;
  margin: 0;
  padding: 2px 6px;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #111;
  font: 12px/17px Geneva, Arial, sans-serif;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.popup-window-menu__row:hover,
.popup-window-menu__row:focus-visible,
.popup-window-menu__row.is-active {
  outline: none;
  background: #111;
  color: #fff;
}
''')
