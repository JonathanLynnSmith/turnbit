const test = require('node:test');
const assert = require('node:assert/strict');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('FM reception has silent gaps and gradually strengthens towards either station', async () => {
  const { receptionAt, clampFrequency } = await import(
    '../renderer/features/radio-reception.mjs'
  );
  const stations = [{}, {}];
  assert.equal(receptionAt(89, stations).index, -1);
  assert.equal(receptionAt(89, stations).strength, 0);
  assert.equal(
    receptionAt(89.1, stations).index,
    1,
    'outer pickup starts Spotify before music clears',
  );
  assert.equal(
    receptionAt(89.1, stations).strength,
    0,
    'outer pickup remains covered by full static',
  );
  assert.ok(
    receptionAt(89.5, stations).strength < receptionAt(89.7, stations).strength,
  );
  assert.ok(
    receptionAt(89.7, stations).strength < receptionAt(89.9, stations).strength,
  );
  assert.equal(receptionAt(89.9, stations).strength, 1);
  assert.equal(receptionAt(88.1, stations).strength, 1);
  assert.equal(receptionAt(88.1, []).index, -1);
  assert.equal(clampFrequency(30), 87.5);
  assert.equal(clampFrequency(140), 108);
});

test('radio noise is stereo, varied, and has a smooth loop boundary', async () => {
  const { makeRadioNoise } = await import(
    '../renderer/features/radio-reception.mjs'
  );
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const channels = makeRadioNoise(8000, 1, random);
  assert.equal(channels.length, 2);
  assert.equal(channels[0].length, 8000);
  assert.notDeepEqual(channels[0], channels[1]);
  for (const samples of channels) {
    assert.ok(samples.every(Number.isFinite));
    const rms = Math.sqrt(
      samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
    );
    assert.ok(rms > 0.1 && rms < 0.6);
    assert.ok(
      Math.abs(samples[0] - samples.at(-1)) < 0.000001,
      'no step at the loop seam',
    );
  }
});

test('volume follows reception during a sustained sweep and restores after an in-flight write', async () => {
  const { createReceptionVolume } = await import(
    '../renderer/features/radio-reception.mjs'
  );
  const writes = [];
  let release;
  const volume = createReceptionVolume(async (value) => {
    writes.push(value);
    if (writes.length === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
  });
  volume.start(60);
  volume.set(0.2);
  await wait(240);
  assert.deepEqual(writes, [12]);
  volume.start(12); // Incoming remote volume must not replace the original level.
  volume.set(0.5);
  volume.set(0.9);
  volume.restore();
  release();
  await wait(200);
  assert.deepEqual(writes, [12, 60]);
  volume.start(60);
  for (let i = 0; i < 8; i++) {
    volume.set(i / 10);
    await wait(35);
  }
  assert.ok(writes.length >= 3, 'a moving dial sends updates before it stops');
  volume.restore();
  await wait(200);
  assert.equal(writes.at(-1), 60);
});
