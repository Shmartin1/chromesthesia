import { clamp, pitchFromFrequency, type PitchEstimate } from '@chromesthesia/core';

/** Interpolate a resolved local peak in log magnitude, never a noisy band's centroid.
 * This estimates a spectral note/partial, not a separated polyphonic fundamental. */
export function spectralPitch(
  magnitudes: Float32Array,
  peak: number,
  binHz: number,
  flatness: number,
): PitchEstimate | undefined {
  if (peak < 2 || peak >= magnitudes.length - 1 || flatness > 0.22) return undefined;
  const center = magnitudes[peak]!,
    left = magnitudes[peak - 1]!,
    right = magnitudes[peak + 1]!;
  if (center <= left || center <= right || center <= 1e-8) return undefined;
  const a = Math.log(Math.max(left, 1e-12)),
    b = Math.log(center),
    c = Math.log(Math.max(right, 1e-12));
  const curvature = a - 2 * b + c;
  if (Math.abs(curvature) < 1e-6) return undefined;
  const offset = clamp((0.5 * (a - c)) / curvature, -0.5, 0.5);
  return pitchFromFrequency((peak + offset) * binHz, clamp(1 - flatness * 2, 0.4, 0.95));
}
