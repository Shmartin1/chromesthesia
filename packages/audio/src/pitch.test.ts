import { describe, expect, it } from 'vitest';
import { spectralPitch } from './pitch';

// Actual Blackman-windowed sinusoids, matching the Web Audio analysis window.
function spectrum(hz: number) {
  const size = 2048,
    rate = 48000,
    values = new Float32Array(size / 2).fill(1e-8);
  const nearest = Math.round((hz * size) / rate);
  for (let bin = nearest - 1; bin <= nearest + 1; bin++) {
    let real = 0,
      imaginary = 0;
    for (let i = 0; i < size; i++) {
      const phase = (2 * Math.PI * i) / size;
      const value =
        Math.sin((2 * Math.PI * hz * i) / rate) *
        (0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase));
      real += value * Math.cos(phase * bin);
      imaginary -= value * Math.sin(phase * bin);
    }
    values[bin] = Math.hypot(real, imaginary) / size;
  }
  return { values, nearest, binHz: rate / size };
}

describe('spectral note estimation', () => {
  it.each([
    [55, 'A1'],
    [65.406, 'C2'],
    [73.416, 'D2'],
    [82.407, 'E2'],
    [220, 'A3'],
    [440, 'A4'],
    [523.251, 'C5'],
  ])('resolves %s Hz to %s without quantizing to the FFT bin center', (hz, name) => {
    const { values, nearest, binHz } = spectrum(hz as number);
    const pitch = spectralPitch(values, nearest, binHz, 0.01)!;
    expect(pitch.name).toBe(name);
    expect(Math.abs(pitch.cents)).toBeLessThan(22);
  });
  it('does not claim notes for unresolved sub-bins, plateaus, or noise', () => {
    const values = new Float32Array(1024).fill(0.1);
    expect(spectralPitch(values, 1, 23.4375, 0)).toBeUndefined();
    expect(spectralPitch(values, 19, 23.4375, 0)).toBeUndefined();
    values[19] = 1;
    expect(spectralPitch(values, 19, 23.4375, 0.8)).toBeUndefined();
  });
});
