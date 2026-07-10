import './style.css';
import { createControlStrip } from './ControlStrip';
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

  // Window menu rows already carry their owning app id. Handle the click at the
  // strip boundary so selecting a minimized window performs a real restore/focus
  // action instead of only closing the menu and logging the selection.
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
    items = applyRunningWindowsToItems(items, runningWindows);
    strip.setItems(items);
  });
  const removeStrip = strip.remove.bind(strip);

  strip.remove = () => {
    stopPolling();
    removeStrip();
  };

  document.body.append(strip);
}
