from pathlib import Path

control_strip = Path('src/ControlStrip.ts')
text = control_strip.read_text()

old = '''  const setPressedPart = (nextPressedPart: PressedPart): void => {
    if (pressedPart === nextPressedPart) {
      return;
    }

    pressedPart = nextPressedPart;
    render();
  };
'''
new = '''  const updatePressedVisuals = (): void => {
    const canScrollLeft = !isCollapsed && visibleStart > 0;
    const canScrollRight =
      !isCollapsed && visibleCount > 0 && visibleStart + visibleCount < items.length;

    for (const element of track.querySelectorAll<HTMLElement>('[data-pressed-part]')) {
      const part = element.dataset.pressedPart as PressedPart;

      if (element instanceof HTMLImageElement) {
        if (part === 'head') {
          element.src = pressedPart === 'head' ? CONTROL_STRIP_ASSETS.headHold : CONTROL_STRIP_ASSETS.head;
        } else if (part === 'tail') {
          element.src = pressedPart === 'tail' || resizeState
            ? CONTROL_STRIP_ASSETS.tailHold
            : CONTROL_STRIP_ASSETS.tail;
        } else if (part === 'left') {
          element.src = canScrollLeft && pressedPart === 'left'
            ? CONTROL_STRIP_ASSETS.activeLeftHold
            : canScrollLeft
              ? CONTROL_STRIP_ASSETS.activeLeft
              : CONTROL_STRIP_ASSETS.inactiveLeft;
        } else if (part === 'right') {
          element.src = canScrollRight && pressedPart === 'right'
            ? CONTROL_STRIP_ASSETS.activeRightHold
            : canScrollRight
              ? CONTROL_STRIP_ASSETS.activeRight
              : CONTROL_STRIP_ASSETS.inactiveRight;
        }
        continue;
      }

      if (part?.startsWith('pane:')) {
        const itemId = part.slice('pane:'.length);
        const item = items.find((candidate) => candidate.id === itemId);
        if (!item) continue;
        element.classList.toggle('is-pressed', pressedPart === part);
        element.style.backgroundImage = `url("${getPaneAsset(item, pressedPart === part)}")`;
      }
    }
  };

  const setPressedPart = (nextPressedPart: PressedPart): void => {
    if (pressedPart === nextPressedPart) {
      return;
    }

    pressedPart = nextPressedPart;
    updatePressedVisuals();
  };
'''
if old not in text:
    raise SystemExit('setPressedPart block not found')
text = text.replace(old, new, 1)

old = '''    track.replaceChildren(...trackParts);
    scheduleContentResize();
  };
'''
new = '''    track.replaceChildren(...trackParts);
    updatePressedVisuals();
    scheduleContentResize();
  };
'''
if old not in text:
    raise SystemExit('render tail not found')
text = text.replace(old, new, 1)

old = '''  const renderMenu = (): void => {
    menuLayer.replaceChildren();
    // Always re-measure: opening grows the window, closing shrinks it back.
    scheduleContentResize();

    if (!openWindowMenu) {
      return;
    }

    const item = items.find((candidate) => candidate.id === openWindowMenu?.itemId);
    if (!item) {
      return;
    }

    const menu = createWindowMenu(item, openWindowMenu, closeWindowMenu);
    menuLayer.append(menu);
  };
'''
new = '''  const renderMenu = (): void => {
    if (!openWindowMenu) {
      menuLayer.replaceChildren();
      scheduleContentResize();
      return;
    }

    const item = items.find((candidate) => candidate.id === openWindowMenu?.itemId);
    if (!item) {
      menuLayer.replaceChildren();
      scheduleContentResize();
      return;
    }

    const menu = createWindowMenu(item, openWindowMenu, closeWindowMenu);
    menuLayer.replaceChildren(menu);
    scheduleContentResize();
  };
'''
if old not in text:
    raise SystemExit('renderMenu block not found')
text = text.replace(old, new, 1)

old = '''  image.src = part.src;
  image.alt = part.alt;
'''
new = '''  image.src = part.src;
  image.alt = part.alt;
  image.dataset.pressedPart = part.pressedPart;
'''
if old not in text:
    raise SystemExit('createImagePart block not found')
text = text.replace(old, new, 1)

old = '''  pane.dataset.itemId = item.id;
'''
new = '''  pane.dataset.itemId = item.id;
  pane.dataset.pressedPart = panePressedPart;
'''
if old not in text:
    raise SystemExit('pane dataset block not found')
text = text.replace(old, new, 1)

control_strip.write_text(text)

main = Path('src/main.ts')
main_text = main.read_text()
old = '''  let contextMenu: HTMLDivElement | null = null;
  let stripContentSize = { width: 1, height: 24 };
'''
new = '''  let contextMenu: HTMLDivElement | null = null;
  let stripContentSize = { width: 1, height: 24 };
  let lastRequestedStripSize = { width: 0, height: 0 };
'''
if old not in main_text:
    raise SystemExit('main state block not found')
main_text = main_text.replace(old, new, 1)

old = '''    onContentResize: ({ width, height }) => {
      stripContentSize = { width, height };

      if (!contextMenu) {
        resizeStripWindow(width, height);
      }
    }
'''
new = '''    onContentResize: ({ width, height }) => {
      stripContentSize = { width, height };

      if (contextMenu) {
        return;
      }

      if (
        Math.abs(width - lastRequestedStripSize.width) < 1 &&
        Math.abs(height - lastRequestedStripSize.height) < 1
      ) {
        return;
      }

      lastRequestedStripSize = { width, height };
      resizeStripWindow(width, height);
    }
'''
if old not in main_text:
    raise SystemExit('onContentResize block not found')
main_text = main_text.replace(old, new, 1)
main.write_text(main_text)
