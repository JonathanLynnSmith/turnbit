// Local system-audio analysis only: no recorder, destination connection, or upload.
export function createPartyAudio({
  api,
  getState,
  onStatus,
  message,
  getHost = () => document.body,
}) {
  const supported = api?.supported === true;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const properties = ['bass', 'mid', 'treble', 'mix'];
  const interval = 1000 / 15;
  const written = new Map();
  function writeStyle(key, value) {
    const host = getHost();
    if (!host) return;
    let values = written.get(host);
    if (!values) written.set(host, (values = new Map()));
    if (values.get(key) === value) return;
    values.set(key, value);
    host.style.setProperty(key, value);
  }
  function schedule() {
    frame = setTimeout(() => paint(performance.now()), interval);
  }
  let state = supported ? 'idle' : 'unavailable';
  let stream = null,
    context = null,
    source = null,
    analyser = null;
  let frequency, waveform;
  let frame = 0,
    generation = 0,
    pending = false,
    running = false,
    disposed = false;
  let sampledAt = 0;
  let reconnecting = false;
  let amplitude = 0;
  let transition = 0;
  let nativeActive = false,
    nativeSource = '',
    nativeBands = [0, 0, 0],
    nativeRms = 0,
    nativeAt = 0,
    unsubscribe = null,
    captureSource = null;
  const hasCapture = () => !!stream || nativeActive;
  const levels = [0, 0, 0],
    peaks = [0.2, 0.2, 0.2];
  const baseHues = [315, 100, 200, 40];
  const hues = [...baseHues],
    hueTargets = [...baseHues];
  const previousEnergy = [0, 0, 0, 0],
    lastHit = [0, 0, 0, 0];

  function setStatus(next) {
    document.body.dataset.partyAudioLive = String(hasCapture());
    document.body.dataset.partyAudioState = next;
    if (state === next) return;
    state = next;
    if (!disposed) onStatus();
  }
  function release() {
    Promise.resolve(api?.release?.()).catch(() => {});
  }
  function stop() {
    generation++;
    transition++;
    pending = false;
    running = false;
    clearTimeout(frame);
    frame = 0;
    const oldStream = stream,
      oldContext = context;
    stream = context = analyser = null;
    source?.disconnect();
    source = null;
    nativeActive = false;
    reconnecting = false;
    nativeSource = '';
    nativeBands = [0, 0, 0];
    nativeRms = nativeAt = 0;
    captureSource = null;
    unsubscribe?.();
    unsubscribe = null;
    frequency?.fill(0);
    waveform?.fill(0);
    frequency = waveform = undefined;
    oldStream?.getTracks().forEach((track) => track.stop());
    oldContext?.close().catch(() => {});
    release();
    levels.fill(0);
    amplitude = 0;
    peaks.fill(0.2);
    hues.splice(0, hues.length, ...baseHues);
    hueTargets.splice(0, hueTargets.length, ...baseHues);
    previousEnergy.fill(0);
    lastHit.fill(0);
    for (const [host, values] of written)
      for (const key of values.keys()) host.style.removeProperty(key);
    written.clear();
    setStatus(supported ? 'idle' : 'unavailable');
  }
  function fail(text) {
    stop();
    setStatus('error');
    message(text);
  }
  function shouldAnalyse() {
    const current = getState();
    return (
      current.enabled &&
      current.playing &&
      current.ready &&
      current.visible &&
      !current.gamingIdle &&
      !document.hidden &&
      !reducedMotion.matches
    );
  }
  function band(from, to) {
    const hzPerBin = context.sampleRate / analyser.fftSize;
    const first = Math.max(1, Math.ceil(from / hzPerBin));
    const last = Math.min(frequency.length - 1, Math.floor(to / hzPerBin));
    let energy = 0;
    for (let i = first; i <= last; i++) energy += (frequency[i] / 255) ** 2;
    return Math.sqrt(energy / Math.max(1, last - first + 1));
  }
  function paint(timestamp) {
    frame = 0;
    if (!hasCapture() || !running) return;
    if (!shouldAnalyse()) {
      sync();
      return;
    }
    const elapsed = sampledAt ? Math.min(150, timestamp - sampledAt) : interval;
    sampledAt = timestamp;
    if (nativeActive)
      amplitude = performance.now() - nativeAt < 500 ? nativeRms : 0;
    else {
      analyser.getByteFrequencyData(frequency);
      analyser.getFloatTimeDomainData(waveform);
      let rms = 0;
      for (const value of waveform) rms += value * value;
      amplitude = Math.sqrt(rms / waveform.length);
    }
    const silent = amplitude < 0.0008;
    const bands = silent
      ? [0, 0, 0]
      : nativeActive
        ? nativeBands
        : [band(40, 250), band(250, 2000), band(2000, 10000)];
    const energy = [];
    for (let i = 0; i < bands.length; i++) {
      peaks[i] = Math.max(0.2, bands[i], peaks[i] * Math.exp(-elapsed / 6000));
      const target = bands[i] < 0.035 ? 0 : Math.min(1, bands[i] / peaks[i]);
      energy.push(target);
      const smoothing =
        1 - Math.exp(-elapsed / (target > levels[i] ? 65 : 220));
      levels[i] += (target - levels[i]) * smoothing;
    }
    const [bass, mid, treble] = levels;
    const amount = Math.max(0, Math.min(100, getState().intensity ?? 50)) / 100;
    const mix = (bass + mid + treble) / 3;
    writeStyle('--party-glow-strength', (0.2 + mix * amount * 0.7).toFixed(2));
    energy.push((energy[0] + energy[1] + energy[2]) / 3);
    [bass, mid, treble, mix].forEach((level, i) => {
      const rise = energy[i] - previousEnergy[i];
      previousEnergy[i] = energy[i];
      // Accumulate hue instead of returning to a fixed color after each hit.
      // Sustained energy travels through the whole wheel; new hits jump ahead.
      if (!silent && amount > 0) {
        hueTargets[i] += ((energy[i] * elapsed) / 1000) * 320 * amount;
        if (rise > 0.1 && timestamp - lastHit[i] >= 180) {
          hueTargets[i] += (100 + energy[i] * 100) * amount;
          lastHit[i] = timestamp;
        }
      }
      if (amount > 0) {
        const gap = hueTargets[i] - hues[i];
        hues[i] =
          Math.abs(gap) < 0.02
            ? hueTargets[i]
            : hues[i] + gap * (1 - Math.exp(-elapsed / 85));
        const turns = Math.floor(hues[i] / 360) * 360;
        hues[i] -= turns;
        hueTargets[i] -= turns;
      }
      const hue = amount === 0 ? baseHues[i] : hues[i];
      // Saturated colors with bounded lightness; no flashing or layout effects.
      writeStyle(
        '--party-audio-' + properties[i],
        `hsl(${Math.round(hue)} 92% ${Math.round(64 + level * amount * 8)}%)`,
      );
      if (i === 3) {
        const position = ((hue - 315 + 360) % 360) / 60;
        const first = Math.floor(position),
          blend = position - first;
        for (let layer = 0; layer < 6; layer++) {
          const weight =
            layer === first ? 1 - blend : layer === (first + 1) % 6 ? blend : 0;
          writeStyle('--party-glow-' + layer, weight.toFixed(2));
        }
      }
    });
    schedule();
  }
  function sync() {
    const current = getState();
    if (document.body.dataset.partyAudio !== String(current.enabled))
      document.body.dataset.partyAudio = String(current.enabled);
    if (
      (nativeActive || pending) &&
      captureSource &&
      captureSource !== (current.source || 'spotify')
    ) {
      stop();
      return;
    }
    if (!current.enabled || disposed) {
      if (hasCapture() || context || pending || state === 'error') stop();
      return;
    }
    if (!hasCapture() || (!nativeActive && !context)) return;
    const active = shouldAnalyse();
    if (active === running) return;
    running = active;
    const resumeTicket = ++transition;
    clearTimeout(frame);
    frame = 0;
    if (nativeActive) {
      Promise.resolve(api.pause(!active)).catch(() => {});
      setStatus(
        active ? (reconnecting ? 'reconnecting' : 'listening') : 'paused',
      );
      if (active) {
        sampledAt = 0;
        schedule();
      }
      return;
    }
    if (!active) {
      context.suspend().catch(() => {});
      setStatus('paused');
      return;
    }
    const ticket = generation;
    context
      .resume()
      .then(() => {
        if (
          ticket !== generation ||
          resumeTicket !== transition ||
          !running ||
          !stream
        )
          return;
        sampledAt = 0;
        setStatus('listening');
        schedule();
      })
      .catch(() => {
        if (ticket === generation && resumeTicket === transition)
          fail('Audio capture paused. Click Audio Capture to start again.');
      });
  }
  async function start() {
    if (disposed || pending || hasCapture() || !getState().enabled) return;
    if (!supported) {
      message('Audio Reactive is available on Windows.');
      return;
    }
    if (
      !api.native &&
      navigator.userActivation &&
      !navigator.userActivation.isActive
    ) {
      message('Click Audio Capture in Extras to start system audio.');
      return;
    }
    const ticket = ++generation;
    pending = true;
    let incoming = null;
    setStatus('starting');
    try {
      if (api.native) {
        captureSource = getState().source || 'spotify';
        unsubscribe = api.onData((data) => {
          if (ticket !== generation) return;
          if (data.type === 'bands') {
            nativeBands = data.bands;
            nativeRms = data.rms;
            nativeAt = performance.now();
          } else if (data.type === 'source') {
            nativeSource = data.name;
            reconnecting = false;
            if (nativeActive && running) setStatus('listening');
            onStatus();
          } else if (data.type === 'error') fail(data.message);
          else if (data.type === 'reconnecting') {
            nativeBands = [0, 0, 0];
            nativeRms = 0;
            reconnecting = true;
            if (nativeActive && running) setStatus('reconnecting');
          }
        });
        const result = await api.start(captureSource);
        if (ticket !== generation) return;
        nativeSource = result.name;
        nativeActive = true;
        pending = false;
        running = null;
        setStatus('paused');
        sync();
        message('Audio capture started · ' + nativeSource);
        return;
      }
      context = new AudioContext();
      await context.resume();
      if (ticket !== generation) return;
      await api.prepare();
      if (ticket !== generation) return;
      incoming = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: { width: 16, height: 16, frameRate: 1 },
      });
      // The display API requires a video track. It is never rendered, read, or recorded.
      incoming.getVideoTracks().forEach((track) => track.stop());
      if (ticket !== generation || !getState().enabled) return;
      const audio = incoming
        .getAudioTracks()
        .filter((track) => track.readyState === 'live');
      if (!audio.length)
        throw new Error('No system audio track was available.');
      stream = incoming;
      incoming = null;
      const currentStream = stream;
      for (const track of audio)
        track.addEventListener('ended', () => {
          if (stream === currentStream)
            fail('System audio capture ended. Click Audio Capture to restart.');
        });
      source = context.createMediaStreamSource(new MediaStream(audio));
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -20;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      frequency = new Uint8Array(analyser.frequencyBinCount);
      waveform = new Float32Array(analyser.fftSize);
      pending = false;
      running = null;
      setStatus('paused');
      sync();
      message(
        'System audio capture started. Stop it with Audio Capture in Extras.',
      );
    } catch (error) {
      if (ticket === generation)
        fail(
          error.name === 'NotAllowedError'
            ? 'Audio capture was not allowed. Click Audio Capture to try again.'
            : 'Could not start system audio capture. Click Audio Capture to retry.',
        );
    } finally {
      incoming?.getTracks().forEach((track) => track.stop());
      if (ticket === generation) {
        pending = false;
        if (!nativeActive) release();
      }
    }
  }
  function dispose() {
    disposed = true;
    stop();
    document.removeEventListener('visibilitychange', sync);
    reducedMotion.removeEventListener('change', sync);
  }
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('pagehide', dispose, { once: true });
  return {
    start,
    stop,
    sync,
    get status() {
      return {
        supported,
        state,
        active: hasCapture(),
        busy: pending,
        levels: [...levels],
        rms: amplitude,
        source: nativeSource,
      };
    },
  };
}
