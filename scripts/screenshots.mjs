import { spawnSync } from 'node:child_process';
import process from 'node:process';
const result = spawnSync(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--grep',
    'silence, playback|detailed surface|solid drum facets|rendered notes',
  ],
  {
    env: { ...process.env, CHROMESTHESIA_SCREENSHOTS: '1' },
    stdio: 'inherit',
  },
);
process.exit(result.status ?? 1);
