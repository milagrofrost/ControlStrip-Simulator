import './style.css';
import { createControlStrip } from './ControlStrip';
import { bootstrapWindowMenu } from './windowMenu';
import type { ControlStripItem } from './ControlStrip';
import {
  applyRunningWindowsToItems,
  focusAppWindows,
  ignoreWmClass,
  launchPinnedApp,
  loadControlStripModel,
  resizeStripWindow,
  resolveDesktopFile,
  setAppPinned,
  showWindowMenu,
  hideWindowMenu,
  startRunningWindowPolling
} from './controlStripModel';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = '';

const isWindowMenu = new URLSearchParams(window.location.search).has('windowMenu');

if (isWindowMenu) {
  void bootstrapWindowMenu();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  const model = await loadControlStripModel();
  let items = model.items;
  let latestRunningWindows: Parameters<typeof applyRunningWindowsToItems>[1] = [];
  let contextMenu: HTMLDivElement | null = null;
  let stripContentSize = { width: 1, height: 24 };
  let lastRequestedStripSize = { width: 0, height: 0 };

  const strip = createControlStrip(items, {
    sizing: model.strip,
    screenCorner: model.screenCorner,
    onLaunchPinnedApp: (item) => {
      window.setTimeout(() => {
        void launchPinnedApp(item.id);
      }, 0);
    },
    onFocusAppWindows: (item) => {
      window.setTimeout(() => {
        void focusAppWindows(item.id);
      }, 0);
    },
    onOpenWindowMenu: (item, anchor) => {
      void showWindowMenu(item, anchor);
    },
    onCloseWindowMenu: () => {
      void hideWindowMenu();
    },
    onContentResize: ({ width, height }) => {
      stripContentSize = { width, height };

      if (contextMenu) {
        return;
      }

      if (
        Math.abs(width - lastRequestedStripSize.width) < 1 &&
        Math.abs(height - lastRequestedStripSize.height) < 1
      ) {
        return;
      }

      lastRequestedStripSize = { width, height };
      resizeStripWindow(width, height);
    }
  });

  // The hold menu lives in a separate native window. A click anywhere in the
  // main Control Strip should dismiss that popup before handling the new action.
  strip.addEventListener(
    'pointerdown',
    () => {
      void hideWindowMenu();
    },
    { capture: true }
  );

  // Window menu rows carry their owning app id. Selecting a minimized window
  // performs a real restore/focus action instead of only closing the menu.
  strip.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const menuRow = target.closest<HTMLButtonElement>('.control-strip__window-menu-row');
    const appId = menuRow?.dataset.appId;
    if (!appId) {
      return;
    }

    window.setTimeout(() => {
      void focusAppWindows(appId);
    }, 0);
  });

  const closeContextMenu = (): void => {
    contextMenu?.remove();
    contextMenu = null;

    resizeStripWindow(stripContentSize.width, stripContentSize.height);
  };

  const refreshItems = async (): Promise<void> => {
    const refreshed = await loadControlStripModel();
    items = applyRunningWindowsToItems(refreshed.items, latestRunningWindows);
    strip.setItems(items);
  };

  strip.addEventListener('contextmenu', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const pane = target.closest<HTMLElement>('.control-strip__pane');
    const item = items.find((candidate) => candidate.id === pane?.dataset.itemId);
    if (!pane || !item) return;
    event.preventDefault();
    closeContextMenu();

    const wmClass = getItemWmClass(item);
    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = '0';
    menu.style.top = '0';
    menu.style.zIndex = '10000';
    menu.style.visibility = 'hidden';
    menu.style.padding = '3px';
    menu.style.border = '1px solid #000';
    menu.style.background = '#fff';
    menu.style.font = '12px sans-serif';
    menu.style.boxShadow = '2px 2px 0 rgba(0,0,0,.45)';

    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = item.isPinned ? 'Unpin from Strip' : 'Pin to Strip';
    action.style.display = 'block';
    action.style.width = '100%';
    action.style.border = '0';
    action.style.background = 'transparent';
    action.style.padding = '4px 10px';
    action.style.textAlign = 'left';
    action.addEventListener('click', async () => {
      action.disabled = true;
      try {
        const desktopFile = item.isPinned
          ? item.desktopFile
          : await resolveDesktopFile(wmClass);
        if (!desktopFile) throw new Error(`No desktop file is available for ${item.label}`);
        await setAppPinned(desktopFile, !item.isPinned, wmClass);
        await refreshItems();
      } catch (error) {
        console.error('Control Strip: failed to update pin state', error);
      } finally {
        closeContextMenu();
      }
    });
    menu.append(action);

    const ignoreAction = document.createElement('button');
    ignoreAction.type = 'button';
    ignoreAction.textContent = 'Ignore from Strip';
    ignoreAction.style.display = 'block';
    ignoreAction.style.width = '100%';
    ignoreAction.style.border = '0';
    ignoreAction.style.borderTop = '1px solid #999';
    ignoreAction.style.background = 'transparent';
    ignoreAction.style.padding = '4px 10px';
    ignoreAction.style.textAlign = 'left';
    ignoreAction.disabled = !wmClass;
    ignoreAction.addEventListener('click', async () => {
      if (!wmClass) return;
      ignoreAction.disabled = true;
      try {
        await ignoreWmClass(wmClass);
        latestRunningWindows = latestRunningWindows.filter((windowItem) => {
          const candidate = windowItem.wm_class.trim() || windowItem.wm_class_instance.trim();
          return candidate.toLowerCase() !== wmClass.toLowerCase();
        });
        await refreshItems();
      } catch (error) {
        console.error('Control Strip: failed to ignore app', error);
      } finally {
        closeContextMenu();
      }
    });
    menu.append(ignoreAction);
    document.body.append(menu);

    const margin = 4;
    const pointerGap = 2;
    const rect = menu.getBoundingClientRect();

    contextMenu = menu;

    const expandedHeight =
      stripContentSize.height +
      rect.height +
      pointerGap +
      margin;

    resizeStripWindow(stripContentSize.width, expandedHeight);

    // Wait for Tauri to resize and re-anchor the native window.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const maxLeft = Math.max(
      margin,
      window.innerWidth - rect.width - margin
    );

    const left = Math.min(
      Math.max(event.clientX, margin),
      maxLeft
    );

    const top = Math.max(
      margin,
      window.innerHeight -
        stripContentSize.height -
        rect.height -
        pointerGap
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  });

  window.addEventListener('pointerdown', (event) => {
    if (contextMenu && event.target instanceof Node && !contextMenu.contains(event.target)) {
      closeContextMenu();
    }
  });

  const stopPolling = startRunningWindowPolling((runningWindows) => {
    latestRunningWindows = runningWindows;
    const detectedItems = applyRunningWindowsToItems(items, runningWindows);
    items = keepStableItemOrder(items, detectedItems);
    strip.setItems(items);
  });
  const removeStrip = strip.remove.bind(strip);

  strip.remove = () => {
    stopPolling();
    removeStrip();
  };

  document.body.append(strip);
}

function getItemWmClass(item: ControlStripItem): string {
  return item.wmClass?.trim() || item.match?.wm_class?.trim() || '';
}

function keepStableItemOrder(
  previousItems: ControlStripItem[],
  detectedItems: ControlStripItem[]
): ControlStripItem[] {
  const detectedById = new Map(detectedItems.map((item) => [item.id, item]));
  const stableItems: ControlStripItem[] = [];

  // Keep every surviving pane in its existing slot. Changes in X11 discovery
  // order must never move a different icon underneath the user's pointer.
  for (const previousItem of previousItems) {
    const detectedItem = detectedById.get(previousItem.id);
    if (!detectedItem) {
      continue;
    }

    stableItems.push(detectedItem);
    detectedById.delete(previousItem.id);
  }

  // Newly detected applications append on the right. Their position stays fixed
  // until the application closes and its pane is removed.
  for (const detectedItem of detectedItems) {
    if (!detectedById.has(detectedItem.id)) {
      continue;
    }

    stableItems.push(detectedItem);
    detectedById.delete(detectedItem.id);
  }

  return stableItems;
}
