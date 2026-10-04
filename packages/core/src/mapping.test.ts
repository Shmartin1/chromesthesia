import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@chromesthesia/profiles';
import {
  mapFeatures,
  silentFeatures,
  stereoPosition,
  type BandFeature,
  type FeatureFrame,
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
});
