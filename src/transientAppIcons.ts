import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';

import type { ControlStripItem } from './ControlStrip';

type ResolvedTransientApp = {
  desktopFile?: string;
  icon?: string;
  label?: string;
};

const resolutionCache = new Map<string, Promise<ResolvedTransientApp>>();
const ICON_EXTENSIONS = ['png', 'svg', 'xpm'] as const;
const ICON_SIZES = ['scalable', '512x512', '256x256', '128x128', '96x96', '64x64', '48x48', '32x32', '24x24', '22x22', '16x16'] as const;

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

async function resolveTransientApp(wmClass: string): Promise<ResolvedTransientApp> {
  try {
    const desktopFile = await invoke<string>('resolve_desktop_file', { wmClass });
    const contents = await fetchTextFile(desktopFile);
    const desktopEntry = parseDesktopEntry(contents);
    const icon = desktopEntry.icon
      ? await resolveIcon(desktopEntry.icon, desktopFile)
      : undefined;

    return {
      desktopFile,
      icon,
      label: desktopEntry.name
    };
  } catch (error) {
    console.debug(`Control Strip: no transient icon resolved for ${wmClass}`, error);
    return {};
  }
}

async function fetchTextFile(path: string): Promise<string> {
  const response = await fetch(convertFileSrc(path));
  if (!response.ok) {
    throw new Error(`Failed to read ${path}: HTTP ${response.status}`);
  }
  return response.text();
}

function parseDesktopEntry(contents: string): { name?: string; icon?: string } {
  let inDesktopEntry = false;
  let name: string | undefined;
  let icon: string | undefined;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      inDesktopEntry = line === '[Desktop Entry]';
      continue;
    }
    if (!inDesktopEntry) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (key === 'Name' && !name) name = value;
    if (key === 'Icon' && !icon) icon = value;
  }

  return { name, icon };
}

async function resolveIcon(iconValue: string, desktopFile: string): Promise<string | undefined> {
  const value = iconValue.trim();
  if (!value) return undefined;

  if (value.startsWith('/')) {
    return (await canLoadImage(value)) ? convertFileSrc(value) : undefined;
  }

  const iconName = value.replace(/\.(png|svg|xpm)$/i, '');
  for (const candidate of buildIconCandidates(iconName, desktopFile)) {
    if (await canLoadImage(candidate)) {
      return convertFileSrc(candidate);
    }
  }

  return undefined;
}

function buildIconCandidates(iconName: string, desktopFile: string): string[] {
  const candidates: string[] = [];
  const home = inferHomeDirectory(desktopFile);
  const roots = [
    home ? `${home}/.local/share/icons` : undefined,
    '/usr/local/share/icons',
    '/usr/share/icons'
  ].filter((root): root is string => Boolean(root));

  for (const root of roots) {
    for (const size of ICON_SIZES) {
      for (const extension of ICON_EXTENSIONS) {
        candidates.push(`${root}/hicolor/${size}/apps/${iconName}.${extension}`);
      }
    }
  }

  for (const extension of ICON_EXTENSIONS) {
    if (home) candidates.push(`${home}/.local/share/pixmaps/${iconName}.${extension}`);
    candidates.push(`/usr/local/share/pixmaps/${iconName}.${extension}`);
    candidates.push(`/usr/share/pixmaps/${iconName}.${extension}`);
  }

  return candidates;
}

function inferHomeDirectory(path: string): string | undefined {
  const match = path.match(/^(\/home\/[^/]+)\//);
  return match?.[1];
}

function canLoadImage(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = '';
      resolve(false);
    }, 350);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    image.src = convertFileSrc(path);
  });
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
