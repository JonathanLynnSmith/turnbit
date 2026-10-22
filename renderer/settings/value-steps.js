// Value pickers move between predefined stops, so a few dial clicks reach any useful setting.
(() => {
  // Seconds: short waits close together, long ones far apart.
  const TIMEOUT_STOPS = [
    3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600,
  ];
  // The twelve named hues 30 degrees apart, then 360 for White (radial-view.mjs names them).
  const COLOR_STOPS = Array.from({ length: 13 }, (_, i) => i * 30);

  // One click from value toward delta's sign, landing on stops. A value saved between stops
  // (an older setting) moves to the nearest stop in that direction.
  function stepThrough(stops, value, delta, wrap = false) {
    let index;
    if (delta > 0) {
      index = stops.findIndex((stop) => stop > value);
      if (index < 0) index = wrap ? 0 : stops.length - 1;
      else index += Math.max(0, delta - 1);
    } else if (delta < 0) {
      index = stops.findLastIndex((stop) => stop < value);
      if (index < 0) index = wrap ? stops.length - 1 : 0;
      else index -= Math.max(0, -delta - 1);
    } else return value;
    if (wrap) index = ((index % stops.length) + stops.length) % stops.length;
    return stops[Math.max(0, Math.min(stops.length - 1, index))];
  }
  // Evenly spaced stops from min to max.
  function stepEvenly({ min, max, step }, value, delta) {
    const stops = [];
    for (let stop = Math.ceil(min / step) * step; stop <= max; stop += step)
      stops.push(stop);
    if (stops[0] !== min) stops.unshift(min);
    if (stops.at(-1) !== max) stops.push(max);
    return stepThrough(stops, value, delta);
  }

  const steps = { TIMEOUT_STOPS, COLOR_STOPS, stepThrough, stepEvenly };
  if (typeof module !== 'undefined') module.exports = steps;
  else window.TurnbitValueSteps = steps;
})();
