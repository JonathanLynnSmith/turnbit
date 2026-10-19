# Turnbit architecture

Turnbit is one installed Electron desktop/widget application for macOS and Windows.
Its application services run in the main process. Internal APIs are JavaScript
contracts exposed through preload and Electron IPC. The loopback HTTP bridge is
only for the external Ulanzi plugin; there is no frontend server to deploy.

## Where code belongs

| Location | Responsibility |
| --- | --- |
| `src/main.js` | Composition and lifecycle: construct services, integrations, native window, input, bridge, and tray |
| `src/app/` | Playback state/polling/commands, library pagination, versioned application settings, and hardware command routing |
| `src/core/` | Two reusable stateful input primitives: held transport gestures and coalesced value writes |
| `src/desktop/window.js` | Native window lifecycle, placement, interface constraints, visibility, click-through, and move/resize gestures |
| `src/desktop/ipc.js` | Register and remove desktop IPC handlers; delegate to services and native operations |
| `src/desktop/*storage.js` | Filesystem persistence and injected secure storage |
| `src/integrations/spotify/` | Authentication, HTTP policy, provider codecs, recovery, and local-media reconciliation |
| `src/spotify.js` | Compose the Spotify integration and coordinate its playback actions and like confirmation |
| `renderer/bootstrap.mjs` | Explicit imports for frontend dependencies and feature factories |
| `renderer/features/` | Settings and library controllers, playback rendering, and the radial view |
| `renderer/client/` | IPC clients and adapters for the existing screens |
| `renderer/renderer.js` | Existing interface composition, navigation coordination, demo state, and control bindings |
| `ulanzi-plugin/` | External device plugin and vendor SDK |

Application modules must not import Electron, desktop implementations, Spotify
implementations, or renderer code. Supply their dependencies explicitly. They
must not access browser storage or the DOM. ESLint enforces these boundaries.
Frontend feature modules receive state accessors and callbacks rather than
looking up application globals. Integrations own provider formats and protocols.

Prefer functions and factories. Keep helpers with the feature that owns them.
Extract common behavior when repeated uses demonstrate the same semantics; a
clear responsibility boundary can justify a module with one caller. The two
core classes own timer-driven state and serve backend hardware, frontend pointer
controls, and existing tests. There are no base controllers or universal services.

## Playback

`createPlaybackService(provider, options)` owns the canonical snapshot, event
subscriptions, command ordering, connection lifecycle, and polling. A provider
implements `read()`, `command(name, value)`, `subscribe(listener)`, and capability
flags. The service is tested with an in-memory provider and an injected clock,
without Electron or a DOM.

The preload exposes `window.turnbit.playback`:

- `getState()` reads the cached snapshot without a provider request.
- `refresh()` reads current state and deduplicates concurrent refreshes.
- `command(name, value)` dispatches an application command.
- `onEvent(listener)` returns an unsubscribe function.
- `presentation(hidden)` reports document visibility; the desktop combines this
  with native minimized/invisible state to choose polling frequency.

Snapshots use `track.title`, `track.artists`, `track.durationMs`, `playing`,
`positionMs`, `observedAt`, `device.volume`, `shuffle`, and repeat modes
`off` / `all` / `one`. IDs are opaque strings; linked IDs preserve relinked-track
matching. Capability flags describe supported controls. Full JSDoc contracts are
in `src/app/playback-model.js`.

Polling is 5 seconds for active/local playback, 15 seconds when paused or remote
playback is idle, and 30 seconds when hidden. Track-end checks do not repeatedly
query a lagging provider. Disconnect clears state and timers; old queued commands
cannot run in a new connection. Dispose unsubscribes from the provider. Spotify's
own delayed reconciliation reads remain inside its integration.

## Library

`createLibraryService(provider)` validates requests, deduplicates pending pages,
and rejects results belonging to an old connection. It returns independent
copies to consumers. The provider owns endpoint selection and item normalization.

