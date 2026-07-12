import { invoke, isTauri } from '@tauri-apps/api/core';

import type { ControlStripItem } from './ControlStrip';

type ResolvedTransientApp = {
  desktopFile?: string;
  icon?: string;
  label?: string;
};

const resolutionCache = new Map<string, Promise<ResolvedTransientApp>>();

export async function enrichTransientAppIcons(
  items: ControlStripItem[]
): Promise<ControlStripItem[]> {
  if (!isTauri()) {
    return items;
  }

  return Promise.all(
    items.map(async (item) => {
      if (item.isPinned !== false || item.icon || !item.wmClass?.trim()) {
        return item;
      }

      const key = normalizeIdentity(item.wmClass);
      let resolution = resolutionCache.get(key);
      if (!resolution) {
        resolution = resolveTransientApp(item.wmClass);
        resolutionCache.set(key, resolution);
      }

      const resolved = await resolution;
      if (!resolved.icon && !resolved.desktopFile && !resolved.label) {
        return item;
      }

      return {
        ...item,
        icon: resolved.icon ?? item.icon,
        desktopFile: resolved.desktopFile ?? item.desktopFile,
        label: resolved.label ?? item.label
      };
    })
  );
}

async function resolveTransientApp(
  wmClass: string
): Promise<ResolvedTransientApp> {
  try {
    return await invoke<ResolvedTransientApp>('resolve_transient_app', {
      wmClass
    });
  } catch (error) {
    console.debug(
      `Control Strip: no transient icon resolved for ${wmClass}`,
      error
    );
    return {};
  }
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
