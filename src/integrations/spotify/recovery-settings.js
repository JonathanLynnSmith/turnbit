const RECOVERY_DEFAULTS = {
  preferredDevice: null,
  autoLaunchSpotify: true,
  coldStart: { mode: 'last', playlist: null },
};
function normalizeRecoverySettings(value = {}, current = RECOVERY_DEFAULTS) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid playback settings.');
  const settings = structuredClone(current);
  if (Object.hasOwn(value, 'preferredDevice')) {
    const device = value.preferredDevice;
    if (
      device !== null &&
      (!device ||
        typeof device.id !== 'string' ||
        !device.id ||
        device.id.length > 256 ||
        typeof device.name !== 'string' ||
        device.name.length > 256)
    )
      throw new Error('Select a valid preferred device.');
    settings.preferredDevice = device
      ? {
          id: device.id,
          name: device.name,
          type: String(device.type || '').slice(0, 64),
        }
      : null;
  }
  if (Object.hasOwn(value, 'coldStart')) {
    const next = value.coldStart || {},
      mode = ['last', 'liked', 'playlist', 'off'].includes(next.mode)
        ? next.mode
        : 'last';
    const playlist = /^spotify:playlist:[a-zA-Z0-9]{22}$/.test(
      next.playlist?.uri || '',
    )
      ? {
          uri: next.playlist.uri,
          name: String(next.playlist.name || '').slice(0, 256),
        }
      : null;
    if (mode === 'playlist' && !playlist)
      throw new Error(
        'Choose a playlist for Play to start when nothing is playing.',
      );
    settings.coldStart = { mode, playlist };
  }
  if (typeof value.autoLaunchSpotify === 'boolean')
    settings.autoLaunchSpotify = value.autoLaunchSpotify;
  return settings;
}
module.exports = { RECOVERY_DEFAULTS, normalizeRecoverySettings };
