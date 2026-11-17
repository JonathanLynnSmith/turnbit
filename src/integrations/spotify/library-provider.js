const { normalizeTrack } = require('./track');
function createSpotifyLibraryProvider(client) {
  return {
    async page({ kind, id, offset }) {
      let raw;
      try {
        raw = await client.library(kind, id, offset);
      } catch (error) {
        // Said here because only the message crosses to the view; the status code does not.
        if (error.status === 403)
          throw Object.assign(
            new Error(
              'Spotify denied browsing. Reconnect for library permissions; playlist contents require ownership or collaboration.',
            ),
            { status: 403, code: 'denied' },
          );
        throw error;
      }
      const items = (raw?.items || []).map((entry, index) => {
        if (kind === 'playlists')
          return {
            kind: 'collection',
            id: entry.id,
            playbackId: entry.uri,
            title: entry.name || 'Untitled playlist',
            artwork:
              entry.images?.findLast((image) => image.width >= 96)?.url ||
              entry.images?.[0]?.url ||
              '',
          };
        const item = entry.item || entry.track;
        return {
          kind: 'track',
          track: normalizeTrack(item),
          position: offset + index,
          playable:
            !!item &&
            !item.is_local &&
            item.is_playable !== false &&
            !item.restrictions &&
            /^spotify:(track|episode):[A-Za-z0-9]{22}$/.test(item.uri || ''),
        };
      });
      return {
        items,
        total: raw?.total ?? items.length,
        nextOffset: raw?.next
          ? offset + (raw.items?.length || raw.limit || 50)
          : null,
      };
    },
  };
}
module.exports = { createSpotifyLibraryProvider };
