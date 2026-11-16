const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPreferences } = require('../renderer/settings/preferences');

// Builds the settings controller with stand-ins for the view, so the menu's
// structure can be checked without a window.
async function controller({ windowMode, startAtLogin } = {}) {
  const { createSettingsController } =
    await import('../renderer/features/settings-controller.mjs');
  const preferences = {
    ...loadPreferences({ getItem: () => null }, { demoCount: 3 }),
    windowMode,
  };
  const pages = [];
  const nav = {
    stack: pages,
    get current() {
      return pages.at(-1);
    },
    back: () => pages.pop(),
  };
  const settings = createSettingsController({
    preferences,
    nav,
    api:
      startAtLogin === undefined
        ? {}
        : { startAtLogin: async () => startAtLogin },
    push: (page) => {
      pages.push(page);
      return page;
    },
    drawNavigation() {},
    getState: () => ({ demo: true, pinned: false }),
    mouseModeKeys: { off: 'Off', 'ctrl-alt-z': 'Ctrl+Alt+Z' },
    radialColorName: () => 'White',
    backdropActive: () => windowMode && preferences.nowPlayingBackdrop,
    backdropLayoutName: () => 'Overlay',
    menuBackgroundName: () => 'Matching',
    visibilityNow: () => preferences.visibility,
    valueText: (key, value) => String(value),
    WINDOW_MIN_OPACITY: 20,
  });
  // Let the Start at Login answer arrive.
  await new Promise((resolve) => setImmediate(resolve));
  return { settings, pages, preferences };
}
const everyRow = (settings) =>
  settings.settingsGroups.flatMap((group) => settings.settingsRows(group.id));

for (const windowMode of [true, false]) {
  const mode = windowMode ? 'Window' : 'Widget';
  test(`${mode}: every setting has a description, and every toggle shows its value`, async () => {
    const { settings } = await controller({ windowMode, startAtLogin: false });
    const rows = everyRow(settings);
    for (const row of rows) {
      assert.equal(typeof row.help, 'string', `${row.label} has a description`);
      assert.ok(row.help.length <= 130, `${row.label}: description fits`);
      if (!row.branch) assert.ok(row.detail, `${row.label} shows its value`);
    }
    const labels = rows.map((row) => row.label);
    assert.equal(new Set(labels).size, labels.length, 'no label appears twice');
  });
}

test('only the settings for the display in use are listed', async () => {
  const has = (rows, match) => rows.some(match);
  const widgetOnly = (row) =>
    row.key === 'mousePassthrough' ||
    ['radial-layout', 'widget-background-page'].includes(row.action);
  const windowOnly = (row) =>
    row.key === 'nowPlayingBackdrop' ||
    ['menu-timeout', 'menu-background-page', 'backdrop-layout'].includes(
      row.action,
    );
  const inWindow = everyRow((await controller({ windowMode: true })).settings);
  const inWidget = everyRow((await controller({ windowMode: false })).settings);
  assert.equal(has(inWindow, windowOnly), true);
  assert.equal(has(inWindow, widgetOnly), false);
  assert.equal(has(inWidget, widgetOnly), true);
  assert.equal(has(inWidget, windowOnly), false);
});

test('Settings opens on the first category, with Display, the account, and one reset', async () => {
  const { settings, pages } = await controller({ windowMode: true });
  settings.showSettings();
  const page = pages.at(-1);
  assert.deepEqual(
    page.rows.map((row) => row.label),
    [
      'Display',
      'Spotify Account',
      'General',
      'Playback',
      'Controls',
      'Appearance',
      'Reset to Defaults',
    ],
  );
  assert.equal(page.rows[page.selected].label, 'General');
  assert.equal(page.rows[0].detail, 'Window');
  assert.equal(page.rows[1].detail, 'Not connected');
  assert.equal(
    everyRow(settings).some((row) => row.action === 'reset-settings'),
    false,
    'categories no longer carry their own reset',
  );
  await settings.select(page.rows.at(-1));
  assert.deepEqual(
    pages.at(-1).rows.map((row) => row.group),
    ['all', 'general', 'playback', 'controls', 'appearance', 'window', 'widget'],
  );
  assert.ok(pages.at(-1).rows.every((row) => row.help));
});

test('Start at Login is offered only where the app can report it', async () => {
  const find = (settings) =>
    settings
      .settingsRows('general')
      .find((row) => row.action === 'start-at-login');
  assert.equal(find((await controller({ windowMode: true })).settings), undefined);
  const on = (await controller({ windowMode: true, startAtLogin: true }))
    .settings;
  assert.equal(find(on).detail, 'On');
});

test('pages opened from a setting carry descriptions for their own rows', async () => {
  const { settings, pages } = await controller({ windowMode: true });
  settings.showTransparency();
  assert.ok(pages.at(-1).rows.every((row) => row.help));
  settings.showColdStart();
  assert.equal(pages.at(-1).title, 'What Play Starts');
  assert.ok(pages.at(-1).rows.every((row) => row.help));
  settings.showMenuBackground();
  assert.ok(pages.at(-1).rows.every((row) => row.help));
});
