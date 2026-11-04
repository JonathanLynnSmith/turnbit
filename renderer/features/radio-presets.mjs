// Reservoir sampling gives every eligible playlist a chance, including later pages.
// No listening-history ranking or additional Spotify scopes are needed.
export async function pickRadioPlaylists({
  library,
  existing = [],
  count = 10,
  random = Math.random,
  cancelled = () => false,
}) {
  const seen = new Set(existing.map((station) => station.id));
  const sample = [];
  let offset = 0,
    eligible = 0;
  while (!cancelled()) {
    const page = await library(offset, true);
    if (cancelled()) return null;
    for (const playlist of page.items || []) {
      if (
        !playlist ||
        playlist.radioEligible !== true ||
        !/^spotify:playlist:[A-Za-z0-9]{22}$/.test(playlist.uri || '') ||
        typeof playlist.id !== 'string' ||
        typeof playlist.name !== 'string' ||
        seen.has(playlist.id)
      )
        continue;
      seen.add(playlist.id);
      eligible++;
      if (sample.length < count) sample.push(playlist);
      else {
        const slot = Math.floor(random() * eligible);
        if (slot < count) sample[slot] = playlist;
      }
    }
    if (!page.next) break;
    const next = page.nextOffset ?? offset + (page.items?.length || 0);
    if (!Number.isInteger(next) || next <= offset || next > 100000)
      throw new Error('Could not finish loading playlists. Try again.');
    offset = next;
  }
  if (cancelled()) return null;
  // Also randomize the frequency assignment when there are fewer than ten.
  for (let i = sample.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [sample[i], sample[j]] = [sample[j], sample[i]];
  }
  return sample;
}
