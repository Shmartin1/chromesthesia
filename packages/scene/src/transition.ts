import { Color } from 'three';
import type { VisualEvent } from '@chromesthesia/core';

const forms = ['orb', 'tube', 'neon', 'wisp', 'flame'] as const;
type Form = (typeof forms)[number];

/** Presentation-only damping. Missing input clears all history on the same frame. */
export class SoundTransition {
  private state: {
    event: VisualEvent;
    color: Color;
    weights: Record<Form, number>;
  } | null = null;
  private targetColor = new Color();

  sample(target: VisualEvent | undefined, delta: number, reducedMotion = false) {
    if (!target) {
      this.state = null;
      return null;
    }
    if (!this.state) {
      this.state = {
        event: { ...target, position: [...target.position] },
        color: new Color(target.color),
        weights: { orb: 0, tube: 0, neon: 0, wisp: 0, flame: 0, [target.form]: 1 },
      };
      return this.state;
    }
    // Time constants in seconds: a quick response without FFT-frame jitter.
    const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) / 0.045);
    const shapeBlend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) / 0.055);
    const state = this.state;
    for (const axis of [0, 1, 2] as const)
      state.event.position[axis] += (target.position[axis] - state.event.position[axis]) * blend;
    for (const key of ['scale', 'lightness', 'intensity', 'motion', 'glow'] as const)
      state.event[key] += (target[key] - state.event[key]) * blend;
    state.color.lerp(this.targetColor.set(target.color), blend);
    for (const form of forms)
      state.weights[form] += ((target.form === form ? 1 : 0) - state.weights[form]) * shapeBlend;
    return state;
  }
}
