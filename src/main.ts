import './style.css';
import { createControlStrip } from './ControlStrip';
import type { ControlStripItem } from './ControlStrip';
import {
  applyRunningWindowsToItems,
  focusAppWindows,
  launchPinnedApp,
  loadControlStripModel,
  resizeStripWindow,
  startRunningWindowPolling
} from './controlStripModel';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = '';

void bootstrap();

async function bootstrap(): Promise<void> {
  const model = await loadControlStripModel();
  let items = model.items;
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
    onContentResize: ({ width, height }) => {
      resizeStripWindow(width, height);
    }
  });

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

  const stopPolling = startRunningWindowPolling((runningWindows) => {
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
