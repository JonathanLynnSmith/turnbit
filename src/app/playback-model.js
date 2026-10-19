/**
 * Internal playback contract. IDs are opaque strings owned by the provider.
 * Position is measured at observedAt (epoch milliseconds); consumers may
 * interpolate it while playing, capped at track.durationMs.
 *
 * @typedef {Object} PlaybackTrack
 * @property {string} id
 * @property {string|null} linkedId
 * @property {string} publisher
 * @property {string} title
 * @property {string[]} artists
 * @property {{title: string, artwork: Array<{url: string, width?: number, height?: number}>}} album
 * @property {number} durationMs
 * @property {boolean} local
 * @property {'track'|'episode'} kind
 *
 * @typedef {Object} PlaybackCapabilities
 * @property {boolean} play
 * @property {boolean} pause
 * @property {boolean} next
 * @property {boolean} previous
 * @property {boolean} seek
 * @property {boolean} volume
 * @property {boolean} like
 * @property {boolean} shuffle
 * @property {boolean} repeat
 * @property {boolean} device
 *
 * @typedef {Object} PlaybackState
 * @property {PlaybackTrack|null} track
 * @property {boolean} playing
 * @property {number} positionMs
 * @property {number} observedAt
 * @property {{id: string, name: string, type: string, volume: number|null, restricted: boolean}|null} device
 * @property {{id: string}|null} context
 * @property {boolean|null} liked
 * @property {boolean} likedPending
 * @property {string|null} likeError
 * @property {boolean} shuffle
 * @property {'off'|'all'|'one'} repeat
 * @property {boolean} provisional
 * @property {'local'|'remote'} transport
 * @property {PlaybackCapabilities} capabilities
 *
 * @typedef {{type: 'state', state: PlaybackState|null}|
 *   {type: 'notice', message: string}|
 *   {type: 'error', message: string}|
 *   {type: 'device-recovered', device: {id: string, name: string, type: string}}} PlaybackEvent
 *
 * @typedef {Object} PlaybackProvider
 * @property {PlaybackCapabilities} capabilities Static support; state capabilities may narrow it.
 * @property {() => Promise<PlaybackState|null>} read
 * @property {(listener: (event: PlaybackEvent) => void) => () => void} subscribe
 * @property {(name: string, value?: unknown) => Promise<unknown>} command
 *
 * Commands: play/pause/toggle/next/previous, volume (0–100), seek (milliseconds),
 * like/shuffle/repeat, device ({id, name, type}), play-item ({trackId?, contextId?,
 * position?, track?: PlaybackTrack}). Recovery stays inside the provider.
 */
module.exports = {};
