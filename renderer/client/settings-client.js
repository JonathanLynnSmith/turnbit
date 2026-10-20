(() => {
  // Serializes optimistic edits and applies only the latest backend result.
  function createApplicationSettingsClient(api, { onValue, onError }) {
    let ready = false,
      pending = 0,
      queue = Promise.resolve(),
      initialization = Promise.resolve();
    const unsubscribe = api.onChange((value) => {
      if (ready && !pending) onValue(value);
    });
    return {
      initialize(legacy) {
        initialization = api.importLegacy(legacy).then((value) => {
          ready = true;
          onValue(value);
          return value;
        });
        return initialization;
      },
      save(value) {
        pending++;
        const request = queue
          .then(() => initialization)
          .then(() => api.update(value))
          .then(
            (saved) => {
              if (--pending === 0) onValue(saved);
            },
            async (error) => {
              if (--pending === 0) {
                try {
                  onValue(await api.get());
                } catch {
                  /* Keep the last view until storage recovers. */
                }
              }
              onError(error);
            },
          );
        queue = request.catch(onError);
        return request;
      },
      dispose: unsubscribe,
    };
  }
  if (typeof module !== 'undefined')
    module.exports = { createApplicationSettingsClient };
  else window.createApplicationSettingsClient = createApplicationSettingsClient;
})();
