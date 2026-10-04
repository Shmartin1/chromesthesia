/** These contracts contain no browser, React, or renderer dependencies. */
export type SoundFamily = 'bass' | 'voice' | 'synth' | 'supersaw';
export type FamilyChoice = 'auto' | SoundFamily;
export type FormKind = 'orb' | 'tube' | 'wisp' | 'neon' | 'flame';
export type FrequencyRegion = 'low' | 'mid' | 'high';

export interface SynestheticProfile {
  schemaVersion: 1;
  name: string;
  gateDb: number;
  sensitivity: number;
  stereoSpread: number;
  heightSpread: number;
  depth: number;
  motion: number;
  glow: number;
  reducedMotion: boolean;
  colors: { bass: string; voice: [string, string, string]; synth: [string, string, string] };
  assignments: Record<FrequencyRegion, FamilyChoice>;
}

export interface BandFeature {
  id: number;
  frequency: number;
  db: number;
  pan: number;
  flatness: number;
  onset: number;
  age: number;
  sustainRatio: number;
}

export interface FeatureFrame {
  time: number;
  rmsDb: number;
  peakDb: number;
  centroid: number;
  stereo: number;
  bands: BandFeature[];
}

export interface VisualEvent {
  id: number;
  family: SoundFamily;
  form: FormKind;
  position: [number, number, number];
  color: string;
  lightness: number;
  intensity: number;
  scale: number;
  motion: number;
  glow: number;
  confidence: number;
  reason: string;
  frequency: number;
  pan: number;
  db: number;
}

export interface SceneFrame {
  time: number;
  audible: boolean;
  events: VisualEvent[];
}

export const silentFeatures = (): FeatureFrame => ({
  time: 0,
  rmsDb: -120,
  peakDb: -120,
  centroid: 0,
  stereo: 0,
  bands: [],
});
export const emptyScene = (): SceneFrame => ({ time: 0, audible: false, events: [] });
export const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, Number.isFinite(n) ? n : low));
export const amplitudeToDb = (value: number) =>
  value > 0 ? Math.max(-120, 20 * Math.log10(value)) : -120;
export const frequencyRegion = (hz: number): FrequencyRegion =>
  hz < 220 ? 'low' : hz < 2600 ? 'mid' : 'high';

/** Stereo energy balance, not source localization. Phase is intentionally not discarded by mono summing. */
export function stereoPosition(leftPower: number, rightPower: number): number {
  const total = leftPower + rightPower;
  return total > 1e-12 ? clamp((rightPower - leftPower) / total, -1, 1) : 0;
}

function classify(
  band: BandFeature,
  profile: SynestheticProfile,
): { family: SoundFamily; confidence: number; reason: string } {
  const override = profile.assignments[frequencyRegion(band.frequency)];
  if (override !== 'auto')
    return {
      family: override,
      confidence: 1,
      reason: 'Your frequency-region override; not a detected instrument.',
    };
  if (band.frequency < 220)
    return {
      family: 'bass',
      confidence: 0.8,
      reason: 'Low-frequency energy; attack duration selects pluck or sustain.',
    };
  if (band.flatness > 0.22 && band.age > 0.22)
    return {
      family: 'supersaw',
      confidence: 0.35,
      reason:
        'Sustained, spectrally dense energy → flame interpretation. May also be noise or percussion.',
    };
  if (band.frequency < 2600 && band.flatness > 0.025)
    return {
      family: 'voice',
      confidence: 0.4,
      reason: 'Textured midrange energy → voice-like wisps. Instruments can share these features.',
    };
  return {
    family: 'synth',
    confidence: 0.45,
    reason: 'Concentrated or bright energy → neon interpretation. Not verified synth detection.',
  };
}

/** Pure and deterministic. No release tails: inaudibility removes geometry immediately. */
export function mapFeatures(frame: FeatureFrame, profile: SynestheticProfile): SceneFrame {
  if (!Number.isFinite(frame.rmsDb) || frame.rmsDb <= profile.gateDb) {
    return { time: frame.time, audible: false, events: [] };
  }
  const strongest = Math.max(-120, ...frame.bands.map((band) => band.db));
  const candidates = frame.bands
    .filter(
      (band) =>
        Number.isFinite(band.db) && band.db > profile.gateDb - 6 && band.db > strongest - 32,
    )
    .sort((a, b) => b.db - a.db)
    .filter(
      (band, index, sorted) =>
        !sorted
          .slice(0, index)
          .some(
            (stronger) =>
              Math.abs(Math.log2(band.frequency / stronger.frequency)) < 0.8 &&
              Math.abs(band.pan - stronger.pan) < 0.18 &&
              frequencyRegion(band.frequency) === frequencyRegion(stronger.frequency),
          ),
    )
    .slice(0, 14);
  const events = candidates.map((band): VisualEvent => {
    const interpretation = classify(band, profile);
    const { family } = interpretation;
    const pitch = clamp(Math.log2(Math.max(35, band.frequency) / 35) / Math.log2(17000 / 35));
    const intensity = clamp(((band.db - (profile.gateDb - 6)) / 48) * profile.sensitivity, 0.03, 1);
    const pan = clamp(band.pan, -1, 1);
    const paletteIndex = Math.abs(band.id) % 3;
    const color =
      family === 'bass'
        ? profile.colors.bass
        : family === 'voice'
          ? profile.colors.voice[paletteIndex]!
          : profile.colors.synth[paletteIndex]!;
    const form: FormKind =
      family === 'bass'
        ? band.age < 0.28 || band.onset > 0.6 || band.sustainRatio < 0.65
          ? 'orb'
          : 'tube'
        : family === 'voice'
          ? 'wisp'
          : family === 'synth'
            ? 'neon'
            : 'flame';
    return {
      id: band.id,
      family,
      form,
      position: [
        pan * 5 * profile.stereoSpread,
        (pitch - 0.45) * 5 * profile.heightSpread,
        -(1 - intensity) * 4 * profile.depth,
      ],
      color,
      lightness: 0.2 + pitch * 0.55,
      intensity,
      scale: (0.35 + intensity * 0.65) * (family === 'bass' ? 1.1 : 1),
      motion: profile.reducedMotion ? 0 : profile.motion,
      glow: profile.glow,
      confidence: interpretation.confidence,
      reason: interpretation.reason,
      frequency: band.frequency,
      pan,
      db: band.db,
    };
  });
  return { time: frame.time, audible: events.length > 0, events };
}
