# Phase 2 Integration Report

## Summary

- Starting commit SHA: `b9cd677c7562135e12d8631925336ea9d086df4f`
- Integration branch: `codex/phase-2-beta`
- Final integration commit: `9dcc96cd6ee2eee7af6609a1332f1627fdf50c85`
- Skipped phases: none
- Deferred work: issue #19 was not started
- Recommended first Pi checkpoint to test: `phase2/02-polling-performance`, then continue through `phase2/06-icon-cache`

## Branches, Merges, Tags

| Phase | Branch | Merge commit | Checkpoint tag |
| --- | --- | --- | --- |
| Baseline | `codex/phase-2-beta` | `b9cd677c7562135e12d8631925336ea9d086df4f` | `phase2/00-baseline` |
| Test dependencies | `codex/phase2-test-dependencies` | `7b0244ef1c3e88551127b61bc0411567ffa2f024` | `phase2/01-test-dependencies` |
| X11 polling | `codex/issue-18-polling-performance` | `8a711d9eb77728efcd6794f1a6e2da84d21a5cd5` | `phase2/02-polling-performance` |
| Context menu | `codex/issue-22-context-menu` | `662dc9f856885d9be0a6ae4e7c00c9c8e3526edb` | `phase2/03-context-menu` |
| Config cache | `codex/issue-22-config-cache` | `bcdfc81e93dcc90e12b3a2d4aa8599eb94d486c2` | `phase2/04-config-cache` |
| CI quality | `codex/issue-23-ci-quality` | `5676a5cff927846bafec80c62ae8ce6777b4b022` | `phase2/05-ci-quality` |
| Icon cache | `codex/native-icon-resolution-cache` | `9dcc96cd6ee2eee7af6609a1332f1627fdf50c85` | `phase2/06-icon-cache` |

## Files Changed

- Phase 1: `package.json`, `package-lock.json`
- Phase 2: `scripts/window-check.sh`
- Phase 3: `src/contextMenu.ts`, `src/contextMenu.css`, `src/contextMenu.test.ts`, `src/main.ts`
- Phase 4: `src-tauri/src/lib.rs`
- Phase 5: `.github/workflows/ci.yml`, `build.sh`, `src-tauri/src/lib.rs`
- Phase 6: `src-tauri/src/lib.rs`

## Commands Run

- Branch/tag/push flow: `git fetch --all --tags`, `git switch`, `git pull --ff-only`, `git tag -a`, `git merge --no-ff`, `git push`
- Frontend/dependencies: `npm install`, `npm ci`, `npm test`, `npm run build`, `npm ls vite vitest jsdom`, `npm audit`
- Rust: `cargo check --manifest-path src-tauri/Cargo.toml`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo fmt --manifest-path src-tauri/Cargo.toml`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- Shell: `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`, `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`, `shellcheck scripts/window-check.sh`

## Validation Results

- `npm test`: passed
- `npm run build`: passed
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed
- `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed
- `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed
- Pre-existing failures: none in the final validation suite
- ShellCheck availability: available at `/usr/bin/shellcheck`, version `0.10.0`

## Dependency Changes

- Removed direct `jsdom` dev dependency because current Vitest tests do not require a DOM test environment.
- Replaced Vitest 4 with pinned `vitest@1.6.1`, keeping Vite 5 unchanged.
- Current dependency tree: `vite@5.4.21`, `vitest@1.6.1`, no installed `jsdom`.

## npm Audit

`npm audit` reports 4 vulnerabilities through the Vite/esbuild chain: 2 moderate, 1 high, 1 critical. The suggested fix is `npm audit fix --force`, which would install `vite@8.1.4` and is a breaking upgrade. No unrelated dependency upgrade was performed in this phase.

## X11 Polling

- Preserved normal-window detection, minimized windows, `_NET_WM_WINDOW_TYPE_NORMAL`, `_NET_WM_STATE_SKIP_TASKBAR`, `_NET_WM_STATE_SKIP_PAGER`, exact-title exclusions, WM_CLASS exclusions, and JSON fields `id`, `title`, `wm_class_instance`, `wm_class`, optional `pid`.
- Changed polling to call `xprop` once per window for all needed properties, parse simple values in Bash, emit one JSON object per accepted window, and combine once with `jq -s`.
- Approximate subprocess count for 5 accepted windows with no config exclusions:
  - Before: about 62 subprocesses (`xdotool`, 25 `xprop`, 15 `grep`, 15 `sed`, 6 `jq`)
  - After: about 12 subprocesses (`xdotool`, 5 `xprop`, 6 `jq`)
- X11 manual tests performed here: none. This environment did not expose a usable `DISPLAY`.
- X11 tests still required: Raspberry Pi X11/Openbox validation for normal windows, minimized windows, title and WM_CLASS exclusions, taskbar/pager skipped windows, Unicode titles, and representative poll timing.

## Context Menu

- Extracted right-click menu behavior from `src/main.ts` into `src/contextMenu.ts`.
- Moved menu CSS to `src/contextMenu.css`.
- Preserved pin/unpin/ignore actions, click-outside dismissal, immediate refresh, error logging, menu positioning, and native host-window resize while open.
- Added focused context-menu tests for extracted behavior.

## Config Cache

- Added managed Rust config state loaded at application startup.
- `get_control_strip_model`, launch, focus, resize, pin, unpin, and ignore paths use cached configuration instead of repeatedly reading `config.yaml`.
- Pin/unpin/ignore update the persisted YAML first, then update the in-memory cache only after successful write.
- Failed writes preserve prior cached state.
- Added explicit `reload_config` command for runtime manual reloads.
- Added Rust tests for initial load, successful update, failed write preserving prior state, and explicit reload.

## CI Workflow

- Added `.github/workflows/ci.yml` for pull requests and pushes to `main`.
- Uses Node 20, stable Rust, npm cache, Cargo cache, and only Tauri Linux development packages needed for check/test.
- Runs `npm ci`, `npm test`, `npm run build`, Rust check/test/fmt-check, shell syntax checks, and ShellCheck.
- Does not launch the Tauri GUI, publish releases, deploy, or collect coverage.
- Added Bash metadata to `build.sh` so ShellCheck can analyze it.

## Icon Cache

- Added icon-name cache independent from transient WM_CLASS app-resolution cache.
- Caches both successful data URLs and failed lookups.
- Keeps absolute path support, PNG/SVG/XPM support, current max-size check, and data-URL behavior.
- Checks direct candidate paths before broad recursive fallback.
- Builds icon roots from XDG data locations and includes user-local icons, `/usr/local/share/icons`, `/usr/share/icons`, `/usr/local/share/pixmaps`, and `/usr/share/pixmaps`.
- Recursive fallback is deterministic and bounded.
- Added Rust tests for cache hits, failed-result caching, direct-path preference, XDG path construction, `/usr/local/share/icons`, and deterministic candidate ranking.
