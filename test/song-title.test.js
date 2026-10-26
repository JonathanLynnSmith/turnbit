const { test } = require('node:test');
const assert = require('node:assert/strict');

test('song title separates credits and versions without changing meaningful title text', async () => {
  const { splitSongTitle } = await import(
    '../renderer/features/song-title.mjs'
  );
  assert.deepEqual(
    splitSongTitle('Fortnight (feat. Post Malone) - BLOND:ISH Remix'),
    {
      title: 'Fortnight',
      detail: 'feat. Post Malone · BLOND:ISH Remix',
    },
  );
  assert.deepEqual(splitSongTitle('Song [2011 Remaster]'), {
    title: 'Song',
    detail: '2011 Remaster',
  });
  assert.deepEqual(splitSongTitle('Song - Remix'), {
    title: 'Song',
    detail: 'Remix',
  });
  for (const title of [
    'Sweet Dreams (Are Made of This)',
    'Love - Hate',
    '(feat. Someone)',
    'Live Forever',
    'Song (Part II)',
    '',
  ])
    assert.deepEqual(splitSongTitle(title), { title, detail: '' });
});
