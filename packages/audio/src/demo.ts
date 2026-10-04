import type { SoundFamily, StudyKind, PercussionKind } from '@chromesthesia/core';

/** Original procedural stereo study. Synthetic voice-like tones, not recorded vocals. */
export function makeDemo(context: AudioContext, isolate?: StudyKind): AudioBuffer {
  const rate = context.sampleRate;
  const duration = isolate ? 6 : 24;
  const buffer = context.createBuffer(2, rate * duration, rate);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  function note(
    start: number,
    length: number,
    hz: number,
    pan: number,
    family: SoundFamily,
    sustained = false,
  ) {
    if (isolate && family !== isolate) return;
    const lg = Math.cos(((pan + 1) * Math.PI) / 4),
      rg = Math.sin(((pan + 1) * Math.PI) / 4);
    const attack = family === 'bass' ? 0.009 : 0.22;
    for (let n = 0; n < Math.floor(length * rate); n++) {
      const index = Math.floor(start * rate) + n;
      if (index >= left.length) break;
      const t = n / rate,
        phase = 2 * Math.PI * hz * t;
      const release = Math.min(1, (length - t) / (family === 'bass' ? 0.1 : 0.45));
      const envelope =
        Math.min(1, t / attack) *
        release *
        (family === 'bass' && !sustained ? Math.exp(-t * 5) : 1);
      let sound = 0;
      if (family === 'bass') sound = Math.sin(phase) * 0.38 + Math.sin(phase * 2) * 0.045;
      if (family === 'voice') {
        const vibrato = 0.8 * Math.sin(2 * Math.PI * 5 * t);
        for (let h = 1; h <= 7; h++)
          sound += Math.sin(phase * h + vibrato) * (h === 3 || h === 5 ? 0.04 : 0.014);
      }
      if (family === 'synth')
        sound = (Math.sin(phase) + Math.sin(phase * 2) * 0.25 + Math.sin(phase * 4) * 0.12) * 0.12;
      if (family === 'supersaw') {
        for (const detune of [0.992, 1, 1.008])
          for (let h = 1; h <= 12; h++) sound += (Math.sin(phase * detune * h) * 0.033) / h;
      }
      left[index] = left[index]! + sound * envelope * lg;
      right[index] = right[index]! + sound * envelope * rg;
    }
  }
  function drum(start: number, kind: PercussionKind, pan: number, level = 1) {
    const length = kind === 'kick' ? 0.28 : kind === 'snare' ? 0.18 : 0.062;
    const lg = Math.cos(((pan + 1) * Math.PI) / 4),
      rg = Math.sin(((pan + 1) * Math.PI) / 4);
    let seed = (Math.floor(start * rate) + 1) >>> 0;
    let low = 0,
      previous = 0,
      high = 0,
      previousHigh = 0,
      high2 = 0;
    const hp = Math.exp((-2 * Math.PI * 6500) / rate);
    for (let n = 0; n < Math.floor(length * rate); n++) {
      const index = Math.floor(start * rate) + n;
      if (index >= left.length) break;
      const t = n / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      low += (noise - low) * (1 - Math.exp((-2 * Math.PI * 3200) / rate));
      high = hp * (high + noise - previous);
      previous = noise;
      high2 = hp * (high2 + high - previousHigh);
      previousHigh = high;
      const envelope =
        Math.min(1, t / 0.001) * Math.exp(-t * (kind === 'kick' ? 17 : kind === 'snare' ? 28 : 65));
      const sound =
        kind === 'kick'
          ? Math.sin(2 * Math.PI * (48 * t + 95 * 0.025 * (1 - Math.exp(-t / 0.025)))) * 0.8
          : kind === 'snare'
            ? low * 0.8 + Math.sin(2 * Math.PI * 185 * t) * 0.07
            : high2 * 0.55;
      left[index] = left[index]! + sound * envelope * lg * level;
      right[index] = right[index]! + sound * envelope * rg * level;
    }
  }
  if (isolate === 'percussion') {
    for (let i = 0; i < 36; i++) drum(0.3 + i * 0.125, 'hat', 0.55, i % 4 === 0 ? 1 : 0.65);
    for (let i = 0; i < 9; i++) {
      drum(0.3 + i * 0.5, i % 2 === 0 ? 'kick' : 'snare', i % 2 === 0 ? -0.25 : 0.05);
    }
  } else if (isolate) {
    const hz = { bass: 73.42, voice: 293.66, synth: 587.33, supersaw: 220 }[isolate];
    note(0.2, 1.1, hz, -0.6, isolate);
    note(1.6, 3.5, hz * 1.5, 0.6, isolate, true);
    if (isolate === 'supersaw') note(1.6, 3.5, hz * 1.25, 0.1, isolate, true);
  } else {
    for (let beat = 0; beat < 28; beat++)
      note(
        0.3 + beat * 0.72,
        0.62,
        [55, 73.42, 82.41, 65.41][Math.floor(beat / 4) % 4]!,
        Math.sin(beat * 1.5) * 0.65,
        'bass',
      );
    note(3.3, 3.8, 220, -0.55, 'voice');
    note(7.2, 3.7, 293.66, 0.5, 'voice');
    note(11, 4.5, 65.41, -0.1, 'bass', true);
    for (let i = 0; i < 8; i++)
      note(5 + i * 1.5, 1.05, [440, 659.25, 587.33, 880][i % 4]!, i % 2 ? 0.7 : -0.7, 'synth');
    for (const [hz, pan] of [
      [220, -0.65],
      [277.18, 0],
      [329.63, 0.65],
    ])
      note(16, 4.3, hz!, pan!, 'supersaw');
    for (let i = 0; i < 96; i++) drum(8.3 + i * 0.125, 'hat', 0.6, i % 4 ? 0.45 : 0.7);
    for (let i = 0; i < 24; i++)
      drum(8.3 + i * 0.5, i % 2 ? 'snare' : 'kick', i % 2 ? 0.1 : -0.3, 0.6);
    // The last three seconds are exact digital silence: a deliberate void check.
  }
  return buffer;
}
