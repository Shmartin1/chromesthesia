import { describe, expect, it } from 'vitest';
import { defaultProfile, loadProfile, parseProfile, saveProfile } from './index';
describe('portable profiles', () => {
  it('round-trips the default profile', () =>
    expect(parseProfile(JSON.parse(JSON.stringify(defaultProfile)))).toEqual(defaultProfile));
  it('rejects unsupported schemas, invalid colors and unsafe ranges', () => {
    for (const patch of [
      { schemaVersion: 2 },
      { gateDb: 5 },
      { sensitivity: Infinity },
      { colors: { ...defaultProfile.colors, bass: 'url(evil)' } },
      { assignments: { low: 'arbitrary' } },
    ]) {
      expect(() => parseProfile({ ...defaultProfile, ...patch })).toThrow();
    }
  });
  it('copies arrays and strips unknown properties', () => {
    const profile = parseProfile({ ...defaultProfile, extra: 'ignored' });
    expect(profile).not.toHaveProperty('extra');
    expect(profile.colors.voice).not.toBe(defaultProfile.colors.voice);
  });
  it('recovers from corrupted storage and reports failed saves', () => {
    const broken = {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('Quota');
      },
    };
    expect(loadProfile(broken).warning).toBeTruthy();
    expect(loadProfile(broken).profile).toEqual(defaultProfile);
    expect(() => saveProfile(broken, defaultProfile)).toThrow('Quota');
  });
});
