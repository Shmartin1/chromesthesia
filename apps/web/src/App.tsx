import {
  Component,
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import BlurText from './components/react-bits/BlurText';
import SpotlightCard from './components/react-bits/SpotlightCard';
import { AudioEngine, FFT_SIZE, type InputKind } from '@chromesthesia/audio';
import {
  emptyScene,
  mapFeatures,
  silentFeatures,
  type FeatureFrame,
  type SceneFrame,
  type SoundFamily,
  type SynestheticProfile,
} from '@chromesthesia/core';
import { defaultProfile, loadProfile, saveProfile } from '@chromesthesia/profiles';
import { SynestheticScene } from '@chromesthesia/scene';
import { Icon } from './icons';
import { ProfileDialog, Slider } from './ProfileDialog';

const World = memo(SynestheticScene);
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const formatDb = (value: number) => (value < -110 ? '−∞' : value.toFixed(1));
const shapeNames = {
  orb: 'Rubber orb',
  tube: 'Sustained tube',
  wisp: 'Pastel wisp',
  neon: 'Neon tube',
  flame: 'Flame sheet',
};

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Visible fallback below; no telemetry. */
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        <h2>The world needs WebGL.</h2>
        <p>
          Enable hardware acceleration or try a current desktop browser. Audio analysis and profile
          controls remain available.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}

