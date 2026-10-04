import { Color } from 'three';
import type { FormKind, VisualEvent } from '@chromesthesia/core';

const forms = ['orb', 'tube', 'neon', 'wisp', 'flame'] as const;
const spatialRate = 36;

/** Analytic critically damped response: continuous velocity, independent of refresh rate. */
export function spring(position: number, velocity: number, target: number, delta: number) {
  const offset = position - target,
    decay = Math.exp(-spatialRate * delta);
  const travel = (velocity + spatialRate * offset) * delta;
  return {
    position: target + (offset + travel) * decay,
    velocity: (velocity - spatialRate * travel) * decay,
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
  } | null = null;
  private velocity = [0, 0, 0];
  private targetColor = new Color();
  private candidate: FormKind = 'orb';
  private candidateTime = 0;
  private settled: FormKind = 'orb';
  private strike = 0;
  private previousAge = 0;
  private previousOnset = 0;

  reset() {
    this.state = null;
    this.velocity.fill(0);
    this.candidateTime = 0;
  }

  sample(target: VisualEvent | undefined, delta: number, reducedMotion = false) {
    if (!target) {
      this.reset();
      return null;
    }
    const dt = Math.max(0, delta);
    if (!this.state) {
      this.settled = this.candidate = target.form;
      this.previousAge = target.age;
      this.previousOnset = target.onset;
      this.strike = target.intensity;
      this.state = {
        event: { ...target, position: [...target.position] },
        color: new Color(target.color),
        weights: { orb: 0, tube: 0, neon: 0, wisp: 0, flame: 0, [target.form]: 1 },
        phase: 0,
        impulse: 0,
        travel: Math.min(target.age, 1),
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
      );
      state.event.position[axis] = reducedMotion ? target.position[axis] : next.position;
      this.velocity[axis] = reducedMotion ? 0 : next.velocity;
    }
    for (const key of ['scale', 'lightness', 'motion', 'glow'] as const)
      state.event[key] += (target[key] - state.event[key]) * blend(0.085);
    state.event.intensity +=
      (target.intensity - state.event.intensity) *
      blend(target.intensity > state.event.intensity ? 0.018 : 0.085);
    state.color.lerp(this.targetColor.set(target.color), blend(0.12));

    // Reject one-frame timbre changes, then dissolve continuously between actual surfaces.
    if (this.candidate !== target.form) {
      this.candidate = target.form;
      this.candidateTime = 0;
    }
    this.candidateTime += dt;
    if (this.candidateTime >= 0.09 || reducedMotion) this.settled = this.candidate;
    for (const form of forms)
      state.weights[form] += ((this.settled === form ? 1 : 0) - state.weights[form]) * blend(0.095);

    state.travel += dt;
    if (
      (target.onset > 0.55 && this.previousOnset <= 0.55) ||
      target.age + 0.025 < this.previousAge
    ) {
      state.travel = 0;
      this.strike = target.intensity;
    }
    this.previousAge = target.age;
    this.previousOnset = target.onset;
    state.phase +=
      dt * (0.55 + state.event.intensity * 0.2) * (reducedMotion ? 0 : state.event.motion);
    state.impulse = reducedMotion
      ? 0
      : Math.sin(state.travel * 18 + 0.5) *
        Math.exp(-state.travel * 5) *
        this.strike *
        state.event.motion;
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
