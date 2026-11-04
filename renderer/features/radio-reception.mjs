export const BAND_MIN = 87.5;
export const BAND_MAX = 108;
export const stationFrequency = (index) =>
  Number((88.1 + index * 1.8).toFixed(1));
export const clampFrequency = (value) =>
  Math.round(Math.max(BAND_MIN, Math.min(BAND_MAX, value)) * 10) / 10;

export function receptionAt(frequency, stations) {
  let index = -1,
    distance = Infinity;
  stations.forEach((_, i) => {
    const next = Math.abs(frequency - stationFrequency(i));
    if (next < distance) {
      index = i;
      distance = next;
    }
  });
  // Stations are 1.8 MHz apart. Start Spotify in the outer 0.8 MHz pickup
  // zone, keeping it hidden under static until the inner 0.5 MHz fade zone.
  const strength = Math.max(0, Math.min(1, 1 - distance / 0.5));
  return {
    index: distance <= 0.80001 ? index : -1,
    distance,
    strength: strength * strength * (3 - 2 * strength),
  };
}

// A long stereo bed blends broadband hiss, low radio rush and sparse crackle.
export function makeRadioNoise(sampleRate, seconds = 6, random = Math.random) {
  return Array.from({ length: 2 }, () => {
    const samples = new Float32Array(Math.floor(sampleRate * seconds));
    let low = 0,
      crackle = 0,
      drift = 0;
    for (let i = 0; i < samples.length; i++) {
      const white = random() * 2 - 1;
      low = low * 0.975 + white * 0.025;
      drift = drift * 0.9995 + white * 0.0005;
      if (random() < 9 / sampleRate) crackle += (random() * 2 - 1) * 0.55;
      crackle *= 0.92;
      samples[i] = Math.tanh(
        (white * 0.48 + low * 2.1 + crackle) * (0.85 + drift * 3),
      );
    }
    // Crossfade the loop seam; no periodic click every six seconds.
    const seam = Math.min(
      Math.floor(sampleRate * 0.025),
      Math.floor(samples.length / 2),
    );
    const seamOffset = samples[samples.length - 1] - samples[0];
    for (let i = 0; i < seam; i++) {
      const t = i / seam;
      samples[i] += seamOffset * (1 - t);
    }
    return samples;
  });
}

export function createTuningNoise() {
  let context,
    source,
    gain,
    highpass,
    lowpass,
    resonance,
    enabled = false;
  function set(level, { frequency = 88.1, motion = 0 } = {}) {
    enabled = level > 0;
    if (!enabled && !context) return;
    try {
      if (!context) {
        context = new AudioContext();
        const buffer = context.createBuffer(
          2,
          context.sampleRate * 6,
          context.sampleRate,
        );
        makeRadioNoise(context.sampleRate).forEach((samples, channel) =>
          buffer.copyToChannel(samples, channel),
        );
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        gain = context.createGain();
        gain.gain.value = 0;
        highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 180;
        lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 6500;
        resonance = context.createBiquadFilter();
        resonance.type = 'peaking';
        resonance.Q.value = 2.5;
        source
          .connect(highpass)
          .connect(lowpass)
          .connect(resonance)
          .connect(gain)
          .connect(context.destination);
        source.start();
      }
      const now = context.currentTime;
      // Sweeping through the band changes the texture rather than replaying a burst.
      highpass.frequency.setTargetAtTime(160 + motion * 220, now, 0.08);
      lowpass.frequency.setTargetAtTime(3300 + level * 3200, now, 0.08);
      resonance.frequency.setTargetAtTime(
        750 + ((frequency * 137) % 2100),
        now,
        0.06,
      );
      resonance.gain.setTargetAtTime(motion * 3, now, 0.08);
      gain.gain.setTargetAtTime(level * 0.065, now, 0.06);
      if (enabled) context.resume().catch(() => {});
    } catch {
      /* Audio availability does not block tuning. */
    }
  }
  function stop() {
    enabled = false;
    if (gain) gain.gain.setValueAtTime(0, context.currentTime);
    context?.suspend().catch(() => {});
  }
  return { set, stop };
}

// Serialize remote volume writes and discard intermediate targets during a sweep.
export function createReceptionVolume(write) {
  let baseline = null,
    desired = null,
    last = null,
    pending = null,
    timer;
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (pending) return pending;
    if (desired === null || desired === last) return Promise.resolve();
    const value = desired;
    pending = Promise.resolve()
      .then(() => write(value))
      .then(() => {
        last = value;
      })
      .catch(() => {
        /* Restricted devices still allow station selection. */
      })
      .finally(() => {
        pending = null;
        if (desired !== value) timer = setTimeout(flush, 160);
      });
    return pending;
  }
  return {
    start(volume) {
      if (baseline === null && Number.isFinite(volume)) baseline = volume;
    },
    set(strength) {
      if (baseline === null) return;
      desired = Math.round(baseline * strength);
      if (!timer && !pending) timer = setTimeout(flush, 200);
    },
    async silence() {
      if (baseline === null) return;
      desired = 0;
      await flush();
      // If a previous volume write was already running, drain our mute next.
      if (desired === 0) await flush();
    },
    restore() {
      clearTimeout(timer);
      if (baseline === null) return;
      desired = baseline;
      baseline = null;
      void flush();
    },
  };
}
