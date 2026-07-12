import { invoke } from '@tauri-apps/api/core';
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
