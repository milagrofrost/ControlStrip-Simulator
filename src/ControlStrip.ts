import './ControlStrip.css';

import activeLeft from './assets/control-strip/active_left.png';
import activeLeftHold from './assets/control-strip/active_left_hold.png';
import activeRight from './assets/control-strip/active_right.png';
import activeRightHold from './assets/control-strip/active_right_hold.png';
import inactiveLeft from './assets/control-strip/inactive_left.png';
import inactiveRight from './assets/control-strip/inactive_right.png';
import head from './assets/control-strip/head.png';
import headHold from './assets/control-strip/head_hold.png';
import tail from './assets/control-strip/tail.png';
import tailHold from './assets/control-strip/tail_hold.png';
import pane from './assets/control-strip/pane.png';
import paneHold from './assets/control-strip/pane_hold.png';
import paneArrow from './assets/control-strip/pane_arrow.png';
import paneArrowHold from './assets/control-strip/pane_arrow_hold.png';

const CONTROL_STRIP_ASSETS = {
  activeLeft,
  activeLeftHold,
  activeRight,
  activeRightHold,
  inactiveLeft,
  inactiveRight,
  head,
  headHold,
  tail,
  tailHold,
  pane,
  paneHold,
  paneArrow,
  paneArrowHold
};

export type ControlStripItem = {
  id: string;
  label: string;
  icon: string;
  isOpen: boolean;
  windows?: ControlStripWindow[];
};

export type ControlStripWindow = {
  id: string;
  title: string;
  isActive?: boolean;
};

export type PressedPart = null | 'head' | 'tail' | 'left' | 'right' | `pane:${string}`;

type OpenWindowMenu = {
  itemId: string;
  anchorRect: {
    left: number;
    top: number;
    width: number;
    bottom: number;
    right: number;
  };
};

type AnchorRect = OpenWindowMenu['anchorRect'];

type ActivePanePress = {
  item: ControlStripItem;
  pointerId: number;
  anchorRect: AnchorRect;
};

type StripPart = {
  src: string;
  alt: string;
  pressedPart: Exclude<PressedPart, null>;
  isPressable?: boolean;
  onPressStart?: (event: PointerEvent) => void;
  onPressCancel?: () => void;
  className?: string;
};

const TEST_ITEMS: ControlStripItem[] = [
  { id: 'finder', label: 'Finder', icon: 'F', isOpen: true, windows: [{ id: 'desktop', title: 'Desktop', isActive: true }] },
  {
    id: 'browser',
    label: 'Web Browser',
    icon: 'W',
    isOpen: true,
    windows: [
      { id: 'docs', title: 'Control Strip Notes' },
      { id: 'mail', title: 'Inbox - Long Project Planning Thread' },
      { id: 'release', title: 'Release Checklist and Compatibility Matrix' }
    ]
  },
  { id: 'calculator', label: 'Calculator', icon: 'C', isOpen: false },
  { id: 'paint', label: 'Paint', icon: 'P', isOpen: true, windows: [] },
  {
    id: 'editor',
    label: 'Text Editor',
    icon: 'T',
    isOpen: true,
    windows: [
      { id: 'readme', title: 'README.md' },
      { id: 'proposal', title: 'Very Long Window Title For Menu Width Testing' }
    ]
  },
  { id: 'music', label: 'Music Player', icon: 'M', isOpen: false }
];

const initialVisibleStart = 0;
const initialVisibleCount = 3;
const minVisibleCount = 1; // A zero-pane strip leaves the scroll controls acting on an invisible window.
const defaultPaneWidth = 27;
const longPressDelayMs = 1000;

type ResizeState = {
  startX: number;
  startVisibleCount: number;
  paneWidth: number;
};

