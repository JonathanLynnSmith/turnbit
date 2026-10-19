function normalizeTrack(item) {
  if (!item) return null;
  return {
    id: item.uri || '',
    linkedId: item.linked_from?.uri || null,
    publisher: item.publisher || '',
    title: item.name || '',
    artists: (item.artists || []).map((artist) => artist.name),
    album: {
      title: item.album?.name || '',
      artwork: (item.album?.images || []).map(({ url, width, height }) => ({
        url,
        width,
        height,
      })),
    },
    durationMs: item.duration_ms || 0,
    local: item.is_local === true,
    kind: item.type === 'episode' ? 'episode' : 'track',
  };
}
function spotifyTrack(track) {
  if (!track) return undefined;
  return {
    uri: track.id,
    ...(track.linkedId ? { linked_from: { uri: track.linkedId } } : {}),
    ...(track.publisher ? { publisher: track.publisher } : {}),
    name: track.title,
    artists: track.artists.map((name) => ({ name })),
    album: { name: track.album.title, images: track.album.artwork },
    duration_ms: track.durationMs,
    is_local: track.local,
    type: track.kind,
  };
}

module.exports = { normalizeTrack, spotifyTrack };
