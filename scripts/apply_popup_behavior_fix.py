from pathlib import Path

lib = Path('src-tauri/src/lib.rs')
text = lib.read_text()
text = text.replace(
'''    .always_on_top(true)
    .visible(false)
    .build()''',
'''    .always_on_top(true)
    .inner_size(logical_width, logical_height)
    .visible(false)
    .build()''',
1,
)
marker = '''#[tauri::command]
fn hide_window_menu(app: tauri::AppHandle) -> Result<(), String> {
'''
helper = '''#[tauri::command]
fn select_window_menu_item(app: tauri::AppHandle, window_id: String) -> Result<(), String> {
    if let Some(menu) = app.get_webview_window("window-menu") {
        if let Err(error) = menu.close() {
            eprintln!("Control Strip: could not close window menu before selection: {error}");
        }
    }
    focus_window(&window_id)
}

'''
if helper not in text:
    text = text.replace(marker, helper + marker, 1)
text = text.replace(
'''            show_window_menu,
            hide_window_menu,
            resize_strip_window''',
'''            show_window_menu,
            hide_window_menu,
            select_window_menu_item,
            resize_strip_window''',
1,
)
lib.write_text(text)

menu = Path('src/windowMenu.ts')
menu.write_text('''import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
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

async function closePopup(): Promise<void> {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    console.error('Control Strip: failed to close window menu', error);
  }
}

export async function bootstrapWindowMenu(): Promise<void> {
  document.documentElement.classList.add('window-menu-document');
  document.body.classList.add('window-menu-body');

  const app = document.querySelector<HTMLDivElement>('#app');
  const encoded = new URLSearchParams(window.location.search).get('windowMenu');
  if (!app || !encoded) {
    await closePopup();
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
    row.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void invoke('select_window_menu_item', { windowId: windowItem.id }).catch((error) => {
        console.error('Control Strip: failed to select window', error);
        void closePopup();
      });
    });
    menu.append(row);
  }

  app.append(menu);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      void closePopup();
    }
  });

  const popup = getCurrentWindow();
  const unlisten = await popup.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      unlisten();
      void closePopup();
    }
  });

  window.setTimeout(() => {
    let missedFocusChecks = 0;
    const focusPoll = window.setInterval(() => {
      void popup.isFocused().then((focused) => {
        missedFocusChecks = focused ? 0 : missedFocusChecks + 1;
        if (missedFocusChecks >= 2) {
          window.clearInterval(focusPoll);
          unlisten();
          void closePopup();
        }
      });
    }, 100);
  }, 250);
}
''')

css = Path('src/WindowMenu.css')
css.write_text('''.window-menu-document,
.window-menu-body {
  margin: 0;
  overflow: hidden;
  background: transparent;
}

.window-menu-body {
  font-family: Geneva, Arial, sans-serif;
  user-select: none;
}

.window-menu-app {
  display: inline-block;
  margin: 0;
  background: transparent;
}

.popup-window-menu {
  box-sizing: border-box;
  display: inline-block;
  min-width: 100px;
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
