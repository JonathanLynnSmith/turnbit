# turnbit

Electron + Spotify controller for the Ulanzi D100H dial. The main process composes application services, desktop adapters, and provider
integrations in `src/`. The renderer uses an ES module bootstrap and feature
factories, with a classic coordinator retained for the existing interfaces and
verification harnesses. The Ulanzi Studio plugin lives in `ulanzi-plugin/`.
See [docs/architecture.md](docs/architecture.md) for contracts and dependency rules.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run check` | ESLint with dependency rules, then the `node --test` unit suite |
| `npm run test:desktop` | Window Mode and Now Playing Backdrop verification in real Electron windows |
| `npm run test:playback` | Normalized services and hardware commands in real Electron with a fake provider |
| `npm run format:check` | Source formatting verification |
| `npm start` | The app |
| `npm run smoke:paused` | The paused interfaces' suite — see below |

The `scripts/verify-*.js` files are single-purpose Electron harnesses; run one
directly with `npx electron scripts/verify-<name>.js`. They are timing-sensitive
under load, so prefer waiting on a condition (`until(...)`) over a fixed delay,
and drive behaviour through preferences rather than poking internals.

## Paused: the iPod and Zune interfaces

**Do not work on the iPod or Zune interfaces for now.** They still ship and stay
selectable under Settings → Appearance → Interface. They are simply not being
developed: the turnbit (radial) interface, Window Mode and the Now Playing
Backdrop are where the work goes.

In practice:

- Do not add features, polish, or fix cosmetic issues in `renderer/classic.css`,
  `renderer/zune.css`, or the `interfaceStyle === 'ipod'` / `'zune'` branches of
  `renderer/renderer.js` unless asked for them directly.
- Keep them *working*. Shared code (navigation, playback, preferences, the
  hardware bridge) must not break them, and none of their code or saved data
  should be deleted. This is a pause, not a removal.
- No routine command touches them. `scripts/smoke.js` and
  `scripts/preview-zune.js` are their suites, kept intact and reachable only
  through `npm run smoke:paused` and `npx electron scripts/preview-zune.js`.
- Several `verify-*` scripts still switch interfaces while testing *shared*
  behaviour (back row, Home layout, hover shortcuts, load more, return to song).
  That is fine and worth keeping. But if one of those assertions breaks because
  of a change to shared code, drop the paused interface's half of the assertion
  rather than reworking the paused screens.

To resume, start with `npm run smoke:paused`: it is **already failing** at the
point the pause began, on its first classic-interface check ("Classic root menu
shows current artwork preview", `#menuPreview` hidden). That failure predates the
pause — it reproduces at commit `97c637e` — so it is a known starting point, not
a regression from pausing. Then restore the two pieces of coverage removed when
the pause began:

- `scripts/verify-window-mode.js` — switching to iPod and Zune proved they take
  their compact window constraints, and that returning to the turnbit interface
  restored its own saved placement.
- `scripts/verify-now-playing-backdrop.js` — a loop asserting the Now Playing
  Backdrop hides itself for every non-radial interface.
