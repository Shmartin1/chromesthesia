# Ordered implementation backlog

The backlog is published as [GitHub issues](https://github.com/Shmartin1/chromesthesia/issues?q=is%3Aissue) and [milestones](https://github.com/Shmartin1/chromesthesia/milestones). `CH-xx` identifiers remain stable; [the issue index](github-issues.json) maps them to actual URLs. Milestones follow dependencies; the app remains runnable at each boundary. The initial implementation combines M0–M5 in this workspace. Completed implementation issues are closed records; device verification and V1 issues remain open.

| Milestone               | Issues       | Runnable outcome                                 | State                                |
| ----------------------- | ------------ | ------------------------------------------------ | ------------------------------------ |
| M0 · Foundation         | CH-01        | Typed workspace and black scene shell            | Implemented                          |
| M1 · Signals            | CH-02, CH-03 | Stereo study → measured features → mapped events | Implemented                          |
| M2 · Inputs             | CH-04, CH-05 | File, microphone and shared-audio paths          | Implemented; real capture QA pending |
| M3 · The world          | CH-06        | Five forms, silence gate, immersive mode         | Implemented                          |
| M4 · Perception         | CH-07, CH-08 | Profiles, calibration and inspector              | Implemented                          |
| M5 · Release foundation | CH-09        | Tests, CI, docs, screenshots and examples        | Published; initial GitHub CI passed  |
| V1 · Listening accuracy | CH-10–CH-13  | Validated perception and reliable stem inputs    | Planned                              |

## CH-01 · Establish the typed workspace and runnable shell

**Depends on:** none. **Milestone:** M0. **Status:** implemented.

Create npm workspaces for app, core, audio, profiles and scene. Wire strict TS, lint, formatting, Vitest, Vite, lockfile and MIT license. Acceptance: clean install followed by `npm run dev` displays the black listening shell; dependencies point into core without browser imports there.

## CH-02 · Measure stereo features without phase cancellation

**Depends on:** CH-01. **Milestone:** M1. **Status:** implemented.

Implement independent L/R FFT and waveform analysis, RMS/peak, centroid, per-region energy/pan/flatness, transient and duration state. Acceptance: silent, hard-left, mono and antiphase fixtures have expected values; silence resets durations; arrays and work per frame are bounded.

## CH-03 · Implement the pure synesthetic mapping contract

**Depends on:** CH-02. **Milestone:** M1. **Status:** implemented.

Map features to typed events with forms, palettes, positions and explanation metadata. Acceptance: blue bass plucks/sustains, pitch height/lightness, quieter depth, user overrides and immediate silence pass deterministic tests. Document imperfect timbre inference and peak consolidation.

## CH-04 · Add original study and local file transport

**Depends on:** CH-02, CH-03. **Milestone:** M2. **Status:** implemented.

Provide an original stereo demo with a deliberate silent ending, local file picker/drop, play/pause/seek/volume, object URL cleanup and decode errors. Acceptance: actual browser FFT sees a generated stereo WAV; mute/pause/stop clear mappings; the demo needs no network audio asset.

## CH-05 · Add microphone and system/tab capture lifecycle

**Depends on:** CH-04. **Milestone:** M2. **Status:** implementation complete; hardware verification open.

Implement permission-triggered capture with no speaker monitoring. Handle permission denial, video-only sharing, source switching, cancellation, late grants and browser stop-sharing. Acceptance: lifecycle unit tests pass; real Chrome/Edge microphone and tab capture are manually verified; document OS-specific system-audio availability. Track the remaining device checks in CH-11.

## CH-06 · Render a coherent abstract world in a black void

**Depends on:** CH-03, CH-04. **Milestone:** M3. **Status:** implemented.

Build pooled rubber orbs/tubes, pastel wisps, neon tubes and flame sheets with local glow and fixed camera. Acceptance: silence pixels are black, stereo direction is preserved, profiles affect materials, reduced motion stops drift, immersive Escape works, and there are no idle objects or trails. Further perceptual fidelity is CH-10, not an assertion of photoreal fluid simulation.

## CH-07 · Add portable profiles and guided listening calibration

**Depends on:** CH-03, CH-06. **Milestone:** M4. **Status:** implemented.

Implement a versioned profile, bounded validation, edit/save/import/export, defaults and quiet preset, OS reduced-motion initial preference, and four studies. Acceptance: edits persist across reload; malformed JSON is rejected without losing the current profile; calibration previews preserve overrides; storage failure has an explicit unsaved state.

## CH-08 · Explain the translation in a live inspector

**Depends on:** CH-02, CH-03, CH-06. **Milestone:** M4. **Status:** implemented.

Display measured level, gate, centroid, stereo balance, active events, mapping reasons, estimated score, sample rate and timing estimates at 10 Hz. Acceptance: inspector uses the same frame/events as the renderer; manual rules are identified; scores are not presented as calibrated probabilities; it can be hidden.

## CH-09 · Establish the public project presentation and quality gate

**Depends on:** CH-05–CH-08. **Milestone:** M5. **Status:** implemented and published; CI validation is tracked in GitHub.

Write PRD, architecture diagram, setup, limitations, profile examples/schema, contribution guide, screenshots/demo slot, roadmap, issue templates and CI. Acceptance: checks and browser tests pass locally; no audio/private files are committed; remote CI and issue publication are verified separately after a destination is confirmed.

## CH-10 · Run a reference-sound listening study and tune the form language

**Depends on:** CH-06–CH-08. **Milestone:** V1. **Status:** open. **Priority:** first.

With the owner, compare isolated bass plucks/sustains, speech/singing, simple synths, supersaws, and dense mixes. Use locally supplied or openly licensed fixtures. Record perceived shape/color/placement differences and desired changes. Acceptance: a small reference set, qualitative evaluation notes, and regression cases guide revised materials/mappings; no claim of exact instrument detection.

## CH-11 · Validate capture, latency, and rendering on real devices

**Depends on:** CH-05, CH-06. **Milestone:** V1. **Status:** open.

Test Chrome/Edge on Windows/macOS plus file/mic fallbacks in Firefox/Safari. Measure rendering and end-to-end audiovisual timing on a typical integrated GPU; distinguish FFT window, device latency, scheduling and true observed lag. Exercise 30-minute capture, unplugging devices, mute, source end, tab backgrounding and visibility return. Acceptance: published compatibility/performance matrix; any optimization has measured justification.

## CH-12 · Support separate stems and per-stem profile assignments

**Depends on:** CH-10, CH-11. **Milestone:** V1. **Status:** open.

Add synchronized multi-file stems with labels, independent stereo analysis and explicit per-stem family assignment. Explain memory and alignment tradeoffs before selecting streaming versus decoded buffers. Acceptance: two overlapping same-frequency sources retain separate pans and forms; all stems pause/seek together; unlabeled single-mix mode remains available.

## CH-13 · Improve analysis only where evaluation shows a benefit

**Depends on:** CH-10–CH-12. **Milestone:** V1. **Status:** open.

Evaluate multiresolution FFT, harmonic grouping, temporal feature stability, worker/worklet execution and adaptive quality against the reference set. Preserve black-on-silence and profile compatibility. Acceptance: before/after CPU, lag and perceptual results justify added complexity. Optional ML preprocessing requires a separate decision on wait time, model size and privacy.

## Deferred proposals

Offline installable PWA, device selection, a profile library/migrations, audio/video export, MIDI, WebGPU/volumetrics and VR each deserve a separate issue after V1 requirements are chosen. Do not bundle them into the MVP quality gate.
