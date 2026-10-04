import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const audioModule = `/@fs/${resolve('packages/audio/src/index.ts').replaceAll('\\', '/')}`;
const demoModule = `/@fs/${resolve('packages/audio/src/demo.ts').replaceAll('\\', '/')}`;

test('native FFT retains two opposite-side notes within one spectral region', async ({ page }) => {
  await page.route('**/stereo-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<button>Start</button>' }),
  );
  await page.goto('/stereo-fixture');
  await page.getByRole('button').click();
  const bands = await page.evaluate(async (audioModule) => {
    const { SpectrumAnalyzer, FFT_SIZE } = (await import(
      audioModule
    )) as typeof import('../packages/audio/src/index');
    const ctx = new AudioContext({ sampleRate: 48000 });
    try {
      await ctx.resume();
      const oscillators = [ctx.createOscillator(), ctx.createOscillator()];
      const analyzers = [ctx.createAnalyser(), ctx.createAnalyser()];
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      for (let i = 0; i < 2; i++) {
        oscillators[i]!.frequency.value = [523.251, 659.255][i]!;
        analyzers[i]!.fftSize = FFT_SIZE;
        analyzers[i]!.smoothingTimeConstant = 0;
        oscillators[i]!.connect(analyzers[i]!);
        analyzers[i]!.connect(sink);
        oscillators[i]!.start();
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      const spectral = analyzers.map((analyzer) => {
        const data = new Float32Array(FFT_SIZE / 2);
        analyzer.getFloatFrequencyData(data);
        return data;
      });
      const waves = analyzers.map((analyzer) => {
        const data = new Float32Array(FFT_SIZE);
        analyzer.getFloatTimeDomainData(data);
        return data;
      });
      return new SpectrumAnalyzer().analyze(
        spectral[0]!,
        spectral[1]!,
        waves[0]!,
        waves[1]!,
        ctx.sampleRate,
        ctx.currentTime,
        -58,
      ).bands;
    } finally {
      await ctx.close();
    }
  }, audioModule);
  expect(bands.find((band) => band.pitch?.name === 'C5')!.pan).toBeLessThan(-0.95);
  expect(bands.find((band) => band.pitch?.name === 'E5')!.pan).toBeGreaterThan(0.95);
});

test('real Web Audio detects rhythm-study kicks, snares, and rapid hats', async ({ page }) => {
  // Exercise real native FFT windows without GPU scheduling hiding short transients.
  await page.route('**/analysis-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<button>Start analysis</button>' }),
  );
  await page.goto('/analysis-fixture');
  await page.getByRole('button').click();
  const result = await page.evaluate(
    async ({ audioModule, demoModule }) => {
      const { SpectrumAnalyzer, FFT_SIZE } = (await import(
        audioModule
      )) as typeof import('../packages/audio/src/index');
      const { makeDemo } = (await import(
        demoModule
      )) as typeof import('../packages/audio/src/demo');
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = makeDemo(ctx, 'percussion');
      const split = ctx.createChannelSplitter(2),
        left = ctx.createAnalyser(),
        right = ctx.createAnalyser(),
        sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      source.connect(split);
      for (const [index, analyzer] of [left, right].entries()) {
        analyzer.fftSize = FFT_SIZE;
        analyzer.smoothingTimeConstant = 0;
        split.connect(analyzer, index);
        analyzer.connect(sink);
      }
      const spectral = [new Float32Array(FFT_SIZE / 2), new Float32Array(FFT_SIZE / 2)];
      const wave = [new Float32Array(FFT_SIZE), new Float32Array(FFT_SIZE)];
      const analyzer = new SpectrumAnalyzer(),
        seen = new Set<number>(),
        hits: { kind: string; time: number; pan: number }[] = [];
      const start = ctx.currentTime;
      source.start();
      while (ctx.currentTime - start < 5.2) {
        left.getFloatFrequencyData(spectral[0]!);
        right.getFloatFrequencyData(spectral[1]!);
        left.getFloatTimeDomainData(wave[0]!);
        right.getFloatTimeDomainData(wave[1]!);
        const frame = analyzer.analyze(
          spectral[0]!,
          spectral[1]!,
          wave[0]!,
          wave[1]!,
          ctx.sampleRate,
          ctx.currentTime,
          -58,
        );
        for (const hit of frame.percussion)
          if (!seen.has(hit.id)) {
            seen.add(hit.id);
            hits.push({ kind: hit.kind, time: ctx.currentTime - start, pan: hit.pan });
          }
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      await ctx.close();
      return hits;
    },
    { audioModule, demoModule },
  );
  await test.info().attach('detected-attacks', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.filter((hit) => hit.kind === 'kick').length).toBeGreaterThanOrEqual(4);
  expect(result.filter((hit) => hit.kind === 'kick').length).toBeLessThanOrEqual(6);
  expect(result.filter((hit) => hit.kind === 'snare').length).toBeGreaterThanOrEqual(4);
  expect(result.filter((hit) => hit.kind === 'snare').length).toBeLessThanOrEqual(5);
  const hats = result.filter((hit) => hit.kind === 'hat');
  expect(hats.length).toBeGreaterThanOrEqual(28);
  expect(hats.length).toBeLessThanOrEqual(38);
  expect(hats.filter((hit) => hit.pan > 0.4).length).toBeGreaterThan(24);
  // Between the backbeat hits, the observed hat spacing follows the 125 ms audio spacing.
  const gaps = hats.slice(1).map((hit, i) => hit.time - hats[i]!.time);
  expect(gaps.filter((gap) => Math.abs(gap - 0.125) < 0.035).length).toBeGreaterThan(20);
});
