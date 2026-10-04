<div align="center">

# Chromesthesia

### Sound, seen.

**A real-time synesthetic engine that turns audio into a personal world of color, shape, and motion.**

React · TypeScript · React Three Fiber · Web Audio

**Early MVP · MIT licensed · Local by design**

[![Quality](https://github.com/Shmartin1/chromesthesia/actions/workflows/ci.yml/badge.svg)](https://github.com/Shmartin1/chromesthesia/actions/workflows/ci.yml)

[Issues](https://github.com/Shmartin1/chromesthesia/issues) · [Milestones](https://github.com/Shmartin1/chromesthesia/milestones)

</div>

In silence, nothing. A bass pluck becomes a glowing blue rubber orb. A sustained note stretches into a tube. Voice-like textures diffuse into pastel wisps; bright tones become neon; dense chords flicker like multicolored flame. When the sound disappears, the world disappears with it.

Chromesthesia starts from one person's synesthetic associations and makes them editable. It is a coherent abstract listening space, with stereo placement, pitch-driven height and brightness, and quiet sounds that recede into black.

![Chromesthesia listening interface](docs/media/experience.png)

> **An interpretation, not instrument separation.** The MVP measures stereo energy, frequency and texture, then applies transparent heuristics. Overlapping sounds in a finished mix cannot be reliably identified or positioned independently. The inspector explains the interpretation, and your profile can override it.

## Listen locally

Use **Node 24** (minimum 22.12) and npm. From this repository:

```sh
git clone https://github.com/Shmartin1/chromesthesia.git
cd chromesthesia
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173), click **Begin the study**, and use headphones to explore stereo placement. The original 24-second study deliberately ends in silence. No API key, account, backend or downloaded model is required.

| Input              | How it works                                                                |
| ------------------ | --------------------------------------------------------------------------- |
| Built-in study     | Original procedural stereo music; no external recording                     |
| Your music         | Select or drop an audio file; browser-supported formats such as MP3/WAV/OGG |
| Microphone         | Explicit browser permission; adjust the silence threshold for room noise    |
| System / tab audio | Choose a source in the browser picker and enable audio sharing              |

Microphone and shared audio are analyzed **without speaker monitoring**, avoiding feedback. Tab/system capture depends on browser, operating system and the selected source; an audio track is required. The app cannot capture protected audio or guarantee universal system loopback. See [the browser API limitations](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia). HTTPS or localhost is required for live inputs.

No audio is uploaded, and profiles stay on your device unless you export them. Assets and fonts are served locally. This release does not yet include an installable offline PWA.

## Make it yours

Open **Your perception** to choose colors, motion, glow, stereo width, pitch height, depth, sensitivity and a silence threshold. Four short calibration studies help you explore associations; the voice study is synthesized, not recorded singing. Preview shapes never replace your saved overrides.

- **Low:** below 220 Hz; defaults to blue bass forms.
- **Mid:** 220–2,600 Hz; texture-based voice/synth/flame interpretations.
- **High:** above 2,600 Hz; brighter, higher forms.

Region overrides make the interpretation explicit. Import/export portable JSON or try [First perception](examples/profiles/first-perception.json) and [Quiet perception](examples/profiles/quiet-perception.json). Profile data is versioned and validated. Read the [profile design](docs/PROFILES.md).

**Space** plays/pauses (or stops live input). **F** enters immersion. **Escape** returns to controls. The canvas is pure black in silence; normal-mode labels and controls are outside the world. Reduced motion removes drift and wobble, while sound-driven appearance still works.

## How it works

```mermaid
flowchart LR
  A[File · Demo · Mic · Shared audio] --> B[L/R FFT + waveform features]
  B --> C[Pure mapping engine]
  P[Personal profile] --> C
  C --> D[Pooled 3D forms]
  D --> E[Black-void scene]
  B --> I[Explainability inspector]
  C --> I
  U[Calibration / editor] --> P
```

The engine keeps measurement, interpretation, rendering and profile storage separate. Geometry and materials are reused; animation updates run outside React state. The inspector updates at 10 Hz and shows the same events the renderer receives, including raw features and the reason for each form.

| Package             | Responsibility                                                 |
| ------------------- | -------------------------------------------------------------- |
| `apps/web`          | Listening interface, transport, inspector and calibration      |
| `packages/audio`    | Inputs, stream ownership, procedural audio and stereo analysis |
| `packages/core`     | Shared contracts and deterministic mapping rules               |
| `packages/profiles` | Defaults, validation and persistence                           |
| `packages/scene`    | R3F forms, materials and procedural shaders                    |

Read the [PRD](docs/PRD.md), [architecture and exact stack](docs/ARCHITECTURE.md), and [ordered issues](docs/ISSUES.md).

## Develop and verify

```sh
npm run dev            # Development server
npm run test           # Mapping, analysis, profile and capture lifecycle tests
npm run typecheck      # Strict TypeScript
npm run lint           # ESLint
npm run format         # Prettier
npm run check          # Lint + unit tests + typecheck/build + format check
npx playwright install chromium
npm run test:e2e        # Real browser audio, transport, profile and layout tests
npm run screenshots    # Reproduce README screenshots with the original study
npm run build          # Static output in apps/web/dist
npm run preview        # Serve production build locally
```

GitHub Actions runs the quality gate and Chromium tests. See [validation and manual checks](docs/VALIDATION.md) for what has and has not been verified. Serve the contents of `apps/web/dist` over HTTPS for deployment; no server routes or environment secrets are needed. A host may still need to allow microphone/display capture in its permissions policy.

## Roadmap

- [x] Black void, five form treatments, stereo placement and immediate gating
- [x] Local files, original study, microphone and tab/system input adapters
- [x] Personal profiles, synthetic calibration, import/export and reduced motion
- [x] Measured-feature inspector, tests, CI and modular workspace
- [ ] Owner-led listening trials and refinement against isolated reference sounds
- [ ] Real-device capture matrix, measured latency and integrated-GPU benchmarks
- [ ] Synchronized stems and per-stem mappings
- [ ] Better temporal/harmonic tracking and adaptive quality, justified by measurements
- [ ] Optional offline install, recording, MIDI and preprocessing experiments

**Performance target:** smooth 60 FPS on a typical laptop with capped DPR. The 2048-sample analysis window is about 43 ms at 48 kHz; device and scheduling delay add to this. Timing values in the inspector are estimates, not measured end-to-end latency. Exact note transcription, perfect timbre labels and universal system capture are outside this MVP.

## Demo and media

The playable demo is bundled in the app. [Interface screenshot](docs/media/experience.png) · [Live scene](docs/media/live-world.png).

**Public demo:** deployment URL pending. **Demo video:** reserved for a 20–30 second capture showing bass → wisps/neon → dense chord → silence, followed by one profile edit. Use the original study or appropriately licensed audio.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md). Small improvements grounded in a concrete listening example are welcome. Preserve black-on-silence, local processing, input cleanup and understandable mapping rules.

Original project code and procedural study audio: [MIT license](LICENSE). The interface incorporates adapted [React Bits](https://reactbits.dev/) Blur Text and Spotlight Card components, which retain their **MIT + Commons Clause** license. See [third-party notices](THIRD_PARTY_NOTICES.md) for the exact scope and attribution; bundled dependencies and fonts retain their respective licenses.
