import { silentFeatures, type FeatureFrame, type StudyKind } from '@chromesthesia/core';
import { FFT_SIZE, SpectrumAnalyzer } from './analysis';
import { makeDemo } from './demo';
export { SpectrumAnalyzer, FFT_SIZE, BAND_EDGES } from './analysis';
export type InputKind = 'demo' | 'file' | 'microphone' | 'capture';
export interface AudioStatus {
  kind: InputKind;
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended';
  label: string;
  duration: number;
  position: number;
  error: string | null;
  sampleRate: number;
  latency: number;
}
const initialStatus = (): AudioStatus => ({
  kind: 'demo',
  state: 'idle',
  label: 'First light · a stereo study',
  duration: 24,
  position: 0,
  error: null,
  sampleRate: 0,
  latency: 0,
});

export class AudioEngine {
  private context?: AudioContext;
  private input?: GainNode;
  private left?: AnalyserNode;
  private right?: AnalyserNode;
  private spectrum = new SpectrumAnalyzer();
  private frequency = [new Float32Array(FFT_SIZE / 2), new Float32Array(FFT_SIZE / 2)];
  private waveform = [new Float32Array(FFT_SIZE), new Float32Array(FFT_SIZE)];
  private source?: AudioBufferSourceNode | MediaElementAudioSourceNode | MediaStreamAudioSourceNode;
  private stream?: MediaStream;
  private media?: HTMLAudioElement;
  private objectUrl?: string;
  private buffer?: AudioBuffer;
  private startedAt = 0;
  private offset = 0;
  private generation = 0;
  private volume = 0.7;
  private listeners = new Set<() => void>();
  status: AudioStatus = initialStatus();

  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getSnapshot = () => this.status;
  private update(patch: Partial<AudioStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((callback) => callback());
  }

