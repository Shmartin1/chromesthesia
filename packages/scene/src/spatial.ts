import { clamp } from '@chromesthesia/core';

/** Keep stereo readable at every depth; perspective still reduces a quiet form's size. */
export function stereoX(mappedX: number, depth: number, viewportWidth: number, radius: number) {
  const pan = mappedX / 5;
  const halfWidth = (viewportWidth * (10 - depth)) / 20;
  const room = Math.max(0, halfWidth - Math.max(0.2, radius));
  const expanded = Math.sign(pan) * Math.abs(pan) ** 0.78;
  return clamp(expanded, -1, 1) * room;
}
