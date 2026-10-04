# Contributing

Chromesthesia explores personal perception. A convincing relationship between sound and form matters more than adding more effects.

1. Use Node 24 (minimum 22.12), run `npm ci`, then `npm run dev`.
2. Read [the product brief](docs/PRD.md) and [architecture](docs/ARCHITECTURE.md).
3. Keep browser/renderer dependencies out of `packages/core`. Add meaningful tests for new mapping invariants or resource-lifecycle behavior.
4. Run `npm run format` and `npm run check`. For browser tests, run `npx playwright install chromium` then `npm run test:e2e`.
5. In a change description, name the sound or interaction that improves, include validation, and show a screenshot/video if visual behavior changed.

Never upload somebody's audio without permission. Do not commit personal audio, secrets, browser traces, local caches or exported user profiles. Use synthetic or clearly licensed fixtures. Fonts are served locally and retain their package license notices. Reports of false sound-type interpretation are useful: describe the source, expected form and relevant inspector values without attaching private music.

Adding a new engine dependency, backend, model, global release trail or moving camera warrants an architecture discussion. Preserve exact-black silence, source ownership, explicit permission requests, keyboard access and reduced motion.
