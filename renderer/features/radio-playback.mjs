export function radioStartPosition(durationMs, random = Math.random) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const min = Math.ceil(durationMs * 0.15);
  const max = Math.min(
    Math.floor(durationMs) - 1,
    Math.floor(durationMs * 0.85),
  );
  return Math.max(
    0,
    Math.min(max, Math.floor(min + random() * (max - min + 1))),
  );
}

export function createRadioStationPlayer({
  library,
  command,
  random = Math.random,
}) {
  return async (playlist, { cancelled = () => false } = {}) => {
    let offset = 0;
    while (!cancelled()) {
      const page = await library('playlist', playlist.id, offset);
      if (cancelled()) return false;
      const index = (page.items || []).findIndex(
        ({ item }) =>
          item &&
          !item.is_local &&
          item.is_playable !== false &&
          !item.restrictions &&
          /^spotify:track:[A-Za-z0-9]{22}$/.test(item.uri || '') &&
          item.duration_ms > 0,
      );
      if (index >= 0) {
        const item = page.items[index].item;
        return command('play-item', {
          contextUri: playlist.uri,
          position: offset + index,
          item,
          startPositionMs: radioStartPosition(item.duration_ms, random),
        });
      }
      if (!page.next) break;
      const next = page.nextOffset ?? offset + (page.items?.length || 0);
      if (!Number.isInteger(next) || next <= offset || next > 100000) break;
      offset = next;
    }
    if (cancelled()) return false;
    throw new Error('No playable songs were found in this station.');
  };
}
