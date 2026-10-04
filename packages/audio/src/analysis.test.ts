import { describe, expect, it } from 'vitest';
import { SpectrumAnalyzer, FFT_SIZE } from './analysis';
const quiet = () => new Float32Array(FFT_SIZE / 2).fill(-120);
function peak(data: Float32Array, hz: number, db: number) {
  const center = hz / (48000 / FFT_SIZE);
  for (let bin = Math.max(1, Math.floor(center) - 4); bin <= Math.ceil(center) + 4; bin++)
    data[bin] = Math.max(data[bin]!, db - 18 * (bin - center) ** 2);
}
describe('stereo analysis', () => {
  it('resolves opposite-side notes inside the same coarse region and keeps their own pitches', () => {
    const left = quiet(),
      right = quiet(),
      wave = new Float32Array(FFT_SIZE).fill(0.1);
    peak(left, 523.251, -18);
    peak(right, 659.255, -18);
    const result = new SpectrumAnalyzer().analyze(left, right, wave, wave, 48000, 0.1, -58);
    const c = result.bands.find((band) => band.pitch?.name === 'C5')!;
    const e = result.bands.find((band) => band.pitch?.name === 'E5')!;
    expect(c.pan).toBeLessThan(-0.99);
    expect(e.pan).toBeGreaterThan(0.99);
    expect(c.id).not.toBe(e.id);
    expect(result.stereo).toBe(0);
  });
  it('retains a quieter side note beside a loud centered note and preserves its age', () => {
    const left = quiet(),
      right = quiet(),
      wave = new Float32Array(FFT_SIZE).fill(0.1);
    peak(left, 523.251, -15);
    peak(right, 523.251, -15);
    peak(right, 659.255, -35);
    const analyzer = new SpectrumAnalyzer();
    analyzer.analyze(left, right, wave, wave, 48000, 0.1, -58);
    const result = analyzer.analyze(left, right, wave, wave, 48000, 0.2, -58);
    expect(result.bands.find((band) => band.pitch?.name === 'C5')!.pan).toBeCloseTo(0);
    const side = result.bands.find((band) => band.pitch?.name === 'E5')!;
    expect(side.pan).toBeGreaterThan(0.99);
    expect(side.age).toBeCloseTo(0.1);
    expect(side.onset).toBe(0);
  });
  it('keeps mono as one centered peak and splits broad side textures without claiming notes', () => {
    const data = quiet(),
      wave = new Float32Array(FFT_SIZE).fill(0.1);
    peak(data, 523.251, -18);
    const mono = new SpectrumAnalyzer().analyze(data, data, wave, wave, 48000, 0.1, -58);
    const pitches = mono.bands.filter((band) => band.pitch?.name === 'C5');
    expect(pitches).toHaveLength(1);
    expect(pitches[0]!.pan).toBe(0);
    expect(mono.bands.filter((band) => band.db > -40)).toHaveLength(1);
    const l = quiet(),
      r = quiet();
    for (let bin = 320; bin < 400; bin++) (bin < 360 ? l : r)[bin] = -25;
    const noise = new SpectrumAnalyzer().analyze(l, r, wave, wave, 48000, 0.1, -58);
    expect(noise.bands.some((band) => band.db > -40 && band.pan < -0.99 && !band.pitch)).toBe(true);
    expect(noise.bands.some((band) => band.db > -40 && band.pan > 0.99 && !band.pitch)).toBe(true);
  });
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
