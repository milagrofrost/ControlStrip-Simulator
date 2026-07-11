import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';

import type { ControlStripItem, ControlStripWindow } from './ControlStrip';

type BackendControlStripModel = {
  items: BackendControlStripItem[];
  strip?: BackendStripBehavior;
  screenCorner?: BackendScreenCornerConfig;
};

type BackendControlStripItem = Omit<ControlStripItem, 'icon'> & {
  icon?: string | null;
};

export type ControlStripModel = {
  items: ControlStripItem[];
  strip: ControlStripSizingConfig;
  screenCorner: ScreenCornerConfig;
};

export type ControlStripSizingConfig = {
  visibleIcons?: number | null;
  snapBackSeconds: number;
};

export type ScreenCornerConfig = {
  enabled: boolean;
  position: 'bottom-left' | string;
  radius: number;
  color: string;
};

type BackendStripBehavior = {
  visibleIcons?: number | null;
  snapBackSeconds?: number;
};

type BackendScreenCornerConfig = {
  enabled?: boolean;
  position?: string;
  radius?: number;
  color?: string;
};

export type RunningWindow = {
  id: string;
  title: string;
  wm_class_instance: string;
  wm_class: string;
  pid?: number | null;
};

type RunningWindowsResult = {
  windows: RunningWindow[];
  error?: string;
};

export async function loadControlStripItems(): Promise<ControlStripItem[]> {
  const model = await loadControlStripModel();
  return model.items;
}

export async function loadControlStripModel(): Promise<ControlStripModel> {
  if (!isTauri()) {
    return {
      items: [],
      strip: {
        visibleIcons: null,
        snapBackSeconds: 10
      },
      screenCorner: defaultScreenCornerConfig()
    };
  }

  try {
    const model = await invoke<BackendControlStripModel>('get_control_strip_model');
    return {
      items: model.items.map(normalizeBackendItem),
      strip: {
        visibleIcons: model.strip?.visibleIcons ?? null,
        snapBackSeconds: model.strip?.snapBackSeconds ?? 10
      },
      screenCorner: normalizeScreenCornerConfig(model.screenCorner)
    };
  } catch (error) {
    console.error('Control Strip: failed to load pinned apps', error);
    return {
      items: [],
      strip: {
        visibleIcons: null,
        snapBackSeconds: 10
      },
      screenCorner: defaultScreenCornerConfig()
    };
  }
}

function defaultScreenCornerConfig(): ScreenCornerConfig {
  return {
    enabled: true,
    position: 'bottom-left',
    radius: 18,
    color: '#000000'
  };
}

function normalizeScreenCornerConfig(config?: BackendScreenCornerConfig): ScreenCornerConfig {
  const defaults = defaultScreenCornerConfig();

  return {
    enabled: config?.enabled ?? defaults.enabled,
    position: config?.position ?? defaults.position,
    radius: normalizeScreenCornerRadius(config?.radius, defaults.radius),
    color: config?.color ?? defaults.color
  };
}

function normalizeScreenCornerRadius(radius: number | null | undefined, fallback: number): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return fallback;
  }

  return Math.max(0, radius);
}

export async function loadRunningWindows(): Promise<RunningWindowsResult> {
  if (!isTauri()) {
    return { windows: [], error: 'Not running inside Tauri' };
  }

  try {
    return await invoke<RunningWindowsResult>('get_running_windows');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Control Strip: failed to load running windows', error);
    return { windows: [], error: message };
  }
}

export async function launchPinnedApp(appId: string): Promise<void> {
  if (!isTauri()) {
    console.info(`Control Strip: would launch pinned app ${appId}`);
    return;
  }

  try {
    await invoke('launch_pinned_app', { appId });
    console.info(`Control Strip: launched pinned app ${appId}`);
  } catch (error) {
    console.error(`Control Strip: failed to launch pinned app ${appId}`, error);
  }
}

export async function setAppPinned(desktopFile: string, pinned: boolean, wmClass?: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('set_app_pinned', { desktopFile, pinned, wmClass: wmClass ?? null });
}

export async function resolveDesktopFile(wmClass: string): Promise<string> {
  if (!isTauri()) throw new Error('Not running inside Tauri');
  return await invoke<string>('resolve_desktop_file', { wmClass });
}

export async function focusAppWindows(appId: string): Promise<void> {
  if (!isTauri()) {
    console.info(`Control Strip: would focus app windows for ${appId}`);
    return;
  }

  try {
    await invoke('focus_app_windows', { appId });
    console.info(`Control Strip: focused app windows for ${appId}`);
  } catch (error) {
    console.error(`Control Strip: failed to focus app windows for ${appId}`, error);
  }
}

export function resizeStripWindow(width: number, height: number): void {
  if (!isTauri()) {
    return;
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return;
  }

  void invoke('resize_strip_window', { width, height }).catch((error) => {
    console.warn('Control Strip: failed to resize strip window', error);
  });
}

export function startRunningWindowPolling(onWindows?: (windows: RunningWindow[]) => void): () => void {
  if (!isTauri()) {
    console.info('Control Strip: running window polling disabled outside Tauri');
    return () => {};
  }

  let isStopped = false;
  let pollCount = 0;

  const poll = async (): Promise<void> => {
    pollCount += 1;
    console.debug(`Control Strip: polling running windows #${pollCount}`);
    const result = await loadRunningWindows();

    if (isStopped) {
      return;
    }

    if (result.error) {
      console.warn('Control Strip: running window detection warning:', result.error);
    }

    onWindows?.(result.windows);
    console.info(`Control Strip: detected ${result.windows.length} running windows`);
    if (result.windows.length > 0) {
      console.table(result.windows);
    }
  };

  void poll();
  const intervalId = window.setInterval(() => {
    void poll();
  }, 2000);

  return () => {
    isStopped = true;
    window.clearInterval(intervalId);
  };
}

