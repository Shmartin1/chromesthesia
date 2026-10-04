import { describe, expect, it } from 'vitest';
import { TransientDetector } from './transients';

const rate = 48000,
  bins = 1024;
function spectrum(low: number, high: number, db: number) {
  const data = new Float32Array(bins).fill(-120);
  for (let i = Math.ceil(low / (rate / (bins * 2))); i < Math.ceil(high / (rate / (bins * 2))); i++)
    data[i] = db;
  return data;
}

describe('percussion onsets', () => {
  it('positions a new hat from its attack energy instead of a sustained opposite-side bed', () => {
    const detector = new TransientDetector(),
      quiet = new Float32Array(bins).fill(-120);
    const bed = spectrum(6000, 15000, -36),
      attack = spectrum(6000, 15000, -30);
    detector.analyze(quiet, bed, rate, 0, -58, []);
    const hit = detector.analyze(attack, bed, rate, 0.1, -58, [])[0]!;
    expect(hit.kind).toBe('hat');
    expect(hit.pan).toBeLessThan(-0.99);
  });
  it('does not retrigger when two visual samples share one audio quantum', () => {
    const detector = new TransientDetector(),
      data = spectrum(6000, 15000, -30);
    const first = detector.analyze(data, data, rate, 0.1, -58, []);
    expect(detector.analyze(data, data, rate, 0.1, -58, [])).toEqual(first);
    expect(detector.analyze(data, data, rate, 0.12, -58, [])[0]!.id).toBe(first[0]!.id);
  });
  it.each([0.125, 0.0625])(
    'follows every observed sixteenth at interval %s, including silence between hits',
    (interval) => {
      const detector = new TransientDetector();
      const ids = new Set<number>(),
        attacks: number[] = [];
      for (let frame = 0; frame < 240; frame++) {
        const t = frame / 120,
          phase = t % interval;
        const data = spectrum(6000, 15000, phase < 0.018 ? -30 : -90);
        for (const hit of detector.analyze(data, data, rate, t, -58, [])) {
          expect(hit.kind).toBe('hat');
          if (!ids.has(hit.id)) {
            ids.add(hit.id);
            attacks.push(t);
          }
        }
      }
      expect(ids.size).toBe(Math.round(2 / interval));
      for (let i = 1; i < attacks.length; i++)
        expect(Math.abs(attacks[i]! - attacks[i - 1]! - interval)).toBeLessThan(1 / 60);
    },
  );

  it('does not invent a pulse train from sustained noise', () => {
    const detector = new TransientDetector(),
      data = spectrum(6000, 15000, -30),
      ids = new Set<number>();
    for (let i = 0; i < 90; i++)
      detector.analyze(data, data, rate, i / 60, -58, []).forEach((hit) => ids.add(hit.id));
    expect(ids.size).toBe(1);
    expect(detector.analyze(data, data, rate, 1.5, -58, [])).toEqual([]);
  });

  it('keeps a hard-left hat hard-left and removes it when its band is inaudible', () => {
    const detector = new TransientDetector(),
      data = spectrum(6000, 15000, -30),
      quiet = new Float32Array(bins).fill(-120);
    expect(detector.analyze(data, quiet, rate, 0, -58, [])[0]!.pan).toBeLessThan(-0.99);
    expect(detector.analyze(quiet, quiet, rate, 0.016, -58, [])).toEqual([]);
  });

  it('does not count one broadband snare as both a snare and a hat', () => {
    const detector = new TransientDetector(),
      data = spectrum(200, 16000, -30);
    expect(detector.analyze(data, data, rate, 0, -58, []).map((hit) => hit.kind)).toEqual([
      'snare',
    ]);
  });

  it('requires a falling low-frequency center before interpreting a kick', () => {
    const detector = new TransientDetector(),
      attack = spectrum(100, 180, -20),
      body = spectrum(40, 100, -22);
    expect(detector.analyze(attack, attack, rate, 0, -58, [])).toEqual([]);
    expect(detector.analyze(body, body, rate, 0.02, -58, [])[0]!.kind).toBe('kick');
    detector.reset();
    const bass = new Float32Array(bins).fill(-120);
    bass[3] = -20;
    for (let i = 0; i < 12; i++)
      expect(detector.analyze(bass, bass, rate, i / 60, -58, [])).toEqual([]);
  });
});
