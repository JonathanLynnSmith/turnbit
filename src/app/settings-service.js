// Versioned application settings. The feature supplies normalization; the host
// supplies storage. Neither browser storage nor Electron is needed here.
function createSettingsService({ storage, defaults, normalize }) {
  let values = structuredClone(defaults),
    migrated = false;
  const listeners = new Set();
  const saved = storage.read();
  if (saved?.schemaVersion > 1)
    throw new Error('Application settings require a newer version of Turnbit.');
  if (saved?.schemaVersion === 1) {
    try {
      values = normalize(saved.values, values);
      migrated = saved.migrated === true;
    } catch {
      /* Recover from legacy browser preferences. */
    }
  }
  function commit(next) {
    storage.write({ schemaVersion: 1, migrated: true, values: next });
    values = structuredClone(next);
    migrated = true;
    for (const listener of listeners) listener(structuredClone(values));
    return structuredClone(values);
  }
  return {
    get: () => structuredClone(values),
    update(patch) {
      const next = normalize(patch, values);
      return migrated && JSON.stringify(next) === JSON.stringify(values)
        ? structuredClone(values)
        : commit(next);
    },
    importLegacy(legacy) {
      return migrated
        ? structuredClone(values)
        : commit(normalize(legacy, values));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
module.exports = { createSettingsService };
