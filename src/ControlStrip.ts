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
  icon?: string;
  desktopFile?: string;
  wmClass?: string;
  isPinned?: boolean;
  isOpen: boolean;
  windows?: ControlStripWindow[];
  match?: WindowMatch;
  disabled?: boolean;
  error?: string;
};

export type ControlStripWindow = {
  id: string;
  title: string;
  isActive?: boolean;
};

export type ControlStripElement = HTMLElement & {
  setItems: (nextItems: ControlStripItem[]) => void;
};

export type ControlStripSizingOptions = {
  visibleIcons?: number | null;
  snapBackSeconds?: number;
};

export type ScreenCornerOptions = {
  enabled?: boolean;
  position?: 'bottom-left' | string;
  radius?: number;
  color?: string;
};

export type ControlStripOptions = {
  onLaunchPinnedApp?: (item: ControlStripItem) => void;
  onFocusAppWindows?: (item: ControlStripItem) => void;
  onContentResize?: (size: { width: number; height: number }) => void;
  sizing?: ControlStripSizingOptions;
  screenCorner?: ScreenCornerOptions;
};

export type PinnedAppConfig = {
  desktop_file: string;
  match?: WindowMatch;
};

export type WindowMatch = {
  wm_class?: string;
  title_contains?: string;
};

