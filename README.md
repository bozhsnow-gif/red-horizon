# Red Horizon

A browser game for exploring Gale Crater with the fictional ARES rover. It includes a custom WebGL 2 renderer, orbit and first-person cameras, a crater overview, free flight, terrain-following wheels, tire tracks, a landing intro, and Curiosity route references.

The rover starts at **4.6° S, 137.4° E**. The default landscape is estimated from a supplied color topographic map. The game can import a measured NASA MOLA elevation crop; importing is optional and does not turn the illustrative small rocks or vehicle physics into measured science data.

## Run locally

Use Node.js 22 or newer. No JavaScript packages are required by the game at runtime.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. Press **Begin Exploring** to watch the landing clip, then drive. The intro has Pause, Play, and Skip controls. Reset starts a fresh mission without replaying the clip.

For a portable static copy:

```sh
npm run build
```

Serve `dist/` with any static web server. You can also open `src/index.html` directly in a recent browser; serving it locally gives more predictable media and browser-storage behavior. WebGL 2 is required. Google Fonts is optional: local fallback fonts are used if it cannot load.

## Controls

| Action                       | Control                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Drive forward / reverse      | W / S or ↑ / ↓                                                          |
| Steer                        | A / D or ← / →                                                          |
| Orbit or look around         | Drag the mouse, or drag two fingers on the trackpad                     |
| Zoom                         | Pinch inward to zoom in, spread outward to zoom out; also + / − buttons |
| First-person / orbit view    | Shift + 1                                                               |
| Crater overview / orbit view | Shift + 2                                                               |
| Leave / return to the rover  | Double-tap Space, or the free-flight button                             |
| Fly                          | WASD to move, E to rise, Q to descend                                   |
| Recenter camera              | Double-click the view                                                   |
| Skip intro                   | Skip Intro button or Escape                                             |

The rover stays parked during free flight. Exploration mode is accelerated for play; Simulation mode caps speed at 0.04 m/s. The three travel buttons jump between the landing area, mountain, and southern rim. The mini-map cycles between nearby, route, and whole-crater views.

Named stops follow the supplied Curiosity route screenshots. Small intermediate checkpoints preserve the visible bends. Arrive within 12 m of the next driving checkpoint to advance; flying over it does not count.

## Project layout

| Path                                                            | Purpose                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/index.html`, `src/styles.css`, `src/app.js`                | Interface, input, mission state, and game loop                        |
| `src/renderer.js`                                               | WebGL terrain, rover, wheel motion, shadows, tracks, and cameras      |
| `src/gale.js`                                                   | Coordinates, terrain sampling, and simplified driving physics         |
| `src/mola-import.js`, `src/terrain-loader.js`, `src/nasa-ui.js` | NASA file validation, import, local storage, and provenance UI        |
| `src/traverse-data.js`, `src/waypoints.js`                      | Screenshot-derived route registration, named stops, and map display   |
| `src/intro.js`, `src/intro.css`                                 | Landing video playback and generated background                       |
| `src/ares4-mesh.js`                                             | Exported body and four wheel groups from Blender                      |
| `assets/source/`                                                | Original Blender rover, intro movie, and topographic conversion input |
| `tests/`                                                        | Current automated regression tests and shared harnesses               |
| `docs/`                                                         | Review notes and generated-image provenance                           |
| `history/`                                                      | Earlier patch scripts and snapshots retained as development history   |

Edit `src/`; `dist/` is generated. The scripts under `history/` describe earlier versions and may contain old absolute paths or assumptions. They are **not** the current build or test workflow.

## Check changes

```sh
npm test
npm run format:check
npm run build
npm run test:browser
```

`npm test` uses Node's test runner. Tests cover source loading, the intro and input state, geographic coordinates, MOLA parsing, waypoint progression, terrain/physics agreement, wheel contact, tracks, teleports, shadows, and camera matrices. MOLA parser tests use an explicitly synthetic affine surface, not downloaded NASA data. Renderer tests mock WebGL calls; they cannot prove shader compilation or visual quality.

The browser check uses Playwright with a locally installed Chrome on Windows or Playwright Chromium. If no supported browser is available, install one with `npx playwright install chromium`. The browser check is separate from the fast Node test suite.

Use `npm run format` to format maintained source and tests. Generated mesh/elevation files and historical snapshots are excluded from formatting.

## Terrain and reference limits

The optional import accepts the NASA MOLA 128-pixels-per-degree topography product `MEGT00N090HB.IMG` and its matching label. Download links and instructions are in the game's **NASA terrain & accuracy** panel. The game validates the label and binary layout, extracts the Gale region, and saves it in the current browser. It reports failed imports and keeps the existing landscape if storage is unavailable or full.

Measured MOLA cells are roughly 460 m apart. They do not resolve individual stones, dunes, tire hazards, or a safe driving route. The local map has projection distortion and omits planetary curvature. The image-derived fallback has additional unknown projection and elevation-datum limitations.

The route uses estimated positions manually traced from screenshots, with Bradbury Landing as its geographic anchor. It is not the full mission traverse or a live rover position. The Gediz Vallis screenshot is preserved as an unconnected reference because its missing connecting segment and absolute registration were not established.

See [ASSETS.md](ASSETS.md) for media sources and [docs/review.md](docs/review.md) for review findings and verification limits.
