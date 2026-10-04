/** These contracts contain no browser, React, or renderer dependencies. */
export type SoundFamily = 'bass' | 'voice' | 'synth' | 'supersaw';
export type FamilyChoice = 'auto' | SoundFamily;
export type FormKind = 'orb' | 'tube' | 'wisp' | 'neon' | 'flame' | 'polygon';
export type PercussionKind = 'kick' | 'snare' | 'hat';
export type StudyKind = SoundFamily | 'percussion';
export interface PitchEstimate {
  midi: number;
  pitchClass: number;
  name: string;
  cents: number;
  confidence: number;
}
export interface PercussionFeature {
  id: number;
  kind: PercussionKind;
  frequency: number;
  db: number;
  pan: number;
  strength: number;
  age: number;
  envelope: number;
  brightness: number;
  bandIds: number[];
  reason: string;
}
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
  pitch?: PitchEstimate;
}

export interface FeatureFrame {
  time: number;
  rmsDb: number;
  peakDb: number;
  centroid: number;
  stereo: number;
  bands: BandFeature[];
  percussion: PercussionFeature[];
}

export interface VisualEvent {
  id: number;
  family: SoundFamily | 'percussion';
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
  onset: number;
  age: number;
  pitch?: PitchEstimate;
  percussion?: PercussionKind;
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
  percussion: [],
});
export const emptyScene = (): SceneFrame => ({ time: 0, audible: false, events: [] });
export const MAX_TONAL_EVENTS = 24;
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
  const hits = frame.percussion.filter(
    (hit) =>
      Number.isFinite(hit.db) &&
      hit.db > profile.gateDb - 6 &&
      profile.assignments[hit.kind === 'kick' ? 'low' : hit.kind === 'snare' ? 'mid' : 'high'] ===
        'auto',
  );
  const claimed = new Set(hits.flatMap((hit) => hit.bandIds));
  const distinct = frame.bands
    .filter(
      (band) =>
        Number.isFinite(band.db) &&
        band.db > profile.gateDb - 6 &&
        band.db > strongest - 40 &&
        !(claimed.has(band.id) && profile.assignments[frequencyRegion(band.frequency)] === 'auto'),
    )
    .sort((a, b) => b.db - a.db)
    .filter(
      (band, index, sorted) =>
        !sorted
          .slice(0, index)
          .some(
            (stronger) =>
              Math.abs(Math.log2(band.frequency / stronger.frequency)) <
                (band.pitch && stronger.pitch ? 0.045 : 0.16) &&
              Math.abs(band.pan - stronger.pan) < 0.18 &&
              frequencyRegion(band.frequency) === frequencyRegion(stronger.frequency),
          ),
    );
  // Give audible side detail a share of the bounded pool even under a loud center.
  const sectors = [
    distinct.filter((band) => band.pan < -0.25),
    distinct.filter((band) => Math.abs(band.pan) <= 0.25),
    distinct.filter((band) => band.pan > 0.25),
  ];
  const candidates: BandFeature[] = [];
  for (let i = 0; candidates.length < MAX_TONAL_EVENTS && i < distinct.length; i++)
    for (const sector of sectors)
      if (sector[i] && candidates.length < MAX_TONAL_EVENTS) candidates.push(sector[i]!);
  candidates.sort((a, b) => b.db - a.db);
  const events = candidates.map((band): VisualEvent => {
    const interpretation = classify(band, profile);
    const { family } = interpretation;
    const pitch = clamp(Math.log2(Math.max(35, band.frequency) / 35) / Math.log2(17000 / 35));
    const intensity = clamp(((band.db - (profile.gateDb - 6)) / 48) * profile.sensitivity, 0.03, 1);
    const pan = clamp(band.pan, -1, 1);
    // Unresolved plumes still receive a frequency-based hue, without claiming a
    // detected note. A static family fallback otherwise traps dense music in blue.
    const colorPitch =
      band.pitch ?? (family !== 'bass' ? pitchFromFrequency(band.frequency, 0) : undefined);
    const color = colorPitch
      ? noteColor(family, colorPitch.pitchClass, profile)
      : profile.colors.bass;
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
        (family === 'bass' ? -3.15 + pitch * 2.2 : (pitch - 0.45) * 5) * profile.heightSpread,
        -(1 - intensity) * 4 * profile.depth,
      ],
      color,
      lightness: 0.2 + pitch * 0.55,
      intensity,
      scale: (0.35 + intensity * 0.65) * (family === 'bass' ? 1.1 : 1),
      motion: profile.reducedMotion ? 0 : profile.motion,
      glow: profile.glow,
      confidence: interpretation.confidence,
      reason:
        interpretation.reason +
        (!band.pitch && family !== 'bass'
          ? ' Color follows the nearest note-color at this spectral frequency; no stable pitch was detected.'
          : ''),
      frequency: band.frequency,
      pan,
      db: band.db,
      onset: band.onset,
      age: band.age,
      pitch: band.pitch,
    };
  });
  for (const hit of hits) {
    const intensity = clamp(((hit.db - (profile.gateDb - 6)) / 48) * profile.sensitivity, 0.03, 1);
    const tone = hit.brightness;
    events.push({
      id: hit.id,
      family: 'percussion',
      form: 'polygon',
      percussion: hit.kind,
      position: [
        clamp(hit.pan, -1, 1) * 5 * profile.stereoSpread,
        (hit.kind === 'kick'
          ? -3.3
          : hit.kind === 'snare'
            ? -0.5 + tone * 0.8
            : 3.25 + tone * 0.85) * profile.heightSpread,
        -(1 - intensity) * 4 * profile.depth,
      ],
      color:
        hit.kind === 'kick'
          ? '#000000'
          : hit.kind === 'snare'
            ? mixColor('#ec873e', '#e6d3ad', 1 - tone)
            : mixColor('#777e88', '#ffffff', tone),
      lightness: tone,
      intensity: intensity * hit.envelope,
      scale:
        (hit.kind === 'kick' ? 0.7 : hit.kind === 'snare' ? 0.48 : 0.17) * (0.7 + intensity * 0.3),
      motion: profile.reducedMotion ? 0 : profile.motion,
      glow: 0,
      confidence: hit.kind === 'kick' ? 0.5 : 0.6,
      reason: hit.reason,
      frequency: hit.frequency,
      pan: hit.pan,
      db: hit.db,
      onset: hit.strength,
      age: hit.age,
    });
  }
  return { time: frame.time, audible: events.length > 0, events };
}