export function createControlStrip(): HTMLElement {
  let pressedPart: PressedPart = null;
  // visibleStart is the first item index in view; visibleCount is the pane window size.
  let visibleStart = initialVisibleStart;
  let visibleCount = initialVisibleCount;
  // Tail dragging compares horizontal pointer movement to one measured pane width.
  let resizeState: ResizeState | null = null;
  let activePanePress: ActivePanePress | null = null;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let openWindowMenu: OpenWindowMenu | null = null;
  const eventController = new AbortController();

  const strip = document.createElement('section');
  strip.className = 'control-strip';
  strip.setAttribute('aria-label', 'Mac OS 9 Control Strip');

  const track = document.createElement('div');
  track.className = 'control-strip__track';

  const menuLayer = document.createElement('div');
  menuLayer.className = 'control-strip__menu-layer';

  strip.append(track, menuLayer, createAssetPreload());

  const setPressedPart = (nextPressedPart: PressedPart): void => {
    if (pressedPart === nextPressedPart) {
      return;
    }

    pressedPart = nextPressedPart;
    render();
  };

  const clearPressedPart = (): void => {
    setPressedPart(null);
  };

  const closeWindowMenu = (): void => {
    if (!openWindowMenu) {
      return;
    }

    openWindowMenu = null;
    renderMenu();
  };

  const clearLongPressTimer = (): void => {
    if (longPressTimer === null) {
      return;
    }

    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  const clearActivePanePress = (): void => {
    clearLongPressTimer();
    activePanePress = null;
    longPressTriggered = false;
  };

  const clampVisibleStart = (nextVisibleStart: number): number => {
    const maxVisibleStart = Math.max(0, TEST_ITEMS.length - visibleCount);
    return Math.min(Math.max(nextVisibleStart, 0), maxVisibleStart);
  };

  const clampVisibleCount = (nextVisibleCount: number): number => {
    return Math.min(Math.max(nextVisibleCount, minVisibleCount), TEST_ITEMS.length);
  };

  const scrollBy = (delta: number): void => {
    const nextVisibleStart = clampVisibleStart(visibleStart + delta);

    if (nextVisibleStart === visibleStart) {
      return;
    }

    visibleStart = nextVisibleStart;
    render();
  };

  const beginResize = (event: PointerEvent): void => {
    resizeState = {
      startX: event.clientX,
      startVisibleCount: visibleCount,
      paneWidth: getPaneWidth(track)
    };
  };

  const updateResize = (event: PointerEvent): void => {
    if (!resizeState) {
      return;
    }

    const dragDistance = event.clientX - resizeState.startX;
    const nextVisibleCount = clampVisibleCount(
      Math.round(resizeState.startVisibleCount + dragDistance / resizeState.paneWidth)
    );

    if (nextVisibleCount === visibleCount) {
      return;
    }

    visibleCount = nextVisibleCount;
    visibleStart = clampVisibleStart(visibleStart);
    render();
  };

  const endResize = (): boolean => {
    if (!resizeState) {
      return false;
    }

    resizeState = null;
    return true;
  };

  const activatePressedPart = (): void => {
    if (resizeState) {
      return;
    }

    const activePressedPart = pressedPart;

    if (activePressedPart === 'left') {
      scrollBy(-1);
    }

    if (activePressedPart === 'right') {
      scrollBy(1);
    }

    if (activePressedPart?.startsWith('pane:')) {
      if (longPressTriggered) {
        return;
      }

      const itemId = activePressedPart.slice('pane:'.length);
      const item = TEST_ITEMS.find((candidate) => candidate.id === itemId);

      if (item) {
        activatePane(item);
      }
    }
  };

  const releasePressedPart = (event: PointerEvent): void => {
    if (activePanePress) {
      if (event.pointerId !== activePanePress.pointerId) {
        return;
      }

      clearLongPressTimer();

      if (longPressTriggered) {
        activePanePress = null;
        longPressTriggered = false;
        clearPressedPart();
        return;
      }

      const item = activePanePress.item;
      activePanePress = null;
      activatePane(item);
      clearPressedPart();
      return;
    }

    clearLongPressTimer();
    activatePressedPart();
    longPressTriggered = false;
    const didEndResize = endResize();
    clearPressedPart();

    if (didEndResize && pressedPart === null) {
      render();
    }
  };

  strip.addEventListener(
    'pointerleave',
    () => {
      if (activePanePress && !longPressTriggered) {
        clearActivePanePress();
      }

      clearPressedPart();
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'pointerup',
    (event) => {
      releasePressedPart(event);
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'pointercancel',
    () => {
      clearActivePanePress();
      const didEndResize = endResize();
      clearPressedPart();

      if (didEndResize && pressedPart === null) {
        render();
      }
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'pointermove',
    (event) => {
      updateResize(event);
      cancelPanePressIfPointerLeftAnchor(event);
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (!openWindowMenu) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && menuLayer.contains(target)) {
        return;
      }

      closeWindowMenu();
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        closeWindowMenu();
      }
    },
    { signal: eventController.signal }
  );
  window.addEventListener(
    'beforeunload',
    () => {
      clearLongPressTimer();
    },
    { signal: eventController.signal }
  );

  const render = (): void => {
    const visibleItems = TEST_ITEMS.slice(visibleStart, visibleStart + visibleCount);
    const canScrollLeft = visibleStart > 0;
    const canScrollRight = visibleStart + visibleCount < TEST_ITEMS.length;

    track.replaceChildren(
      createImagePart(
        {
          src: pressedPart === 'head' ? CONTROL_STRIP_ASSETS.headHold : CONTROL_STRIP_ASSETS.head,
          alt: 'Control Strip head',
          pressedPart: 'head',
          isPressable: true
        },
        setPressedPart,
        clearPressedPart
      ),
      createImagePart(
        {
          src:
            canScrollLeft && pressedPart === 'left'
              ? CONTROL_STRIP_ASSETS.activeLeftHold
              : canScrollLeft
                ? CONTROL_STRIP_ASSETS.activeLeft
                : CONTROL_STRIP_ASSETS.inactiveLeft,
          alt: canScrollLeft ? 'Scroll left' : 'Scroll left unavailable',
          pressedPart: 'left',
          isPressable: canScrollLeft
        },
        setPressedPart,
        clearPressedPart
      ),
      ...visibleItems.map((item) =>
        createPane(item, pressedPart, attachPaneHandlers)
      ),
      createImagePart(
        {
          src:
            canScrollRight && pressedPart === 'right'
              ? CONTROL_STRIP_ASSETS.activeRightHold
              : canScrollRight
                ? CONTROL_STRIP_ASSETS.activeRight
                : CONTROL_STRIP_ASSETS.inactiveRight,
          alt: canScrollRight ? 'Scroll right' : 'Scroll right unavailable',
          pressedPart: 'right',
          isPressable: canScrollRight
        },
        setPressedPart,
        clearPressedPart
      ),
      createImagePart(
        {
          src:
            pressedPart === 'tail' || resizeState
              ? CONTROL_STRIP_ASSETS.tailHold
              : CONTROL_STRIP_ASSETS.tail,
          alt: 'Control Strip tail',
          pressedPart: 'tail',
          isPressable: true,
          onPressStart: beginResize,
          className: 'control-strip__tail'
        },
        setPressedPart,
        clearPressedPart
      )
    );
  };

  const beginPaneLongPress = (item: ControlStripItem, anchorRect: AnchorRect): void => {
    clearLongPressTimer();
    longPressTriggered = false;

    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;

      if (!activePanePress || activePanePress.item.id !== item.id || !hasSelectableWindows(item)) {
        return;
      }

      longPressTriggered = true;
      openWindowMenu = {
        itemId: item.id,
        anchorRect: {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width,
          bottom: anchorRect.bottom,
          right: anchorRect.right
        }
      };
      renderMenu();
    }, longPressDelayMs);
  };

  const attachPaneHandlers = (
    pane: HTMLElement,
    item: ControlStripItem,
    panePressedPart: `pane:${string}`
  ): void => {
    pane.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }

      const rect = pane.getBoundingClientRect();
      const anchorRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        bottom: rect.bottom,
        right: rect.right
      };

      activePanePress = {
        item,
        pointerId: event.pointerId,
        anchorRect
      };

      if (pane.setPointerCapture) {
        pane.setPointerCapture(event.pointerId);
      }

      setPressedPart(panePressedPart);

      if (hasSelectableWindows(item)) {
        beginPaneLongPress(item, anchorRect);
      }
    });
  };

  const cancelPanePressIfPointerLeftAnchor = (event: PointerEvent): void => {
    if (!activePanePress || longPressTriggered || event.pointerId !== activePanePress.pointerId) {
      return;
    }

    const { anchorRect } = activePanePress;
    const isInsideAnchor =
      event.clientX >= anchorRect.left &&
      event.clientX <= anchorRect.right &&
      event.clientY >= anchorRect.top &&
      event.clientY <= anchorRect.bottom;

    if (isInsideAnchor) {
      return;
    }

    clearActivePanePress();
    clearPressedPart();
  };

  const renderMenu = (): void => {
    menuLayer.replaceChildren();

    if (!openWindowMenu) {
      return;
    }

    const item = TEST_ITEMS.find((candidate) => candidate.id === openWindowMenu?.itemId);
    if (!item) {
      return;
    }

    const menu = createWindowMenu(item, openWindowMenu, closeWindowMenu);
    menuLayer.append(menu);
  };

  render();
  const removeStrip = strip.remove.bind(strip);
  strip.remove = () => {
    clearLongPressTimer();
    eventController.abort();
    removeStrip();
  };

  return strip;
}