`window.turnbit.library.page({kind, id?, offset?})` returns:

```js
{
  items: [
    // Collection: {kind: 'collection', id, playbackId, title}
    // Track: {kind: 'track', track, position, playable}
  ],
  total: 80,
  nextOffset: 50 // null at the end; provider URLs never cross the boundary
}
```

Kinds are `playlists`, `songs`, and `playlist`. Collection IDs are opaque. The
existing frontend's liked-song cache and selection-follow behavior belong to its
library controller; the service does not know about menu rows or highlight state.

## Settings and migration

Application recovery settings live in `application-settings.json` under Electron's
user-data directory. The file has `{schemaVersion: 1, migrated: true, values}`.
Settings validation is supplied by the feature, and filesystem storage is supplied
by the desktop host. Writes complete before in-memory state or subscribers change.
Unknown future schema versions are not overwritten.

`window.turnbit.settings` provides `get()`, `update(patch)`,
`importLegacy(values)`, and `onChange(listener)`. The existing frontend imports
its old recovery values once. Backend settings then win over stale browser copies.
Quick edits are serialized, and outdated acknowledgements cannot replace newer
frontend edits. Failed writes restore the frontend's backend-owned values.

Presentation preferences remain in browser storage (including legacy `dialpod`
migrations and paused-interface preferences). Native window placement retains its
existing files and formats. Encrypted Spotify sessions and endpoint cooldown files
retain their existing formats. No saved preference or credential data is removed.

The `spotify:recovery` IPC alias remains for the existing frontend and verification
scripts; it delegates to the settings service rather than configuring the provider
directly. Browser storage is a migration/display copy of application settings,
not their authority.

## Hardware and view policies

`src/app/hardware-input.js` executes real playback commands against the playback
service even if the renderer is missing. It owns hardware transport holds and
coalesces volume/seek writes. The native window reports idle state, and the view
reports whether Play should open Now Playing. Demo input and navigation gestures
remain frontend behavior. Feedback events do not execute the command again.

A visible Play press can open Now Playing without toggling. A quiet Play press
acts without waking the interface. If no view is available, playback still works.
The tray and pointer/keyboard client also use the same application playback service.

## Existing interfaces

Feature modules load through explicit imports in `bootstrap.mjs`. The coordinator
remains a classic script so the shipped interfaces and existing desktop harnesses
retain their named entry points during migration. Playback and library adapters
translate normalized contracts into the fields those screens already use. New
interfaces should consume the normalized preload APIs directly.

The paused iPod and Zune interfaces and their saved data remain intact. Their
standalone suites remain opt-in as described in `CLAUDE.md`. Further interface
work can move individual navigation/control bindings out of the coordinator
without changing the backend contracts; this is no longer a prerequisite for
adding another frontend.

## Checks and release verification

- `npm run check`: ESLint (including dependency rules) and unit/contract tests.
- `npm run format:check`: consistent source formatting. `npm run format` applies it.
- `npm run test:playback`: real Electron composition with a fake Spotify network
  boundary, normalized IPC/library, backend settings, renderer reload/crash recovery,
  and hardware playback without a renderer. Uses a temporary profile and no real credentials.
- `npm run test:desktop`: Window Mode and Now Playing verification.
- `npm run test:navigation`: large-list navigation probe; asserts synchronous local
  selection, no layout IPC on dial turns, and working size-preview/cancel updates.
- Focused `scripts/verify-*.js` harnesses cover settings, recovery, quiet play,
  selection-follow behavior, pagination, visibility, and gestures.

Before release, manually verify live Spotify and physical Ulanzi controls on both
macOS and Windows: connect/reconnect, preferred-device recovery, idle Play, library
paging/selection, transport holds, volume, quiet wake, and switching Widget/Window
Mode while music continues. Automated checks do not replace this platform/hardware
pass. No framework, monorepo, or dependency injection container is required.
