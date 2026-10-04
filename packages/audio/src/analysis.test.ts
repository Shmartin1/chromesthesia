import { describe, expect, it } from 'vitest';
import { SpectrumAnalyzer, FFT_SIZE } from './analysis';
const quiet = () => new Float32Array(FFT_SIZE / 2).fill(-120);
describe('stereo analysis', () => {
  it('reports exact silence without forms', () => {
    const zero = new Float32Array(FFT_SIZE);
    expect(
      new SpectrumAnalyzer().analyze(quiet(), quiet(), zero, zero, 48000, 0, -58).bands,
    ).toEqual([]);
  });
  it('keeps antiphase stereo audible and detects a hard-left spectral band', () => {
    const left = quiet(),
      right = quiet();
    left[4] = -15;
    const wave = new Float32Array(FFT_SIZE).fill(0.1),
      inverse = new Float32Array(FFT_SIZE).fill(-0.1);
    const result = new SpectrumAnalyzer().analyze(left, right, wave, inverse, 48000, 0.1, -58);
    expect(result.rmsDb).toBeCloseTo(-20);
    expect(result.stereo).toBe(0);
    expect(result.bands.find((band) => band.db > -30)!.pan).toBeLessThan(-0.99);
  });
  it('clears sustained state through silence', () => {
    const analyzer = new SpectrumAnalyzer(),
      spectrum = quiet();
    spectrum[4] = -15;
    const wave = new Float32Array(FFT_SIZE).fill(0.1),
      zero = new Float32Array(FFT_SIZE);
    for (let n = 1; n < 8; n++)
      analyzer.analyze(spectrum, spectrum, wave, wave, 48000, n / 10, -58);
    analyzer.analyze(quiet(), quiet(), zero, zero, 48000, 1, -58);
    expect(
      analyzer
        .analyze(spectrum, spectrum, wave, wave, 48000, 1.1, -58)
        .bands.find((band) => band.db > -30)!.age,
    ).toBe(0);
  });
});
