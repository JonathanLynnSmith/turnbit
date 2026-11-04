const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { createPartyAudioCapture } = require('../src/desktop/party-audio');
function fixture(t) {
  let handler,
    clock = 100,
    child,
    commands = [];
  const frame = { url: 'file:///turnbit/index.html' };
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    send: (channel, data) => messages.push({ channel, data }),
  });
  const messages = [];
  const desktop = { window: { webContents: sender } };
  sender.session = { setDisplayMediaRequestHandler: (fn) => (handler = fn) };
  const capture = createPartyAudioCapture({
    desktop,
    rendererUrl: frame.url,
    platform: 'win32',
    now: () => clock,
    desktopCapturer: {
      getSources: async (options) => {
        assert.deepEqual(options.thumbnailSize, { width: 0, height: 0 });
        return [{ id: 'screen:0', name: 'Screen' }];
      },
    },
    spawnProcess: (_file, _args, options) => {
      assert.equal(options.windowsHide, true);
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(data, _encoding, cb) {
          commands.push(data.toString());
          cb();
        },
        final(cb) {
          cb();
          setImmediate(() => child.emit('exit', 0));
        },
      });
      child.kill = () => child.emit('exit', 0);
      return child;
    },
  });
  t.after(() => capture.dispose());
  return {
    capture,
    sender,
    frame,
    messages,
    commands,
    get child() {
      return child;
    },
    expire: () => (clock += 10001),
    request(overrides = {}) {
      let result = 'not called';
      handler(
        { frame, audioRequested: true, userGesture: true, ...overrides },
        (value) => (result = value),
      );
      return result;
    },
  };
}
test('Chromium fallback grants are armed, gesture-gated, frame-scoped, single-use and expire', async (t) => {
  const f = fixture(t);
  assert.equal(f.request(), null);
  await f.capture.prepare(f.sender);
  assert.equal(f.request({ userGesture: false }), null);
  assert.equal(f.request(), null);
  await f.capture.prepare(f.sender);
  assert.equal(f.request({ frame: { url: f.frame.url } }), null);
  await f.capture.prepare(f.sender);
  assert.equal(f.request().audio, 'loopback');
  assert.equal(f.request(), null);
  await f.capture.prepare(f.sender);
  f.expire();
  assert.equal(f.request(), null);
  await f.capture.prepare(f.sender);
  f.capture.release();
  assert.equal(f.request(), null);
});
test('native capture validates input, forwards only bounded band data and cleans up on navigation', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.capture.start(f.sender, 'microphone'),
    /Unknown audio source/,
  );
  const started = f.capture.start(f.sender, 'spotify');
  f.child.stdout.write(
    JSON.stringify({ type: 'source', name: 'Music' }) + '\n',
  );
  assert.deepEqual(await started, { name: 'Music' });
  f.child.stdout.write(
    JSON.stringify({ type: 'bands', bands: [2, -1, 0.4], rms: 2 }) + '\n',
  );
  f.child.stdout.write(
    JSON.stringify({ type: 'bands', bands: ['bad'], rms: 0 }) + '\n',
  );
  const bands = f.messages.filter((v) => v.data.type === 'bands');
  assert.equal(bands.length, 1);
  assert.deepEqual(bands[0].data.bands, [1, 0, 0.4]);
  assert.equal(bands[0].data.rms, 1);
  f.capture.pause(true);
  assert.ok(f.commands.includes('pause\n'));
  f.sender.emit('did-start-navigation', {}, f.frame.url, false, true);
  assert.ok(f.commands.includes('stop\n'));
  assert.equal(f.sender.listenerCount('did-start-navigation'), 0);
});
test('cancelled native startup rejects promptly and removes listeners', async (t) => {
  const f = fixture(t);
  const start = f.capture.start(f.sender, 'default');
  f.capture.release();
  await assert.rejects(start, /cancelled/);
  assert.equal(f.sender.listenerCount('destroyed'), 0);
});
