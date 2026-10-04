import {
  amplitudeToDb,
  clamp,
  silentFeatures,
  stereoPosition,
  type FeatureFrame,
} from '@chromesthesia/core';

export const FFT_SIZE = 2048;
export const BAND_EDGES = [
  35, 55, 85, 130, 220, 330, 490, 730, 1080, 1600, 2350, 3450, 5050, 7400, 10800, 17000,
];
export class SpectrumAnalyzer {
  private ages = new Float64Array(BAND_EDGES.length - 1);
  private previous = new Float64Array(BAND_EDGES.length - 1);
  private lastTime = 0;

  reset() {
    this.ages.fill(0);
    this.previous.fill(0);
    this.lastTime = 0;
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
    const bands = BAND_EDGES.slice(0, -1).map((low, id) => {
      const high = BAND_EDGES[id + 1]!;
      const start = Math.max(1, Math.ceil(low / binHz));
      const end = Math.min(leftDb.length - 1, Math.max(start, Math.floor(high / binHz)));
      let lp = 0,
        rp = 0,
        arithmetic = 0,
        logarithmic = 0,
        maxMagnitude = 0,
        center = 0;
      for (let bin = start; bin <= end; bin++) {
        const l = 10 ** ((leftDb[bin] ?? -120) / 20),
          r = 10 ** ((rightDb[bin] ?? -120) / 20);
        const magnitude = Math.sqrt((l * l + r * r) / 2);
        lp += l * l;
        rp += r * r;
        arithmetic += magnitude;
        logarithmic += Math.log(Math.max(1e-12, magnitude));
        center += magnitude * bin * binHz;
        maxMagnitude = Math.max(maxMagnitude, magnitude);
      }
      const count = Math.max(1, end - start + 1);
      const db = amplitudeToDb(maxMagnitude);
      const onset = clamp((maxMagnitude - this.previous[id]!) / Math.max(maxMagnitude, 1e-8));
      this.ages[id] = db > gateDb - 6 ? (onset > 0.75 ? 0 : this.ages[id]! + dt) : 0;
      this.previous[id] = maxMagnitude;
      weightedFrequency += center;
      totalMagnitude += arithmetic;
      return {
        id,
        db,
        frequency: arithmetic > 1e-10 ? center / arithmetic : Math.sqrt(low * high),
        pan: stereoPosition(lp, rp),
        flatness:
          arithmetic > 1e-10 ? clamp(Math.exp(logarithmic / count) / (arithmetic / count)) : 0,
        onset,
        age: this.ages[id]!,
      };
    });
    return {
      time,
      rmsDb,
      peakDb: amplitudeToDb(peak),
      centroid: totalMagnitude ? weightedFrequency / totalMagnitude : 0,
      stereo: stereoPosition(leftPower, rightPower),
      bands,
    };
  }
}