  private async setup() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.input = this.context.createGain();
      this.input.channelCount = 2;
      this.input.channelCountMode = 'explicit';
      this.input.channelInterpretation = 'speakers';
      const splitter = this.context.createChannelSplitter(2);
      this.left = this.context.createAnalyser();
      this.right = this.context.createAnalyser();
      for (const analyser of [this.left, this.right]) {
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
      }
      this.input.connect(splitter);
      splitter.connect(this.left, 0);
      splitter.connect(this.right, 1);
      // Keep analysis branches active without monitoring live captures.
      const silentSink = this.context.createGain();
      silentSink.gain.value = 0;
      this.left.connect(silentSink);
      this.right.connect(silentSink);
      silentSink.connect(this.context.destination);
    }
    await this.context.resume();
    this.update({
      sampleRate: this.context.sampleRate,
      latency: this.context.baseLatency + (this.context.outputLatency || 0),
    });
  }

  private detach() {
    if (this.source instanceof AudioBufferSourceNode) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* Already stopped. */
      }
    }
    this.source?.disconnect();
    this.source = undefined;
    if (this.media) {
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
      this.media = undefined;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = undefined;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.stream = undefined;
    }
    if (this.context && this.input) {
      try {
        this.input.disconnect(this.context.destination);
      } catch {
        /* Live inputs are not monitored. */
      }
    }
    this.spectrum.reset();
  }

  stop() {
    this.generation++;
    this.detach();
    this.buffer = undefined;
    this.offset = 0;
    this.update({ state: 'idle', position: 0, error: null });
  }
  private begin(kind: InputKind, label: string) {
    this.stop();
    const ticket = this.generation;
    this.update({ kind, label, state: 'loading', duration: 0 });
    return ticket;
  }
  private fail(error: unknown, ticket: number) {
    if (ticket !== this.generation) return;
    this.detach();
    const message = error instanceof Error ? error.message : 'Audio could not start.';
    this.update({ state: 'idle', error: message });
  }
  private route(monitor: boolean) {
    this.input!.gain.value = monitor ? this.volume : 1;
    if (monitor) this.input!.connect(this.context!.destination);
    this.source!.connect(this.input!);
  }
  private playBuffer() {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer!;
    source.connect(this.input!);
    this.source = source;
    this.startedAt = ctx.currentTime;
    const ticket = this.generation;
    source.onended = () => {
      if (ticket === this.generation && this.status.state === 'playing') {
        source.disconnect();
        this.spectrum.reset();
        this.offset = 0;
        this.update({ state: 'ended', position: this.status.duration });
      }
    };
    source.start(0, this.offset);
    this.update({ state: 'playing' });
  }

  async startDemo(isolate?: StudyKind) {
    const ticket = this.begin(
      'demo',
      isolate ? `${isolate} · calibration tone` : 'First light · a stereo study',
    );
    try {
      await this.setup();
      if (ticket !== this.generation) return;
      this.buffer = makeDemo(this.context!, isolate);
      this.input!.gain.value = this.volume;
      this.input!.connect(this.context!.destination);
      this.update({ duration: this.buffer.duration });
      this.playBuffer();
    } catch (error) {
      this.fail(error, ticket);
    }
  }

  async startFile(file: File) {
    const ticket = this.begin('file', file.name);
    try {
      await this.setup();
      if (ticket !== this.generation) return;
      const media = new Audio();
      this.media = media;
      this.objectUrl = URL.createObjectURL(file);
      media.src = this.objectUrl;
      media.preload = 'metadata';
      media.onloadedmetadata = () => {
        if (ticket === this.generation)
          this.update({ duration: Number.isFinite(media.duration) ? media.duration : 0 });
      };
      media.onended = () => {
        if (ticket === this.generation) {
          this.spectrum.reset();
          this.update({ state: 'ended' });
        }
      };
      media.onerror = () =>
        this.fail(
          new Error(
            'This file could not be decoded. Try an MP3, WAV, or OGG supported by your browser.',
          ),
          ticket,
        );
      this.source = this.context!.createMediaElementSource(media);
      this.route(true);
      await media.play();
      if (ticket === this.generation) this.update({ state: 'playing' });
    } catch (error) {
      this.fail(error, ticket);
    }
  }

  async startLive(kind: 'microphone' | 'capture') {
    const ticket = this.begin(
      kind,
      kind === 'microphone' ? 'Microphone · live input' : 'Shared audio · live input',
    );
    try {
      if (!navigator.mediaDevices)
        throw new Error('Live input needs a secure browser context (HTTPS or localhost).');
      // Request permission directly from the user gesture, before awaiting AudioContext setup.
      const pending =
        kind === 'microphone'
          ? navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: { ideal: 2 },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
            })
          : navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // Start context activation in the same gesture as the permission request.
      // Capture errors are held until the stream is owned so failure can release it.
      const ready = this.setup().then(
        () => null,
        (error: unknown) => error,
      );
      const stream = await pending;
      if (ticket !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          'No audio was shared. Choose a browser tab and enable “Share tab audio”, or a screen with system audio if your browser offers it.',
        );
      }
      this.stream = stream;
      const setupError = await ready;
      if (ticket !== this.generation) return;
      if (setupError) throw setupError;
      this.source = this.context!.createMediaStreamSource(stream);
      this.route(false);
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (ticket === this.generation) {
            this.stop();
            this.update({ state: 'ended' });
          }
        };
      });
      this.update({ state: 'playing' });
    } catch (error) {
      this.fail(error, ticket);
    }
  }

  async toggle() {
    if (this.status.kind === 'microphone' || this.status.kind === 'capture') {
      if (this.status.state === 'playing') this.stop();
      else await this.startLive(this.status.kind);
      return;
    }
    if (this.status.state === 'playing') {
      if (this.media) this.media.pause();
      else if (this.source instanceof AudioBufferSourceNode) {
        this.offset += this.context!.currentTime - this.startedAt;
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      }
      this.spectrum.reset();
      this.update({ state: 'paused', position: this.media ? this.media.currentTime : this.offset });
    } else if (this.media) {
      try {
        await this.context!.resume();
        await this.media.play();
        this.update({ state: 'playing', error: null });
      } catch (error) {
        this.fail(error, this.generation);
      }
    } else if (this.buffer && this.status.state === 'paused') {
      await this.context!.resume();
      this.playBuffer();
    } else await this.startDemo();
  }
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.input && this.status.kind !== 'microphone' && this.status.kind !== 'capture')
      this.input.gain.value = this.volume;
  }
  seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, this.status.duration));
    if (this.media) this.media.currentTime = target;
    else if (this.buffer) {
      const playing = this.status.state === 'playing';
      if (this.source instanceof AudioBufferSourceNode) {
        this.source.onended = null;
        try {
          this.source.stop();
        } catch {
          /* Already ended. */
        }
        this.source.disconnect();
      }
      this.offset = target >= this.status.duration ? 0 : target;
      if (target >= this.status.duration) this.update({ state: 'ended' });
      else if (playing) this.playBuffer();
      else this.update({ state: 'paused' });
    }
    this.spectrum.reset();
    this.update({ position: target });
  }
  getPosition() {
    return this.media
      ? this.media.currentTime
      : this.status.state === 'playing'
        ? Math.min(
            this.status.duration,
            this.offset + (this.context?.currentTime ?? 0) - this.startedAt,
          )
        : this.status.position;
  }
  sample(gateDb: number): FeatureFrame {
    if (this.status.state !== 'playing' || !this.context || this.context.state !== 'running')
      return silentFeatures();
    this.left!.getFloatFrequencyData(this.frequency[0]!);
    this.right!.getFloatFrequencyData(this.frequency[1]!);
    this.left!.getFloatTimeDomainData(this.waveform[0]!);
    this.right!.getFloatTimeDomainData(this.waveform[1]!);
    return this.spectrum.analyze(
      this.frequency[0]!,
      this.frequency[1]!,
      this.waveform[0]!,
      this.waveform[1]!,
      this.context.sampleRate,
      this.context.currentTime,
      gateDb,
    );
  }
  async dispose() {
    this.stop();
    await this.context?.close();
    this.context = undefined;
    this.listeners.clear();
  }
}
