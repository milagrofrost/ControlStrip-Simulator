export interface WindowMenuEntry {
  id: string;
  title: string;
  isActive?: boolean;
}

export interface WindowMenuPayload {
  appId: string;
  label: string;
  windows: WindowMenuEntry[];
}

export function decodeWindowMenuPayload(
  encoded: string
): WindowMenuPayload | null {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0)
    );
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    return validateWindowMenuPayload(decoded);
  } catch {
    return null;
  }
}

export function validateWindowMenuPayload(
  value: unknown
): WindowMenuPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.appId !== 'string' || typeof value.label !== 'string') {
    return null;
  }

  if (!Array.isArray(value.windows)) {
    return null;
  }

  const windows: WindowMenuEntry[] = [];
  for (const windowItem of value.windows) {
    if (!isRecord(windowItem)) {
      return null;
    }
    if (
      typeof windowItem.id !== 'string' ||
      typeof windowItem.title !== 'string'
    ) {
      return null;
    }
    if (
      windowItem.isActive !== undefined &&
      typeof windowItem.isActive !== 'boolean'
    ) {
      return null;
    }

    windows.push({
      id: windowItem.id,
      title: windowItem.title,
      isActive: windowItem.isActive
    });
  }

  return {
    appId: value.appId,
    label: value.label,
    windows
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
