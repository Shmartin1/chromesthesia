import {
  amplitudeToDb,
  clamp,
  silentFeatures,
  stereoPosition,
  type BandFeature,
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
  private leftPower = new Float32Array(FFT_SIZE / 2);
  private rightPower = new Float32Array(FFT_SIZE / 2);
  private peakHistory: Array<{
    bin: number;
    pan: number;
    magnitude: number;
    peak: number;
    age: number;
  }> = [];

  reset() {
    this.ages.fill(0);
    this.previous.fill(0);
    this.peaks.fill(0);
    this.lastTime = 0;
    this.transients.reset();
    this.peakHistory = [];
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
    if (this.magnitudes.length !== leftDb.length) {
      this.magnitudes = new Float32Array(leftDb.length);
      this.leftPower = new Float32Array(leftDb.length);
      this.rightPower = new Float32Array(leftDb.length);
      this.peakHistory = [];
    }
    for (let bin = 0; bin < leftDb.length; bin++) {
      const l = 10 ** (leftDb[bin]! / 20),
        r = 10 ** (rightDb[bin]! / 20);
      this.magnitudes[bin] = Math.sqrt((l * l + r * r) / 2);
      this.leftPower[bin] = l * l;
      this.rightPower[bin] = r * r;
    }
    const nextHistory: typeof this.peakHistory = [];
    const usedHistory = new Set<number>();
    const bands = BAND_EDGES.slice(0, -1).flatMap((low, id): BandFeature[] => {
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
        if (magnitude > maxMagnitude) {
          maxMagnitude = magnitude;
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
      const localFlatness = (peak: number) => {
        const start = Math.max(1, peak - 5),
          end = Math.min(this.magnitudes.length - 1, peak + 5);
        let sum = 0,
          log = 0;
        for (let bin = start; bin <= end; bin++) {
          sum += this.magnitudes[bin]!;
          log += Math.log(Math.max(this.magnitudes[bin]!, 1e-12));
        }
        return Math.exp(log / (end - start + 1)) / Math.max(sum / (end - start + 1), 1e-12);
      };
      const summary: BandFeature = {
        id: id * 3 + 1,
        db,
        frequency: arithmetic > 1e-10 ? center / arithmetic : Math.sqrt(low * high),
        pan: stereoPosition(lp, rp),
        flatness,
        onset,
        age: this.ages[id]!,
        sustainRatio: this.peaks[id]! > 0 ? clamp(maxMagnitude / this.peaks[id]!) : 0,
      };
      if (db <= gateDb - 6) return [summary];

      // Keep several resolved notes in a region. Local L/R energy avoids dragging a
      // quiet side melody toward a different, louder note in the same coarse band.
      const peaks: number[] = [];
      for (let bin = Math.max(2, start); bin <= Math.min(end, leftDb.length - 2); bin++) {
        const magnitude = this.magnitudes[bin]!;
        if (
          magnitude > this.magnitudes[bin - 1]! &&
          magnitude > this.magnitudes[bin + 1]! &&
          magnitude >= maxMagnitude * 0.08 &&
          amplitudeToDb(magnitude) > gateDb - 6
        )
          peaks.push(bin);
      }
      peaks.sort((a, b) => this.magnitudes[b]! - this.magnitudes[a]!);
      const resolved: BandFeature[] = [];
      for (const bin of peaks) {
        const pitch = spectralPitch(this.magnitudes, bin, binHz, localFlatness(bin));
        if (!pitch || resolved.some((band) => Math.abs(band.frequency / binHz - bin) < 2.5))
          continue;
        let l = 0,
          r = 0;
        for (let neighbor = bin - 1; neighbor <= bin + 1; neighbor++) {
          l += this.leftPower[neighbor]!;
          r += this.rightPower[neighbor]!;
        }
        const pan = stereoPosition(l, r),
          magnitude = this.magnitudes[bin]!;
        const priorIndex = this.peakHistory.findIndex(
          (previous, index) =>
            !usedHistory.has(index) &&
            Math.abs(previous.bin - bin) <= 1 &&
            Math.abs(previous.pan - pan) < 0.3,
        );
        const prior = this.peakHistory[priorIndex];
        if (prior) usedHistory.add(priorIndex);
        const onset = clamp((magnitude - (prior?.magnitude ?? 0)) / Math.max(magnitude, 1e-8));
        const age = onset > 0.75 ? 0 : (prior?.age ?? 0) + dt;
        const peak = onset > 0.75 ? magnitude : Math.max(prior?.peak ?? 0, magnitude);
        nextHistory.push({ bin, pan, magnitude, age, peak });
        resolved.push({
          ...summary,
          id: 64 + bin,
          db: amplitudeToDb(magnitude),
          pan,
          pitch,
          onset,
          age,
          frequency: 440 * 2 ** ((pitch.midi + pitch.cents / 100 - 69) / 12),
          sustainRatio: clamp(magnitude / peak),
        });
        if (resolved.length === 3) break;
      }
      if (resolved.length) return resolved;

      // Unpitched textures still have a stereo image. Summarize measured left,
      // center and right spectral energy separately instead of averaging them away.
      const sectors = Array.from({ length: 3 }, () => ({
        l: 0,
        r: 0,
        sum: 0,
        weighted: 0,
        max: 0,
      }));
      for (let bin = start; bin <= end; bin++) {
        const l = this.leftPower[bin]!,
          r = this.rightPower[bin]!;
        const pan = stereoPosition(l, r),
          magnitude = this.magnitudes[bin]!;
        if (magnitude < maxMagnitude * 0.08) continue;
        const sector = sectors[pan < -0.28 ? 0 : pan > 0.28 ? 2 : 1]!;
        sector.l += l;
        sector.r += r;
        sector.sum += magnitude;
        sector.weighted += magnitude * bin * binHz;
        sector.max = Math.max(sector.max, magnitude);
      }
      return sectors.flatMap((sector, side) =>
        sector.sum > 0 && amplitudeToDb(sector.max) > gateDb - 6
          ? [
              {
                ...summary,
                id: id * 3 + side,
                db: amplitudeToDb(sector.max),
                pan: stereoPosition(sector.l, sector.r),
                frequency: sector.weighted / sector.sum,
              },
            ]
          : [],
      );
    });
    this.peakHistory = nextHistory;
    // FFT main lobes often cross a coarse-region boundary. Do not turn the flank
    // of a resolved tone into a second unpitched object in the neighboring region.
    const tones = bands.filter((band) => band.pitch);
    const detections = bands.filter(
      (band) =>
        band.pitch ||
        !tones.some(
          (tone) =>
            Math.abs(band.frequency - tone.frequency) < binHz * 2.5 &&
            Math.abs(band.pan - tone.pan) < 0.25,
        ),
    );
    return {
      time,
      rmsDb,
      peakDb: amplitudeToDb(peak),
      centroid: totalMagnitude ? weightedFrequency / totalMagnitude : 0,
      stereo: stereoPosition(leftPower, rightPower),
      bands: detections,
      percussion: this.transients.analyze(leftDb, rightDb, sampleRate, time, gateDb, detections),
    };
  }
}
