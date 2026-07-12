# Issue 23 Quality Gate Report

## Starting point

- Starting commit SHA: `cc849df`
- Branch created from: `codex/phase-2-beta`
- Work branch: `codex/issue-23-finish-quality`

## Audit findings

Already present before this branch:

- Vitest frontend tests and `npm test`.
- Frontend production build through `npm run build`.
- Rust tests covering desktop-entry parsing, XDG application path resolution, ID validation, application matching, icon candidate ranking, icon resolution, and icon cache behavior.
- CI workflow for pull requests and pushes to `main`.
- Shell syntax and ShellCheck coverage for `build.sh`, `scripts/install-user-service.sh`, and `scripts/window-check.sh`.

Missing or incomplete issue requirements found during audit:

- `tsconfig.json` did not enable `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, or `noFallthroughCasesInSwitch`.
- No frontend ESLint or Prettier scripts/configuration.
- CI did not run frontend lint, frontend format check, or Rust Clippy.
- Baseline Clippy failed on the starting commit.
- README did not document the full local validation command set.

## Files changed

- `.github/workflows/ci.yml`
- `.prettierignore`
- `.prettierrc.json`
- `ISSUE23_REPORT.md`
- `README.md`
- `eslint.config.js`
- `package-lock.json`
- `package.json`
- `src/ControlStrip.ts`
- `src/WindowMenu.css`
- `src/contextMenu.css`
- `src/contextMenu.ts`
- `src/controlStripModel.test.ts`
- `src/controlStripModel.ts`
- `src/main.ts`
- `src/transientAppIcons.ts`
- `src/windowMenu.ts`
- `src/windowMenuPayload.test.ts`
- `src/windowMenuPayload.ts`
- `src-tauri/src/lib.rs`
- `tsconfig.json`

## Tests added

- Added a focused Vitest regression for unmatched running windows that:
  - falls back to `wm_class_instance` when `wm_class` is empty,
  - preserves first-seen temporary group ordering,
  - groups repeated temporary windows,
  - normalizes empty class identity to `running:unknown`.

Existing tests already covered the other issue areas: WM class normalization, application matching, stable pinned ordering, visible-count clamping, desktop-entry parsing, application-path resolution, ID validation, and icon candidate ranking/resolution.

## TypeScript checks enabled

Enabled in `tsconfig.json`:

- `noUnusedLocals`
- `noUnusedParameters`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`

`npm run build` passed with these checks enabled without additional TypeScript source changes.

## ESLint and formatting

Added:

- `eslint.config.js`
- `.prettierrc.json`
- `.prettierignore`
- `npm run lint`
- `npm run format:check`
- `npm run format`

ESLint is scoped to `src` and uses restrained TypeScript recommended rules with strict unused-variable handling. Prettier is scoped to maintained frontend/config/report/workflow files and ignores generated/build output.

## Clippy findings fixed

Baseline Clippy failed before this branch on:

- Derivable `Default` implementation for `ControlStripConfig`.
- Tauri command signature exceeding Clippy's argument-count preference.
- Needless generic argument borrow in config directory creation.
- Test-only cloned references that should use `std::slice::from_ref`.

Fixes:

- Replaced the manual default with `#[derive(Default)]`.
- Added a narrow documented allow for the Tauri command boundary because the signature mirrors frontend invoke arguments.
- Removed the needless borrow.
- Replaced cloned test slice refs with `std::slice::from_ref`.

## ShellCheck findings fixed

- No ShellCheck findings were present during baseline or final validation.
- `shellcheck` was available locally.

## GitHub Actions workflow summary

The CI workflow runs for pull requests and pushes to `main` on `ubuntu-24.04`.

It uses:

- `actions/checkout@v4`
- `actions/setup-node@v4` with Node 20 and npm cache
- `dtolnay/rust-toolchain@stable`
- `Swatinem/rust-cache@v2`
- Linux packages required for Tauri compile/check plus ShellCheck

It runs:

- `npm ci`
- `npm test`
- `npm run build`
- `npm run lint`
- `npm run format:check`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`
- `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`

The workflow does not launch the GUI, require an X server, publish artifacts, deploy, or hide failures with `continue-on-error`.

## Validation results

Baseline:

- `npm ci`: passed; npm reported 4 existing vulnerabilities.
- `npm test`: passed, 10 frontend tests.
- `npm run build`: passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 23 Rust tests.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: failed on pre-existing Clippy warnings listed above.
- `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.
- `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.

Final:

- `npm ci`: passed; npm reported 4 vulnerabilities.
- `npm test`: passed, 11 frontend tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 23 Rust tests.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: passed.
- `bash -n build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.
- `shellcheck build.sh scripts/install-user-service.sh scripts/window-check.sh`: passed.
- `npm ls --depth=0`: passed and showed expected top-level dependencies.

## Locally unavailable tools

- None.

## Remaining manual Pi tests

- GUI behavior still needs manual verification under the target Raspberry Pi X11/Openbox environment.
- This branch did not run or claim GUI validation.

## Acceptance criteria

All issue #23 automated quality-gate acceptance criteria are satisfied by this branch.
