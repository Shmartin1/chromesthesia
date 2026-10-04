import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  emptyScene,
  mapFeatures,
  pitchFromFrequency,
  silentFeatures,
  type SceneFrame,
} from '../packages/core/src/index';
import { defaultProfile } from '../packages/profiles/src/index';

const fixture = `/@fs/${resolve('tests/fixtures/scene.tsx').replaceAll('\\', '/')}`;
const tone = (frequency: number, id = 1, pan = 0) => ({
  id,
  frequency,
  pan,
  db: -18,
  flatness: 0.1,
  onset: 0,
  age: 1,
  sustainRatio: 1,
  pitch: pitchFromFrequency(frequency, 0.9),
});

test('rendered notes cover the rainbow, frequency controls shade, and hats occupy the upper stereo field', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(fixture.replace('scene.tsx', 'scene.html'));
  const canvas = page.locator('canvas');
  const show = async (scene: SceneFrame) => {
    await page.evaluate(
      async ({ fixture, scene }) => {
        const { showScene } = (await import(fixture)) as typeof import('./fixtures/scene');
        showScene(scene);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      },
      { fixture, scene },
    );
  };
  const read = async () => {
    const png = PNG.sync.read(await canvas.screenshot());
    const rgb = [0, 0, 0];
    let count = 0,
      brightness = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const max = Math.max(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
      if (max < 8) continue;
      count++;
      brightness += max;
      for (let channel = 0; channel < 3; channel++) rgb[channel]! += png.data[i + channel]!;
    }
    const total = Math.max(
      1,
      rgb.reduce((a, b) => a + b),
    );
    return {
      count,
      rgb: rgb.map((value) => value / total),
      brightness: brightness / Math.max(1, count),
    };
  };
  const shades: number[][] = [];
  for (let note = 0; note < 12; note++) {
    const hz = 523.251 * 2 ** (note / 12);
    const scene = mapFeatures(
      {
        ...silentFeatures(),
        rmsDb: -18,
        bands: [{ ...tone(hz), pitch: note % 2 ? undefined : pitchFromFrequency(hz, 0.9) }],
      },
      {
        ...defaultProfile,
        assignments: { low: 'voice', mid: 'voice', high: 'voice' },
      },
    );
    scene.events[0]!.position = [0, 0, 0];
    scene.events[0]!.lightness = 0.5;
    await show(scene);
    await expect.poll(async () => (await read()).count).toBeGreaterThan(1000);
    shades.push((await read()).rgb);
    const [r, g, b] = shades[note]! as [number, number, number];
    const max = Math.max(r, g, b),
      delta = max - Math.min(r, g, b);
    const hue =
      ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 +
        360) %
      360;
    const hueError = Math.abs(((hue - note * 30 + 540) % 360) - 180);
    expect(hueError).toBeLessThan(12);
    expect(delta).toBeGreaterThan(0.1);
    if (note === 0) {
      scene.events[0]!.lightness = 0.25;
      await show(scene);
      const low = await read();
      scene.events[0]!.lightness = 0.7;
      await show(scene);
      const high = await read();
      expect(high.brightness).toBeGreaterThan(low.brightness * 1.3);
    }
  }
  for (let i = 0; i < shades.length; i++)
    for (let j = i + 1; j < shades.length; j++)
      expect(
        shades[i]!.reduce((sum, value, channel) => sum + Math.abs(value - shades[j]![channel]!), 0),
      ).toBeGreaterThan(0.035);

  if (process.env.CHROMESTHESIA_SCREENSHOTS) {
    const rainbow = mapFeatures(
      {
        ...silentFeatures(),
        rmsDb: -18,
        bands: Array.from({ length: 12 }, (_, note) => tone(523.251 * 2 ** (note / 12), note)),
      },
      { ...defaultProfile, assignments: { low: 'voice', mid: 'voice', high: 'voice' } },
    );
    rainbow.events.forEach((event) => {
      const note = event.id;
      event.position = [-4.25 + (note % 6) * 1.7, note < 6 ? 1.6 : -1.6, 0];
      event.scale = 0.32;
      event.lightness = 0.6;
    });
    await show(rainbow);
    await canvas.screenshot({ path: 'docs/media/rainbow-notes.png' });
  }

  const wide = mapFeatures(
    {
      ...silentFeatures(),
      rmsDb: -18,
      bands: [tone(523.251, 1, -0.9), tone(659.255, 2, 0.9)],
      percussion: [
        {
          id: 1001,
          kind: 'hat',
          frequency: 11000,
          db: -18,
          pan: 0.65,
          strength: 1,
          age: 0.01,
          envelope: 1,
          brightness: 1,
          bandIds: [],
          reason: 'Controlled stereo rendering fixture',
        },
      ],
    },
    { ...defaultProfile, assignments: { low: 'auto', mid: 'synth', high: 'auto' } },
  );
  await show(wide);
  const png = PNG.sync.read(await canvas.screenshot());
  let left = 0,
    right = 0,
    upperHat = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]!,
      g = png.data[i + 1]!,
      b = png.data[i + 2]!;
    const x = ((i / 4) % png.width) / png.width,
      y = Math.floor(i / 4 / png.width) / png.height;
    if (Math.max(r, g, b) < 35) continue;
    if (x < 0.3) left++;
    if (x > 0.7) right++;
    if (y < 0.2 && x > 0.6 && Math.abs(r - g) < 10 && Math.abs(r - b) < 10) upperHat++;
  }
  expect(left).toBeGreaterThan(200);
  expect(right).toBeGreaterThan(200);
  expect(upperHat).toBeGreaterThan(80);
  if (process.env.CHROMESTHESIA_SCREENSHOTS)
    await canvas.screenshot({ path: 'docs/media/stereo-notes.png' });
  await show(emptyScene());
  expect((await read()).count).toBe(0);
  expect(errors).toEqual([]);
});
