const { ValueControl } = require('../core/value-control');
const { TransportHold } = require('../core/transport-hold');

// Application commands execute here even when the renderer is being recreated.
// The view reports its presentation policy; navigation and demo behavior stay in
// that view. Feedback contains no command to execute a second time.
function createHardwareInput({
  playback,
  forward,
  isIdle,
  activity,
  now = Date.now,
  hasView = () => true,
}) {
  let context = { demo: true, dialOnlyWake: false, openPlayerOnToggle: false };
  let targetVolume = null,
    targetPosition = null,
    volumeAt = 0,
    positionAt = 0;
  function quiet() {
    return context.dialOnlyWake && isIdle();
  }
  function feedback(command, value) {
    const silent = quiet();
    if (!silent) activity();
    forward({ type: 'command', command, value, handled: true, quiet: silent });
  }
  function execute(command, value) {
    feedback(command, value);
    return playback.command(command, value).then(
      (result) => {
        forward({
          type: 'command-complete',
          command,
          message: result?.message,
        });
      },
      () => {
        forward({ type: 'command-complete', command });
      },
    );
  }
  function position() {
    const state = playback.getState();
    const current = state
      ? state.positionMs +
        (state.playing ? Math.max(0, now() - state.observedAt) : 0)
      : 0;
    return now() - positionAt < 1500 && targetPosition !== null
      ? targetPosition
      : current;
  }
  function seek(delta) {
    const duration = playback.getState()?.track?.durationMs || 86400000;
    targetPosition = Math.max(0, Math.min(duration, position() + delta));
    positionAt = now();
    seekWrites.set(targetPosition);
  }
  const volumeWrites = new ValueControl(
    (value) => playback.command('volume', value),
    {
      interval: 600,
      settle: 1500,
      onValue: (value) => feedback('volume', value),
      onError: () => {
        targetVolume = null;
      },
    },
  );
  const seekWrites = new ValueControl(
    (value) => playback.command('seek', value),
    {
      interval: 450,
      max: 86400000,
      onValue: (value) => feedback('seek', value),
      onError: () => {
        targetPosition = null;
      },
    },
  );
  let lastTrack = null;
  const hold = new TransportHold(
    (direction) => execute(direction > 0 ? 'next' : 'previous'),
    seek,
  );
  return {
    setContext(value) {
      context = {
        demo: value?.demo !== false,
        dialOnlyWake: value?.dialOnlyWake === true,
        openPlayerOnToggle: value?.openPlayerOnToggle === true,
      };
      if (context.demo) hold.cancel();
    },
    handle(event) {
      if (context.demo || event.type !== 'command') return forward(event);
      const command = event.command;
      if (
        ['next-down', 'previous-down', 'next-up', 'previous-up'].includes(
          command,
        )
      ) {
        const direction = command.startsWith('next') ? 1 : -1;
        feedback(command);
        return command.endsWith('-down')
          ? hold.down(direction)
          : hold.up(direction);
      }
      if (
        command === 'toggle' &&
        context.openPlayerOnToggle &&
        hasView() &&
        !quiet()
      ) {
        context.openPlayerOnToggle = false;
        return forward({ type: 'open-player' });
      }
      if (command === 'volume-up' || command === 'volume-down') {
        const current =
          now() - volumeAt < 1500 && targetVolume !== null
            ? targetVolume
            : (playback.getState()?.device?.volume ?? 50);
        targetVolume = Math.max(
          0,
          Math.min(100, current + (command === 'volume-up' ? 5 : -5)),
        );
        volumeAt = now();
        volumeWrites.set(targetVolume);
        return;
      }
      if (command === 'seek-forward' || command === 'seek-back')
        return seek(command === 'seek-forward' ? 10000 : -10000);
      if (
        ['toggle', 'next', 'previous', 'like', 'shuffle', 'repeat'].includes(
          command,
        )
      ) {
        if (command === 'next' || command === 'previous') {
          hold.cancel();
          targetPosition = null;
        }
        return execute(command);
      }
      return forward(event);
    },
    stateChanged(state) {
      const id = state?.track?.id;
      if (lastTrack && id !== lastTrack) {
        hold.cancel();
        targetPosition = null;
        seekWrites.reset(0);
      }
      lastTrack = id;
    },
    reset() {
      hold.cancel();
      volumeWrites.reset();
      seekWrites.reset();
      targetVolume = null;
      targetPosition = null;
    },
    dispose() {
      hold.cancel();
      volumeWrites.reset();
      seekWrites.reset();
    },
  };
}
module.exports = { createHardwareInput };
