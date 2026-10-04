import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './index';

class FakeNode {
  gain = { value: 1 };
  channelCount = 2;
  channelCountMode = '';
  channelInterpretation = '';
  fftSize = 2048;
  smoothingTimeConstant = 0;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  stop = vi.fn();
  start = vi.fn();
  getFloatFrequencyData(array: Float32Array) {
    array.fill(-120);
  }
  getFloatTimeDomainData(array: Float32Array) {
    array.fill(0);
  }
}
class FakeContext {
  sampleRate = 48000;
  baseLatency = 0.01;
  outputLatency = 0;
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createGain = () => new FakeNode();
  createChannelSplitter = () => new FakeNode();
  createAnalyser = () => new FakeNode();
  createMediaStreamSource = () => new FakeNode();
}
function capture(audio = true) {
  const tracks = Array.from({ length: audio ? 2 : 1 }, () => ({
    stop: vi.fn(),
    onended: null as (() => void) | null,
  }));
  return {
    tracks,
    stream: {
      getTracks: () => tracks,
      getAudioTracks: () => (audio ? [tracks[0]] : []),
    } as unknown as MediaStream,
  };
}
beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioBufferSourceNode', FakeNode);
});
afterEach(() => vi.unstubAllGlobals());
describe('capture ownership and cancellation', () => {
  it('stops all audio and video tracks on explicit stop', async () => {
    const { stream, tracks } = capture();
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => stream) } });
    const engine = new AudioEngine();
    await engine.startLive('capture');
    expect(engine.status.state).toBe('playing');
    engine.stop();
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
    expect(engine.sample(-58).bands).toEqual([]);
  });
  it('releases video-only shares and explains the missing audio', async () => {
    const { stream, tracks } = capture(false);
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => stream) } });
    const engine = new AudioEngine();
    await engine.startLive('capture');
    expect(engine.status.error).toContain('No audio was shared');
    expect(tracks[0]!.stop).toHaveBeenCalledOnce();
  });
  it('discards a permission result that arrives after cancellation', async () => {
    const { stream, tracks } = capture();
    let resolve!: (value: MediaStream) => void;
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((done) => {
            resolve = done;
          }),
      },
    });
    const engine = new AudioEngine();
    const pending = engine.startLive('microphone');
    engine.stop();
    resolve(stream);
    await pending;
    expect(engine.status.state).toBe('idle');
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
  });
  it('clears the engine when the browser ends sharing', async () => {
    const { stream, tracks } = capture();
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: async () => stream } });
    const engine = new AudioEngine();
    await engine.startLive('capture');
    tracks[1]!.onended!();
    expect(engine.status.state).toBe('ended');
    expect(engine.sample(-58).bands).toEqual([]);
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
  });
  it('handles permission denial without a stuck loading state', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error('Permission denied');
        },
      },
    });
    const engine = new AudioEngine();
    await engine.startLive('microphone');
    expect(engine.status.state).toBe('idle');
    expect(engine.status.error).toContain('Permission denied');
  });
});
