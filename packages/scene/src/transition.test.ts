import { describe, expect, it } from 'vitest';
import type { VisualEvent } from '@chromesthesia/core';
import { SoundTransition } from './transition';

const sound: VisualEvent = {
  id: 0,
  family: 'bass',
  form: 'orb',
  position: [-3, -2, -1],
  color: '#2255cc',
  lightness: 0.4,
  intensity: 0.7,
  scale: 1,
  motion: 0.5,
  glow: 0.5,
  confidence: 0.7,
  reason: 'test tone',
  frequency: 100,
  pan: -1,
  db: -20,
};

describe('active sound transitions', () => {
  it('places new sounds immediately, clears on silence, and never carries history across silence', () => {
    const transition = new SoundTransition();
    expect(transition.sample(sound, 1 / 60)!.event.position).toEqual(sound.position);
    transition.sample({ ...sound, position: [3, 2, 0] }, 1 / 60);
    expect(transition.sample(undefined, 0)).toBeNull();
    expect(
      transition.sample({ ...sound, form: 'flame', position: [4, 3, 1] }, 1 / 144),
    ).toMatchObject({ event: { position: [4, 3, 1] }, weights: { orb: 0, flame: 1 } });
  });

  it('converges equally at 30 and 144 FPS, without overshoot or mutating mapping output', () => {
    const start = structuredClone(sound);
    const target: VisualEvent = {
      ...sound,
      scale: 2,
      position: [3, 2, 1],
      color: '#ffccaa',
      form: 'tube',
    };
    const run = (fps: number) => {
      const transition = new SoundTransition();
      transition.sample(start, 0);
      for (let frame = 0; frame < fps / 2; frame++) transition.sample(target, 1 / fps);
      return transition.sample(target, 0)!;
    };
    const slow = run(30),
      fast = run(144);
    expect(slow.event.position[0]).toBeCloseTo(fast.event.position[0], 10);
    expect(slow.event.scale).toBeCloseTo(2, 3);
    expect(slow.event.scale).toBeLessThan(2);
    expect(slow.color.r).toBeCloseTo(fast.color.r, 10);
    expect(slow.weights.tube).toBeCloseTo(fast.weights.tube, 10);
    expect(start).toEqual(sound);
    expect(target.position).toEqual([3, 2, 1]);
  });

  it('crossfades active shapes with conserved weight and bypasses interpolation for reduced motion', () => {
    const transition = new SoundTransition();
    transition.sample(sound, 0);
    const target: VisualEvent = { ...sound, form: 'tube', position: [1, 2, 3] };
    const blended = transition.sample(target, 1 / 60)!;
    expect(blended.weights.tube).toBeGreaterThan(0);
    expect(blended.weights.orb).toBeGreaterThan(0);
    expect(Object.values(blended.weights).reduce((a, b) => a + b)).toBeCloseTo(1);
    const reduced = transition.sample(target, 0, true)!;
    expect(reduced.event.position).toEqual(target.position);
    expect(reduced.weights).toEqual({ orb: 0, tube: 1, neon: 0, wisp: 0, flame: 0 });
  });
});
