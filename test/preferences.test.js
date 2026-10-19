const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadPreferences,
  persistPreferences,
} = require("../renderer/settings/preferences");
const options = { themes: [{ id: "silver" }, { id: "spotify" }], demoCount: 3 };
function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("legacy preferences migrate without losing paused interfaces or song lists", () => {
  const store = storage({
    "dialpod-preferences": JSON.stringify({
      interfaceStyle: "zune",
      autoLaunchSpotify: false,
      radialWidthPct: 900,
      lastSongList: {
        kind: "playlist",
        name: "Saved",
        playlist: { id: "abc", demoIndexes: [0, 2, 9] },
      },
    }),
  });
  const value = loadPreferences(store, options);
  assert.equal(value.interfaceStyle, "zune");
  assert.equal(value.autoLaunchSpotify, true);
  assert.equal(value.radialWidthPct, 70);
  assert.deepEqual(value.lastSongList.playlist.demoIndexes, [0, 2]);
  persistPreferences(store, value, { clicker: true });
  assert.equal(store.getItem("dialpod-preferences"), undefined);
  assert.equal(loadPreferences(store, options).clicker, true);
});

test("corrupt storage falls back to independent defaults and failed writes leave current state intact", () => {
  const store = storage({ "turnbit-preferences": "{bad" });
  const value = loadPreferences(store, options);
  assert.equal(value.interfaceStyle, "radial");
  value.visibility.opacity = 1;
  assert.equal(loadPreferences(storage(), options).visibility.opacity, 70);
  store.setItem = () => {
    throw new Error("disk full");
  };
  assert.throws(
    () => persistPreferences(store, value, { clicker: true }),
    /disk full/,
  );
  assert.equal(value.clicker, false);
});