export function applyRunningWindowsToItems(
  items: ControlStripItem[],
  runningWindows: RunningWindow[]
): ControlStripItem[] {
  const unmatchedWindows = new Map(runningWindows.map((windowItem) => [windowItem.id, windowItem]));
  let openPinnedItemCount = 0;

  const pinnedItems = items.filter((item) => item.isPinned !== false);
  const nextPinnedItems = pinnedItems.map((item) => {
    if (item.disabled) {
      return {
        ...item,
        isPinned: true,
        isOpen: false,
        windows: []
      };
    }

    const matchedWindows = [...unmatchedWindows.values()].filter((windowItem) =>
      doesWindowMatchItem(item, windowItem)
    );
    const windows = matchedWindows.map(toControlStripWindow);

    for (const windowItem of matchedWindows) {
      unmatchedWindows.delete(windowItem.id);
    }

    if (windows.length > 0) {
      openPinnedItemCount += 1;
    }

    return {
      ...item,
      isPinned: true,
      isOpen: windows.length > 0,
      windows
    };
  });
  const temporaryItems = createTemporaryItems([...unmatchedWindows.values()]);
  const nextItems = [...nextPinnedItems, ...temporaryItems];

  console.info(
    `Control Strip: matched ${runningWindows.length - unmatchedWindows.size} running windows to ${openPinnedItemCount} pinned apps; appended ${temporaryItems.length} temporary apps`
  );
  console.table(
    nextItems.map((item, index) => ({
      index,
      id: item.id,
      label: item.label,
      isPinned: item.isPinned !== false,
      isOpen: item.isOpen,
      windowCount: item.windows?.length ?? 0,
      matchWmClass: item.match?.wm_class ?? ''
    }))
  );

  return nextItems;
}

function normalizeBackendItem(item: BackendControlStripItem): ControlStripItem {
  return {
    ...item,
    icon: item.icon ? convertFileSrc(item.icon) : undefined,
    windows: item.windows ?? []
  };
}

function doesWindowMatchItem(item: ControlStripItem, windowItem: RunningWindow): boolean {
  const wmClassHint = item.match?.wm_class?.trim().toLowerCase();
  const titleHint = item.match?.title_contains?.trim().toLowerCase();

  const wmClassMatches = wmClassHint
    ? doesWindowClassMatch(windowItem, wmClassHint)
    : doesWindowMatchWeakFallback(item, windowItem);
  const titleMatches = titleHint
    ? windowItem.title.toLowerCase().includes(titleHint)
    : true;

  return wmClassMatches && titleMatches;
}

function doesWindowClassMatch(windowItem: RunningWindow, hint: string): boolean {
  return (
    doesClassValueMatch(windowItem.wm_class, hint) ||
    doesClassValueMatch(windowItem.wm_class_instance, hint)
  );
}

function doesClassValueMatch(windowClass: string, hint: string): boolean {
  const normalizedWmClass = windowClass.trim().toLowerCase();
  return (
    normalizedWmClass === hint ||
    normalizedWmClass.endsWith(`.${hint}`) ||
    normalizedWmClass.includes(hint)
  );
}

function doesWindowMatchWeakFallback(item: ControlStripItem, windowItem: RunningWindow): boolean {
  const candidates = [
    getDesktopFileStem(item.desktopFile),
    item.label
  ]
    .map((candidate) => candidate?.trim().toLowerCase())
    .filter(Boolean) as string[];

  if (candidates.length === 0) {
    return false;
  }

  return candidates.some((candidate) => doesWindowClassMatch(windowItem, candidate));
}

function createTemporaryItems(runningWindows: RunningWindow[]): ControlStripItem[] {
  const groupedWindows = new Map<string, RunningWindow[]>();

  for (const windowItem of runningWindows) {
    const groupId = normalizeTemporaryGroupId(getWindowGroupKey(windowItem));
    const existing = groupedWindows.get(groupId) ?? [];
    existing.push(windowItem);
    groupedWindows.set(groupId, existing);
  }

  return [...groupedWindows.entries()].map(([groupId, windows]) => {
    const firstWindow = windows[0];
    return {
      id: `running:${groupId}`,
      label: getTemporaryItemLabel(firstWindow),
      isPinned: false,
      isOpen: true,
      windows: windows.map(toControlStripWindow),
      wmClass: getWindowGroupKey(firstWindow)
    };
  });
}

function normalizeTemporaryGroupId(wmClass: string): string {
  const normalized = wmClass
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'unknown';
}

function getTemporaryItemLabel(windowItem: RunningWindow): string {
  const classLabel = getWindowGroupKey(windowItem);
  const wmClassParts = classLabel.split('.').filter(Boolean);
  const wmClassLabel = wmClassParts[wmClassParts.length - 1];
  return wmClassLabel || classLabel || windowItem.title.trim() || 'Running App';
}

function getWindowGroupKey(windowItem: RunningWindow): string {
  return windowItem.wm_class.trim() || windowItem.wm_class_instance.trim();
}

function getDesktopFileStem(desktopFile: string | undefined): string | undefined {
  if (!desktopFile) {
    return undefined;
  }

  const parts = desktopFile.split('/');
  const filename = parts[parts.length - 1] ?? desktopFile;
  return filename.replace(/\.desktop$/i, '');
}

function toControlStripWindow(windowItem: RunningWindow): ControlStripWindow {
  return {
    id: windowItem.id,
    title: windowItem.title
  };
}
