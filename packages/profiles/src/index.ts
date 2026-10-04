import type { SynestheticProfile } from '@chromesthesia/core';

export const defaultProfile: SynestheticProfile = {
  schemaVersion: 1,
  name: 'First perception',
  gateDb: -58,
  sensitivity: 1,
  stereoSpread: 1,
  heightSpread: 1,
  depth: 0.75,
  motion: 0.65,
  glow: 0.9,
  reducedMotion: false,
  colors: {
    bass: '#2266ff',
    voice: ['#a6cfff', '#f5acd3', '#f4e5a0'],
    synth: ['#a07aff', '#4af5d0', '#ff69b0'],
  },
  assignments: { low: 'auto', mid: 'auto', high: 'auto' },
};

export const quietProfile: SynestheticProfile = {
  ...defaultProfile,
  name: 'Quiet perception',
  glow: 0.5,
  motion: 0.2,
  reducedMotion: true,
};

const limits = {
  gateDb: [-80, -25],
  sensitivity: [0.3, 3],
  stereoSpread: [0.3, 1.6],
  heightSpread: [0.3, 1.6],
  depth: [0, 1.5],
  motion: [0, 1.5],
  glow: [0, 1.5],
} as const;
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isColor = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);

/** Copy only known properties. Imported data never becomes executable configuration. */
export function parseProfile(value: unknown): SynestheticProfile {
  if (!isRecord(value) || value.schemaVersion !== 1)
    throw new Error('This profile needs schemaVersion 1.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60)
    throw new Error('Profile name must be 1–60 characters.');
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  if (typeof value.reducedMotion !== 'boolean')
    throw new Error('reducedMotion must be true or false.');
  const colors = value.colors;
  if (
    !isRecord(colors) ||
    !isColor(colors.bass) ||
    !Array.isArray(colors.voice) ||
    colors.voice.length !== 3 ||
    !colors.voice.every(isColor) ||
    !Array.isArray(colors.synth) ||
    colors.synth.length !== 3 ||
    !colors.synth.every(isColor)
  )
    throw new Error('Use one bass color and three voice/synth colors in #RRGGBB format.');
  const assignments = value.assignments;
  if (
    !isRecord(assignments) ||
    !['low', 'mid', 'high'].every((key) =>
      ['auto', 'bass', 'voice', 'synth', 'supersaw'].includes(String(assignments[key])),
    )
  )
    throw new Error('Each frequency region needs a valid interpretation.');
  return {
    schemaVersion: 1,
    name: value.name.trim(),
    ...(Object.fromEntries(Object.keys(limits).map((key) => [key, value[key]])) as Pick<
      SynestheticProfile,
      keyof typeof limits
    >),
    reducedMotion: value.reducedMotion,
    colors: {
      bass: colors.bass,
      voice: [...colors.voice] as [string, string, string],
      synth: [...colors.synth] as [string, string, string],
    },
    assignments: {
      low: assignments.low,
      mid: assignments.mid,
      high: assignments.high,
    } as SynestheticProfile['assignments'],
  };
}

export const PROFILE_KEY = 'chromesthesia.profile.v1';
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function loadProfile(storage: ProfileStorage): {
  profile: SynestheticProfile;
  warning?: string;
} {
  try {
    const saved = storage.getItem(PROFILE_KEY);
    return { profile: saved ? parseProfile(JSON.parse(saved)) : structuredClone(defaultProfile) };
  } catch {
    return {
      profile: structuredClone(defaultProfile),
      warning:
        'Saved profile could not be read. Defaults are active; import a backup or save your settings again.',
    };
  }
}
export function saveProfile(storage: ProfileStorage, profile: SynestheticProfile): void {
  storage.setItem(PROFILE_KEY, JSON.stringify(parseProfile(profile)));
}
