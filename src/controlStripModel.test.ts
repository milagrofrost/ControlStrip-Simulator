import { describe, expect, it } from 'vitest';

import type { ControlStripItem } from './ControlStrip';
import { getDesiredVisibleCount, normalizeConfiguredVisibleCount, normalizeSnapBackDelayMs } from './ControlStrip';
import { applyRunningWindowsToItems, type RunningWindow } from './controlStripModel';

const pinnedBrowser: ControlStripItem = {
  id: 'firefox',
  label: 'Firefox',
  desktopFile: '/usr/share/applications/firefox.desktop',
  isPinned: true,
  isOpen: false,
  windows: [],
  match: { wm_class: 'firefox' }
};

function windowItem(overrides: Partial<RunningWindow>): RunningWindow {
  return {
    id: '0x1',
    title: 'Untitled',
    wm_class_instance: '',
    wm_class: '',
    ...overrides
  };
}

describe('Control Strip sizing helpers', () => {
  it('normalizes configured visible pane counts', () => {
    expect(normalizeConfiguredVisibleCount(undefined)).toBeNull();
    expect(normalizeConfiguredVisibleCount(null)).toBeNull();
    expect(normalizeConfiguredVisibleCount(0)).toBeNull();
    expect(normalizeConfiguredVisibleCount(-1)).toBeNull();
    expect(normalizeConfiguredVisibleCount(Number.NaN)).toBeNull();
    expect(normalizeConfiguredVisibleCount(3.9)).toBe(3);
  });

  it('clamps desired visible count to available items', () => {
    expect(getDesiredVisibleCount(0, null)).toBe(0);
    expect(getDesiredVisibleCount(4, null)).toBe(4);
    expect(getDesiredVisibleCount(4, 2)).toBe(2);
    expect(getDesiredVisibleCount(4, 9)).toBe(4);
    expect(getDesiredVisibleCount(4, 0)).toBe(1);
  });

  it('normalizes snap-back delay seconds to milliseconds', () => {
    expect(normalizeSnapBackDelayMs(undefined)).toBe(10_000);
    expect(normalizeSnapBackDelayMs(Number.NaN)).toBe(10_000);
    expect(normalizeSnapBackDelayMs(-2)).toBe(0);
    expect(normalizeSnapBackDelayMs(1.5)).toBe(1_500);
  });
});

describe('running window application', () => {
  it('preserves pinned order and attaches matching windows', () => {
    const result = applyRunningWindowsToItems(
      [pinnedBrowser],
      [
        windowItem({ id: '0x100', title: 'Firefox window', wm_class: 'Navigator.Firefox' }),
        windowItem({ id: '0x200', title: 'Terminal', wm_class: 'org.gnome.Terminal' })
      ]
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'firefox',
      isPinned: true,
      isOpen: true,
      windows: [{ id: '0x100', title: 'Firefox window' }]
    });
    expect(result[1]).toMatchObject({
      id: 'running:org-gnome-terminal',
      label: 'Terminal',
      isPinned: false,
      isOpen: true,
      windows: [{ id: '0x200', title: 'Terminal' }]
    });
  });

  it('groups unmatched windows by normalized class key', () => {
    const result = applyRunningWindowsToItems([], [
      windowItem({ id: '0x300', title: 'Doc 1', wm_class: 'com.example.Editor' }),
      windowItem({ id: '0x301', title: 'Doc 2', wm_class: 'com.example.Editor' })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'running:com-example-editor',
      label: 'Editor',
      windows: [
        { id: '0x300', title: 'Doc 1' },
        { id: '0x301', title: 'Doc 2' }
      ]
    });
  });

  it('does not match pinned apps by unbounded class substrings', () => {
    const result = applyRunningWindowsToItems(
      [
        {
          ...pinnedBrowser,
          id: 'terminal-shortcut',
          label: 'Term',
          desktopFile: '/usr/share/applications/term.desktop',
          match: { wm_class: 'term' }
        }
      ],
      [windowItem({ id: '0x400', title: 'Terminal', wm_class: 'org.gnome.Terminal' })]
    );

    expect(result[0]).toMatchObject({
      id: 'terminal-shortcut',
      isOpen: false,
      windows: []
    });
    expect(result[1]).toMatchObject({
      id: 'running:org-gnome-terminal',
      windows: [{ id: '0x400', title: 'Terminal' }]
    });
  });
});
