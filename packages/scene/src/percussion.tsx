import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, ExtrudeGeometry, Mesh, OctahedronGeometry, ShaderMaterial, Shape } from 'three';
import type { PercussionKind, SceneFrame } from '@chromesthesia/core';
import { stereoX } from './spatial';

const kinds = ['kick', 'snare', 'hat'] as const;

function kickShape() {
  const shape = new Shape();
  shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
  return solid(shape, 0.055, 48);
}

/** An original, uneven sunburst: blunt rounded lobes around a substantial center. */
function clapShape() {
  const lengths = [1.01, 0.83, 1.13, 0.91, 1.02, 0.79, 1.1, 0.87, 1.05, 0.94, 1.12, 0.82];
  const points: Array<[number, number]> = [];
  const step = (Math.PI * 2) / lengths.length;
  lengths.forEach((radius, i) => {
    const angle = i * step + Math.sin(i * 2.1) * 0.045;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    const valley = 0.5 + Math.sin(i * 1.7) * 0.045;
    points.push([Math.cos(angle + step * 0.48) * valley, Math.sin(angle + step * 0.48) * valley]);
  });
  const shape = new Shape();
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!;
    const point = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const rounding = i % 2 === 0 ? 0.42 : 0.22;
    const before = [
      point[0] * (1 - rounding) + previous[0] * rounding,
      point[1] * (1 - rounding) + previous[1] * rounding,
    ] as const;
    const after = [
      point[0] * (1 - rounding) + next[0] * rounding,
      point[1] * (1 - rounding) + next[1] * rounding,
    ] as const;
    if (i === 0) shape.moveTo(...before);
    else shape.lineTo(...before);
    shape.quadraticCurveTo(point[0], point[1], ...after);
  }
  shape.closePath();
  return solid(shape, 0.018, 8);
}

function solid(shape: Shape, bevelSize: number, curveSegments: number) {
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: 3,
    steps: 1,
    curveSegments,
  });
  geometry.center();
  return geometry;
}

function material() {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color() }, uEnergy: { value: 1 }, uBlack: { value: 0 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 p=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vView=p.xyz; gl_Position=projectionMatrix*p; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uEnergy; uniform float uBlack;
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec3 n=normalize(vNormal), eye=normalize(-vView), light=normalize(vec3(-0.6,0.9,1.2));
        float diffuse=max(0.0,dot(n,light));
        float spec=pow(max(0.0,dot(n,normalize(light+eye))),42.0);
        float rim=pow(1.0-abs(dot(n,eye)),3.0);
        // Black material is legible through a charcoal reflection and bevel highlights.
        vec3 color=uColor*(0.2+0.65*diffuse)+vec3(spec*0.24+rim*0.055);
        color+=vec3(uBlack*(0.006+0.018*diffuse));
        gl_FragColor=vec4(color*(0.3+0.7*sqrt(uEnergy)),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: true,
  });
}

/** Drums bypass tonal springs/crossfades: each measured attack articulates immediately. */
export function PercussionForms({
  frame,
  reducedMotion,
}: {
  frame: RefObject<SceneFrame>;
  reducedMotion: boolean;
}) {
  const meshes = useRef<Partial<Record<PercussionKind, Mesh>>>({});
  const resources = useMemo(
    () => ({
      kick: { geometry: kickShape(), material: material() },
      snare: { geometry: clapShape(), material: material() },
      hat: { geometry: new OctahedronGeometry(1, 0), material: material() },
    }),
    [],
  );
  useEffect(
    () => () =>
      Object.values(resources).forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      }),
    [resources],
  );
  useFrame(({ viewport }) => {
    for (const kind of kinds) {
      const mesh = meshes.current[kind]!;
      const event = frame.current.audible
        ? frame.current.events.find((event) => event.percussion === kind)
        : undefined;
      mesh.visible = !!event;
      if (!event) continue;
      mesh.position.set(...event.position);
      const response = reducedMotion ? 1 : 0.82 + 0.24 * Math.exp(-event.age * 35);
      const scale = event.scale * response * Math.min(1, viewport.width / 7.5);
      mesh.scale.setScalar(scale);
      mesh.position.x = stereoX(event.position[0], event.position[2], viewport.width, scale * 1.2);
      const halfHeight = (viewport.height * (10 - event.position[2])) / 20;
      const y =
        kind === 'hat' ? halfHeight * Math.min(0.92, event.position[1] / 4.5) : event.position[1];
      mesh.position.y = Math.max(
        -halfHeight + scale * 1.2 + 0.18,
        Math.min(halfHeight - scale * 1.2 - 0.18, y),
      );
      mesh.rotation.set(-0.12, kind === 'hat' ? 0.35 : -0.22, kind === 'snare' ? 0.18 : -0.1);
      if (!reducedMotion)
        mesh.rotation.y +=
          Math.sin(event.age * 22) * Math.exp(-event.age * 22) * event.motion * 0.22;
      const uniforms = resources[kind].material.uniforms;
      (uniforms.uColor!.value as Color).set(event.color);
      uniforms.uEnergy!.value = event.intensity;
      uniforms.uBlack!.value = kind === 'kick' ? 1 : 0;
    }
  });
  return (
    <>
      {kinds.map((kind) => (
        <mesh
          key={kind}
          ref={(mesh) => {
            if (mesh) meshes.current[kind] = mesh;
          }}
          visible={false}
          geometry={resources[kind].geometry}
          material={resources[kind].material}
          frustumCulled={false}
        />
      ))}
    </>
  );
}
