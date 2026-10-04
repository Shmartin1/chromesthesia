import {
  amplitudeToDb,
  clamp,
  stereoPosition,
  type BandFeature,
  type PercussionFeature,
  type PercussionKind,
} from '@chromesthesia/core';

const ranges = [
  { kind: 'kick', low: 35, high: 180, life: 0.24 },
  { kind: 'snare', low: 180, high: 4800, life: 0.2 },
  { kind: 'hat', low: 4800, high: 17000, life: 0.075 },
] as const;

interface Region {
  db: number;
  flux: number;
  rise: number;
  flatness: number;
  frequency: number;
  pan: number;
  attackPan: number;
  magnitude: number;
}
interface State {
  lastAttack: number;
  fluxFloor: number;
  magnitude: number;
  pending?: { time: number; frequency: number; strength: number };
  active?: { id: number; time: number; peak: number; strength: number; pan: number };
}

/** Positive spectral flux locates actual attacks; no tempo grid or generated beat clock. */
export class TransientDetector {
  private previous = new Float32Array(0);
  private previousLeft = new Float32Array(0);
  private previousRight = new Float32Array(0);
  private states: State[] = ranges.map(() => ({
    lastAttack: -Infinity,
    fluxFloor: 0,
    magnitude: 0,
  }));
  private serial = 1000;
  private lastTime = -Infinity;
  private lastHits: PercussionFeature[] = [];

  reset() {
    this.previous.fill(0);
    this.previousLeft.fill(0);
    this.previousRight.fill(0);
    this.states = ranges.map(() => ({ lastAttack: -Infinity, fluxFloor: 0, magnitude: 0 }));
    this.lastTime = -Infinity;
    this.lastHits = [];
    // IDs remain distinct when digital silence occurs between two hits.
  }

