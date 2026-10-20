// All entry points share transport ordering. Renderer controllers coalesce volume
// and seek independently, so those writes must not block transport buttons.
function createPlaybackDispatcher(execute) {
  let queue = Promise.resolve();
  return function dispatch(command, value) {
    if (command === 'volume' || command === 'seek') {
      return Promise.resolve().then(() => execute(command, value));
    }
    const next = queue.then(() => execute(command, value));
    queue = next.catch(() => {});
    return next;
  };
}

module.exports = { createPlaybackDispatcher };
