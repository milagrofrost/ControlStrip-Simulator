# Flyout Lifecycle Report

## Starting commit

`97d37758e987ed49e325769fed9c39749ac053d8`

## Files changed

- `src/ControlStrip.ts`
- `src/controlStripModel.ts`
- `src/flyoutLifecycle.ts`
- `src/flyoutLifecycle.test.ts`
- `src/main.ts`
- `src/windowMenu.ts`
- `src/windowMenuPayload.ts`
- `src/windowMenuPayload.test.ts`
- `src-tauri/src/lib.rs`
- `FLYOUT_LIFECYCLE_REPORT.md`

## Held-state ownership design

The main Control Strip webview owns the active flyout-held pane through a session-scoped owner `{ appId, sessionId }`.

`ControlStrip.ts` exposes `setFlyoutHeldOwner()`. Pane rendering treats the owner app id as equivalent to the existing pressed state, reusing the same held pane artwork and `is-pressed` class. Pointer release and pointer movement may clear the transient pointer press, but they do not clear the flyout-held owner while a matching flyout is active.

Opening a new flyout replaces the previous owner. A failed open clears the owner through the same lifecycle controller.

## Flyout session/event design

Each long press creates a frontend `sessionId` before invoking `show_window_menu`. The Tauri command receives a structured request and embeds `appId` and `sessionId` in the native flyout payload.

The native flyout window emits `control-strip://flyout-closed` with `{ appId, sessionId }` from the Tauri `WindowEvent::Destroyed` path. An atomic guard ensures the close event is emitted once per native flyout instance.

The main webview ignores stale close events by matching both `appId` and `sessionId` in `FlyoutLifecycleController`.

## Hover-state coordination design

The originating pane reports hover changes through the Control Strip callback `onFlyoutOriginHover`. The flyout menu reports menu hover through `control-strip://flyout-menu-hover`.

Both hover payloads include `{ appId, sessionId, hovered }`. The lifecycle controller ignores events that do not match the active session.

Initial state is set to `originHovered: true` when the long press opens the flyout, because the long-press timer is canceled if the pointer leaves before opening.

## Timer ownership and cleanup behavior

`FlyoutLifecycleController` owns the two-second outside-hover timer. It starts one timer only when both `originHovered` and `menuHovered` are false, cancels it when either region is re-entered, and requests native close after `2000` ms outside both regions.

The timeout requests `hideWindowMenu()` but does not clear held state directly. Held state clears only after the native destroyed event, or immediately for an opening failure. Controller cleanup is idempotent and clears pending timers on close, failed open, replacement, or destroy.

## Tests added

Added `src/flyoutLifecycle.test.ts` covering:

- opening marks the originating pane as held
- pointer release does not clear held state while active
- closure clears held state
- stale closure does not clear a newer flyout
- leaving both regions starts the countdown
- re-entering the pane cancels the countdown
- entering the flyout cancels the countdown
- remaining outside both closes after two seconds
- repeated leave events do not create multiple timers
- closing clears a pending timer
- opening a different flyout replaces the active owner
- failed open clears held state

Updated payload tests to require `sessionId`.

## Validation results

- `npm ci`: passed; npm reported existing audit findings and no dependency changes were made.
- `npm test`: passed.
- `npm run build`: passed.
- `npm run lint`: failed because `package.json` does not define a `lint` script.
- `npm run format:check`: failed because `package.json` does not define a `format:check` script.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: passed.
- `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.
- `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.

## Remaining Pi/X11 manual checks

These checks were not performed in this environment:

1. Hold VLC until the flyout opens.
2. Release the mouse while remaining over the pane.
3. Confirm the pane stays visually held.
4. Move the pointer into the flyout.
5. Confirm the pane remains held and the flyout stays open.
6. Move the pointer away from both.
7. Confirm the flyout remains visible for approximately two seconds.
8. Return to the pane before two seconds and confirm closure is canceled.
9. Repeat and return to the flyout before two seconds; confirm closure is canceled.
10. Remain outside both for two seconds and confirm the flyout closes and the pane returns to its normal/open state.
11. Select a window and confirm the flyout closes and the pane releases.
12. Press Escape and confirm the same cleanup.
13. Open one flyout, then another, and confirm no pane remains incorrectly held.
14. Confirm normal short clicks still work.
15. Confirm pane geometry and neighboring pane positions do not move.

## Known edge cases

- If the native flyout window is created but destroyed before the flyout webview finishes bootstrapping, cleanup still relies on the native destroyed event and remains session-scoped.
- The outside-hover timer is intentionally owned only by the main webview. The flyout renderer only reports menu hover; it does not manage close timing.
