import { getCurrentWindow } from '@tauri-apps/api/window';
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
