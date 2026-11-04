const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
// Windows WASAPI analysis, with the original Chromium loopback as a fallback API.
function createPartyAudioCapture({
  desktop,
  desktopCapturer,
  rendererUrl,
  platform = process.platform,
  spawnProcess = spawn,
  now = Date.now,
}) {
  let grant = null;
  let generation = 0;
  let worker = null;
  const session = desktop.window.webContents.session;
  const trusted = (frame) => {
    try {
      const contents = desktop.window?.webContents;
      return (
        !!frame &&
        !!contents &&
        !contents.isDestroyed() &&
        frame === contents.mainFrame &&
        frame.url === rendererUrl
      );
    } catch {
      return false;
    }
  };
  function release() {
    generation++;
    grant = null;
    const previous = worker;
    worker = null;
    if (!previous) return;
    clearTimeout(previous.timeout);
    previous.sender.removeListener('destroyed', previous.unload);
    previous.sender.removeListener('did-start-navigation', previous.navigate);
    previous.reader.close();
    previous.reject?.(new Error('Audio capture cancelled.'));
    previous.child.stdin.end('stop\n');
    const force = setTimeout(() => previous.child.kill(), 2500);
    force.unref();
    previous.child.once('exit', () => clearTimeout(force));
  }

  session.setDisplayMediaRequestHandler((request, callback) => {
    const allowed = grant;
    grant = null;
    if (
      platform !== 'win32' ||
      !trusted(request.frame) ||
      !request.userGesture ||
      !request.audioRequested ||
      !allowed ||
      allowed.frame !== request.frame ||
      allowed.expires < now()
    ) {
      callback(null);
      return;
    }
    // Chromium requires display video in getDisplayMedia. The renderer stops that
    // track immediately and only feeds the loopback audio to its analyser.
    callback({ video: allowed.source, audio: 'loopback' });
  });

  return {
    start(sender, source = 'spotify') {
      release();
      if (platform !== 'win32' || !trusted(sender.mainFrame))
        return Promise.reject(new Error('Audio capture is unavailable.'));
      if (!['spotify', 'default'].includes(source))
        return Promise.reject(new Error('Unknown audio source.'));
      return new Promise((resolve, reject) => {
        const script = path
          .join(__dirname, 'party-audio-helper.ps1')
          .replace('app.asar', 'app.asar.unpacked');
        const child = spawnProcess(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            '-Source',
            source,
          ],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        child.stdin.on('error', () => {});
        const reader = readline.createInterface({ input: child.stdout });
        const entry = { child, reader, sender, reject };
        worker = entry;
        const send = (value) => {
          if (worker === entry && !sender.isDestroyed())
            sender.send('party-audio-data', value);
        };
        const fail = () => {
          if (worker !== entry) return;
          send({
            type: 'error',
            message: 'System audio capture ended. Start Audio Capture again.',
          });
          release();
        };
        entry.unload = () => {
          if (worker === entry) release();
        };
        entry.navigate = (_event, _url, _inPlace, mainFrame) => {
          if (mainFrame) entry.unload();
        };
        sender.once('destroyed', entry.unload);
        sender.on('did-start-navigation', entry.navigate);
        entry.timeout = setTimeout(fail, 12000);
        child.stderr.on('data', () => {});
        child.on('error', fail);
        child.on('exit', fail);
        reader.on('line', (line) => {
          if (worker !== entry) return;
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            return;
          }
          if (data.type === 'source') {
            clearTimeout(entry.timeout);
            entry.reject = null;
            send(data);
            resolve({ name: String(data.name || 'System audio') });
          } else if (
            data.type === 'bands' &&
            Array.isArray(data.bands) &&
            data.bands.length === 3 &&
            data.bands.every(Number.isFinite) &&
            Number.isFinite(data.rms)
          ) {
            send({
              type: 'bands',
              bands: data.bands.map((v) => Math.max(0, Math.min(1, v))),
              rms: Math.max(0, Math.min(1, data.rms)),
            });
          } else if (data.type === 'reconnecting')
            send({ type: 'reconnecting' });
        });
      });
    },
    pause(value) {
      if (worker) worker.child.stdin.write(value ? 'pause\n' : 'resume\n');
    },
    async prepare(sender) {
      grant = null;
      const ticket = ++generation;
      if (platform !== 'win32')
        throw new Error('Audio Reactive is available on Windows.');
      const frame = sender.mainFrame;
      if (!trusted(frame)) throw new Error('Unknown audio capture client.');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
      });
      if (ticket !== generation || !trusted(frame))
        throw new Error('Audio capture cancelled.');
      if (!sources[0]) throw new Error('System audio capture is unavailable.');
      grant = { frame, source: sources[0], expires: now() + 10000 };
    },
    release,
    dispose() {
      release();
      session.setDisplayMediaRequestHandler(null);
    },
  };
}
module.exports = { createPartyAudioCapture };
