import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const studies = [
  { name: 'bass-orb', family: 'bass', hz: 80, pluck: true },
  { name: 'bass-tube', family: 'bass', hz: 110, pluck: false },
  { name: 'voice', family: 'voice', hz: 320, pluck: false },
  { name: 'synth', family: 'synth', hz: 660, pluck: false },
  { name: 'flame', family: 'supersaw', hz: 330, pluck: false },
] as const;

function studyWav(hz: number, pluck: boolean) {
  const rate = 24000,
    samples = rate * 8,
    bytes = Buffer.alloc(44 + samples * 4);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate,
      attack = t % 0.7;
    const envelope =
      t > 7 ? 0 : pluck ? Math.min(1, attack / 0.008) * Math.exp(-attack * 4) : Math.min(1, t * 8);
    const sample = Math.round(Math.sin(t * hz * Math.PI * 2) * envelope * 16000);
    bytes.writeInt16LE(sample, 44 + i * 4);
    bytes.writeInt16LE(sample, 46 + i * 4);
  }
  return bytes;
}

for (const study of studies) {
  test(`${study.name}: detailed surface renders, moves, and clears without a tail`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const profile = JSON.parse(readFileSync('examples/profiles/first-perception.json', 'utf8'));
    profile.assignments = { low: study.family, mid: study.family, high: study.family };
    profile.reducedMotion = false;
    await page.addInitScript(
      (value) => localStorage.setItem('chromesthesia.profile.v1', JSON.stringify(value)),
      profile,
    );
    await page.goto('/');
    await page.getByLabel('Open audio file', { exact: true }).setInputFiles({
      name: `${study.name}.wav`,
      mimeType: 'audio/wav',
      buffer: studyWav(study.hz, study.pluck),
    });
    await expect(page.getByTestId('event-count')).not.toHaveText('00');
    if (study.name === 'synth')
      await expect(page.getByLabel('Current mappings')).toContainText('E5');
    await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('1.2');
    await page.getByRole('button', { name: 'Enter immersive view' }).click();
    const canvas = page.locator('canvas');
    const first = await canvas.screenshot();
    const png = PNG.sync.read(first);
    let bright = 0,
      heightSum = 0,
      bottom = 0;
    for (let i = 0; i < png.data.length; i += 4)
      if (Math.max(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!) > 30) {
        bright++;
        heightSum += Math.floor(i / 4 / png.width);
        bottom = Math.max(bottom, Math.floor(i / 4 / png.width));
      }
    expect(bright).toBeGreaterThan(1000);
    if (study.family === 'bass') {
      expect(heightSum / bright / png.height).toBeGreaterThan(0.65);
      expect(bottom).toBeLessThan(png.height - 10);
    }
    if (process.env.CHROMESTHESIA_SCREENSHOTS)
      await canvas.screenshot({ path: `docs/media/${study.name}.png` });
    await expect.poll(async () => Buffer.compare(first, await canvas.screenshot())).not.toBe(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Stop all audio' }).click();
    await page.getByRole('button', { name: 'Enter immersive view' }).click();
    const silent = PNG.sync.read(await canvas.screenshot());
    let total = 0;
    for (let i = 0; i < silent.data.length; i += 4)
      total += silent.data[i]! + silent.data[i + 1]! + silent.data[i + 2]!;
    expect(total).toBe(0);
    expect(errors).toEqual([]);
  });
}