function initialProfile() {
  try {
    const loaded = loadProfile(window.localStorage);
    if (
      !localStorage.getItem('chromesthesia.profile.v1') &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      loaded.profile.reducedMotion = true;
    return loaded;
  } catch {
    return {
      profile: structuredClone(defaultProfile),
      warning: 'Local storage is unavailable. Export your profile to keep it.',
    };
  }
}

export function App() {
  const [engine] = useState(() => new AudioEngine());
  const status = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [loaded] = useState(initialProfile);
  const [profile, setProfile] = useState(loaded.profile),
    [saved, setSaved] = useState(!loaded.warning);
  const [notice, setNotice] = useState(loaded.warning ?? '');
  const [source, setSource] = useState<InputKind>('demo');
  const [profileOpen, setProfileOpen] = useState(false),
    [inspect, setInspect] = useState(() => window.innerWidth >= 980),
    [focus, setFocus] = useState(false),
    [about, setAbout] = useState(false);
  const [dragging, setDragging] = useState(false),
    [volume, setVolume] = useState(0.7);
  const fileInput = useRef<HTMLInputElement>(null),
    file = useRef<File | null>(null);
  const frame = useRef<SceneFrame>(emptyScene()),
    calibrationPreview = useRef<SoundFamily | null>(null);
  const [telemetry, setTelemetry] = useState<{
    features: FeatureFrame;
    scene: SceneFrame;
    fps: number;
    position: number;
  }>({ features: silentFeatures(), scene: emptyScene(), fps: 0, position: 0 });
  // New profiles inherit the OS preference; the profile control is the explicit override.
  const reducedMotion = profile.reducedMotion;
  const reveal = {
    initial: { opacity: 0, y: reducedMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reducedMotion ? 0 : -8 },
  };
  const live = source === 'capture' || source === 'microphone';
  const playing = status.state === 'playing';
  const busy = status.state === 'loading';

  useEffect(() => {
    let raf = 0,
      previousUi = 0,
      counter = 0,
      previousFps = performance.now(),
      fps = 0;
    function tick(now: number) {
      const features = engine.sample(profile.gateDb);
      const preview = calibrationPreview.current;
      frame.current = mapFeatures(
        features,
        preview
          ? { ...profile, assignments: { low: preview, mid: preview, high: preview } }
          : profile,
      );
      counter++;
      if (now - previousFps > 1000) {
        fps = Math.round((counter * 1000) / (now - previousFps));
        counter = 0;
        previousFps = now;
      }
      if (now - previousUi > 100) {
        setTelemetry({ features, scene: frame.current, fps, position: engine.getPosition() });
        previousUi = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, profile]);
  useEffect(
    () => () => {
      void engine.dispose();
    },
    [engine],
  );

  async function togglePlayback() {
    if (busy) return;
    if (status.kind !== source || status.state === 'idle') {
      if (source === 'demo') await engine.startDemo();
      else if (source === 'file') {
        if (file.current) await engine.startFile(file.current);
        else fileInput.current!.click();
      } else await engine.startLive(source);
    } else await engine.toggle();
  }
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (profileOpen) return;
      if (event.key === 'Escape') {
        setFocus(false);
        setAbout(false);
        return;
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key.toLowerCase() === 'f') {
        setFocus((value) => !value);
        return;
      }
      if (event.target instanceof HTMLButtonElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function changeProfile(next: SynestheticProfile) {
    setProfile(next);
    try {
      saveProfile(localStorage, next);
      setSaved(true);
      setNotice('');
    } catch {
      setSaved(false);
      setNotice('Changes are active but could not be saved. Export your profile to keep them.');
    }
  }
  async function openFile(next?: File) {
    if (!next) return;
    if (
      !next.type.startsWith('audio/') &&
      !/\.(mp3|wav|ogg|flac|m4a|aac|webm|opus)$/i.test(next.name)
    ) {
      setNotice('Choose an audio file, such as MP3, WAV, or OGG.');
      return;
    }
    file.current = next;
    setSource('file');
    setNotice('');
    calibrationPreview.current = null;
    await engine.startFile(next);
  }
  function chooseSource(kind: InputKind) {
    calibrationPreview.current = null;
    if (kind === 'file') {
      fileInput.current!.click();
      return;
    }
    engine.stop();
    setSource(kind);
    if (kind === 'microphone' || kind === 'capture') void engine.startLive(kind);
  }
  function closeProfile() {
    if (calibrationPreview.current) engine.stop();
    calibrationPreview.current = null;
    setProfileOpen(false);
  }

  const activeCount = telemetry.scene.events.length;
  return (
    <MotionConfig
      reducedMotion={reducedMotion ? 'always' : 'never'}
      transition={{ duration: reducedMotion ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        data-reduced-motion={reducedMotion}
        className={`app ${focus ? 'is-focused' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void openFile(event.dataTransfer.files[0]);
        }}
      >
        <header className="topbar chrome">
          <a
            className="wordmark"
            href="#"
            aria-label="Chromesthesia home"
            onClick={(event) => {
              event.preventDefault();
              setAbout(false);
            }}
          >
            <span className="brand-mark">
              <Icon name="wave" size={23} />
            </span>
            chromesthesia<span className="alpha-tag">EARLY STUDY</span>
          </a>
          <nav aria-label="Main">
            <button
              className={!about ? 'nav-item selected' : 'nav-item'}
              onClick={() => setAbout(false)}
            >
              Experience
              {!about && <motion.i className="nav-indicator" layoutId="navigation" />}
            </button>
            <button className="nav-item" onClick={() => setProfileOpen(true)}>
              Your perception
            </button>
            <button
              className={about ? 'nav-item selected' : 'nav-item'}
              onClick={() => setAbout(!about)}
            >
              The idea <span>↗</span>
              {about && <motion.i className="nav-indicator" layoutId="navigation" />}
            </button>
          </nav>
          <div className="privacy">
            <span className="status-dot" />
            LOCAL BY DESIGN
          </div>
        </header>

        <main className={`workspace ${inspect ? '' : 'without-inspector'}`}>
          <aside className="sidebar chrome" aria-label="Audio and perception controls">
            <div className="sidebar-intro">
              <span className="eyebrow">A DIFFERENT WAY TO LISTEN</span>
              <h1>
                <BlurText text="Sound," reducedMotion={reducedMotion} />
                <br />
                <em>
                  <BlurText text="seen." reducedMotion={reducedMotion} />
                </em>
              </h1>
              <p>
                A world of color and form.
                <br />
                Existing only while you hear it.
              </p>
            </div>
            <div className="section-heading">
              <span className="eyebrow">01 / AUDIO SOURCE</span>
              <span className="tiny-label">LOCAL</span>
            </div>
            <div className="source-list">
              {(
                [
                  {
                    kind: 'demo',
                    icon: 'wave',
                    title: 'Built-in study',
                    detail: 'Meet your first sounds',
                  },
                  {
                    kind: 'file',
                    icon: 'upload',
                    title: 'Your music',
                    detail: 'Drop a file or browse',
                  },
                  {
                    kind: 'microphone',
                    icon: 'mic',
                    title: 'Microphone',
                    detail: 'Listen to the room',
                  },
                  {
                    kind: 'capture',
                    icon: 'screen',
                    title: 'System / tab audio',
                    detail: 'See what you’re listening to',
                  },
                ] as const
              ).map((item) => (
                <SpotlightCard
                  key={item.kind}
                  className="source-spotlight"
                  reducedMotion={reducedMotion}
                >
                  <button
                    aria-pressed={source === item.kind}
                    className={`source-option ${source === item.kind ? 'active' : ''}`}
                    onClick={() => chooseSource(item.kind)}
                  >
                    {source === item.kind && (
                      <motion.span className="source-selection" layoutId="audio-source" />
                    )}
                    <span className="source-icon">
                      <Icon name={item.icon} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className="radio-mark">{source === item.kind && <i />}</span>
                  </button>
                </SpotlightCard>
              ))}
            </div>
            {live && (
              <p className="source-note">
                {source === 'capture'
                  ? 'Choose a tab and enable audio sharing. System audio depends on your browser and OS.'
                  : 'Mono microphones appear in the center. Room noise may need a higher silence threshold.'}{' '}
                Audio is analyzed without speaker playback.
              </p>
            )}
            <div className="section-heading perception-heading">
              <span className="eyebrow">02 / YOUR PERCEPTION</span>
              <button className="text-button" onClick={() => setProfileOpen(true)}>
                Edit <Icon name="sliders" size={13} />
              </button>
            </div>
            <SpotlightCard className="perception-spotlight" reducedMotion={reducedMotion}>
              <button className="perception-card" onClick={() => setProfileOpen(true)}>
                <div className="palette">
                  <i style={{ background: profile.colors.bass }} />
                  <i style={{ background: profile.colors.voice[1] }} />
                  <i style={{ background: profile.colors.voice[2] }} />
                  <i style={{ background: profile.colors.synth[0] }} />
                  <i style={{ background: profile.colors.synth[1] }} />
                </div>
                <strong>{profile.name}</strong>
                <span>Your colors. Your associations.</span>
                <Icon name="chevron" size={15} />
              </button>
            </SpotlightCard>
            <div className="legend">
              <div>
                <i className="legend-orb" />
                <span>Bass</span>
                <small>Rubber & glow</small>
              </div>
              <div>
                <i className="legend-wisp" />
                <span>Voice</span>
                <small>Pastel diffusion</small>
              </div>
              <div>
                <i className="legend-neon" />
                <span>Synth</span>
                <small>Neon & flame</small>
              </div>
            </div>
            <div className="sidebar-footer">
              <Icon name="info" size={14} />
              <p>
                No uploads. No accounts.
                <br />
                Your audio stays in your browser.
              </p>
            </div>
          </aside>

          <section className="stage" aria-label="Listening world">
            <div className="world">
              <SceneBoundary>
                <World frame={frame} reducedMotion={reducedMotion} />
              </SceneBoundary>
            </div>
            <div className="stage-top chrome">
              <div className="eyebrow">
                <span className={`status-dot ${playing && activeCount ? 'live' : ''}`} />
                {playing
                  ? activeCount
                    ? 'SOUND IS TAKING SHAPE'
                    : 'LISTENING · BELOW THRESHOLD'
                  : 'THE VOID / 01'}
              </div>
              <div className="button-row">
                <button
                  className={`icon-button ${inspect ? 'toggled' : ''}`}
                  aria-label="Toggle live inspector"
                  aria-pressed={inspect}
                  onClick={() => setInspect(!inspect)}
                >
                  <Icon name="sliders" size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Enter immersive view"
                  title="Immersive view · F. Escape to return."
                  onClick={() => {
                    setFocus(true);
                    setNotice('');
                  }}
                >
                  <Icon name="expand" size={16} />
                </button>
              </div>
            </div>
            <AnimatePresence>
              {!playing && !busy && (
                <motion.div key="invitation" className="void-intro chrome" {...reveal}>
                  <div className="void-symbol">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="eyebrow">IN SILENCE, NOTHING.</span>
                  <h2>
                    <BlurText text="Press play." reducedMotion={reducedMotion} />
                    <br />
                    <em>
                      <BlurText text="Let a world appear." reducedMotion={reducedMotion} />
                    </em>
                  </h2>
                  <p>
                    No landscape. No objects.
                    <br />
                    Only the shape of what you hear.
                  </p>
                  <button className="primary" onClick={() => void togglePlayback()}>
                    <Icon name="play" size={16} />
                    {status.state === 'paused'
                      ? 'Continue listening'
                      : live
                        ? 'Start listening'
                        : source === 'file'
                          ? 'Play your music'
                          : 'Begin the study'}
                    <span>↗</span>
                  </button>
                  <small>
                    {live
                      ? 'Live input · permission required'
                      : source === 'file'
                        ? 'Your file · processed locally'
                        : '24 seconds · headphones recommended'}
                  </small>
                </motion.div>
              )}
              {busy && (
                <motion.div key="loading" className="loading chrome" {...reveal}>
                  <span className="loading-dot" />
                  {live ? 'Waiting for audio permission…' : 'Opening your sound…'}
                  <button className="text-button" onClick={() => engine.stop()}>
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="stage-bottom chrome">
              <span>← LEFT</span>
              <span>STEREO SPACE</span>
              <span>RIGHT →</span>
            </div>
            <div className="stage-caption chrome">
              <span>Lower sounds, darker shades.</span>
              <span>Higher sounds, lighter shades.</span>
            </div>
          </section>

          <AnimatePresence>
            {inspect && (
              <motion.aside
                className="inspector chrome"
                aria-label="Live translation inspector"
                initial={{ opacity: 0, x: reducedMotion ? 0 : 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : 24 }}
              >
                <div className="section-heading">
                  <span className="eyebrow">LIVE TRANSLATION</span>
                  <span className={`live-badge ${playing ? 'on' : ''}`}>
                    <i />
                    {playing ? 'LIVE' : 'IDLE'}
                  </span>
                </div>
                <h2>
                  From sound
                  <br />
                  to sensation.
                </h2>
                <p className="small muted">
                  Follow what the engine hears, and how it becomes visible.
                </p>
                <div className="signal-card">
                  <span className="eyebrow">INPUT LEVEL</span>
                  <div className="db-reading">
                    {formatDb(telemetry.features.rmsDb)}
                    <small>dBFS</small>
                  </div>
                  <div className="level-meter">
                    <i
                      style={{
                        width: `${Math.max(0, Math.min(100, ((telemetry.features.rmsDb + 80) / 80) * 100))}%`,
                      }}
                    />
                    <span style={{ left: `${((profile.gateDb + 80) / 80) * 100}%` }} />
                  </div>
                  <div className="meter-caption">
                    <span>−80</span>
                    <span>Gate {profile.gateDb}</span>
                    <span>0</span>
                  </div>
                </div>
                <dl className="metrics">
                  <div>
                    <dt>Brightness center</dt>
                    <dd>
                      {telemetry.features.centroid
                        ? `${Math.round(telemetry.features.centroid)} Hz`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Stereo balance</dt>
                    <dd>
                      {Math.abs(telemetry.features.stereo) < 0.05
                        ? 'Center'
                        : `${Math.round(Math.abs(telemetry.features.stereo) * 100)}% ${telemetry.features.stereo < 0 ? 'L' : 'R'}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Visible forms</dt>
                    <dd data-testid="event-count">{activeCount.toString().padStart(2, '0')}</dd>
                  </div>
                </dl>
                <div className="section-heading">
                  <span className="eyebrow">WHAT BECAME VISIBLE</span>
                </div>
                <div className="event-list" aria-label="Current mappings">
                  {telemetry.scene.events.slice(0, 4).map((event) => (
                    <details key={event.id} className="event-card">
                      <summary>
                        <span className="event-swatch" style={{ background: event.color }} />
                        <span>
                          <strong>{shapeNames[event.form]}</strong>
                          <small>
                            {Math.round(event.frequency)} Hz · {event.db.toFixed(0)} dBFS
                          </small>
                        </span>
                        <Icon name="chevron" size={12} />
                      </summary>
                      <p>{event.reason}</p>
                      <p>
                        {event.confidence === 1
                          ? 'Manual assignment'
                          : `Heuristic score ${Math.round(event.confidence * 100)}% · not a calibrated probability`}
                      </p>
                    </details>
                  ))}
                  {!activeCount && (
                    <div className="empty-mappings">
                      <Icon name="wave" size={26} />
                      <span>
                        Nothing audible.
                        <br />
                        Nothing visible.
                      </span>
                    </div>
                  )}
                </div>
                <div className="inspector-bottom">
                  <Slider
                    label="Silence threshold"
                    value={profile.gateDb}
                    min={-80}
                    max={-25}
                    step={1}
                    suffix=" dB"
                    onChange={(gateDb) => changeProfile({ ...profile, gateDb })}
                  />
                  <p className="small muted">
                    Sound types are interpretations of frequency and texture, not isolated
                    instruments.
                  </p>
                  <div className="engine-stats">
                    <span>{telemetry.fps || '—'} UI FPS</span>
                    <span>
                      {status.sampleRate ? `${status.sampleRate / 1000} kHz` : 'WEB AUDIO'}
                    </span>
                  </div>
                  {status.sampleRate > 0 && (
                    <small className="latency-note">
                      FFT window {((FFT_SIZE / status.sampleRate) * 1000).toFixed(0)} ms · device
                      estimate {(status.latency * 1000).toFixed(0)} ms
                    </small>
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </main>

        <footer className="transport chrome">
          <div className="track-info">
            <span className={`album-mark ${playing ? 'playing' : ''}`}>
              <Icon name="wave" size={23} />
            </span>
            <div>
              <strong>
                {status.kind === source
                  ? status.label
                  : source === 'demo'
                    ? 'First light · a stereo study'
                    : 'Choose your sound'}
              </strong>
              <span>
                {live ? 'LIVE INPUT · NO SPEAKER MONITORING' : 'PROCESSED ON THIS DEVICE'}
              </span>
            </div>
          </div>
          <div className="player-controls">
            <button
              className="play-button"
              disabled={busy}
              aria-label={playing ? (live ? 'Stop capture' : 'Pause audio') : 'Play audio'}
              onClick={() => void togglePlayback()}
            >
              <Icon name={playing ? (live ? 'stop' : 'pause') : 'play'} size={19} />
            </button>
            {live ? (
              <span className="live-time">{playing ? 'Listening live' : 'Ready to listen'}</span>
            ) : (
              <>
                <span className="time">{formatTime(telemetry.position)}</span>
                <input
                  aria-label="Playback position"
                  type="range"
                  min={0}
                  max={status.duration || 24}
                  step={0.1}
                  value={Math.min(telemetry.position, status.duration || 24)}
                  disabled={status.state === 'idle' || busy}
                  onChange={(event) => {
                    const position = Number(event.target.value);
                    engine.seek(position);
                    // Commit the controlled value before native change/keyup can restore stale telemetry.
                    setTelemetry((previous) => ({ ...previous, position }));
                  }}
                />
                <span className="time">{formatTime(status.duration || 24)}</span>
              </>
            )}
          </div>
          <div className="transport-end">
            {!live && (
              <label className="volume">
                <Icon name="volume" size={17} />
                <input
                  type="range"
                  aria-label="Playback volume"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setVolume(value);
                    engine.setVolume(value);
                  }}
                />
              </label>
            )}
            <span className="shortcut">
              SPACE <span>play / pause</span>
            </span>
            <button
              className="icon-button"
              aria-label="Stop all audio"
              onClick={() => engine.stop()}
            >
              <Icon name="stop" size={14} />
            </button>
          </div>
        </footer>

        {focus && (
          <button
            className="exit-focus"
            aria-label="Exit immersive view"
            onClick={() => setFocus(false)}
          >
            Exit <kbd>Esc</kbd>
          </button>
        )}
        <AnimatePresence>
          {(status.error || notice) && !focus && (
            <motion.div key="notice" className="toast" role="alert" {...reveal}>
              <Icon name="info" />
              <span>{status.error || notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => {
                  setNotice('');
                  if (status.error) engine.stop();
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {dragging && (
            <motion.div
              key="drop"
              className="drop-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Icon name="upload" size={40} />
              <h2>Drop a sound into the void.</h2>
              <p>Your audio stays on this device.</p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {profileOpen && (
            <ProfileDialog
              key="profile"
              reducedMotion={reducedMotion}
              profile={profile}
              frame={frame}
              onChange={changeProfile}
              onClose={closeProfile}
              engine={engine}
              saved={saved}
              onPreview={(family) => {
                calibrationPreview.current = family;
                setSource('demo');
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {about && (
            <motion.div
              key="about"
              className="about-panel chrome"
              initial={{ opacity: 0, x: reducedMotion ? 0 : 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reducedMotion ? 0 : 40 }}
            >
              <button
                className="icon-button"
                aria-label="Close the idea"
                onClick={() => setAbout(false)}
              >
                <Icon name="close" />
              </button>
              <span className="eyebrow">THE IDEA</span>
              <h2>
                Music doesn’t need
                <br />a world around it.
                <br />
                <em>It becomes the world.</em>
              </h2>
              <p>
                Chromesthesia is an open-source exploration of sound, color, shape, and personal
                perception. A black void becomes blue rubbery bass, pastel wisps, neon tubes, and
                multicolored flame. When the sound leaves, so does its form.
              </p>
              <p>
                Left and right follow stereo energy. Pitch sets height and brightness. Quieter
                sounds recede. These associations are a starting point—your profile makes them
                yours.
              </p>
              <p className="small muted">
                The engine measures audio, then interprets it. Overlapping instruments cannot be
                reliably separated by the lightweight analysis used here. A dense mix will be more
                impressionistic than an isolated sound.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setAbout(false);
                  setProfileOpen(true);
                }}
              >
                Explore your perception <Icon name="arrow" size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <input
          hidden
          ref={fileInput}
          type="file"
          accept="audio/*,.flac,.opus,.m4a"
          aria-label="Open audio file"
          onChange={(event) => {
            void openFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
    </MotionConfig>
  );
}
