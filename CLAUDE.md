# turnbit

A better Now Playing for Spotify, as a window, widget, or mini player, that
feels best with a dial but works with any input. Keep features input-agnostic:
the Ulanzi D100H is one supported dial alongside other dials, keyboard, and
mouse. New features should make Now Playing nicer to look at or easier to
control from any input.

Built with Electron. The main process composes application services, desktop adapters, and provider
integrations in `src/`. The renderer is ES modules: `bootstrap.mjs` loads the
helper scripts, and `renderer.js` composes the feature factories and ends with
the explicit list of names the verification harnesses may reach. The Ulanzi Studio plugin lives in `ulanzi-plugin/`.
See [docs/architecture.md](docs/architecture.md) for contracts and dependency rules.

## Commands

| Command | What it runs |
| --- | --- |
| `npm run check` | ESLint with dependency rules, the formatting check, then the `node --test` unit suite |
| `npm run test:desktop` | Window Mode and Now Playing Backdrop verification in real Electron windows |
| `npm run test:playback` | Normalized services and hardware commands in real Electron with a fake provider |
| `npm run format:check` | Source formatting verification |
| `npm run test:harnesses` | Smoke plus every offline `scripts/verify-*.js` harness, one after another, with a pass/fail summary |
| `npm run smoke` | Offline turnbit demo flow through the real app and simulated dial bridge |
| `npm start` | The app |

The `scripts/verify-*.js` files are single-purpose Electron harnesses; run one
directly with `npx electron scripts/verify-<name>.js`, or a few by name with
`node scripts/verify-all.js <name> <name>`. Each requires `scripts/harness-env.js`
first, which stops Chromium pausing a harness window that another window covers.
They are timing-sensitive
under load, so prefer waiting on a condition (`until(...)`) over a fixed delay,
and drive behaviour through preferences rather than poking internals.

## Archived interfaces

Only the turnbit radial interface is developed and shipped on main. iPod and
Zune are preserved on the remote `archive/ipod-zune-interfaces` branch at
`c73554c`, including their assets, paused smoke suite, and restoration notes.
Do not restore them to main unless requested. Saved interface selections fall
back to radial; unrelated preferences and saved song lists remain intact.
