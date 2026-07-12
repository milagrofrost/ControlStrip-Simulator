import { describe, expect, it } from 'vitest';

import { calculateContextMenuPosition } from './contextMenu';

describe('context menu positioning', () => {
  it('clamps horizontal position inside the viewport', () => {
    expect(
      calculateContextMenuPosition({
        pointerX: 500,
        viewportWidth: 320,
        viewportHeight: 240,
        menuWidth: 90,
        menuHeight: 40,
        stripHeight: 24
      }).left
    ).toBe(226);

    expect(
      calculateContextMenuPosition({
        pointerX: -10,
        viewportWidth: 320,
        viewportHeight: 240,
        menuWidth: 90,
        menuHeight: 40,
        stripHeight: 24
      }).left
    ).toBe(4);
  });

  it('positions above the strip and reports the expanded host height', () => {
    expect(
      calculateContextMenuPosition({
        pointerX: 80,
        viewportWidth: 320,
        viewportHeight: 240,
        menuWidth: 90,
        menuHeight: 40,
        stripHeight: 24
      })
    ).toEqual({
      left: 80,
      top: 174,
      expandedHeight: 70
    });
  });
});
