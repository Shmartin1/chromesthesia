# Validation record

The initial public revision passed [GitHub Actions on Linux](https://github.com/Shmartin1/chromesthesia/actions/runs/37175047375), including a clean `npm ci`, the full quality gate, and all four Chromium integration tests.

## Automated coverage

- **23 unit tests**: silence and threshold boundaries, stereo symmetry, antiphase audibility, bass pluck/sustain including decaying plucks, frequency-height-lightness ordering, quiet-sound depth, overrides, reduced motion, deterministic mapping, schema bounds, corrupt storage, capture denial, video-only capture, late grant cancellation and browser stop-sharing cleanup. Scene transition tests cover frame-rate independence, conserved shape weights, immutable mapping input, reduced-motion bypass, immediate silence and clean restart.
- **6 Chromium integration tests**: actual Web Audio demo and local stereo WAV analysis; play/pause/mute/seek; immersive Escape; profile persistence/import errors/calibration override preservation; narrow-screen source and inspector controls; animated panel reversal and modal focus restoration; reduced-motion defaults and a persistent user override.
- **Pixel check**: with interface chrome hidden, every rendered canvas pixel is black at startup and after pause. Playing audio produces non-black pixels. Ordinary DOM overlays are intentionally excluded by using immersive mode.
- TypeScript strict checks, ESLint, Prettier and a production Vite build are part of `npm run check`.

The browser suite uses software-rendered Chromium for portability. It establishes behavior, not representative GPU performance. Input lifecycle tests use simulated streams; file/demo integration uses real browser Web Audio.

## Visual review

Desktop 1440×900 / 1440×1000 layouts and a 390×844 narrow viewport have been inspected or exercised. Playback stays reachable, control panels can scroll, profiles use a native modal, and the inspector can appear on narrow screens. README PNGs come from `npm run screenshots`, which reruns the audio/silence integration path. The in-app browser preview was also checked for visible forms and runtime errors.

## Manual checks still required

| Check                                    | Status / acceptance                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Real microphone grant and denial         | Pending owner/device run; correct indicator, no feedback, stop releases device |
| Real tab audio with sharing enabled      | Pending; stereo behavior and browser stop-sharing verified on actual browser   |
| Screen/system audio on target OS         | Pending; unavailable audio must yield the explicit missing-track message       |
| Long playback / live sessions            | Pending; 30-minute resource and background-tab check                           |
| Integrated-GPU 60 FPS target             | Pending measured benchmark; UI RAF rate is not GPU frame timing                |
| End-to-end perceived synchronization     | Pending observed measurement; displayed FFT/device timing is only an estimate  |
| Perceptual match to owner's associations | Pending listening session with isolated references and full music              |
| Firefox / Safari / mobile capture        | Not certified; browser and device capabilities vary                            |

## Known limitations

The FFT window is roughly 43 ms at 48 kHz. Browser scheduling and audio device latency add delay. Low-frequency resolution is approximate, sound-type scores are heuristic, and adjacent spectral components may merge. Dense mixtures can produce several forms for one source or combine multiple sources. The digital audibility threshold is not a model of headphone volume or human hearing.

The production renderer carries the expected Three.js bundle cost; Vite reports a large-chunk advisory. There is no backend or model to download. Idle rendering currently runs continuously; demand rendering, adaptive quality and more precise timing belong to measured V1 performance work.
