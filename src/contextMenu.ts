import './contextMenu.css';

import type { ControlStripItem } from './ControlStrip';
import type { RunningWindow } from './controlStripModel';
import {
  ignoreWmClass,
  resolveDesktopFile,
  setAppPinned
} from './controlStripModel';

type StripContentSize = {
  width: number;
  height: number;
};

type ContextMenuOptions = {
  getItems: () => ControlStripItem[];
  getLatestRunningWindows: () => RunningWindow[];
  setLatestRunningWindows: (runningWindows: RunningWindow[]) => void;
  getStripContentSize: () => StripContentSize;
  resizeStripWindow: (width: number, height: number) => void;
  refreshItems: () => Promise<void>;
};

type ContextMenuPositionInput = {
  pointerX: number;
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  menuHeight: number;
  stripHeight: number;
  margin?: number;
  pointerGap?: number;
};

export type ContextMenuPosition = {
  left: number;
  top: number;
  expandedHeight: number;
};

export type ContextMenuController = {
  isOpen: () => boolean;
  close: () => void;
  destroy: () => void;
};

export function createContextMenuController(
  strip: HTMLElement,
  options: ContextMenuOptions
): ContextMenuController {
  let contextMenu: HTMLDivElement | null = null;

  const close = (): void => {
    contextMenu?.remove();
    contextMenu = null;

    const stripContentSize = options.getStripContentSize();
    options.resizeStripWindow(stripContentSize.width, stripContentSize.height);
  };

  const handleContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pane = target.closest<HTMLElement>('.control-strip__pane');
    const item = options.getItems().find((candidate) => candidate.id === pane?.dataset.itemId);
    if (!pane || !item) return;

    event.preventDefault();
    void openContextMenu(event, item, options, close, (menu) => {
      contextMenu = menu;
    });
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (contextMenu && event.target instanceof Node && !contextMenu.contains(event.target)) {
      close();
    }
  };

  strip.addEventListener('contextmenu', handleContextMenu);
  window.addEventListener('pointerdown', handlePointerDown);

  return {
    isOpen: () => contextMenu !== null,
    close,
    destroy: () => {
      strip.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('pointerdown', handlePointerDown);
      close();
    }
  };
}

export function calculateContextMenuPosition({
  pointerX,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
  stripHeight,
  margin = 4,
  pointerGap = 2
}: ContextMenuPositionInput): ContextMenuPosition {
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const left = Math.min(Math.max(pointerX, margin), maxLeft);
  const top = Math.max(margin, viewportHeight - stripHeight - menuHeight - pointerGap);

  return {
    left,
    top,
    expandedHeight: stripHeight + menuHeight + pointerGap + margin
  };
}

async function openContextMenu(
  event: MouseEvent,
  item: ControlStripItem,
  options: ContextMenuOptions,
  close: () => void,
  setContextMenu: (menu: HTMLDivElement) => void
): Promise<void> {
  close();

  const wmClass = getItemWmClass(item);
  const menu = document.createElement('div');
  menu.className = 'control-strip-context-menu';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'control-strip-context-menu__button';
  action.textContent = item.isPinned ? 'Unpin from Strip' : 'Pin to Strip';
  action.addEventListener('click', async () => {
    action.disabled = true;
    try {
      const desktopFile = item.isPinned
        ? item.desktopFile
        : await resolveDesktopFile(wmClass);
      if (!desktopFile) throw new Error(`No desktop file is available for ${item.label}`);
      await setAppPinned(desktopFile, !item.isPinned, wmClass);
      await options.refreshItems();
    } catch (error) {
      console.error('Control Strip: failed to update pin state', error);
    } finally {
      close();
    }
  });
  menu.append(action);

  const ignoreAction = document.createElement('button');
  ignoreAction.type = 'button';
  ignoreAction.className = 'control-strip-context-menu__button control-strip-context-menu__button--separated';
  ignoreAction.textContent = 'Ignore from Strip';
  ignoreAction.disabled = !wmClass;
  ignoreAction.addEventListener('click', async () => {
    if (!wmClass) return;
    ignoreAction.disabled = true;
    try {
      await ignoreWmClass(wmClass);
      options.setLatestRunningWindows(
        options.getLatestRunningWindows().filter((windowItem) => {
          const candidate = windowItem.wm_class.trim() || windowItem.wm_class_instance.trim();
          return candidate.toLowerCase() !== wmClass.toLowerCase();
        })
      );
      await options.refreshItems();
    } catch (error) {
      console.error('Control Strip: failed to ignore app', error);
    } finally {
      close();
    }
  });
  menu.append(ignoreAction);
  document.body.append(menu);

  const stripContentSize = options.getStripContentSize();
  const rect = menu.getBoundingClientRect();
  const position = calculateContextMenuPosition({
    pointerX: event.clientX,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    menuWidth: rect.width,
    menuHeight: rect.height,
    stripHeight: stripContentSize.height
  });

  setContextMenu(menu);
  options.resizeStripWindow(stripContentSize.width, position.expandedHeight);

  // Wait for Tauri to resize and re-anchor the native window.
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });

  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.style.visibility = 'visible';
}

function getItemWmClass(item: ControlStripItem): string {
  return item.wmClass?.trim() || item.match?.wm_class?.trim() || '';
}
