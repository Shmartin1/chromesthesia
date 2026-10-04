import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { emptyScene, mapFeatures, silentFeatures } from '../packages/core/src/index';
import { defaultProfile } from '../packages/profiles/src/index';

test('dye shapes vary between sounds without reseeding sustained sounds or moving stereo anchors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fixture = `/@fs/${resolve('tests/fixtures/scene.tsx').replaceAll('\\', '/')}`;
  await page.goto(fixture.replace('scene.tsx', 'scene.html'));
  const features = {
    ...silentFeatures(),
    rmsDb: -16,
    bands: [
      {
        id: 5,
        frequency: 440,
        pan: -0.65,
        db: -16,
        flatness: 0.2,
        onset: 0,
        age: 1,
        sustainRatio: 1,
      },
    ],
  };
  const scene = mapFeatures(features, {
    ...defaultProfile,
    assignments: { low: 'voice', mid: 'voice', high: 'voice' },
  });
  const setScene = async (value: typeof scene) => {
    await page.evaluate(
      async ({ fixture, value }) => {
        const { showScene } = (await import(fixture)) as typeof import('./fixtures/scene');
        showScene(value);
      },
      { fixture, value },
    );
  };
  const canvas = page.locator('canvas');
  const statistics = (buffer: Buffer) => {
    const png = PNG.sync.read(buffer);
    let count = 0,
      x = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (Math.max(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!) > 30) {
        count++;
        x += (i / 4) % png.width;
      }
    }
    return { count, x: x / Math.max(1, count) / png.width };
  };
  await setScene(scene);
  await expect.poll(async () => statistics(await canvas.screenshot()).count).toBeGreaterThan(1000);
  const first = await canvas.screenshot();
  expect(statistics(first).x).toBeLessThan(0.45);
  // In reduced motion a continuing sound is exactly still, even across a neighboring FFT ID.
  await setScene({ ...scene, events: scene.events.map((event) => ({ ...event, id: 6, age: 2 })) });
  expect(Buffer.compare(first, await canvas.screenshot())).toBe(0);
  await setScene(emptyScene());
  await expect.poll(async () => statistics(await canvas.screenshot()).count).toBe(0);
  await setScene(scene);
  await expect.poll(async () => statistics(await canvas.screenshot()).count).toBeGreaterThan(1000);
  const next = await canvas.screenshot();
  expect(statistics(next).x).toBeLessThan(0.45);
  const a = PNG.sync.read(first).data,
    b = PNG.sync.read(next).data;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4)
    if (
      Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) >
      30
    )
      changed++;
  expect(changed).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
