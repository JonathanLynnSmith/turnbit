const fs = require('node:fs');

// Saved windows may belong to a display that has since been unplugged.
function fitWindow(bounds, area) {
  const width = Math.min(area.width, Math.max(360, Math.round(bounds.width)));
  const height = Math.min(area.height, Math.max(320, Math.round(bounds.height)));
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - width, Math.round(bounds.x))),
    y: Math.max(area.y, Math.min(area.y + area.height - height, Math.round(bounds.y))),
    width, height
  };
}

function readWindowState(file) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bounds = {};
    for (const style of ['radial', 'ipod', 'zune']) {
      const value = saved.bounds?.[style];
      if (value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key])) && value.width > 0 && value.height > 0) bounds[style] = value;
    }
    return { enabled: saved.enabled === true, bounds };
  } catch { return { enabled: false, bounds: {} }; }
}

function writeWindowState(file, state) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state));
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { fitWindow, readWindowState, writeWindowState };