function createImagePart(
  part: StripPart,
  setPressedPart: (pressedPart: PressedPart) => void,
  clearPressedPart: () => void
): HTMLImageElement {
  const image = document.createElement('img');
  image.className = ['control-strip__part', 'control-strip__image-part', part.className]
    .filter(Boolean)
    .join(' ');
  image.src = part.src;
  image.alt = part.alt;
  image.draggable = false;

  if (part.isPressable) {
    attachPressHandlers(
      image,
      part.pressedPart,
      setPressedPart,
      clearPressedPart,
      part.onPressStart,
      part.onPressCancel
    );
  }

  return image;
}

function createPane(
  item: ControlStripItem,
  pressedPart: PressedPart,
  attachPaneHandlers: (
    pane: HTMLElement,
    item: ControlStripItem,
    panePressedPart: `pane:${string}`
  ) => void
): HTMLElement {
  const panePressedPart = `pane:${item.id}` as const;
  const isPressed = pressedPart === panePressedPart;
  const pane = document.createElement('div');
  pane.className = [
    'control-strip__part',
    'control-strip__pane',
    hasSelectableWindows(item) && 'is-open',
    isPressed && 'is-pressed'
  ]
    .filter(Boolean)
    .join(' ');
  pane.style.backgroundImage = `url("${getPaneAsset(item, isPressed)}")`;
  pane.setAttribute('role', 'img');
  pane.setAttribute('aria-label', item.label);
  attachPaneHandlers(pane, item, panePressedPart);

  const icon = document.createElement('span');
  icon.className = 'control-strip__icon';
  icon.textContent = item.icon;
  pane.append(icon);

  return pane;
}

