# Validation record

The initial public revision passed [GitHub Actions on Linux](https://github.com/Shmartin1/chromesthesia/actions/runs/37175047375), including a clean `npm ci`, the full quality gate, and all four Chromium integration tests.

## Automated coverage

- **59 unit tests**: silence and threshold boundaries, stereo symmetry, antiphase audibility, bass pluck/sustain including decaying plucks, frequency-height-lightness ordering, quiet-sound depth, overrides, reduced motion, deterministic mapping, schema bounds, corrupt storage, capture denial, video-only capture, late grant cancellation and browser stop-sharing cleanup. Scene transition tests cover frame-rate independence, conserved shape weights, immutable mapping input, reduced-motion bypass, immediate silence and clean restart, analytic spring continuity, onset-driven recoil, stable neighboring-band identity, and distinct simultaneous stereo sources. Additional animation checks cover continuous deformation during retriggers, overlapping traveling accents, analytic elastic integration across refresh rates, immediate-but-soft tonal entrances, preserved size momentum, and bounded phase advancement after a stall.
- **17 Chromium integration tests**: actual Web Audio demo and local stereo WAV analysis; play/pause/mute/seek; immersive Escape; profile persistence/import errors/calibration override preservation; narrow-screen source and inspector controls; animated panel reversal and modal focus restoration; reduced-motion defaults and a persistent user override. Five real-audio rendering studies verify every material family, changing pixels during motion, no shader/runtime errors, and exact black after stopping. A controlled dye study verifies different shapes for successive sounds, exact stability through neighboring FFT IDs in reduced motion, retained stereo placement, and silence. Keyboard seeking is checked against stale controlled-slider values.
- **New audio and mapping checks**: transient trains at 120/240 BPM, no generated pulses from sustained noise, same-quantum deduplication, stereo hat position, bass/kick distinction, immediate per-band disappearance, Blackman-windowed A1/C2/D2/E2/A3/A4/C5 note estimation, unique family note colors and octave consistency. Real browser FFT tests exercise the mixed rhythm study and measured hat spacing. Rendering checks cover lowered bass placement, a real E5 inspector label, opaque black/warm/silver polygons and exact black after clearing.
- **Stereo and color checks**: separate notes within one coarse region, a quieter side note beside a centered tone, mono centering, unpitched side textures, transient attack positioning, bounded stereo projection, side-event capacity, distinct shaded note colors, and frequency lightness. A native Web Audio oscillator test verifies opposite-side C5/E5 detection. Rendered-pixel checks verify all twelve rainbow hues, including unresolved-frequency fallbacks, a brighter high-frequency shade, activity on both outer sides, and hats in the top fifth of the view.
- **Inspector layout**: a real-audio browser check measures identical list height and footer placement with silence, one sound, five cards and expanded details; all five closed cards fit, and expanded explanations scroll internally.
- **Pixel check**: with interface chrome hidden, every rendered canvas pixel is black at startup and after pause. Playing audio produces non-black pixels. Ordinary DOM overlays are intentionally excluded by using immersive mode.
- TypeScript strict checks, ESLint, Prettier and a production Vite build are part of `npm run check`.

The browser suite uses software-rendered Chromium for portability. It establishes behavior, not representative GPU performance. Input lifecycle tests use simulated streams; file/demo integration uses real browser Web Audio.

A previous screenshot-enabled full run passed 15 of 16 checks; the playback-to-immersion pixel check intermittently returned black. It passed unchanged in an isolated screenshot-enabled rerun and three additional ordinary runs. The cause is not established; track this intermittency rather than treating those reruns as a proven fix.

## Visual review

Desktop 1440×900 / 1440×1000 layouts and a 390×844 narrow viewport have been inspected or exercised. Playback stays reachable, control panels can scroll, profiles use a native modal, and the inspector can appear on narrow screens. README PNGs come from `npm run screenshots`, which reruns the audio/silence integration path and five isolated, explicitly overridden tonal material studies. The percussion PNG uses controlled mapping events to demonstrate materials independently of transient timing. The in-app browser preview was also checked for visible forms and runtime errors.

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

The richer surfaces use shared geometry and GPU deformation, but the 60 FPS target remains unbenchmarked on integrated GPUs; passing software-rendered tests is not a performance certification.

The production renderer carries the expected Three.js bundle cost; Vite reports a large-chunk advisory. There is no backend or model to download. Idle rendering currently runs continuously; demand rendering, adaptive quality and more precise timing belong to measured V1 performance work.
