import { afterEach, describe, expect, it, vi } from 'vitest';

import { FLYOUT_CLOSE_GRACE_MS, FlyoutLifecycleController } from './flyoutLifecycle';
import type { FlyoutSession } from './flyoutLifecycle';

const firstSession: FlyoutSession = { appId: 'vlc', sessionId: 'session-1' };
const secondSession: FlyoutSession = { appId: 'firefox', sessionId: 'session-2' };

describe('flyout lifecycle controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the originating pane as held when a flyout opens', () => {
    const heldOwners: Array<FlyoutSession | null> = [];
    const controller = new FlyoutLifecycleController({
      onHeldOwnerChange: (owner) => heldOwners.push(owner)
    });

    controller.open(firstSession, { originHovered: true });

    expect(controller.isHeld('vlc')).toBe(true);
    expect(heldOwners).toEqual([firstSession]);
  });

  it('does not clear held state for pointer release while the flyout remains open', () => {
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: true });

    expect(controller.isHeld('vlc')).toBe(true);
  });

  it('clears held state when the flyout closes', () => {
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.close(firstSession);

    expect(controller.isHeld('vlc')).toBe(false);
    expect(controller.getActiveSession()).toBeNull();
  });

  it('ignores stale closure events for an older flyout', () => {
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.open(secondSession, { originHovered: true });
    controller.close(firstSession);

    expect(controller.isHeld('firefox')).toBe(true);
    expect(controller.getActiveSession()).toEqual(secondSession);
  });

  it('starts the two-second countdown after leaving both regions', () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const controller = new FlyoutLifecycleController({ onRequestClose });

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });

    expect(controller.hasPendingCloseTimer()).toBe(true);
    vi.advanceTimersByTime(FLYOUT_CLOSE_GRACE_MS - 1);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('cancels the countdown when the pointer re-enters the pane', () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const controller = new FlyoutLifecycleController({ onRequestClose });

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    controller.setOriginHovered({ ...firstSession, hovered: true });

    expect(controller.hasPendingCloseTimer()).toBe(false);
    vi.advanceTimersByTime(FLYOUT_CLOSE_GRACE_MS);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('cancels the countdown when the pointer enters the flyout', () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const controller = new FlyoutLifecycleController({ onRequestClose });

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    controller.setMenuHovered({ ...firstSession, hovered: true });

    expect(controller.hasPendingCloseTimer()).toBe(false);
    vi.advanceTimersByTime(FLYOUT_CLOSE_GRACE_MS);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('requests closure after remaining outside both regions for two seconds', () => {
    vi.useFakeTimers();
    const onRequestClose = vi.fn();
    const controller = new FlyoutLifecycleController({ onRequestClose });

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    vi.advanceTimersByTime(FLYOUT_CLOSE_GRACE_MS);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onRequestClose).toHaveBeenCalledWith(firstSession);
  });

  it('does not create multiple timers for repeated leave events', () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    controller.setMenuHovered({ ...firstSession, hovered: false });

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('clears a pending timer when the flyout closes', () => {
    vi.useFakeTimers();
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.setOriginHovered({ ...firstSession, hovered: false });
    controller.close(firstSession);

    expect(controller.hasPendingCloseTimer()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the active owner when opening a different flyout', () => {
    const heldOwners: Array<FlyoutSession | null> = [];
    const controller = new FlyoutLifecycleController({
      onHeldOwnerChange: (owner) => heldOwners.push(owner)
    });

    controller.open(firstSession, { originHovered: true });
    controller.open(secondSession, { originHovered: true });

    expect(controller.isHeld('vlc')).toBe(false);
    expect(controller.isHeld('firefox')).toBe(true);
    expect(heldOwners).toEqual([firstSession, secondSession]);
  });

  it('clears held state when flyout opening fails', () => {
    const controller = new FlyoutLifecycleController();

    controller.open(firstSession, { originHovered: true });
    controller.failOpen(firstSession);

    expect(controller.isHeld('vlc')).toBe(false);
  });
});
