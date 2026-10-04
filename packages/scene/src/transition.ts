import { Color } from 'three';
import { clamp, type FormKind, type VisualEvent } from '@chromesthesia/core';

const forms = ['orb', 'tube', 'neon', 'wisp', 'flame'] as const;
const responseRates = { scale: 32, lightness: 28, motion: 24, glow: 28 } as const;

/** Analytic critically damped response: continuous velocity, independent of refresh rate. */
export function spring(
  position: number,
  velocity: number,
  target: number,
  delta: number,
  rate = 36,
) {
  const offset = position - target,
    decay = Math.exp(-rate * delta);
  const travel = (velocity + rate * offset) * delta;
  return {
    position: target + (offset + travel) * decay,
    velocity: (velocity - rate * travel) * decay,
  };
}

/** An attack adds velocity, never a discontinuity in the visible deformation. */
export function recoil(position: number, velocity: number, delta: number) {
  const damping = 7,
    frequency = 15;
  const decay = Math.exp(-damping * delta),
    sine = Math.sin(frequency * delta),
    cosine = Math.cos(frequency * delta);
  const quadrature = (velocity + damping * position) / frequency;
  return {
    position: decay * (position * cosine + quadrature * sine),
    velocity: decay * (velocity * cosine - (damping * quadrature + position * frequency) * sine),
  };
}

/** Presentation history exists only while an audible event owns its slot. */
export class SoundTransition {
  private state: {
    event: VisualEvent;
    color: Color;
    weights: Record<FormKind, number>;
    phase: number;
    impulse: number;
    travel: number;
    presence: number;
    pulses: Array<{ age: number; strength: number }>;
  } | null = null;
  private velocity = [0, 0, 0];
  private scalarVelocity = { scale: 0, lightness: 0, motion: 0, glow: 0 };
  private weightVelocity = { orb: 0, tube: 0, neon: 0, wisp: 0, flame: 0 };
  private colorVelocity = [0, 0, 0];
  private elastic = { position: 0, velocity: 0 };
  private targetColor = new Color();
  private candidate: FormKind = 'orb';
  private candidateTime = 0;
  private settled: FormKind = 'orb';
  private previousAge = 0;
  private previousOnset = 0;

  reset() {
    this.state = null;
    this.velocity.fill(0);
    this.colorVelocity.fill(0);
    for (const key of Object.keys(responseRates) as Array<keyof typeof responseRates>)
      this.scalarVelocity[key] = 0;
    for (const form of forms) this.weightVelocity[form] = 0;
    this.elastic = { position: 0, velocity: 0 };
    this.candidateTime = 0;
  }

  sample(target: VisualEvent | undefined, delta: number, reducedMotion = false) {
    if (!target) {
      this.reset();
      return null;
    }
    const dt = Math.max(0, Number.isFinite(delta) ? delta : 0);
    if (!this.state) {
      this.settled = this.candidate = target.form;
      this.previousAge = target.age;
      this.previousOnset = target.onset;
      this.elastic = { position: 0, velocity: reducedMotion ? 0 : target.intensity * 6 };
      this.state = {
        event: { ...target, position: [...target.position] },
        color: new Color(target.color),
        weights: { orb: 0, tube: 0, neon: 0, wisp: 0, flame: 0, polygon: 0, [target.form]: 1 },
        phase: 0,
        impulse: 0,
        travel: Math.min(target.age, 1),
        presence: reducedMotion ? 1 : 0.25,
        pulses: [
          { age: Math.min(target.age, 1), strength: reducedMotion ? 0 : target.intensity },
          { age: 10, strength: 0 },
          { age: 10, strength: 0 },
        ],
      };
      return this.state;
    }
    const state = this.state;
    const blend = (seconds: number) => (reducedMotion ? 1 : 1 - Math.exp(-dt / seconds));
    for (const axis of [0, 1, 2] as const) {
      const next = spring(
        state.event.position[axis],
        this.velocity[axis]!,
        target.position[axis],
        dt,
        axis === 0 ? 36 : axis === 1 ? 28 : 24,
      );
      state.event.position[axis] = reducedMotion ? target.position[axis] : next.position;
      this.velocity[axis] = reducedMotion ? 0 : next.velocity;
    }
    for (const key of ['scale', 'lightness', 'motion', 'glow'] as const) {
      const next = spring(
        state.event[key],
        this.scalarVelocity[key],
        target[key],
        dt,
        responseRates[key],
      );
      state.event[key] = reducedMotion ? target[key] : next.position;
      this.scalarVelocity[key] = reducedMotion ? 0 : next.velocity;
    }
    state.event.intensity +=
      (target.intensity - state.event.intensity) *
      blend(target.intensity > state.event.intensity ? 0.018 : 0.085);
    this.targetColor.set(target.color);
    for (const [index, channel] of (['r', 'g', 'b'] as const).entries()) {
      const next = spring(
        state.color[channel],
        this.colorVelocity[index]!,
        this.targetColor[channel],
        dt,
        40,
      );
      state.color[channel] = reducedMotion ? this.targetColor[channel] : next.position;
      this.colorVelocity[index] = reducedMotion ? 0 : next.velocity;
    }
    state.presence += (1 - state.presence) * blend(0.02);

    // Reject one-frame timbre changes, then dissolve continuously between actual surfaces.
    if (this.candidate !== target.form) {
      this.candidate = target.form;
      this.candidateTime = 0;
    }
    this.candidateTime += dt;
    if (this.candidateTime >= 0.09 || reducedMotion) this.settled = this.candidate;
    for (const form of forms) {
      const targetWeight = this.settled === form ? 1 : 0;
      const next = spring(state.weights[form], this.weightVelocity[form], targetWeight, dt, 28);
      state.weights[form] = reducedMotion ? targetWeight : next.position;
      this.weightVelocity[form] = reducedMotion ? 0 : next.velocity;
    }

    state.travel += dt;
    for (const pulse of state.pulses) pulse.age = Math.min(10, pulse.age + dt);
    if (
      (target.onset > 0.55 && this.previousOnset <= 0.55) ||
      target.age + 0.025 < this.previousAge
    ) {
      state.travel = 0;
      this.elastic.velocity = clamp(this.elastic.velocity + target.intensity * 6, -10, 10);
      const pulse = state.pulses.reduce((oldest, candidate) =>
        candidate.age > oldest.age ? candidate : oldest,
      );
      pulse.age = 0;
      pulse.strength = target.intensity;
    }
    this.previousAge = target.age;
    this.previousOnset = target.onset;
    state.phase +=
      Math.min(dt, 0.05) *
      (0.55 + state.event.intensity * 0.2) *
      (reducedMotion ? 0 : state.event.motion);
    this.elastic = reducedMotion
      ? { position: 0, velocity: 0 }
      : recoil(this.elastic.position, this.elastic.velocity, dt);
    state.impulse = this.elastic.position * state.event.motion;
    if (reducedMotion) for (const pulse of state.pulses) pulse.strength = 0;
    state.event.id = target.id;
    state.event.form = target.form;
    state.event.family = target.family;
    state.event.frequency = target.frequency;
    state.event.pan = target.pan;
    state.event.db = target.db;
    state.event.age = target.age;
    state.event.onset = target.onset;
    return state;
  }
}
