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

test("fresh installs open in Window Mode with left-aligned text on the curved menu", () => {
  const value = loadPreferences(storage(), options);
  assert.equal(value.windowMode, true);
  assert.equal(value.radialAlign, "left");
  assert.equal(value.radialCurve, true);
});

test("dial menu background keeps known looks and falls back to Matching", () => {
  assert.equal(loadPreferences(storage(), options).menuBackground, "match");
  for (const look of ["black", "glass", "artwork"])
    assert.equal(
      loadPreferences(
        storage({ "turnbit-preferences": JSON.stringify({ menuBackground: look }) }),
        options,
      ).menuBackground,
      look,
    );
  assert.equal(
    loadPreferences(
      storage({ "turnbit-preferences": JSON.stringify({ menuBackground: "neon" }) }),
      options,
    ).menuBackground,
    "match",
  );
});

test("legacy preferences migrate archived interfaces to radial without losing song lists", () => {
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
  assert.equal(value.interfaceStyle, "radial");
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

for (const interfaceStyle of ['ipod', 'zune']) {
  test(`saved ${interfaceStyle} selection falls back to turnbit and retains other preferences`, () => {
    const value = loadPreferences(storage({'turnbit-preferences': JSON.stringify({interfaceStyle, clicker: true, radialSide: 'right', appearance: 'spotify'})}), options);
    assert.equal(value.interfaceStyle, 'radial');
    assert.equal(value.clicker, true);
    assert.equal(value.radialSide, 'right');
    assert.equal(value.appearance, 'spotify');
    const next = persistPreferences(storage(), value, {interfaceStyle});
    assert.equal(next.interfaceStyle, 'radial');
  });
}