export type ParsedDesktopFile = {
  name?: string;
  icon?: string;
  exec?: string;
  startup_wm_class?: string;
  type?: string;
  hidden?: boolean;
  no_display?: boolean;
  comment?: string;
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
    // Viewport height captured with the rect, so the menu can be anchored to the
    // strip's distance-from-bottom and stay put when the window is resized.
    viewportHeight: number;
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

const initialVisibleStart = 0;
const minVisibleCount = 1; // A zero-pane strip leaves the scroll controls acting on an invisible window.
const defaultPaneWidth = 27;
const longPressDelayMs = 1000;
const defaultSnapBackDelayMs = 10000;

type ResizeState = {
  startX: number;
  startVisibleCount: number;
  paneWidth: number;
};

export function createControlStrip(
  initialItems: ControlStripItem[] = [],
  options: ControlStripOptions = {}
): ControlStripElement {
  let items = [...initialItems];
  const configuredVisibleCount = normalizeConfiguredVisibleCount(options.sizing?.visibleIcons);
  const snapBackDelayMs = normalizeSnapBackDelayMs(options.sizing?.snapBackSeconds);
  let pressedPart: PressedPart = null;
  // visibleStart is the first item index in view; visibleCount is the pane window size.
  let visibleStart = initialVisibleStart;
  let visibleCount = getDesiredVisibleCount(items.length, configuredVisibleCount);
  let isCollapsed = false;
  // Tail dragging compares horizontal pointer movement to one measured pane width.
  let resizeState: ResizeState | null = null;
  let activePanePress: ActivePanePress | null = null;
  let longPressTimer: number | null = null;
  let longPressTriggered = false;
  let openWindowMenu: OpenWindowMenu | null = null;
  let snapBackTimer: number | null = null;
  let contentResizeFrame: number | null = null;
  const eventController = new AbortController();

  const strip = document.createElement('section') as ControlStripElement;
  strip.className = 'control-strip';
  strip.setAttribute('aria-label', 'Mac OS 9 Control Strip');

  const track = document.createElement('div');
  track.className = 'control-strip__track';

  const screenCorner = createScreenCorner(options.screenCorner);

  const menuLayer = document.createElement('div');
  menuLayer.className = 'control-strip__menu-layer';

  const emptyMessage = document.createElement('div');
  emptyMessage.className = 'control-strip__empty-message';
  emptyMessage.textContent = 'No pinned apps';

  strip.append(track, screenCorner, emptyMessage, menuLayer, createAssetPreload());

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

  const clearSnapBackTimer = (): void => {
    if (snapBackTimer === null) {
      return;
    }

    window.clearTimeout(snapBackTimer);
    snapBackTimer = null;
  };

  const getDesiredVisiblePaneCount = (): number => {
    return getDesiredVisibleCount(items.length, configuredVisibleCount);
  };

  const snapBackToDesiredVisibleCount = (): void => {
    snapBackTimer = null;

    const nextVisibleCount = getDesiredVisiblePaneCount();
    if (nextVisibleCount === visibleCount) {
      return;
    }

    visibleCount = nextVisibleCount;
    visibleStart = clampVisibleStart(visibleStart);
    render();
  };

  const scheduleSnapBack = (): void => {
    clearSnapBackTimer();

    if (configuredVisibleCount === null || visibleCount === getDesiredVisiblePaneCount()) {
      return;
    }

    snapBackTimer = window.setTimeout(snapBackToDesiredVisibleCount, snapBackDelayMs);
  };

  const clearActivePanePress = (): void => {
    clearLongPressTimer();
    activePanePress = null;
    longPressTriggered = false;
  };

  const clampVisibleStart = (nextVisibleStart: number): number => {
    const maxVisibleStart = Math.max(0, items.length - visibleCount);
    return Math.min(Math.max(nextVisibleStart, 0), maxVisibleStart);
  };

  const clampVisibleCount = (nextVisibleCount: number): number => {
    if (items.length === 0) {
      return 0;
    }

    return Math.min(Math.max(nextVisibleCount, minVisibleCount), items.length);
  };

  const scrollBy = (delta: number): void => {
    const nextVisibleStart = clampVisibleStart(visibleStart + delta);

    if (nextVisibleStart === visibleStart) {
      return;
    }

    visibleStart = nextVisibleStart;
    render();
  };

  const toggleCollapsed = (): void => {
    clearSnapBackTimer();

    if (isCollapsed) {
      isCollapsed = false;
      visibleCount = items.length;
      visibleStart = 0;
      render();
      return;
    }

    isCollapsed = true;
    visibleCount = 0;
    visibleStart = 0;
    render();
  };

  const beginResize = (event: PointerEvent): void => {
    clearSnapBackTimer();
    isCollapsed = false;
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
    scheduleSnapBack();
    return true;
  };

  const activatePressedPart = (): void => {
    if (resizeState) {
      return;
    }

    const activePressedPart = pressedPart;

    if (activePressedPart === 'head') {
      toggleCollapsed();
      return;
    }

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
      const item = items.find((candidate) => candidate.id === itemId);

      if (item) {
        activatePane(item, options);
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
      clearPressedPart();
      activatePane(item, options);
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
    'blur',
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

  // Measure the union footprint of everything actually drawn (strip, empty-state
  // message, open window menu) so the host window can be shrunk to hug it. The strip
  // is bottom-left anchored, so height is measured up from the viewport bottom, which
  // is invariant to the window height we are about to set (no feedback loop).
  const measureContent = (): { width: number; height: number } | null => {
    const rects: DOMRect[] = [];
    const trackRect = track.getBoundingClientRect();
    if (trackRect.width > 0 && trackRect.height > 0) {
      rects.push(trackRect);
    }
    if (!emptyMessage.hidden) {
      rects.push(emptyMessage.getBoundingClientRect());
    }
    const menu = menuLayer.querySelector('.control-strip__window-menu');
    if (menu) {
      rects.push(menu.getBoundingClientRect());
    }

    if (rects.length === 0) {
      return null;
    }

    let right = 0;
    let top = window.innerHeight;
    for (const rect of rects) {
      right = Math.max(right, rect.right);
      top = Math.min(top, rect.top);
    }

    // +2 covers the strip's 1px drop-shadow filter so it is never clipped.
    return {
      width: Math.max(1, Math.ceil(right) + 2),
      height: Math.max(1, Math.ceil(window.innerHeight - top) + 2)
    };
  };

  const scheduleContentResize = (): void => {
    if (!options.onContentResize || contentResizeFrame !== null) {
      return;
    }

    contentResizeFrame = window.requestAnimationFrame(() => {
      contentResizeFrame = null;
      const size = measureContent();
      if (size) {
        options.onContentResize?.(size);
      }
    });
  };

  const render = (): void => {
    const visibleItems = items.slice(visibleStart, visibleStart + visibleCount);
    const canScrollLeft = !isCollapsed && visibleStart > 0;
    const canScrollRight = !isCollapsed && visibleCount > 0 && visibleStart + visibleCount < items.length;
    const shouldRenderScrollControls = !isCollapsed;

    emptyMessage.hidden = items.length > 0;

    const trackParts: HTMLElement[] = [
      createImagePart(
        {
          src: pressedPart === 'head' ? CONTROL_STRIP_ASSETS.headHold : CONTROL_STRIP_ASSETS.head,
          alt: 'Control Strip head',
          pressedPart: 'head',
          isPressable: true
        },
        setPressedPart,
        clearPressedPart
      )
    ];

    if (shouldRenderScrollControls) {
      trackParts.push(
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
        )
      );
    }

    trackParts.push(
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

    track.replaceChildren(...trackParts);
    scheduleContentResize();
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
          right: anchorRect.right,
          viewportHeight: anchorRect.viewportHeight
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
        right: rect.right,
        viewportHeight: window.innerHeight
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

  strip.setItems = (nextItems: ControlStripItem[]): void => {
    const previousItemCount = items.length;
    const wasAtRightEdge = visibleStart + visibleCount >= previousItemCount;
    items = [...nextItems];
    visibleCount = isCollapsed
      ? 0
      : configuredVisibleCount === null
      ? getDesiredVisiblePaneCount()
      : visibleCount === 0 && items.length > 0
        ? getDesiredVisiblePaneCount()
        : clampVisibleCount(visibleCount);
    visibleStart = clampVisibleStart(
      wasAtRightEdge && items.length > previousItemCount
        ? items.length - visibleCount
        : visibleStart
    );

    const menuItem = openWindowMenu
      ? items.find((item) => item.id === openWindowMenu?.itemId)
      : null;
    if (openWindowMenu && (!menuItem || !hasSelectableWindows(menuItem))) {
      openWindowMenu = null;
    }

    render();
    renderMenu();
  };

  render();
  const removeStrip = strip.remove.bind(strip);
  strip.remove = () => {
    clearLongPressTimer();
    clearSnapBackTimer();
    if (contentResizeFrame !== null) {
      window.cancelAnimationFrame(contentResizeFrame);
      contentResizeFrame = null;
    }
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

function createScreenCorner(options: ScreenCornerOptions | undefined): HTMLElement {
  const corner = document.createElement('div');
  const enabled = options?.enabled ?? true;
  const position = options?.position ?? 'bottom-left';
  const radius = normalizeScreenCornerRadius(options?.radius);

  corner.className = 'control-strip__screen-corner';
  corner.setAttribute('aria-hidden', 'true');
  corner.hidden = !enabled || position !== 'bottom-left' || radius <= 0;
  corner.style.width = `${radius}px`;
  corner.style.height = `${radius}px`;
  corner.style.background = `radial-gradient(circle at top right, transparent 0 ${radius}px, ${options?.color ?? '#000000'} ${radius}px)`;

  return corner;
}

function normalizeScreenCornerRadius(radius: number | null | undefined): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return 18;
  }

  return Math.max(0, radius);
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
    isPressed && 'is-pressed',
    item.disabled && 'is-disabled'
  ]
    .filter(Boolean)
    .join(' ');
  pane.style.backgroundImage = `url("${getPaneAsset(item, isPressed)}")`;
  pane.dataset.itemId = item.id;
  pane.setAttribute('role', 'img');
  pane.setAttribute('aria-label', item.label);
  pane.title = item.error ? `${item.label}: ${item.error}` : item.label;

  if (!item.disabled) {
    attachPaneHandlers(pane, item, panePressedPart);
  }

  const icon = document.createElement('span');
  icon.className = ['control-strip__icon', item.icon ? 'has-image' : 'has-text']
    .filter(Boolean)
    .join(' ');
  if (item.icon) {
    const iconImage = document.createElement('img');
    iconImage.className = 'control-strip__icon-image';
    iconImage.src = item.icon;
    iconImage.alt = '';
    icon.append(iconImage);
  } else {
    icon.textContent = getPlaceholderIcon(item.label);
  }
  pane.append(icon);

  return pane;
}

function activatePane(item: ControlStripItem, options: ControlStripOptions): void {
  if (item.disabled) {
    console.log(`Control Strip: pinned app ${item.id} is disabled: ${item.error ?? 'unknown error'}`);
    return;
  }

  if (item.isOpen) {
    options.onFocusAppWindows?.(item);
    return;
  }

  if (item.isPinned) {
    options.onLaunchPinnedApp?.(item);
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
  // Anchor to the pane's distance from the viewport bottom (invariant when the
  // window is resized to hug content) and grow upward from there.
  const bottomOffset = openWindowMenu.anchorRect.viewportHeight - openWindowMenu.anchorRect.top + 3;
  menu.style.left = `${openWindowMenu.anchorRect.left}px`;
  menu.style.bottom = `${bottomOffset}px`;
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
  return !item.disabled && item.isOpen && Boolean(item.windows?.length);
}

function getPlaceholderIcon(label: string): string {
  const trimmed = label.trim();
  return trimmed.slice(0, 2) || '?';
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

function normalizeConfiguredVisibleCount(visibleIcons: number | null | undefined): number | null {
  if (visibleIcons === null || visibleIcons === undefined || !Number.isFinite(visibleIcons)) {
    return null;
  }

  const normalized = Math.floor(visibleIcons);
  return normalized > 0 ? normalized : null;
}

function normalizeSnapBackDelayMs(snapBackSeconds: number | undefined): number {
  if (snapBackSeconds === undefined || !Number.isFinite(snapBackSeconds)) {
    return defaultSnapBackDelayMs;
  }

  return Math.max(0, snapBackSeconds * 1000);
}

function getDesiredVisibleCount(itemCount: number, configuredVisibleCount: number | null): number {
  if (itemCount === 0) {
    return 0;
  }

  if (configuredVisibleCount === null) {
    return itemCount;
  }

  return Math.min(Math.max(configuredVisibleCount, minVisibleCount), itemCount);
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