export const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const;

/** Equal temperament, A4 = 440 Hz. The caller must establish tonal evidence first. */
export function pitchFromFrequency(hz: number, confidence: number): PitchEstimate | undefined {
  if (!Number.isFinite(hz) || hz < 35 || hz > 17000) return undefined;
  const fractional = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(fractional),
    pitchClass = ((midi % 12) + 12) % 12;
  return {
    midi,
    pitchClass,
    name: `${NOTE_NAMES[pitchClass]}${Math.floor(midi / 12) - 1}`,
    cents: Math.round((fractional - midi) * 100),
    confidence: clamp(confidence),
  };
}

export function mixColor(a: string, b: string, amount: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((offset) => {
        const start = parseInt(a.slice(offset, offset + 2), 16);
        const end = parseInt(b.slice(offset, offset + 2), 16);
        return Math.round(start + (end - start) * clamp(amount))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

function colorHsl(color: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(
    (offset) => parseInt(color.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const lightness = (max + min) / 2;
  if (delta < 1e-8) return [0, 0, lightness];
  const hue =
    max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue / 6, delta / (1 - Math.abs(2 * lightness - 1)), lightness];
}

function hslColor(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 1) + 1) % 1,
    s = clamp(saturation),
    l = clamp(lightness);
  const a = s * Math.min(l, 1 - l);
  return (
    '#' +
    [0, 8, 4]
      .map((n) => {
        const k = (n + h * 12) % 12;
        const channel = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(channel * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/** Preserve the note's hue/chroma while frequency sets its displayed shade. */
export function shadeColor(color: string, lightness: number): string {
  const [h, s] = colorHsl(color);
  return hslColor(h, s, 0.16 + clamp(lightness) * 0.78);
}

/** C through B traverse the full hue wheel; frequency shading is applied separately. */
export const RAINBOW_NOTE_COLORS = Array.from({ length: 12 }, (_, note) =>
  hslColor(note / 12, 0.88, 0.6),
);

/** Melodic families share one note rainbow. Bass retains its personal blue range. */
export function noteColor(
  family: SoundFamily,
  pitchClass: number,
  profile: SynestheticProfile,
): string {
  const note = ((Math.round(pitchClass) % 12) + 12) % 12;
  if (family === 'bass') {
    const [h, s, l] = colorHsl(profile.colors.bass);
    return hslColor(h + (note / 11 - 0.5) * 0.09, s * (0.85 + (0.15 * note) / 11), l);
  }
  return RAINBOW_NOTE_COLORS[note]!;
}
