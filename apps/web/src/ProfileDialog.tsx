import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, useIsPresent } from 'motion/react';
import {
  type FamilyChoice,
  type StudyKind,
  NOTE_NAMES,
  noteColor,
  type SynestheticProfile,
  type SceneFrame,
} from '@chromesthesia/core';
import { SynestheticScene } from '@chromesthesia/scene';
import { defaultProfile, parseProfile, quietProfile } from '@chromesthesia/profiles';
import type { AudioEngine } from '@chromesthesia/audio';
import { Icon } from './icons';

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-label">
      <span>
        {label}
        <span className="slider-value" aria-hidden="true">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const calibrationSteps = [
  {
    title: 'Find your blue.',
    text: 'Listen to the bass pluck, then its longer sustain. Adjust its color until it feels familiar.',
    family: 'bass' as StudyKind,
  },
  {
    title: 'Let the voice diffuse.',
    text: 'This synthetic vowel-like tone is a stand-in for a voice. Watch its note colors diffuse; higher frequencies use lighter shades.',
    family: 'voice' as StudyKind,
  },
  {
    title: 'Give brightness a shape.',
    text: 'Compare a neon tone with the supersaw study. Shape overrides remain available for real music.',
    family: 'synth' as StudyKind,
  },
  {
    title: 'Place it in your space.',
    text: 'The studies move from left to right. Tune width, height, and depth. Then set the silence threshold with your real input.',
    family: 'supersaw' as StudyKind,
  },
  {
    title: 'See the rhythm.',
    text: 'A 120 BPM study: sixteenth-note hats, round black kicks, and warm clap-like bursts. Each shape follows a detected attack.',
    family: 'percussion' as StudyKind,
  },
];
export function ProfileDialog({
  profile,
  reducedMotion,
  onChange,
  onClose,
  engine,
  saved,
  onPreview,
  frame,
}: {
  profile: SynestheticProfile;
  reducedMotion: boolean;
  onChange: (value: SynestheticProfile) => void;
  onClose: () => void;
  engine: AudioEngine;
  saved: boolean;
  onPreview: (family: StudyKind | null) => void;
  frame: RefObject<SceneFrame>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<number | null>(null),
    [error, setError] = useState('');
  const isPresent = useIsPresent();
  useLayoutEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  function update(patch: Partial<SynestheticProfile>) {
    onChange({ ...profile, ...patch });
  }
  function exportProfile() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'chromesthesia-profile.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProfile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('Profile files must be smaller than 100 KB.');
      onChange(parseProfile(JSON.parse(await file.text())));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read profile.');
    }
  }
  return (
    <motion.dialog
      initial={{ opacity: 0, y: reducedMotion ? 0 : 18, scale: reducedMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 10, scale: reducedMotion ? 1 : 0.99 }}
      data-closing={!isPresent}
      ref={dialog}
      className="profile-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="profile-heading"
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">YOUR PERCEPTION</span>
          <h2 id="profile-heading">There is no universal blue.</h2>
        </div>
        <button className="icon-button" aria-label="Close profile" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">
        Start with a feeling. Make the world your own. Changes apply as you listen.
      </p>
      <div className="calibration-card">
        {step === null ? (
          <>
            <div>
              <strong>A small listening ritual</strong>
              <p>Five short studies to find your colors and space.</p>
            </div>
            <button className="secondary" onClick={() => setStep(0)}>
              Calibrate <Icon name="arrow" size={15} />
            </button>
          </>
        ) : (
          <div className="calibration-content">
            <span className="eyebrow">
              STUDY {step + 1} / {calibrationSteps.length}
            </span>
            <h3>{calibrationSteps[step]!.title}</h3>
            <p>{calibrationSteps[step]!.text}</p>
            <div className="calibration-preview">
              <SynestheticScene frame={frame} reducedMotion={reducedMotion} />
            </div>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => {
                  const family = calibrationSteps[step]!.family;
                  onPreview(family);
                  void engine.startDemo(family);
                }}
              >
                <Icon name="play" size={14} /> Play & preview study
              </button>
              <button
                className="text-button"
                onClick={() => {
                  engine.stop();
                  onPreview(null);
                  setStep(step === calibrationSteps.length - 1 ? null : step + 1);
                }}
              >
                {step === calibrationSteps.length - 1 ? 'Finish' : 'Next study'}{' '}
                <Icon name="arrow" size={14} />
              </button>
            </div>
            <small>
              Study shapes are a temporary preview. Your saved interpretation rules are preserved.
            </small>
          </div>
        )}
      </div>
      <div className="profile-grid">
        <section>
          <h3>Identity & color</h3>
          <label className="field-label">
            Profile name
            <input
              value={profile.name}
              maxLength={60}
              onChange={(event) => update({ name: event.target.value || 'My perception' })}
            />
          </label>
          <div className="palette-row">
            <span>
              Bass <small>Rubbery blue</small>
            </span>
            <label className="color-choice">
              <input
                aria-label="Bass color"
                type="color"
                value={profile.colors.bass}
                onChange={(event) =>
                  update({ colors: { ...profile.colors, bass: event.target.value } })
                }
              />
            </label>
          </div>
          <h3>Notes become color</h3>
          <p className="small muted">
            Melodic notes cover a full rainbow: C is red, D yellow, E green, F♯ cyan, G♯ blue, and A
            violet. Higher frequencies use lighter shades. When pitch is uncertain, the spectral
            frequency chooses the nearest note-color without claiming a detected note.
          </p>
          {(['bass', 'voice'] as const).map((family) => (
            <div className="note-palette" key={family}>
              <span>{family === 'voice' ? 'melody' : 'bass'}</span>
              <div>
                {NOTE_NAMES.map((name, index) => (
                  <span className="note-chip" key={name} title={`${family} · ${name}`}>
                    <i style={{ background: noteColor(family, index, profile) }} />
                    <small>{name}</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="small muted">
            Drums keep their own colors: black kicks, beige to orange snares and claps, gray to
            white hats and shakers.
          </p>
          <h3>Interpretation overrides</h3>
          <p className="small muted">
            Apply a shape family to a frequency region. This changes the interpretation; it does not
            separate instruments. A manual override also suppresses automatic drum polygons in that
            region.
          </p>
          {(['low', 'mid', 'high'] as const).map((region) => (
            <label className="select-label" key={region}>
              <span>
                {region === 'low'
                  ? 'Low · below 220 Hz'
                  : region === 'mid'
                    ? 'Mid · 220–2,600 Hz'
                    : 'High · above 2,600 Hz'}
              </span>
              <select
                value={profile.assignments[region]}
                onChange={(event) =>
                  update({
                    assignments: {
                      ...profile.assignments,
                      [region]: event.target.value as FamilyChoice,
                    },
                  })
                }
              >
                {['auto', 'bass', 'voice', 'synth', 'supersaw'].map((family) => (
                  <option key={family} value={family}>
                    {family === 'auto' ? 'Automatic' : family}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
        <section>
          <h3>Space & response</h3>
          <Slider
            label="Stereo width"
            value={profile.stereoSpread}
            min={0.3}
            max={1.6}
            onChange={(stereoSpread) => update({ stereoSpread })}
          />
          <Slider
            label="Pitch height"
            value={profile.heightSpread}
            min={0.3}
            max={1.6}
            onChange={(heightSpread) => update({ heightSpread })}
          />
          <Slider
            label="Quiet-sound depth"
            value={profile.depth}
            min={0}
            max={1.5}
            onChange={(depth) => update({ depth })}
          />
          <Slider
            label="Motion"
            value={profile.motion}
            min={0}
            max={1.5}
            onChange={(motion) => update({ motion })}
          />
          <Slider
            label="Outer glow"
            value={profile.glow}
            min={0}
            max={1.5}
            onChange={(glow) => update({ glow })}
          />
          <Slider
            label="Sensitivity"
            value={profile.sensitivity}
            min={0.3}
            max={3}
            onChange={(sensitivity) => update({ sensitivity })}
          />
          <Slider
            label="Silence threshold"
            value={profile.gateDb}
            min={-80}
            max={-25}
            step={1}
            suffix=" dBFS"
            onChange={(gateDb) => update({ gateDb })}
          />
          <p className="small muted">
            Raise the threshold until room noise disappears. This is a digital level, not a
            measurement of what reaches your ears.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={profile.reducedMotion}
              onChange={(event) => update({ reducedMotion: event.target.checked })}
            />{' '}
            Reduced motion
          </label>
        </section>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-footer">
        <span className="small muted">
          {saved ? 'Saved on this device' : 'Unsaved · storage unavailable'}
        </span>
        <div className="button-row">
          <button className="text-button" onClick={() => onChange(structuredClone(quietProfile))}>
            Quiet preset
          </button>
          <button className="text-button" onClick={() => onChange(structuredClone(defaultProfile))}>
            Reset
          </button>
          <button className="secondary" onClick={() => importInput.current!.click()}>
            Import
          </button>
          <button className="secondary" onClick={exportProfile}>
            <Icon name="download" size={14} /> Export
          </button>
        </div>
      </div>
      <input
        hidden
        ref={importInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import profile file"
        onChange={(event) => {
          void importProfile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </motion.dialog>
  );
}
