import './style.css';
import { createControlStrip } from './ControlStrip';
import { bootstrapWindowMenu } from './windowMenu';
import type { ControlStripItem } from './ControlStrip';
import { createContextMenuController } from './contextMenu';
import type { ContextMenuController } from './contextMenu';
import { enrichTransientAppIcons } from './transientAppIcons';
import {
  applyRunningWindowsToItems,
  focusAppWindows,
  launchPinnedApp,
  loadControlStripModel,
  resizeStripWindow,
  showWindowMenu,
  hideWindowMenu,
  startRunningWindowPolling
} from './controlStripModel';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = '';

const isWindowMenu = new URLSearchParams(window.location.search).has(
  'windowMenu'
);

if (isWindowMenu) {
  void bootstrapWindowMenu();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  const model = await loadControlStripModel();
  let items = model.items;
  let latestRunningWindows: Parameters<typeof applyRunningWindowsToItems>[1] =
    [];
  let stripContentSize = { width: 1, height: 24 };
  let lastRequestedStripSize = { width: 0, height: 0 };
  let runningWindowGeneration = 0;
  let contextMenuController: ContextMenuController | null = null;

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
    onContentResize: ({ width, height }) => {
      stripContentSize = { width, height };

      if (contextMenuController?.isOpen()) {
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

  const refreshItems = async (): Promise<void> => {
    const refreshed = await loadControlStripModel();
    items = applyRunningWindowsToItems(refreshed.items, latestRunningWindows);
    items = await enrichTransientAppIcons(items);
    strip.setItems(items);
  };

  contextMenuController = createContextMenuController(strip, {
    getItems: () => items,
    getLatestRunningWindows: () => latestRunningWindows,
    setLatestRunningWindows: (runningWindows) => {
      latestRunningWindows = runningWindows;
    },
    getStripContentSize: () => stripContentSize,
    resizeStripWindow,
    refreshItems
  });

  const stopPolling = startRunningWindowPolling((runningWindows) => {
    latestRunningWindows = runningWindows;
    const generation = ++runningWindowGeneration;
    const detectedItems = applyRunningWindowsToItems(items, runningWindows);
    const stableItems = keepStableItemOrder(items, detectedItems);

    // Render immediately with the normal text fallback, then replace temporary
    // panes as their bounded, cached desktop-icon lookup completes.
    items = stableItems;
    strip.setItems(items);

    void enrichTransientAppIcons(stableItems).then((enrichedItems) => {
      if (generation !== runningWindowGeneration) {
        return;
      }

      items = keepStableItemOrder(items, enrichedItems);
      strip.setItems(items);
    });
  });
  const removeStrip = strip.remove.bind(strip);

  strip.remove = () => {
    contextMenuController?.destroy();
    stopPolling();
    removeStrip();
  };

  document.body.append(strip);
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
