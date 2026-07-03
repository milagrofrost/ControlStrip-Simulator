# ControlStrip Simulator

ControlStrip Simulator is a standalone Vite frontend prototype inspired by the Macintosh Mac OS 9 Control Strip.

This project is separate from AtEase. It currently renders a static browser-only prototype with hardcoded test items and PNG assets. It does not include Tauri, backend code, app launching, config, or real window detection.

## Run The Prototype

Install dependencies:

```sh
npm install
```

Start the Vite dev server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

## Component Model

The Control Strip component lives in `src/ControlStrip.ts`, with styles in `src/ControlStrip.css`.

The prototype keeps its asset mapping in `CONTROL_STRIP_ASSETS` and its hardcoded item data in `TEST_ITEMS`.

Each test item has an `id`, `label`, `placeholderIcon`, and `isOpen` flag:

- Closed apps use `pane.png`.
- Open apps use `pane_arrow.png`.
- Pressed parts swap to matching `*_hold.png` assets where available.
- Tail dragging changes the visible pane count.
- Left and right controls scroll through the hardcoded item list.

Future work may add Tauri integration, app launching, and real window detection.
