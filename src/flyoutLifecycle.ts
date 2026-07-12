export const FLYOUT_CLOSE_GRACE_MS = 2000;

export const FLYOUT_CLOSED_EVENT = 'control-strip://flyout-closed';
export const FLYOUT_MENU_HOVER_EVENT = 'control-strip://flyout-menu-hover';

export interface FlyoutSession {
  appId: string;
  sessionId: string;
}

export interface FlyoutHoverEvent extends FlyoutSession {
  hovered: boolean;
}

export type FlyoutLifecycleSnapshot = FlyoutSession & {
  originHovered: boolean;
  menuHovered: boolean;
};

export type FlyoutLifecycleCallbacks = {
  onHeldOwnerChange?: (owner: FlyoutSession | null) => void;
  onRequestClose?: (session: FlyoutSession) => void;
};

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type FlyoutLifecycleTimers = {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

type ActiveFlyoutState = FlyoutLifecycleSnapshot & {
  closeTimer: TimerHandle | null;
};

export class FlyoutLifecycleController {
  private active: ActiveFlyoutState | null = null;

  private readonly timers: FlyoutLifecycleTimers;

  private readonly callbacks: FlyoutLifecycleCallbacks;

  constructor(callbacks: FlyoutLifecycleCallbacks = {}, timers: FlyoutLifecycleTimers = globalThis) {
    this.callbacks = callbacks;
    this.timers = timers;
  }

  getActiveSession(): FlyoutSession | null {
    if (!this.active) {
      return null;
    }

    return {
      appId: this.active.appId,
      sessionId: this.active.sessionId
    };
  }

  isHeld(appId: string): boolean {
    return this.active?.appId === appId;
  }

  hasPendingCloseTimer(): boolean {
    return Boolean(this.active?.closeTimer);
  }

  open(session: FlyoutSession, initialHover: { originHovered: boolean; menuHovered?: boolean }): void {
    this.clearTimer();
    this.active = {
      ...session,
      originHovered: initialHover.originHovered,
      menuHovered: initialHover.menuHovered ?? false,
      closeTimer: null
    };
    this.callbacks.onHeldOwnerChange?.(session);
    this.evaluateCloseTimer();
  }

  failOpen(session: FlyoutSession): void {
    if (!this.isActiveSession(session)) {
      return;
    }

    this.clearActive();
  }

  close(session: FlyoutSession): void {
    if (!this.isActiveSession(session)) {
      return;
    }

    this.clearActive();
  }

  setOriginHovered(event: FlyoutHoverEvent): void {
    if (!this.isActiveSession(event)) {
      return;
    }

    this.active!.originHovered = event.hovered;
    this.evaluateCloseTimer();
  }

  setMenuHovered(event: FlyoutHoverEvent): void {
    if (!this.isActiveSession(event)) {
      return;
    }

    this.active!.menuHovered = event.hovered;
    this.evaluateCloseTimer();
  }

  destroy(): void {
    this.clearActive();
  }

  private isActiveSession(session: FlyoutSession): boolean {
    return (
      this.active?.appId === session.appId &&
      this.active.sessionId === session.sessionId
    );
  }

  private evaluateCloseTimer(): void {
    if (!this.active) {
      return;
    }

    if (this.active.originHovered || this.active.menuHovered) {
      this.clearTimer();
      return;
    }

    if (this.active.closeTimer) {
      return;
    }

    const session = {
      appId: this.active.appId,
      sessionId: this.active.sessionId
    };
    this.active.closeTimer = this.timers.setTimeout(() => {
      if (!this.isActiveSession(session)) {
        return;
      }

      this.active!.closeTimer = null;
      this.callbacks.onRequestClose?.(session);
    }, FLYOUT_CLOSE_GRACE_MS);
  }

  private clearTimer(): void {
    if (!this.active?.closeTimer) {
      return;
    }

    this.timers.clearTimeout(this.active.closeTimer);
    this.active.closeTimer = null;
  }

  private clearActive(): void {
    this.clearTimer();
    this.active = null;
    this.callbacks.onHeldOwnerChange?.(null);
  }
}
