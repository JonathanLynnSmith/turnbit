const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MacMediaSession,
  parseState,
  commandScript,
  STATE_SCRIPT,
} = require('../src/mac-media-session');

const SEP = '\u001f';
const reply = (...fields) => fields.join(SEP) + '\n';
// Stands in for osascript: answers the state read from `state` and records every other script.
function fakeOsascript(state) {
  const scripts = [];
  const execFile = (file, args, options, done) => {
    assert.equal(file, 'osascript');
    const script = args[1];
    scripts.push(script);
    setImmediate(() => {
      const result = script === STATE_SCRIPT ? fake.state : fake.command;
      if (result instanceof Error) done(result, '', result.stderr || '');
      else done(null, result, '');
    });
  };
  const fake = { state, command: 'ok\n', scripts, execFile };
  return fake;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('Spotify state from AppleScript becomes the shared local session shape', () => {
  assert.deepEqual(
    parseState(
      reply('playing', 'Song A', 'Artist', 'Album', '200000', '42000'),
    ),
    {
      available: true,
      app: 'Spotify',
      status: 'playing',
      playing: true,
      title: 'Song A',
      artist: 'Artist',
      album: 'Album',
      durationMs: 200000,
      positionMs: 42000,
      canSeek: true,
      canNext: true,
      canPrevious: true,
    },
  );
  assert.equal(
    parseState(reply('paused', 'S', 'A', 'L', '200000', '1')).playing,
    false,
  );
  // Older Spotify releases report seconds.
  assert.equal(
    parseState(reply('playing', 'S', 'A', 'L', '215', '1000')).durationMs,
    215000,
  );
  assert.deepEqual(parseState('closed\n'), { available: false });
  assert.deepEqual(parseState('stopped\n'), { available: false });
});

test('the state read never launches Spotify and avoids locale-dependent decimals', () => {
  assert.match(STATE_SCRIPT, /^if application "Spotify" is running then/);
  assert.match(STATE_SCRIPT, /\(player position \* 1000\) as integer/);
  assert.match(commandScript('seek', 61234.6), /player position to 61235 \/ 1000/);
  assert.match(commandScript('toggle'), /^if application "Spotify" is running/);
  assert.match(commandScript('toggle'), /to playpause/);
  assert.match(commandScript('previous'), /to previous track/);
});

test('the Mac session polls Spotify, reports changes, and sends transport commands', async () => {
  const fake = fakeOsascript(
    reply('playing', 'Song A', 'Artist', 'Album', '200000', '42000'),
  );
  const updates = [];
  const media = new MacMediaSession((state) => updates.push(state), {
    execFile: fake.execFile,
    interval: 10000,
  });
  media.start();
  await media.reading;
  assert.equal(media.state.title, 'Song A');
  assert.equal(media.state.playing, true);
  assert.equal(updates.length, 1);
  // An unchanged read is not reported again.
  await media.poll();
  assert.equal(updates.length, 1);

  assert.equal(await media.command('next'), true);
  assert.ok(fake.scripts.some((script) => /to next track/.test(script)));
  fake.state = reply('playing', 'Song B', 'Other', 'Album', '180000', '0');
  await settle();
  await media.reading;
  assert.equal(media.state.title, 'Song B', 'a command reads straight back');

  assert.equal(await media.command('seek', 5000), true);
  assert.equal(await media.command('seek'), false, 'seek needs a position');
  assert.equal(await media.command('volume', 3), false, 'unknown commands stay on the Web API');
  fake.command = 'closed\n';
  assert.equal(await media.command('pause'), false);
  media.stop();
});

test('without Spotify open or permission to control it, playback stays on the Web API', async () => {
  const fake = fakeOsascript('closed\n');
  const media = new MacMediaSession(() => {}, {
    execFile: fake.execFile,
    interval: 10000,
  });
  media.start();
  await media.reading;
  assert.equal(media.state.available, false);
  assert.equal(await media.command('toggle'), false);
  assert.equal(fake.scripts.length, 1, 'no command is sent while Spotify is closed');

  fake.state = Object.assign(new Error('Command failed'), {
    stderr: 'execution error: Not authorized to send Apple events to Spotify. (-1743)',
  });
  let delay;
  const schedule = media.schedule;
  media.schedule = (value) => {
    delay = value;
    schedule.call(media, value);
  };
  await media.poll();
  assert.equal(media.state.available, false);
  assert.equal(delay, 30000, 'a declined permission is checked rarely');
  media.stop();
});