function activatePane(item: ControlStripItem): void {
  if (item.isOpen) {
    console.log(`Control Strip: would bring all windows forward for app ${item.id} (${item.label})`);
    return;
  }

  console.log(`Control Strip: would launch app ${item.id} (${item.label})`);
}

function createWindowMenu(
  item: ControlStripItem,
  openWindowMenu: OpenWindowMenu,
  closeWindowMenu: () => void
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'control-strip__window-menu';
  menu.style.left = `${openWindowMenu.anchorRect.left}px`;
  menu.style.top = `${openWindowMenu.anchorRect.top}px`;
  menu.style.minWidth = `${openWindowMenu.anchorRect.width}px`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `${item.label} windows`);

  for (const windowItem of item.windows ?? []) {
    const row = document.createElement('button');
    row.className = ['control-strip__window-menu-row', windowItem.isActive && 'is-active']
      .filter(Boolean)
      .join(' ');
    row.type = 'button';
    row.textContent = windowItem.title;
    row.dataset.appId = item.id;
    row.dataset.windowId = windowItem.id;
    row.addEventListener('click', () => {
      console.log(
        `Control Strip: would select window ${windowItem.id} (${windowItem.title}) for app ${item.id}`
      );
      closeWindowMenu();
    });
    menu.append(row);
  }

  return menu;
}

function getPaneAsset(item: ControlStripItem, isPressed: boolean): string {
  // Only items with selectable windows use pane_arrow.png to reserve arrow space.
  if (hasSelectableWindows(item)) {
    return isPressed ? CONTROL_STRIP_ASSETS.paneArrowHold : CONTROL_STRIP_ASSETS.paneArrow;
  }

  return isPressed ? CONTROL_STRIP_ASSETS.paneHold : CONTROL_STRIP_ASSETS.pane;
}

function hasSelectableWindows(item: ControlStripItem): boolean {
  return item.isOpen && Boolean(item.windows?.length);
}

function attachPressHandlers(
  element: HTMLElement,
  pressedPart: Exclude<PressedPart, null>,
  setPressedPart: (pressedPart: PressedPart) => void,
  clearPressedPart: () => void,
  onPressStart?: (event: PointerEvent) => void,
  onPressCancel?: () => void
): void {
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    setPressedPart(pressedPart);
    onPressStart?.(event);
  });
  element.addEventListener('pointercancel', () => {
    onPressCancel?.();
    clearPressedPart();
  });
  element.addEventListener('pointerleave', () => {
    onPressCancel?.();
    clearPressedPart();
  });
}

function getPaneWidth(track: HTMLElement): number {
  const pane = track.querySelector<HTMLElement>('.control-strip__pane');
  return pane?.getBoundingClientRect().width || defaultPaneWidth;
}

function createAssetPreload(): HTMLElement {
  const preload = document.createElement('div');
  preload.className = 'control-strip__preload';
  preload.setAttribute('aria-hidden', 'true');

  for (const [name, src] of Object.entries(CONTROL_STRIP_ASSETS)) {
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.dataset.asset = name;
    preload.append(image);
  }

  return preload;
}
