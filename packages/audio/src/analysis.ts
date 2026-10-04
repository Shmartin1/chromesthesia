import {
  amplitudeToDb,
  clamp,
  silentFeatures,
  stereoPosition,
  type FeatureFrame,
} from '@chromesthesia/core';
import { TransientDetector } from './transients';
import { spectralPitch } from './pitch';

export const FFT_SIZE = 2048;
export const BAND_EDGES = [
  35, 55, 85, 130, 220, 330, 490, 730, 1080, 1600, 2350, 3450, 5050, 7400, 10800, 17000,
];
export class SpectrumAnalyzer {
  private ages = new Float64Array(BAND_EDGES.length - 1);
  private previous = new Float64Array(BAND_EDGES.length - 1);
  private peaks = new Float64Array(BAND_EDGES.length - 1);
  private lastTime = 0;
  private transients = new TransientDetector();
  private magnitudes = new Float32Array(FFT_SIZE / 2);

  reset() {
    this.ages.fill(0);
    this.previous.fill(0);
    this.peaks.fill(0);
    this.lastTime = 0;
    this.transients.reset();
  }

  analyze(
    leftDb: Float32Array,
    rightDb: Float32Array,
    leftWave: Float32Array,
    rightWave: Float32Array,
    sampleRate: number,
    time: number,
    gateDb: number,
  ): FeatureFrame {
    const dt = this.lastTime ? clamp(time - this.lastTime, 0, 0.1) : 0;
    this.lastTime = time;
    let leftPower = 0,
      rightPower = 0,
      peak = 0;
    for (let i = 0; i < leftWave.length; i++) {
      const l = leftWave[i] ?? 0,
        r = rightWave[i] ?? 0;
      leftPower += l * l;
      rightPower += r * r;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }
    const rmsDb = amplitudeToDb(
      Math.sqrt((leftPower + rightPower) / Math.max(1, leftWave.length * 2)),
    );
    if (rmsDb <= gateDb) {
      this.reset();
      return { ...silentFeatures(), time, rmsDb, peakDb: amplitudeToDb(peak) };
    }
    let weightedFrequency = 0,
      totalMagnitude = 0;
    const binHz = sampleRate / (leftDb.length * 2);
    if (this.magnitudes.length !== leftDb.length) this.magnitudes = new Float32Array(leftDb.length);
    for (let bin = 0; bin < leftDb.length; bin++) {
      const l = 10 ** (leftDb[bin]! / 20),
        r = 10 ** (rightDb[bin]! / 20);
      this.magnitudes[bin] = Math.sqrt((l * l + r * r) / 2);
    }
    const bands = BAND_EDGES.slice(0, -1).map((low, id) => {
      const high = BAND_EDGES[id + 1]!;
      const start = Math.max(1, Math.ceil(low / binHz));
      const end = Math.min(leftDb.length - 1, Math.max(start, Math.floor(high / binHz)));
      let lp = 0,
        rp = 0,
        arithmetic = 0,
        logarithmic = 0,
        maxMagnitude = 0,
        center = 0,
        peakBin = start;
      for (let bin = start; bin <= end; bin++) {
        const l = 10 ** ((leftDb[bin] ?? -120) / 20),
          r = 10 ** ((rightDb[bin] ?? -120) / 20);
        const magnitude = Math.sqrt((l * l + r * r) / 2);
        lp += l * l;
        rp += r * r;
        arithmetic += magnitude;
        logarithmic += Math.log(Math.max(1e-12, magnitude));
        center += magnitude * bin * binHz;
        if (magnitude > maxMagnitude) {
          maxMagnitude = magnitude;
          peakBin = bin;
        }
      }
      const count = Math.max(1, end - start + 1);
      const db = amplitudeToDb(maxMagnitude);
      const onset = clamp((maxMagnitude - this.previous[id]!) / Math.max(maxMagnitude, 1e-8));
      this.ages[id] = db > gateDb - 6 ? (onset > 0.75 ? 0 : this.ages[id]! + dt) : 0;
      this.peaks[id] =
        db <= gateDb - 6
          ? 0
          : onset > 0.75
            ? maxMagnitude
            : Math.max(this.peaks[id]!, maxMagnitude);
      this.previous[id] = maxMagnitude;
      weightedFrequency += center;
      totalMagnitude += arithmetic;
      const flatness =
        arithmetic > 1e-10 ? clamp(Math.exp(logarithmic / count) / (arithmetic / count)) : 0;
      // Narrow low bands contain too few bins for a useful flatness measure. Inspect the
      // surrounding peak over a wider neighborhood before deciding whether it is tonal.
      let pitchFlatness = flatness;
      if (high <= 220) {
        const start = Math.max(1, peakBin - 5),
          end = Math.min(this.magnitudes.length - 1, peakBin + 5);
        let sum = 0,
          log = 0;
        for (let bin = start; bin <= end; bin++) {
          sum += this.magnitudes[bin]!;
          log += Math.log(Math.max(this.magnitudes[bin]!, 1e-12));
        }
        pitchFlatness =
          Math.exp(log / (end - start + 1)) / Math.max(sum / (end - start + 1), 1e-12);
      }
      const pitch =
        db > gateDb - 6 ? spectralPitch(this.magnitudes, peakBin, binHz, pitchFlatness) : undefined;
      return {
        id,
        db,
        frequency: pitch
          ? 440 * 2 ** ((pitch.midi + pitch.cents / 100 - 69) / 12)
          : arithmetic > 1e-10
            ? center / arithmetic
            : Math.sqrt(low * high),
        pan: stereoPosition(lp, rp),
        flatness,
        pitch,
        onset,
        age: this.ages[id]!,
        sustainRatio: this.peaks[id]! > 0 ? clamp(maxMagnitude / this.peaks[id]!) : 0,
      };
    });
    return {
      time,
      rmsDb,
      peakDb: amplitudeToDb(peak),
      centroid: totalMagnitude ? weightedFrequency / totalMagnitude : 0,
      stereo: stereoPosition(leftPower, rightPower),
      bands,
      percussion: this.transients.analyze(leftDb, rightDb, sampleRate, time, gateDb, bands),
    };
  }
}
