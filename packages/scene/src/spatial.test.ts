import { describe, expect, it } from 'vitest';
import { stereoX } from './spatial';

describe('stereo projection', () => {
  it('uses both sides symmetrically, keeps mono centered, and leaves room for silhouettes', () => {
    for (const depth of [0, -3]) {
      const half = (14 * (10 - depth)) / 20;
      expect(stereoX(0, depth, 14, 1)).toBe(0);
      expect(stereoX(-2.5, depth, 14, 1)).toBe(-stereoX(2.5, depth, 14, 1));
      expect(stereoX(5, depth, 14, 1)).toBe(half - 1);
      expect(stereoX(8, depth, 14, 1)).toBeLessThan(half);
    }
  });
  it('does not pull distant side sounds back toward the screen center', () => {
    const near = stereoX(2.5, 0, 14, 0) / 7;
    const far = stereoX(2.5, -3, 14, 0) / 9.1;
    expect(far).toBeGreaterThanOrEqual(near);
    expect(near).toBeGreaterThan(0.55);
  });
});
