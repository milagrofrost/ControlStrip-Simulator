import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './WindowMenu.css';

import { FLYOUT_MENU_HOVER_EVENT } from './flyoutLifecycle';
import { decodeWindowMenuPayload } from './windowMenuPayload';

async function closePopup(cleanup?: () => void): Promise<void> {
  cleanup?.();
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

  const payload = decodeWindowMenuPayload(encoded);
  if (!payload) {
    await closePopup();
    return;
  }

  const eventController = new AbortController();
  const cleanup = (): void => {
    eventController.abort();
  };

  app.replaceChildren();
  app.className = 'window-menu-app';

  const menu = document.createElement('div');
  menu.className = 'popup-window-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `${payload.label} windows`);
  menu.addEventListener('pointerenter', () => {
    void emit(FLYOUT_MENU_HOVER_EVENT, {
      appId: payload.appId,
      sessionId: payload.sessionId,
      hovered: true
    });
  }, { signal: eventController.signal });
  menu.addEventListener('pointerleave', () => {
    void emit(FLYOUT_MENU_HOVER_EVENT, {
      appId: payload.appId,
      sessionId: payload.sessionId,
      hovered: false
    });
  }, { signal: eventController.signal });

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
      cleanup();
      void invoke('select_window_menu_item', { windowId: windowItem.id }).catch((error) => {
        console.error('Control Strip: failed to select window', error);
        void closePopup(cleanup);
      });
    });
    menu.append(row);
  }

  app.append(menu);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      void closePopup(cleanup);
    }
  }, { signal: eventController.signal });
  window.addEventListener('pagehide', cleanup, { signal: eventController.signal });
}
