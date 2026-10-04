import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@chromesthesia/profiles';
import {
  mapFeatures,
  silentFeatures,
  stereoPosition,
  type BandFeature,
  type FeatureFrame,
  type PercussionFeature,
  noteColor,
  pitchFromFrequency,
  shadeColor,
  MAX_TONAL_EVENTS,
} from './index';
const band: BandFeature = {
  id: 0,
  frequency: 80,
  db: -20,
  pan: -0.7,
  flatness: 0.01,
  onset: 0,
  age: 0.1,
  sustainRatio: 1,
};
const frame = (patch: Partial<BandFeature> = {}): FeatureFrame => ({
  ...silentFeatures(),
  rmsDb: -18,
  bands: [{ ...band, ...patch }],
});
describe('sound → world invariants', () => {
  it('maps every melodic pitch class around the full rainbow regardless of legacy family anchors', () => {
    const savedBluePalette = {
      ...defaultProfile,
      colors: {
        ...defaultProfile.colors,
        voice: ['#2222ff', '#2222ff', '#2222ff'] as [string, string, string],
        synth: ['#8822ff', '#8822ff', '#8822ff'] as [string, string, string],
      },
    };
    const hue = (color: string) => {
      const [r, g, b] = [1, 3, 5].map((offset) =>
        parseInt(color.slice(offset, offset + 2), 16),
      ) as [number, number, number];
      const max = Math.max(r, g, b),
        delta = max - Math.min(r, g, b);
      return (
        ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) *
          60 +
          360) %
        360
      );
    };
    for (let note = 0; note < 12; note++)
      for (const family of ['voice', 'synth', 'supersaw'] as const) {
        const color = noteColor(family, note, savedBluePalette);
        expect(hue(color)).toBeCloseTo(note * 30, 0);
        expect(color).toBe(noteColor('voice', note + 12, defaultProfile));
      }
  });
  it('uses spectral-frequency colors for unresolved plumes without fabricating pitch metadata', () => {
    const profile = {
      ...defaultProfile,
      assignments: { ...defaultProfile.assignments, mid: 'voice' as const },
    };
    const colors = Array.from({ length: 12 }, (_, note) => {
      const frequency = 523.251 * 2 ** (note / 12);
      const event = mapFeatures(frame({ frequency, pitch: undefined, flatness: 0.3 }), profile)
        .events[0]!;
      expect(event.pitch).toBeUndefined();
      expect(event.reason).toContain('no stable pitch');
      expect(event.color).toBe(noteColor('voice', note, profile));
      return event.color;
    });
    expect(new Set(colors).size).toBe(12);
  });
  it('keeps distinct nearby notes and reserves space for quieter stereo detail', () => {
    const chord = [523.251, 659.255, 783.991].map((frequency, id) => ({
      ...band,
      id,
      frequency,
      pan: 0,
      pitch: pitchFromFrequency(frequency, 0.9),
    }));
    expect(mapFeatures({ ...frame(), bands: chord }, defaultProfile).events).toHaveLength(3);
    const center = Array.from({ length: 32 }, (_, id) => ({
      ...band,
      id,
      frequency: 240 * 2 ** (id / 8),
      pan: 0,
      pitch: pitchFromFrequency(240 * 2 ** (id / 8), 0.9),
    }));
    const sides = [-0.9, 0.9].map((pan, index) => ({
      ...band,
      id: 100 + index,
      frequency: 1300,
      pan,
      db: -48,
    }));
    const events = mapFeatures({ ...frame(), bands: [...center, ...sides] }, defaultProfile).events;
    expect(events).toHaveLength(MAX_TONAL_EVENTS);
    expect(events.some((event) => event.pan < -0.8)).toBe(true);
    expect(events.some((event) => event.pan > 0.8)).toBe(true);
  });
  it('retains note color differences after frequency shading and lightens every family with frequency', () => {
    for (const family of ['bass', 'voice', 'synth'] as const) {
      const colors = Array.from({ length: 12 }, (_, note) =>
        shadeColor(noteColor(family, note, defaultProfile), 0.4),
      );
      expect(new Set(colors).size).toBe(12);
      for (const color of colors) {
        const low = shadeColor(color, 0.25),
          high = shadeColor(color, 0.7);
        const brightness = (hex: string) =>
          [1, 3, 5].reduce((sum, offset) => sum + parseInt(hex.slice(offset, offset + 2), 16), 0);
        expect(brightness(high)).toBeGreaterThan(brightness(low));
      }
    }
  });
  it('silence immediately clears previously visible forms', () => {
    expect(mapFeatures(frame(), defaultProfile).events).toHaveLength(1);
    expect(mapFeatures(silentFeatures(), defaultProfile)).toEqual({
      time: 0,
      audible: false,
      events: [],
    });
  });
  it('gates at the exact threshold and rejects non-finite input', () => {
    for (const rmsDb of [-58, -80, NaN])
      expect(mapFeatures({ ...frame(), rmsDb }, defaultProfile).events).toHaveLength(0);
  });
  it('preserves stereo direction and maps mono to center', () => {
    expect(stereoPosition(1, 0)).toBe(-1);
    expect(stereoPosition(0, 1)).toBe(1);
    expect(stereoPosition(1, 1)).toBe(0);
    expect(mapFeatures(frame(), defaultProfile).events[0]!.position[0]).toBeLessThan(0);
  });
  it('uses blue orbs for short bass and tubes for sustained bass', () => {
    const pluck = mapFeatures(frame(), defaultProfile).events[0]!;
    expect(pluck.form).toBe('orb');
    expect(pluck.color).toBe(defaultProfile.colors.bass);
    expect(mapFeatures(frame({ age: 0.5 }), defaultProfile).events[0]!.form).toBe('tube');
  });
  it('keeps a decaying bass pluck round even after the initial attack window', () => {
    expect(
      mapFeatures(frame({ age: 0.6, sustainRatio: 0.2 }), defaultProfile).events[0]!.form,
    ).toBe('orb');
    expect(
      mapFeatures(frame({ age: 0.6, sustainRatio: 0.95 }), defaultProfile).events[0]!.form,
    ).toBe('tube');
  });
  it('makes higher frequencies lighter and higher; quiet forms farther away', () => {
    const low = mapFeatures(frame(), defaultProfile).events[0]!;
    const high = mapFeatures(frame({ frequency: 8000 }), defaultProfile).events[0]!;
    const quiet = mapFeatures(frame({ db: -45 }), defaultProfile).events[0]!;
    expect(high.lightness).toBeGreaterThan(low.lightness);
    expect(high.position[1]).toBeGreaterThan(low.position[1]);
    expect(quiet.position[2]).toBeLessThan(low.position[2]);
    expect(low.position[1]).toBeLessThan(-2.7);
  });
  it('applies intentional overrides and disables motion', () => {
    const result = mapFeatures(frame(), {
      ...defaultProfile,
      reducedMotion: true,
      assignments: { low: 'voice', mid: 'auto', high: 'auto' },
    }).events[0]!;
    expect(result.form).toBe('wisp');
    expect(result.motion).toBe(0);
    expect(result.reason).toContain('override');
  });
  it('is deterministic and leaves input unmodified', () => {
    const input = frame();
    const before = structuredClone(input);
    expect(mapFeatures(input, defaultProfile)).toEqual(mapFeatures(input, defaultProfile));
    expect(input).toEqual(before);
  });
  it('maps pitch class to repeatable family colors, independent of spectrum band and octave', () => {
    const a = mapFeatures(frame({ id: 1, pitch: pitchFromFrequency(55, 0.9) }), defaultProfile)
      .events[0]!;
    const otherOctave = mapFeatures(
      frame({ id: 2, frequency: 110, pitch: pitchFromFrequency(110, 0.9) }),
      defaultProfile,
    ).events[0]!;
    const c = mapFeatures(frame({ pitch: pitchFromFrequency(65.406, 0.9) }), defaultProfile)
      .events[0]!;
    expect(a.color).toBe(otherOctave.color);
    expect(c.color).not.toBe(a.color);
    expect(otherOctave.lightness).toBeGreaterThan(a.lightness);
    for (const family of ['bass', 'voice', 'synth'] as const) {
      const palette = Array.from({ length: 12 }, (_, note) =>
        noteColor(family, note, defaultProfile),
      );
      expect(new Set(palette).size).toBe(12);
      if (family === 'bass')
        for (const color of palette)
          expect(parseInt(color.slice(5, 7), 16)).toBeGreaterThan(parseInt(color.slice(1, 3), 16));
    }
  });
  it('keeps drum colors independent of note colors and gives hats smaller, unglowing polygons', () => {
    const hit: PercussionFeature = {
      id: 1001,
      kind: 'kick',
      frequency: 70,
      db: -25,
      pan: 0.5,
      strength: 0.8,
      age: 0,
      envelope: 1,
      brightness: 0.5,
      bandIds: [0],
      reason: 'test attack',
    };
    const kick = mapFeatures({ ...frame(), percussion: [hit] }, defaultProfile).events[0]!;
    const hat = mapFeatures(
      {
        ...frame(),
        bands: [],
        percussion: [{ ...hit, kind: 'hat', frequency: 9000, brightness: 1 }],
      },
      defaultProfile,
    ).events[0]!;
    expect(kick.color).toBe('#000000');
    expect(kick.form).toBe('polygon');
    expect(kick.position[0]).toBeGreaterThan(0);
    expect(hat.color).toBe('#ffffff');
    expect(hat.scale).toBeLessThan(kick.scale / 2);
    expect(hat.glow).toBe(0);
    expect(hat.position[1]).toBeGreaterThan(3.2);
    expect(mapFeatures({ ...silentFeatures(), percussion: [hit] }, defaultProfile).events).toEqual(
      [],
    );
    const overridden = mapFeatures(
      { ...frame(), percussion: [hit] },
      { ...defaultProfile, assignments: { ...defaultProfile.assignments, low: 'bass' } },
    );
    expect(overridden.events.map((event) => event.form)).toEqual(['orb']);
  });
});
