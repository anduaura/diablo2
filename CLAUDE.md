# Sanctuary — agent notes

A zero-dependency browser ARPG: one HTML file, one stylesheet, one script
(`js/game.js`, plain JS + Canvas 2D). No build step. `main` auto-deploys to
GitHub Pages on push.

## Workflow rules

- **Always finish work by opening a pull request to `main` and merging it**
  (squash merge, title in the repo's `Title (#NN)` style). Don't leave
  completed work sitting unmerged on a branch — merging is what deploys it.
- If the working branch's previous PR already merged, restart the branch
  from the latest `origin/main` before new work.
- `main` moves fast (parallel sessions); fetch and merge `origin/main`
  before opening the PR if it has advanced.
- **Every PR bumps the version**: in `js/version.js`, raise
  `SANCTUARY_VERSION` (minor for features, patch for fixes) and prepend a
  `SANCTUARY_CHANGELOG` entry (short player-facing notes). The service
  worker cache and the menu's "What's New" panel key off it; the deploy
  workflow stamps `SANCTUARY_BUILD` automatically.

## Testing

- `node --check js/game.js` after every change.
- Drive the real game headless with playwright-core and the system
  Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`) against
  `python3 -m http.server`; `window.__sanctuary` exposes game internals
  for tests. Screenshot visual changes and actually look at them.

## Code conventions

- Everything lives in `js/game.js`; keep its section-comment structure.
- Procedural canvas art only — no image assets, no external libraries.
- Tile art must derive randomness from `thash(x, y)` (deterministic per
  tile), never `Math.random()` in render paths — tiles flicker otherwise.
- New per-hero state goes through `saveGame()`/`startGame()` with a
  sensible default for old saves; shared state (stash, graveyard,
  trophies) uses its own localStorage key.
