import { test, expect } from '@playwright/test';
import { defaultProfile } from '../packages/profiles/src/index';

function chordWav(frequencies: number[]) {
  const rate = 24000,
    samples = rate * 16,
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
    const value = Math.round(
      (frequencies.reduce((sum, hz) => sum + Math.sin((i / rate) * Math.PI * 2 * hz), 0) * 16000) /
        frequencies.length,
    );
    bytes.writeInt16LE(value, 44 + i * 4);
    bytes.writeInt16LE(value, 46 + i * 4);
  }
  return bytes;
}

test('mapping list reserves five cards through silence, one sound, five sounds and expanded details', async ({
  page,
}) => {
  await page.addInitScript(
    (profile) => localStorage.setItem('chromesthesia.profile.v1', JSON.stringify(profile)),
    {
      ...defaultProfile,
      reducedMotion: true,
      assignments: { low: 'voice', mid: 'voice', high: 'voice' },
    },
  );
  await page.goto('/');
  const list = page.getByLabel('Current mappings'),
    cards = list.locator('.event-card');
  const dimensions = () =>
    list.evaluate((element) => {
      const parent = element.closest('.inspector')!;
      return {
        height: element.getBoundingClientRect().height,
        bottom:
          parent.querySelector('.inspector-bottom')!.getBoundingClientRect().top -
          element.getBoundingClientRect().top,
        scrolls: element.scrollHeight > element.clientHeight + 1,
      };
    });
  const before = await dimensions();
  expect(before.height).toBe(344);
  for (const frequencies of [[440], [261.626, 391.995, 587.33, 880, 1318.51, 1975.53]]) {
    await page.getByLabel('Open audio file', { exact: true }).setInputFiles({
      name: 'inspector.wav',
      mimeType: 'audio/wav',
      buffer: chordWav(frequencies),
    });
    await expect(cards).toHaveCount(frequencies.length === 1 ? 1 : 5);
    const active = await dimensions();
    expect(active.height).toBe(before.height);
    expect(active.bottom).toBeCloseTo(before.bottom, 0);
    expect(active.scrolls).toBe(false);
  }
  await cards.first().locator('summary').click();
  await expect(cards.first()).toHaveAttribute('open', '');
  const expanded = await dimensions();
  expect(expanded.height).toBe(before.height);
  expect(expanded.bottom).toBeCloseTo(before.bottom, 0);
  expect(expanded.scrolls).toBe(true);
  if (process.env.CHROMESTHESIA_SCREENSHOTS)
    await page.screenshot({ path: 'docs/media/inspector-fixed.png' });
  await page.getByRole('button', { name: 'Stop all audio' }).click();
  await expect(cards).toHaveCount(0);
  expect((await dimensions()).height).toBe(before.height);
});
