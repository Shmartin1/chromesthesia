import { describe, expect, it } from 'vitest';
import type { VisualEvent } from '@chromesthesia/core';
import { SoundTransition, spring, recoil } from './transition';

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
  onset: 0,
  age: 0.1,
};

describe('active sound transitions', () => {
  it('keeps deformation continuous when another attack arrives, including overlapping traveling accents', () => {
    const transition = new SoundTransition();
    transition.sample({ ...sound, onset: 1, age: 0 }, 0);
    const running = transition.sample({ ...sound, age: 0.09 }, 0.09)!;
    const impulse = running.impulse,
      phase = running.phase;
    const previousPulse = running.pulses[0]!.age;
    const attack = transition.sample({ ...sound, onset: 1, age: 0 }, 0)!;
    expect(attack.impulse).toBeCloseTo(impulse, 12);
    expect(attack.phase).toBe(phase);
    expect(attack.pulses[0]!.age).toBe(previousPulse);
    expect(attack.pulses.filter((pulse) => pulse.strength > 0)).toHaveLength(2);
    expect(attack.pulses.some((pulse) => pulse.age === 0 && pulse.strength > 0)).toBe(true);
    expect(transition.sample(undefined, 0)).toBeNull();
  });

  it('integrates elastic motion consistently across refresh rates', () => {
    const once = recoil(0.2, 3, 0.3);
    let steps = { position: 0.2, velocity: 3 };
    for (let i = 0; i < 72; i++) steps = recoil(steps.position, steps.velocity, 0.3 / 72);
    expect(steps.position).toBeCloseTo(once.position, 12);
    expect(steps.velocity).toBeCloseTo(once.velocity, 12);
  });

  it('softens audible entrances without delaying their first visible frame or adding a release tail', () => {
    const transition = new SoundTransition();
    const first = transition.sample(sound, 0)!;
    expect(first.presence).toBeGreaterThan(0);
    expect(first.presence).toBeLessThan(1);
    expect(transition.sample(sound, 0.06)!.presence).toBeGreaterThan(0.95);
    expect(transition.sample(undefined, 0)).toBeNull();
    expect(transition.sample(sound, 0, true)!.presence).toBe(1);
  });

  it('preserves size momentum on a rapid direction change and avoids a procedural jump after a stall', () => {
    const transition = new SoundTransition();
    transition.sample(sound, 0);
    const growing = transition.sample({ ...sound, scale: 2 }, 0.03)!.event.scale;
    const redirected = transition.sample({ ...sound, scale: 0.5 }, 0.001)!;
    expect(redirected.event.scale).toBeGreaterThan(growing);
    const phase = redirected.phase;
    expect(transition.sample(sound, 2)!.phase - phase).toBeLessThan(0.05);
    expect(transition.sample(sound, 0)!.event.scale).toBeCloseTo(sound.scale, 8);
  });

  it('preserves velocity through target changes and settles without frame-step instability', () => {
    const first = spring(0, 0, 1, 0.05);
    const redirected = spring(first.position, first.velocity, -1, 0);
    expect(redirected.position).toBeCloseTo(first.position);
    expect(redirected.velocity).toBeCloseTo(first.velocity);
    expect(spring(first.position, first.velocity, -1, 10)).toEqual({
      position: -1,
      velocity: expect.any(Number),
    });
  });

  it('ties elastic recoil to onsets and freezes procedural phase in reduced motion', () => {
    const transition = new SoundTransition();
    transition.sample(sound, 0);
    const active = transition.sample({ ...sound, onset: 1, age: 0 }, 1 / 60)!;
    expect(active.impulse).toBeGreaterThan(0);
    expect(active.travel).toBe(0);
    const phase = active.phase;
    const reduced = transition.sample({ ...sound, age: 0.1 }, 0.1, true)!;
    expect(reduced.impulse).toBe(0);
    expect(reduced.phase).toBe(phase);
  });
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
    expect(slow.event.scale).toBeCloseTo(2, 2);
    expect(slow.event.scale).toBeLessThan(2);
    expect(slow.color.r).toBeCloseTo(fast.color.r, 10);
    // Timbre confirmation is bounded by one frame; spatial integration is analytic.
    expect(slow.weights.tube).toBeCloseTo(fast.weights.tube, 2);
    expect(start).toEqual(sound);
    expect(target.position).toEqual([3, 2, 1]);
  });

  it('crossfades active shapes with conserved weight and bypasses interpolation for reduced motion', () => {
    const transition = new SoundTransition();
    transition.sample(sound, 0);
    const target: VisualEvent = { ...sound, form: 'tube', position: [1, 2, 3] };
    const transient = transition.sample(target, 1 / 60)!;
    expect(transient.weights.tube).toBe(0);
    const blended = transition.sample(target, 0.1)!;
    expect(blended.weights.tube).toBeGreaterThan(0);
    expect(blended.weights.orb).toBeGreaterThan(0);
    expect(Object.values(blended.weights).reduce((a, b) => a + b)).toBeCloseTo(1);
    const reduced = transition.sample(target, 0, true)!;
    expect(reduced.event.position).toEqual(target.position);
    expect(reduced.weights).toEqual({ orb: 0, tube: 1, neon: 0, wisp: 0, flame: 0, polygon: 0 });
  });
});