  analyze(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
    time: number,
    gateDb: number,
    bands: BandFeature[],
  ): PercussionFeature[] {
    if (this.previous.length !== left.length) {
      this.previous = new Float32Array(left.length);
      this.previousLeft = new Float32Array(left.length);
      this.previousRight = new Float32Array(left.length);
      this.reset();
    }
    // AudioContext time advances in render quanta; multiple visual samples can
    // see the same quantum. Reuse it rather than inventing a new onset.
    if (time === this.lastTime) return this.lastHits;
    if (time < this.lastTime || time - this.lastTime > 0.25) this.reset();
    const dt = Number.isFinite(this.lastTime) ? time - this.lastTime : 1 / 60;
    this.lastTime = time;
    const binHz = sampleRate / (left.length * 2);
    const regions: Region[] = ranges.map((range, index) => {
      let sum = 0,
        flux = 0,
        lp = 0,
        rp = 0,
        attackLeft = 0,
        attackRight = 0,
        maximum = 0,
        weighted = 0,
        count = 0;
      for (
        let bin = Math.max(1, Math.ceil(range.low / binHz));
        bin < Math.min(left.length, Math.ceil(range.high / binHz));
        bin++
      ) {
        const l = 10 ** (left[bin]! / 20),
          r = 10 ** (right[bin]! / 20);
        const magnitude = Math.sqrt((l * l + r * r) / 2);
        attackLeft += Math.max(0, l * l - this.previousLeft[bin]!);
        attackRight += Math.max(0, r * r - this.previousRight[bin]!);
        this.previousLeft[bin] = l * l;
        this.previousRight[bin] = r * r;
        flux += Math.max(0, magnitude - this.previous[bin]!);
        this.previous[bin] = magnitude;
        sum += magnitude;
        lp += l * l;
        rp += r * r;
        maximum = Math.max(maximum, magnitude);
        weighted += magnitude * bin * binHz;
        count++;
      }
      const magnitude = sum / Math.max(1, count);
      // Evaluate texture over the occupied spectrum, so band-limited shakers are
      // not rejected because their filter leaves a silent edge of this region.
      let occupied = 0,
        occupiedSum = 0,
        log = 0;
      for (
        let bin = Math.max(1, Math.ceil(range.low / binHz));
        bin < Math.min(left.length, Math.ceil(range.high / binHz));
        bin++
      ) {
        const value = this.previous[bin]!;
        if (value > maximum * 0.04) {
          occupied++;
          occupiedSum += value;
          log += Math.log(Math.max(value, 1e-12));
        }
      }
      const flatness =
        (Math.exp(log / Math.max(1, occupied)) /
          Math.max(occupiedSum / Math.max(1, occupied), 1e-8)) *
        clamp(occupied / Math.max(1, count * 0.4));
      return {
        // Match the existing band's spectral gate. Averaging hundreds of bins
        // attenuates a quiet shaker simply because this region is wide.
        db: amplitudeToDb(maximum),
        flux: flux / Math.max(sum, 1e-8),
        rise: clamp((magnitude - this.states[index]!.magnitude) / Math.max(magnitude, 1e-8)),
        flatness,
        frequency: sum > 1e-8 ? weighted / sum : range.low,
        pan: stereoPosition(lp, rp),
        attackPan:
          attackLeft + attackRight > 1e-10
            ? stereoPosition(attackLeft, attackRight)
            : stereoPosition(lp, rp),
        magnitude,
      };
    });
    const attacks = regions.map((region, i) => {
      const state = this.states[i]!;
      return (
        region.db > gateDb - 6 &&
        region.flux > Math.max(0.2, state.fluxFloor * 2.1) &&
        region.rise > 0.16 &&
        time - state.lastAttack >= 0.045 &&
        (i === 0 || region.flatness > 0.28)
      );
    });
    // A broadband snare contributes high-frequency energy too; avoid duplicating that tail as a hat.
    if (attacks[1] && regions[1]!.magnitude > regions[2]!.magnitude * 0.65) attacks[2] = false;

    const hits: PercussionFeature[] = [];
    ranges.forEach((range, i) => {
      const region = regions[i]!,
        state = this.states[i]!;
      let trigger = attacks[i];
      if (i === 0) {
        if (trigger && !state.pending)
          state.pending = { time, frequency: region.frequency, strength: region.flux };
        const pending = state.pending;
        // A decaying pitch sweep is a better kick cue than a bass-note attack alone.
        trigger =
          !!pending &&
          time - pending.time >= 0.012 &&
          time - pending.time < 0.09 &&
          region.frequency < pending.frequency * 0.9 &&
          region.frequency < 110 &&
          region.magnitude > regions[1]!.magnitude * 2.5 &&
          region.db > gateDb - 3;
        if (pending && (time - pending.time >= 0.09 || trigger)) state.pending = undefined;
      }
      if (trigger) {
        state.lastAttack = time;
        state.active = {
          id: ++this.serial,
          time,
          peak: region.magnitude,
          strength: Math.max(region.flux, region.rise, 0.25),
          pan: region.attackPan,
        };
      }
      const active = state.active;
      if (active) {
        const age = time - active.time;
        active.peak = Math.max(active.peak, region.magnitude);
        const ratio = clamp(region.magnitude / Math.max(active.peak, 1e-8));
        if (age >= range.life || region.db <= gateDb - 6 || ratio < 0.06) state.active = undefined;
        else {
          const brightness = clamp((region.frequency - range.low) / (range.high - range.low));
          const kind: PercussionKind = range.kind;
          hits.push({
            id: active.id,
            kind,
            frequency: region.frequency,
            db: region.db,
            pan: active.pan,
            age,
            strength: active.strength,
            envelope: Math.sqrt(ratio) * Math.exp(-age / (kind === 'hat' ? 0.038 : 0.16)),
            brightness,
            bandIds: bands
              .filter(
                (band) =>
                  band.frequency >= range.low &&
                  band.frequency < range.high &&
                  (kind === 'kick' || band.flatness > 0.18),
              )
              .map((band) => band.id),
            reason:
              kind === 'kick'
                ? 'Fast low-frequency attack with a falling spectral center → kick-like polygon. Bass bends can share this cue.'
                : kind === 'snare'
                  ? 'Noisy midrange spectral-flux attack → snare/clap-like polygon; brighter attacks are more orange.'
                  : 'Noisy high-frequency spectral-flux attack → hat/shaker polygon. Each detected hit retriggers the flicker; brighter tones are whiter.',
          });
        }
      }
      state.fluxFloor += (region.flux - state.fluxFloor) * (1 - Math.exp(-dt / 0.3));
      state.magnitude = region.magnitude;
    });
    this.lastHits = hits;
    return hits;
  }
}
