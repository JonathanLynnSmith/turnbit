import {
  BAND_MIN,
  BAND_MAX,
  stationFrequency,
  clampFrequency,
  receptionAt,
  createTuningNoise,
  createReceptionVolume,
} from './radio-reception.mjs';
const frequency = (index) => stationFrequency(index).toFixed(1);
import { pickRadioPlaylists } from './radio-presets.mjs';

export function createRadio({
  getState,
  library,
  play,
  transport,
  noteActivity,
  setVolume,
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'radio';
  dialog.setAttribute('aria-labelledby', 'radioTitle');
  dialog.innerHTML = `
    <header><div><span class="radio-brand">turnbit / receiver</span><h2 id="radioTitle">Radio</h2></div><button type="button" data-close aria-label="Close radio">Close</button></header>
    <section class="radio-glass" aria-label="Station tuner">
      <div class="radio-band"><span>FM · STEREO</span><span data-signal>READY</span></div>
      <div class="radio-frequency"><output data-frequency>88.1</output><span>MHz</span></div>
      <div class="radio-scale" aria-hidden="true"><i></i><span>88</span><span>92</span><span>96</span><span>100</span><span>104</span><span>108</span></div>
      <label class="radio-tuning">Tuning<input data-tuner type="range" min="87.5" max="108" step="0.1" value="88.1" aria-label="Tune frequency in MHz"></label>
      <h3 data-station>No stations yet</h3><div class="radio-track"><img data-art alt="Current album artwork" hidden><a data-track href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Save a playlist to a preset to start listening.</a></div>
    </section>
    <div class="radio-transport"><button type="button" data-prev aria-label="Previous station">‹ Station</button><button type="button" data-play>Play / Pause</button><button type="button" data-next aria-label="Next station">Station ›</button></div>
    <div class="radio-presets" role="group" aria-label="Station presets"></div>
    <div class="radio-options"><button type="button" data-fill>Fill channels</button><button type="button" data-add>Add station</button><button type="button" data-remove>Remove station</button><label><input type="checkbox" data-static> Tuning static</label></div>
    <section class="radio-library" hidden><h3>Choose a playlist</h3><div data-playlists></div><button type="button" data-more>Load more</button></section>
    <p class="radio-status" role="status"></p>
    <footer><a href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer"><img src="assets/spotify-logo-white.png" alt="Spotify"></a><span>Turn the dial to find a station · press to lock on</span></footer>`;
  document.body.append(dialog);
  const $ = (selector) => dialog.querySelector(selector);
  let stations = [],
    selected = 0,
    storageKey,
    timer,
    revision = 0,
    demoStation = null,
    tunedFrequency = 88.1,
    activeStation = null,
    targetStation = null,
    pendingStation = null,
    sweepTimer,
    autoFilled = false,
    filling = false,
    fillGeneration = 0;
  let queue = Promise.resolve(),
    loading = false,
    offset = 0;
  const noise = createTuningNoise();
  const receptionVolume = createReceptionVolume(setVolume);
  const status = (text = '') => {
    $('.radio-status').textContent = text;
  };
  function save() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          stations,
          selected,
          frequency: tunedFrequency,
          receiverVersion: 2,
          autoFilled,
          static: $('[data-static]').checked,
        }),
      );
    } catch {
      status('Could not save radio settings.');
    }
  }
  function load() {
    const key = 'turnbit-radio-' + (getState().demo ? 'demo' : 'spotify');
    if (storageKey === key) return;
    storageKey = key;
    ++fillGeneration;
    filling = false;
    autoFilled = false;
    stations = [];
    selected = 0;
    tunedFrequency = 88.1;
    $('[data-static]').checked = true;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      autoFilled = saved.autoFilled === true;
      stations = (Array.isArray(saved.stations) ? saved.stations : [])
        .filter(
          (s) =>
            s &&
            typeof s.name === 'string' &&
            typeof s.id === 'string' &&
            (getState().demo
              ? s.id.startsWith('demo-')
              : /^spotify:playlist:[A-Za-z0-9]{22}$/.test(s.uri || '')),
        )
        .slice(0, 12);
      selected = Number.isInteger(saved.selected)
        ? Math.max(0, Math.min(stations.length - 1, saved.selected))
        : 0;
      tunedFrequency = Number.isFinite(saved.frequency)
        ? clampFrequency(saved.frequency)
        : stationFrequency(selected);
      $('[data-static]').checked =
        saved.receiverVersion === 2 ? saved.static !== false : true;
    } catch {
      /* A damaged radio setting starts with empty presets. */
    }
  }
  function paint() {
    const reception = receptionAt(tunedFrequency, stations);
    const station = stations[reception.index];
    $('[data-frequency]').textContent = tunedFrequency.toFixed(1);
    $('[data-station]').textContent =
      station?.name ||
      (stations.length ? 'Between stations' : 'No stations yet');
    $('[data-tuner]').value = tunedFrequency;
    $('[data-tuner]').disabled = !stations.length;
    $('[data-tuner]').setAttribute(
      'aria-valuetext',
      `${tunedFrequency.toFixed(1)} MHz${station ? ', ' + station.name : ', between stations'}`,
    );
    $('.radio-scale i').style.left =
      `${((tunedFrequency - BAND_MIN) / (BAND_MAX - BAND_MIN)) * 100}%`;
    $('[data-signal]').textContent =
      reception.strength > 0.98
        ? 'STEREO'
        : reception.strength > 0
          ? 'WEAK SIGNAL'
          : reception.index >= 0
            ? 'ACQUIRING'
            : 'SEARCHING';
    $('.radio-track').style.opacity = String(0.3 + reception.strength * 0.7);
    $('[data-remove]').disabled = !station;
    $('[data-prev]').disabled = $('[data-next]').disabled = !stations.length;
    $('[data-play]').disabled = !station;
    $('[data-add]').disabled = stations.length >= 12;
    $('[data-fill]').disabled =
      filling || stations.length >= 10 || getState().demo;
    $('[data-fill]').textContent = filling
      ? 'Filling channels…'
      : 'Fill channels';
    $('.radio-presets').replaceChildren(
      ...stations.map((entry, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${frequency(i)} · ${entry.name}`;
        button.setAttribute(
          'aria-pressed',
          String(i === reception.index && reception.strength > 0.98),
        );
        button.addEventListener('click', () => choose(i));
        return button;
      }),
    );
    sync();
  }
  function applyReception() {
    if (!stations.length) {
      noise.stop();
      receptionVolume.restore();
      return;
    }
    const reception = receptionAt(tunedFrequency, stations);
    const station = stations[reception.index];
    const ready = station && activeStation === station.id;
    const strength = ready ? reception.strength : 0;
    noise.set(
      dialog.open && stations.length && $('[data-static]').checked
        ? 1 - strength
        : 0,
      { frequency: tunedFrequency, motion: 0.5 },
    );
    receptionVolume.set(strength);
  }
  function tune(value, delay = 50) {
    noteActivity();
    if (!stations.length) return;
    tunedFrequency = clampFrequency(value);
    const reception = receptionAt(tunedFrequency, stations);
    if (reception.index >= 0) selected = reception.index;
    const station = stations[reception.index];
    if ((station?.id || null) !== targetStation) {
      clearTimeout(timer);
      ++revision;
      targetStation = station?.id || null;
      pendingStation = null;
    }
    const version = revision;
    receptionVolume.start(getState().volume);
    applyReception();
    save();
    paint();
    if (!station || activeStation === station.id) {
      status();
      return;
    }
    if (pendingStation === station.id) return;
    pendingStation = station.id;
    timer = setTimeout(() => {
      queue = queue
        .catch(() => {})
        .then(async () => {
          if (version !== revision || !dialog.open) return;
          if (activeStation === station.id) {
            applyReception();
            return;
          }
          status('Receiving ' + station.name + '…');
          try {
            // Ensure the old station is quiet before starting the new one.
            await receptionVolume.silence();
            if (version !== revision || !dialog.open) return;
            const ok = await play(station, {
              cancelled: () => version !== revision || !dialog.open,
            });
            if (ok) {
              activeStation = station.id;
              if (getState().demo) demoStation = station.id;
            }
            if (dialog.open) applyReception();
            if (version !== revision || !dialog.open) return;
            status(
              ok
                ? ''
                : 'Could not receive this station. Check Spotify and try again.',
            );
            applyReception();
            paint();
            if (!ok) $('[data-signal]').textContent = 'NO SIGNAL';
          } catch (error) {
            if (version === revision) {
              status(error.message);
              $('[data-signal]').textContent = 'NO SIGNAL';
            }
          } finally {
            if (version === revision) pendingStation = null;
          }
        });
    }, delay);
  }
  function choose(index, sweep = true) {
    if (!stations.length) return;
    clearInterval(sweepTimer);
    selected = Math.max(0, Math.min(stations.length - 1, index));
    const target = stationFrequency(selected);
    $('[data-tuner]').focus();
    if (!sweep || Math.abs(target - tunedFrequency) < 0.11)
      return tune(target, 0);
    // Preset/seek buttons sweep the same band as the dial instead of teleporting.
    const start = tunedFrequency,
      began = performance.now();
    sweepTimer = setInterval(() => {
      const fraction = Math.min(1, (performance.now() - began) / 500);
      tune(start + (target - start) * fraction);
      if (fraction === 1) {
        clearInterval(sweepTimer);
        tune(target, 0);
      }
    }, 35);
  }
  function rotate(delta) {
    noteActivity();
    if (!$('.radio-library').hidden) {
      const controls = [
        ...$('.radio-library').querySelectorAll(
          'button:not(:disabled):not([hidden])',
        ),
      ];
      const index = controls.indexOf(document.activeElement);
      controls[
        Math.max(0, Math.min(controls.length - 1, index + delta))
      ]?.focus();
      return;
    }
    clearInterval(sweepTimer);
    tune(tunedFrequency + delta * 0.1);
  }
  async function fillChannels() {
    if (filling || getState().demo || stations.length >= 10) return;
    filling = true;
    const generation = ++fillGeneration,
      key = storageKey;
    const cancelled = () =>
      generation !== fillGeneration || key !== storageKey || !dialog.open;
    paint();
    status('Finding playlists for your channels…');
    try {
      const sample = await pickRadioPlaylists({
        library,
        existing: stations,
        count: 10 - stations.length,
        cancelled,
      });
      if (!sample || cancelled()) return;
      const existing = new Set(stations.map((station) => station.id));
      const added = sample
        .filter((station) => !existing.has(station.id))
        .slice(0, Math.max(0, 10 - stations.length));
      stations.push(...added);
      autoFilled = true;
      save();
      paint();
      status(
        added.length
          ? `Added ${added.length} playlist${added.length === 1 ? '' : 's'} to your channels.`
          : 'No more playlists of your own were found.',
      );
    } catch (error) {
      if (!cancelled())
        status(
          'Could not fill channels. ' +
            error.message +
            ' Use Fill channels to retry.',
        );
    } finally {
      if (generation === fillGeneration) {
        filling = false;
        paint();
      }
    }
  }
  async function browse(reset = true) {
    if (loading) return;
    loading = true;
    const key = storageKey;
    $('.radio-library').hidden = false;
    $('[data-more]').disabled = true;
    if (reset) {
      offset = 0;
      $('[data-playlists]').replaceChildren();
    }
    status('Loading playlists…');
    try {
      const page = await library(offset);
      if (key !== storageKey || !dialog.open) return;
      for (const playlist of page.items || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = playlist.name;
        button.addEventListener('click', () => {
          if (stations.length >= 12)
            return status('All 12 presets are full. Remove one first.');
          const existing = stations.findIndex((s) => s.id === playlist.id);
          if (existing >= 0) {
            $('.radio-library').hidden = true;
            choose(existing);
            return;
          }
          stations.push(playlist);
          $('.radio-library').hidden = true;
          choose(stations.length - 1);
        });
        $('[data-playlists]').append(button);
      }
      offset += page.items?.length || 0;
      $('[data-more]').hidden = !page.next;
      if (reset) $('[data-playlists] button')?.focus();
      status(
        offset ? '' : 'No playlists found. Create a playlist in Spotify first.',
      );
    } catch (error) {
      status(error.message);
      $('[data-more]').hidden = false;
    } finally {
      loading = false;
      $('[data-more]').disabled = false;
    }
  }
  function sync() {
    if (!dialog.open) return;
    if (
      storageKey !==
      'turnbit-radio-' + (getState().demo ? 'demo' : 'spotify')
    ) {
      ++revision;
      clearTimeout(timer);
      clearInterval(sweepTimer);
      noise.stop();
      receptionVolume.restore();
      activeStation = null;
      targetStation = pendingStation = null;
      load();
      $('.radio-library').hidden = true;
      paint();
      if (!autoFilled) void fillChannels();
      return;
    }
    const state = getState();
    $('[data-track]').textContent =
      `${state.track.title} · ${state.track.artist}`;
    $('[data-track]').href = state.demo
      ? 'https://open.spotify.com/'
      : (state.playback?.item?.uri || '').replace(
          /^spotify:(track|episode):([A-Za-z0-9]{22})$/,
          'https://open.spotify.com/$1/$2',
        ) || 'https://open.spotify.com/';
    $('[data-art]').hidden = !state.track.artwork;
    if (
      state.track.artwork &&
      $('[data-art]').getAttribute('src') !== state.track.artwork
    )
      $('[data-art]').src = state.track.artwork;
    const current = state.demo
      ? demoStation === stations[selected]?.id
      : state.playback?.context?.uri === stations[selected]?.uri;
    $('[data-play]').textContent = current
      ? state.playing
        ? 'Pause'
        : 'Play'
      : 'Tune in';
  }
  function stopReceiver() {
    ++fillGeneration;
    filling = false;
    clearTimeout(timer);
    ++revision;
    targetStation = pendingStation = null;
    clearInterval(sweepTimer);
    noise.stop();
    receptionVolume.restore();
  }
  function close() {
    stopReceiver();
    dialog.close();
  }
  dialog.addEventListener('close', () => {
    if (!dialog.open) stopReceiver();
  });
  dialog.addEventListener('pointerdown', noteActivity);
  dialog.addEventListener('keydown', (event) => {
    noteActivity();
    if (event.target.matches('input,button,a')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      rotate(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  $('[data-close]').onclick = close;
  $('[data-tuner]').oninput = (event) => {
    clearInterval(sweepTimer);
    tune(Number(event.target.value));
  };
  function seekStation(direction) {
    const candidates = stations
      .map((_, i) => i)
      .filter((i) =>
        direction > 0
          ? stationFrequency(i) > tunedFrequency + 0.05
          : stationFrequency(i) < tunedFrequency - 0.05,
      );
    const index = direction > 0 ? candidates[0] : candidates.at(-1);
    if (index !== undefined) choose(index);
  }
  $('[data-prev]').onclick = () => seekStation(-1);
  $('[data-next]').onclick = () => seekStation(1);
  $('[data-play]').onclick = async () => {
    if ($('[data-play]').textContent === 'Tune in') return choose(selected);
    try {
      await transport();
      sync();
    } catch (error) {
      status(error.message);
    }
  };
  $('[data-add]').onclick = () => browse();
  $('[data-fill]').onclick = () => fillChannels();
  $('[data-more]').onclick = () => browse(false);
  $('[data-remove]').onclick = () => {
    clearTimeout(timer);
    clearInterval(sweepTimer);
    ++revision;
    stations.splice(selected, 1);
    selected = Math.max(0, Math.min(selected, stations.length - 1));
    save();
    paint();
    applyReception();
    status('Preset removed.');
  };
  $('[data-static]').onchange = () => {
    save();
    applyReception();
  };
  return {
    get open() {
      return dialog.open;
    },
    show() {
      load();
      dialog.showModal();
      paint();
      status();
      if (!autoFilled) void fillChannels();
      (stations.length ? $('[data-tuner]') : $('[data-add]')).focus();
    },
    close,
    rotate,
    select() {
      const focused = document.activeElement;
      if (
        dialog.contains(focused) &&
        focused.matches('button,input[type="checkbox"],a')
      )
        focused.click();
      else {
        const reception = receptionAt(tunedFrequency, stations);
        if (reception.index >= 0) choose(reception.index);
      }
    },
    sync,
  };
}
