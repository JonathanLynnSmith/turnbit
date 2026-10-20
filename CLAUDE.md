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
| `npm run smoke` | Offline turnbit demo flow through the real app and simulated dial bridge |
| `npm start` | The app |

The `scripts/verify-*.js` files are single-purpose Electron harnesses; run one
directly with `npx electron scripts/verify-<name>.js`. They are timing-sensitive
under load, so prefer waiting on a condition (`until(...)`) over a fixed delay,
and drive behaviour through preferences rather than poking internals.

## Archived interfaces

Only the turnbit radial interface is developed and shipped on main. iPod and
Zune are preserved on the remote `archive/ipod-zune-interfaces` branch at
`c73554c`, including their assets, paused smoke suite, and restoration notes.
Do not restore them to main unless requested. Saved interface selections fall
back to radial; unrelated preferences and saved song lists remain intact.
