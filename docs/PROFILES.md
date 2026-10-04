# Personal profiles and calibration

The default profile translates the owner's description. It is not a universal synesthesia model. `SynestheticProfile` is shared by the editor, storage adapter, mapping engine and JSON interchange.

| Field                          | Meaning / limits                                      |
| ------------------------------ | ----------------------------------------------------- |
| `schemaVersion`                | Exactly `1`; unknown versions rejected                |
| `name`                         | 1–60 nonblank characters                              |
| `gateDb`                       | −80 to −25 dBFS; below this, the full scene is empty  |
| `sensitivity`                  | 0.3–3; scales active visual intensity, not audio gain |
| `stereoSpread`, `heightSpread` | 0.3–1.6; personal space                               |
| `depth`                        | 0–1.5; quiet sounds recede                            |
| `motion`                       | 0–1.5; procedural movement amount                     |
| `glow`                         | 0–1.5; local halo intensity                           |
| `reducedMotion`                | Stops time-driven drift/wobble                        |
| `colors.bass`                  | One six-digit hex color; blue by default              |
| `colors.voice`, `colors.synth` | Exactly three six-digit hex colors each               |
| `assignments.low/mid/high`     | `auto`, `bass`, `voice`, `synth`, `supersaw`          |

Low is below 220 Hz, mid 220–2,600 Hz, high above 2,600 Hz. Overrides apply to spectral regions and can affect multiple instruments. They are not stem-specific rules.

See [example profiles](../examples/profiles) and [JSON Schema](../examples/profile.schema.json). The runtime validator checks finite numeric bounds and copies only known keys, including fresh palette arrays. Unknown properties are discarded; unknown schema versions are rejected. Imports are capped at 100 KB. Invalid import leaves the current profile intact.

## Guided listening flow

1. **Bass:** play an isolated short bass followed by a sustain, first left then right. Adjust blue and inspect orb/tube distinction.
2. **Voice-like study:** use a synthetic vibrato/formant-like tone to choose three pastel associations. Explain that this is a synthetic proxy, not a recorded voice.
3. **Synth:** inspect a bright harmonic tone and choose the neon palette.
4. **Space:** hear a supersaw-like study. Tune width, height and quiet-sound depth; then calibrate the silence gate using the real input.

The study temporarily previews the selected form family for all regions. Temporary interpretation never overwrites saved region overrides. Next, Finish, and Close end the preview. Palette and control edits apply immediately and persist locally. Calibration does not infer psychological traits, train a model or claim to diagnose synesthesia.

## Persistence

Store a single versioned JSON object at `chromesthesia.profile.v1` in local storage. A failed read activates a fresh default and displays a warning. A failed write keeps active settings in memory, marks them unsaved, and suggests export. Export is a normal JSON download. Existing saved reduced-motion choices are preserved; the OS preference is the initial default only for a new profile.

Future schema changes must introduce an explicit version and tested migration, preserve exported v1 examples, and avoid silently reinterpreting a person's palette. V1 may add named rules, per-stem assignments and a profile library once those use cases are real.
