# Chromesthesia · product brief

**Status:** MVP implementation. A personal interpretation engine, not instrument separation software.

## Experience

Transform listening into an abstract 3D world that exists only while sound is audible. Start with a pure black void. Place sounds left/right according to their stereo energy, higher/lower according to frequency, and farther away when quieter. There are no landscapes, stars, recognizable objects, camera travel, or idle particles.

The founding perception is the default, not a claim about everybody's synesthesia:

| Sound impression         | Form                               | Color                                      |
| ------------------------ | ---------------------------------- | ------------------------------------------ |
| Bass pluck               | Rubbery orb with outer glow        | Blue                                       |
| Sustained bass           | Thick rubbery tube                 | Blue                                       |
| Voice-like texture       | Wisps, like food coloring in water | Pastel blue, pink, yellow                  |
| Synth-like tone          | Neon tube                          | Twelve-note rainbow                        |
| Supersaw-like chord      | Broad flame sheet                  | Multicolored                               |
| Lower / higher frequency | Lower / higher placement           | Darker / lighter shading                   |
| Kick-like attack         | Round beveled disc near bottom     | Black with charcoal reflection             |
| Snare / clap attack      | Coarse, rounded sunburst blob      | Beige to orange                            |
| Hat / shaker attack      | Small flickering faceted solid     | Gray to white                              |
| Resolved note / partial  | Existing family form               | Consistent pitch-class color within family |
| Inaudible sound          | No form                            | Pure black                                 |

## Audience and primary journey

First audience: a desktop listener exploring a personal sound-to-vision relationship; second audience: developers learning audio, graphics, and signal-driven interaction. Open the app → choose a source → explicitly start audio or approve capture → see an immediate response → adjust a profile while listening → optionally inspect how a form was chosen → hide controls for immersion.

## Confirmed requirements

- Browser MVP with local files, original procedural demo, microphone, and system/tab capture.
- Prioritize immediate response; approximate classification and user overrides are acceptable.
- Fixed viewpoint. Stereo → horizontal position; frequency → height; quieter → farther away.
- Abstract forms and colors, with no world visible in silence.
- Modular TypeScript, testable mapping rules, and a strong open-source presentation.

## Default implementation choices

React + React Three Fiber + Web Audio, static hosting, npm workspaces, MIT license. Profiles remain local with JSON import/export. No accounts, backend, model downloads, analytics, or audio uploads. Desktop is the quality target; narrow screens retain usable controls. Reduced motion follows the OS preference for a new profile.

## MVP

- Four inputs with explicit capture permission, cancellation, teardown, errors, and file transport.
- Stereo FFT, waveform RMS/peak, frequency centroid, band energy/pan/flatness, attack and duration features.
- Pure feature-to-scene mapping with audibility gate and no artificial release trails.
- Five tonal form treatments plus solid drum polygons in a black 3D scene; bounded geometry and shader complexity.
- Profile editor: bass color, rainbow note legend, motion, glow, spatial spread, sensitivity, gate, region overrides.
- Five-step calibration with original synthetic studies and temporary shape previews.
- Optional inspector with raw measurements, mappings, reasons, heuristic scores, and timing estimates.
- Keyboard controls, reduced motion, local persistence, schema validation, unit and browser tests, CI and docs.

## V1

- Listening trials with the project owner; refine each form against reference sounds.
- Separate instrument-stem inputs for reliable category and per-stem stereo attribution.
- Audibility calibration and improved temporal tracking without visible post-sound tails.
- Adaptive render quality, worker/AudioWorklet analysis, and audio/output timing synchronization if measurements justify them.
- Better per-event provenance and calibrated confidence, using a curated labeled evaluation set.
- Full browser/OS capture matrix and long-session profiling on integrated GPUs.
- Installable offline PWA, configurable input devices, and portable profile migration.

## Stretch

Optional local source-separation preprocessing, MIDI/note-aware inputs, personal association learning, recording/export, VR, and desktop loopback integration. These require separate scope and tradeoff decisions. A browser cannot bypass protected audio or promise universal system capture.

## Acceptance criteria

1. At startup and after pause/stop, an immersive scene renders black. Crossing below the digital threshold clears forms on the next sampled/rendered frame; no deliberate tail survives.
2. Hard-left/right test signals appear on the corresponding side; mono is centered. Stereo antiphase signals remain detectable.
3. A low isolated short tone produces a blue orb; a sustained one becomes a tube. Higher frequencies are mapped higher and lighter; quieter events recede.
4. User overrides determine their assigned form families. Imported profiles cannot inject scripts or unbounded parameters.
5. Capture denial, missing audio, cancellation, source switching, browser “stop sharing,” and unmount release owned resources.
6. Local file pause/resume/seek/volume work. Muting file/demo playback makes the scene black.
7. Target: 60 rendering FPS at capped 1.5 DPR on a typical desktop/laptop. Target audio-to-visual response: under 100 ms excluding unknown external device delay. These are targets, not yet measured guarantees.
8. `npm run check` and browser smoke tests pass. Hardware permissions and real capture need a separate human compatibility check.

## Known perceptual limits

Frequency regions are not instruments. Resolved spectral peaks provide approximate note/partial labels, not full polyphonic transcription. Drum labels are transient-based interpretations. Dense mixes can merge sources, one source can produce multiple harmonic events, and perceived positions are spectral energy estimates. The digital gate cannot know headphone volume or a person's hearing threshold. Capture analysis sees the incoming source without replaying it. “Confidence” is an explanatory heuristic score, not a measured probability.

## Decision gates

Before adding ML preprocessing, a server, a desktop wrapper, or free camera motion, explain the latency/privacy/portability implications and obtain the owner's preference. The next product decision should follow a listening session with actual music and isolated reference sounds.
