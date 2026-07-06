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
