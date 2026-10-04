import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { silentFeatures, type PercussionFeature } from '../packages/core/src/index';

test('solid drum facets render in their palettes and clear to exact black', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const fixture = `/@fs/${resolve('tests/fixtures/scene.tsx').replaceAll('\\', '/')}`;
  await page.goto(fixture.replace('scene.tsx', 'scene.html'));
  const hits: PercussionFeature[] = (['kick', 'snare', 'hat'] as const).map((kind, i) => ({
    id: 1001 + i,
    kind,
    frequency: [65, 2000, 10000][i]!,
    db: -16,
    pan: [-0.4, 0, 0.4][i]!,
    strength: 0.9,
    age: 0.012,
    envelope: 0.9,
    brightness: 0.6,
    bandIds: [],
    reason: 'Controlled percussion rendering fixture',
  }));
  await page.evaluate(
    async ({ fixture, hits }) => {
      const { show } = (await import(fixture)) as typeof import('./fixtures/scene');
      show({
        time: 1,
        rmsDb: -16,
        peakDb: -12,
        centroid: 3000,
        stereo: 0,
        bands: [],
        percussion: hits,
      });
    },
    { fixture, hits },
  );
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const regions = async () => {
    const png = PNG.sync.read(await canvas.screenshot());
    let warm = 0,
      dark = 0,
      silver = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i]!,
        g = png.data[i + 1]!,
        b = png.data[i + 2]!,
        y = Math.floor(i / 4 / png.width) / png.height;
      if (y > 0.7 && r > 20 && r < 100 && Math.abs(r - g) < 3 && Math.abs(g - b) < 3) dark++;
      if (y > 0.3 && y < 0.7 && r > g * 1.1 && g > b * 1.1) warm++;
      if (y < 0.35 && r > 80 && Math.abs(r - b) < 20) silver++;
    }
    return { warm, dark, silver };
  };
  await expect.poll(async () => (await regions()).dark).toBeGreaterThan(1000);
  const visible = await regions();
  expect(visible.warm).toBeGreaterThan(1000);
  expect(visible.silver).toBeGreaterThan(80);
  if (process.env.CHROMESTHESIA_SCREENSHOTS)
    await canvas.screenshot({ path: 'docs/media/percussion.png' });
  await page.evaluate(
    async ({ fixture, silent }) => {
      const { show } = (await import(fixture)) as typeof import('./fixtures/scene');
      show(silent);
    },
    { fixture, silent: silentFeatures() },
  );
  await expect
    .poll(async () => {
      const image = PNG.sync.read(await canvas.screenshot());
      let sum = 0;
      for (let i = 0; i < image.data.length; i += 4)
        sum += image.data[i]! + image.data[i + 1]! + image.data[i + 2]!;
      return sum;
    })
    .toBe(0);
  expect(errors).toEqual([]);
});
