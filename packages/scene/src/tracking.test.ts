import { describe, expect, it } from 'vitest';
import { mapFeatures, silentFeatures } from '@chromesthesia/core';
import { defaultProfile } from '@chromesthesia/profiles';
import { SoundTracker } from './tracking';

const tone = (id: number, frequency: number, pan: number) =>
  mapFeatures(
    {
      ...silentFeatures(),
      rmsDb: -20,
      bands: [{ id, frequency, pan, db: -20, flatness: 0.1, onset: 0, age: 1, sustainRatio: 1 }],
    },
    defaultProfile,
  ).events[0]!;

describe('spectral continuity', () => {
  it('retains a surface when a source crosses a neighboring FFT region', () => {
    const tracker = new SoundTracker();
    const before = tracker.update([tone(5, 470, -0.3)])[0]!.generation;
    const after = tracker.update([tone(6, 510, -0.28)]);
    expect(after[0]!.generation).toBe(before);
    expect(after[0]!.event.frequency).toBe(510);
    expect(after.filter(Boolean)).toHaveLength(1);
  });

  it('keeps simultaneous left and right sources distinct even if intensity ordering changes', () => {
    const tracker = new SoundTracker();
    const left = tone(5, 470, -0.8),
      right = tone(6, 510, 0.8);
    const start = tracker.update([left, right]).map((slot) => slot?.generation);
    const reversed = tracker.update([right, left]);
    expect(reversed[0]!.event.pan).toBe(-0.8);
    expect(reversed[1]!.event.pan).toBe(0.8);
    expect(reversed.map((slot) => slot?.generation)).toEqual(start);
  });

  it('clears missing sources immediately and never reuses their animation history', () => {
    const tracker = new SoundTracker();
    const before = tracker.update([tone(5, 470, 0)])[0]!.generation;
    expect(tracker.update([]).every((slot) => !slot)).toBe(true);
    expect(tracker.update([tone(5, 470, 0)])[0]!.generation).not.toBe(before);
    const last = tracker.slots[0]!.generation;
    expect(tracker.update([tone(12, 6000, 0.9)])[0]!.generation).not.toBe(last);
  });
});
