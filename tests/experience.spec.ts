import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

function litPixels(image: Buffer) {
  const png = PNG.sync.read(image);
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4)
    if (png.data[i]! + png.data[i + 1]! + png.data[i + 2]! > 0) count++;
  return count;
}

test('silence, playback, pause, mute, seek, and immersive escape', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('event-count')).toHaveText('00');
  if (process.env.CHROMESTHESIA_SCREENSHOTS) {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.void-intro')).toHaveCSS('opacity', '1');
    await expect(page.locator('.void-intro h2 em > span > span').last()).toHaveCSS(
      'filter',
      'blur(0px)',
    );
    await page.screenshot({ path: 'docs/media/experience.png' });
  }
  await page.getByRole('button', { name: 'Enter immersive view' }).click();
  expect(litPixels(await page.locator('canvas').screenshot())).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Begin the study' }).click();
  await expect(page.getByTestId('event-count')).not.toHaveText('00');
  if (process.env.CHROMESTHESIA_SCREENSHOTS) {
    const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
    const bounds = (await seek.boundingBox())!;
    await seek.click({ position: { x: bounds.width * 0.72, y: bounds.height / 2 } });
    await expect(seek).toHaveValue(/^1[67]/);
    await expect(page.getByTestId('event-count')).not.toHaveText('00');
    await page.screenshot({ path: 'docs/media/live-world.png' });
    await seek.press('Home');
    await expect(page.getByTestId('event-count')).not.toHaveText('00');
  }
  await page.getByRole('button', { name: 'Enter immersive view' }).click();
  await expect
    .poll(async () => litPixels(await page.locator('canvas').screenshot()))
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pause audio' }).click();
  await expect(page.getByTestId('event-count')).toHaveText('00');
  await expect(page.getByText(/the sound has faded/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter immersive view' }).click();
  expect(litPixels(await page.locator('canvas').screenshot())).toBe(0);
  await expect(page.locator('.topbar')).toBeHidden();
  // Exit must work even when the button that entered focus still owns keyboard focus.
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.getByRole('slider', { name: 'Playback volume', exact: true }).press('Home');
  await page.getByRole('button', { name: 'Play audio', exact: true }).click();
  await expect(page.getByTestId('event-count')).toHaveText('00');
  await page.getByRole('slider', { name: 'Playback volume', exact: true }).press('End');
  await expect(page.getByTestId('event-count')).not.toHaveText('00');
  await page.getByRole('slider', { name: 'Playback position', exact: true }).press('End');
  await expect(page.getByTestId('event-count')).toHaveText('00');
  await page.getByRole('button', { name: 'Stop all audio' }).click();
  expect(errors).toEqual([]);
});

test('profiles persist, portable imports validate, and calibration preserves overrides', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Your perception', exact: true }).click();
  await page.getByLabel('Profile name', { exact: true }).fill('My blue world');
  await page
    .getByRole('combobox', { name: 'Low · below 220 Hz', exact: true })
    .selectOption('bass');
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  await page.getByRole('button', { name: 'Play & preview study' }).click();
  await page.getByRole('button', { name: 'Next study' }).click();
  await expect(page.getByRole('combobox', { name: 'Low · below 220 Hz', exact: true })).toHaveValue(
    'bass',
  );
  await page.getByRole('button', { name: 'Close profile', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'My blue world Your colors. Your associations.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Your perception', exact: true }).click();
  await page.getByLabel('Import profile file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":9}'),
  });
  await expect(page.getByRole('alert')).toContainText('schemaVersion 1');
});

test('a local stereo file runs through real browser analysis', async ({ page }) => {
  const rate = 48000,
    samples = rate * 3,
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
  for (let i = 0; i < samples; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 2 * 120) * 12000), 44 + i * 4);
  await page.goto('/');
  await page
    .getByLabel('Open audio file', { exact: true })
    .setInputFiles({ name: 'left-tone.wav', mimeType: 'audio/wav', buffer: bytes });
  await expect(page.getByTestId('event-count')).not.toHaveText('00');
  await expect(page.locator('.metrics')).toContainText('100% L');
  await page.getByRole('button', { name: 'Stop all audio' }).click();
  await expect(page.getByTestId('event-count')).toHaveText('00');
});

test('mobile layout keeps sources and playback reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Microphone', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin the study' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle live inspector' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Live translation inspector' }),
  ).toBeVisible();
});

test('animated panels remain reversible and the profile restores keyboard focus', async ({
  page,
}) => {
  await page.goto('/');
  const inspector = page.getByRole('complementary', { name: 'Live translation inspector' });
  const toggle = page.getByRole('button', { name: 'Toggle live inspector' });
  await toggle.click();
  await expect(inspector).toBeHidden();
  await toggle.click();
  await expect(inspector).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'The idea' }).click();
  await expect(page.locator('.about-panel')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Close the idea' }).click();
  await expect(page.locator('.about-panel')).toBeHidden();
  const opener = page.getByRole('button', { name: 'Your perception', exact: true });
  await opener.click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Close profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Begin the study' }).click();
  await expect(page.getByTestId('event-count')).not.toHaveText('00');
  await expect(page.locator('.void-intro')).toBeHidden();
  await page.getByRole('button', { name: 'Stop all audio' }).click();
});

test('reduced motion skips decorative transitions and keeps silence black', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.workspace')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('.void-intro h2 em > span > span').last()).toHaveCSS(
    'filter',
    'blur(0px)',
  );
  await page.getByRole('button', { name: 'Your perception', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Reduced motion' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Enter immersive view' }).click();
  expect(litPixels(await page.locator('canvas').screenshot())).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Your perception', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Reduced motion' }).uncheck();
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'false');
  await expect(page.locator('.workspace')).toHaveCSS('transition-duration', '0.42s');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-reduced-motion', 'false');
});
