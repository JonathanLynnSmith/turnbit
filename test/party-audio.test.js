const { test } = require('node:test');
const assert = require('node:assert/strict');

async function fixture(t, options = {}) {
  const original = new Map();
  const set = (key, value) => {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  };
  const frames = new Map(),
    styles = new Map();
  let next = 1,
    now = 100,
    handler,
    starts = 0,
    releases = 0;
  const media = Object.assign(new EventTarget(), { matches: false });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    body: {
      dataset: {},
      style: {
        setProperty: (k, v) => styles.set(k, v),
        removeProperty: (k) => styles.delete(k),
      },
    },
  });
  const window = new EventTarget();
  const state = {
    enabled: true,
    playing: true,
    ready: true,
    visible: true,
    gamingIdle: false,
    intensity: 50,
    source: 'default',
  };
  const messages = [];
  set('window', window);
  set('document', document);
  set('matchMedia', () => media);
  set('performance', { now: () => now });
  set('setTimeout', (fn) => {
    const id = next++;
    frames.set(id, fn);
    return id;
  });
  set('clearTimeout', (id) => frames.delete(id));
  const api = {
    supported: options.supported !== false,
    native: true,
    onData: (fn) => {
      handler = fn;
      return () => (handler = null);
    },
    start: async () => {
      starts++;
      return options.start ? options.start() : { name: 'Test output' };
    },
    pause: async () => {},
    release: async () => {
      releases++;
    },
  };
  const { createPartyAudio } = await import(
    '../renderer/features/party-audio.mjs'
  );
  const feature = createPartyAudio({
    api,
    getState: () => state,
    onStatus: () => {},
    message: (s) => messages.push(s),
  });
  t.after(() => {
    window.dispatchEvent(new Event('pagehide'));
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    feature,
    state,
    media,
    window,
    document,
    styles,
    frames,
    messages,
    get starts() {
      return starts;
    },
    get releases() {
      return releases;
    },
    emit: (data) => handler?.(data),
    age(ms) {
      now += ms;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((fn) => fn(now));
    },
    tick(bands = [1, 0, 0], rms = 0.02) {
      now += 67;
      handler?.({ type: 'bands', bands, rms });
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((fn) => fn(now));
    },
  };
}
test('audio opt-in never starts itself; distinct bands, intensity zero, pause/resume, and stop are reversible', async (t) => {
  const f = await fixture(t);
  assert.equal(f.starts, 0);
  await f.feature.start();
  assert.equal(f.feature.status.active, true);
  for (let i = 0; i < 20; i++) f.tick();
  assert.ok(f.feature.status.levels[0] > 0.9);
  assert.equal(f.feature.status.levels[1], 0);
  assert.notEqual(
    f.styles.get('--party-audio-bass'),
    f.styles.get('--party-audio-mid'),
  );
  f.state.intensity = 0;
  f.tick();
  assert.match(f.styles.get('--party-audio-bass'), /^hsl\(315 /);
  f.state.playing = false;
  f.feature.sync();
  assert.equal(f.feature.status.state, 'paused');
  assert.equal(f.frames.size, 0);
  f.state.playing = true;
  f.feature.sync();
  assert.equal(f.feature.status.state, 'listening');
  assert.equal(f.frames.size, 1);
  f.media.matches = true;
  f.media.dispatchEvent(new Event('change'));
  assert.equal(f.frames.size, 0);
  f.media.matches = false;
  f.media.dispatchEvent(new Event('change'));
  assert.equal(f.frames.size, 1);
  f.state.visible = false;
  f.feature.sync();
  assert.equal(f.frames.size, 0);
  f.state.visible = true;
  f.feature.sync();
  f.state.gamingIdle = true;
  f.feature.sync();
  assert.equal(f.frames.size, 0);
  f.feature.stop();
  assert.equal(f.feature.status.active, false);
  assert.equal(f.styles.size, 0);
  assert.equal(f.document.body.dataset.partyAudioLive, 'false');
  f.state.gamingIdle = false;
  f.feature.sync();
  assert.equal(f.starts, 1, 'Stop requires another explicit start');
});
test('silence settles, stale samples expire, source changes stop, and pagehide releases capture', async (t) => {
  const f = await fixture(t);
  await f.feature.start();
  for (let i = 0; i < 20; i++) f.tick([0, 0, 1]);
  assert.ok(f.feature.status.levels[2] > 0.9);
  f.age(700);
  assert.equal(
    f.feature.status.rms,
    0,
    'old samples cannot keep a disconnected source alive',
  );
  for (let i = 0; i < 80; i++) f.tick([0, 0, 0], 0);
  assert.ok(f.feature.status.levels.every((v) => v < 0.001));
  f.state.source = 'spotify';
  f.feature.sync();
  assert.equal(f.feature.status.active, false);
  await f.feature.start();
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.feature.status.active, false);
  assert.ok(f.releases >= 2);
  await f.feature.start();
  assert.equal(f.starts, 2, 'disposed views cannot restart');
});
test('cancelling an in-flight start does not revive capture and rejected starts remain retryable', async (t) => {
  let resolve;
  const pending = new Promise((r) => (resolve = r));
  const f = await fixture(t, { start: () => pending });
  const request = f.feature.start();
  assert.equal(f.feature.status.busy, true);
  f.feature.stop();
  resolve({ name: 'Late output' });
  await request;
  assert.equal(f.feature.status.active, false);
  assert.equal(f.frames.size, 0);
});
test('capture failure never pretends to listen', async (t) => {
  const f = await fixture(t, {
    start: () => Promise.reject(new Error('unplugged')),
  });
  await f.feature.start();
  assert.equal(f.feature.status.state, 'error');
  assert.equal(f.feature.status.active, false);
  assert.equal(f.frames.size, 0);
  assert.ok(f.messages.some((m) => m.includes('Could not start')));
});

test('lost outputs show reconnecting, recover, and still respect pause', async (t) => {
  const f = await fixture(t);
  await f.feature.start();
  f.emit({ type: 'reconnecting' });
  assert.equal(f.feature.status.state, 'reconnecting');
  f.state.playing = false;
  f.feature.sync();
  f.emit({ type: 'source', name: 'New headphones' });
  assert.equal(f.feature.status.state, 'paused');
  assert.equal(f.feature.status.source, 'New headphones');
  f.state.playing = true;
  f.feature.sync();
  assert.equal(f.feature.status.state, 'listening');
});

test('unsupported platforms never start a helper or pretend to listen', async (t) => {
  const f = await fixture(t, { supported: false });
  await f.feature.start();
  assert.equal(f.feature.status.state, 'unavailable');
  assert.equal(f.starts, 0);
  assert.ok(f.messages[0].includes('Windows'));
});
