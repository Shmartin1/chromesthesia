import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, Group, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { FormKind, SceneFrame } from '@chromesthesia/core';
import { createGeometries } from './geometry';
import { createMaterial } from './materials';
import { SoundTracker } from './tracking';
import { SoundTransition } from './transition';
import { PercussionForms } from './percussion';

const forms = ['orb', 'tube', 'neon', 'wisp', 'flame'] as const;
const auraForms = ['orb', 'tube', 'neon'] as const;
type RenderState = NonNullable<ReturnType<SoundTransition['sample']>>;

function updateMaterial(
  material: ShaderMaterial,
  state: RenderState,
  seed: number,
  weight: number,
  reducedMotion: boolean,
) {
  const u = material.uniforms,
    event = state.event;
  u.uPhase!.value = state.phase;
  u.uEnergy!.value = event.intensity;
  u.uImpulse!.value = state.impulse;
  const pulses = state.pulses;
  (u.uPulseAges!.value as Vector3).set(pulses[0]!.age, pulses[1]!.age, pulses[2]!.age);
  (u.uPulseStrengths!.value as Vector3).set(
    pulses[0]!.strength,
    pulses[1]!.strength,
    pulses[2]!.strength,
  );
  u.uMotion!.value = reducedMotion ? 0 : event.motion;
  u.uGlow!.value = event.glow;
  u.uWeight!.value = weight * state.presence;
  u.uLightness!.value = event.lightness;
  u.uSeed!.value = seed;
  (u.uColor!.value as Color).copy(state.color);
}

function SoundForm({
  slot,
  tracker,
  geometries,
  reducedMotion,
}: {
  slot: number;
  tracker: SoundTracker;
  geometries: ReturnType<typeof createGeometries>;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const meshes = useRef<Partial<Record<FormKind, Mesh>>>({});
  const halos = useRef<Partial<Record<FormKind, Mesh>>>({});
  const generation = useRef(0);
  const transition = useMemo(() => new SoundTransition(), []);
  const materials = useMemo(
    () =>
      Object.fromEntries(forms.map((form) => [form, createMaterial(form)])) as Record<
        FormKind,
        ShaderMaterial
      >,
    [],
  );
  const auras = useMemo(
    () =>
      Object.fromEntries(auraForms.map((form) => [form, createMaterial(form, true)])) as Record<
        (typeof auraForms)[number],
        ShaderMaterial
      >,
    [],
  );
  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
      Object.values(auras).forEach((material) => material.dispose());
    },
    [materials, auras],
  );

  useFrame(({ viewport }, delta) => {
    const tracked = tracker.slots[slot];
    if (tracked && tracked.generation !== generation.current) {
      transition.reset();
      generation.current = tracked.generation;
    }
    const state = transition.sample(tracked?.event, delta, reducedMotion);
    const g = group.current!;
    g.visible = !!state;
    if (!state) return;
    const { event, weights } = state;
    g.position.set(...event.position);
    g.position.x *= Math.min(1, viewport.width / 14);
    // More generous silhouettes reveal surface detail without moving their stereo anchors.
    g.scale.setScalar(event.scale * 1.2 * Math.min(1, viewport.width / 7.5));
    const bassWeight = weights.orb + weights.tube;
    if (bassWeight > 0.002) {
      // Keep the lower register near the bottom without clipping the tube or orb.
      const halfHeight = (viewport.height * (10 - event.position[2] - g.scale.x * 0.35)) / 20;
      const radius = g.scale.x * (0.95 + (weights.tube / bassWeight) * 0.95);
      g.position.y += Math.max(0, -halfHeight + radius + 0.22 - g.position.y) * bassWeight;
    }
    for (const form of forms) {
      meshes.current[form]!.visible = weights[form] > 0.002;
      if (meshes.current[form]!.visible)
        updateMaterial(materials[form], state, slot * 1.618, weights[form], reducedMotion);
    }
    for (const form of auraForms) {
      halos.current[form]!.visible = weights[form] > 0.002 && event.glow > 0;
      if (halos.current[form]!.visible)
        updateMaterial(auras[form], state, slot * 1.618, weights[form], reducedMotion);
    }
  });
  return (
    <group ref={group} visible={false}>
      {forms.map((form) => (
        <mesh
          key={form}
          ref={(mesh) => {
            if (mesh) meshes.current[form] = mesh;
          }}
          geometry={geometries[form]}
          material={materials[form]}
          frustumCulled={false}
        />
      ))}
      {auraForms.map((form) => (
        <mesh
          key={`${form}-aura`}
          ref={(mesh) => {
            if (mesh) halos.current[form] = mesh;
          }}
          geometry={form === 'orb' ? geometries.halo : geometries[form]}
          material={auras[form]}
          renderOrder={-1}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

function World({ frame, reducedMotion }: { frame: RefObject<SceneFrame>; reducedMotion: boolean }) {
  const geometries = useMemo(createGeometries, []);
  const tracker = useMemo(() => new SoundTracker(), []);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    // Compile hidden families up front so the first new timbre does not interrupt playback.
    void gl.compileAsync(scene, camera).catch(() => {
      // Context-loss and shader diagnostics are reported by Three; normal rendering can retry.
    });
  }, [gl, scene, camera]);
  useEffect(
    () => () => Object.values(geometries).forEach((geometry) => geometry.dispose()),
    [geometries],
  );
  // Run once before any form updates, not independently in each slot.
  useFrame(() => {
    tracker.update(
      frame.current.audible ? frame.current.events.filter((event) => event.form !== 'polygon') : [],
    );
  }, -1);
  return (
    <>
      <PercussionForms frame={frame} reducedMotion={reducedMotion} />
      {Array.from({ length: 15 }, (_, slot) => (
        <SoundForm
          key={slot}
          slot={slot}
          tracker={tracker}
          geometries={geometries}
          reducedMotion={reducedMotion}
        />
      ))}
    </>
  );
}

export function SynestheticScene({
  frame,
  paused = false,
  reducedMotion = false,
}: {
  frame: RefObject<SceneFrame>;
  paused?: boolean;
  reducedMotion?: boolean;
}) {
  return (
    <Canvas
      aria-label="Synesthetic sound world"
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 10], fov: 48, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor('#000000', 1)}
    >
      <color attach="background" args={['#000000']} />
      <World frame={frame} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
