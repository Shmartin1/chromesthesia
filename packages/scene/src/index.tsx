import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { SceneFrame, VisualEvent } from '@chromesthesia/core';

const noise = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) { return noise2(p)*0.55 + noise2(p*2.03)*0.28 + noise2(p*4.01)*0.13; }
`;
const planeVertex = `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const atmosphereFragment = `
uniform vec3 uColor;
uniform float uTime, uMotion, uEnergy, uGlow, uLightness, uSeed, uKind;
varying vec2 vUv;
${noise}
void main() {
  vec2 p = vUv*2.0-1.0;
  float t=uTime*uMotion;
  float alpha=0.0;
  vec3 color=uColor;
  if (uKind < 0.5) {
    float radius = length(p);
    alpha=exp(-radius*radius*6.0)*0.32*uGlow;
  } else if (uKind < 1.5) {
    vec2 flow = p*2.6 + vec2(uSeed, -t*0.19);
    float warp=fbm(flow+fbm(flow+t*0.09)*3.0);
    float filament=pow(max(0.0,1.0-abs(sin((p.x+warp*0.9)*13.0+p.y*4.0))),6.0);
    float veil=fbm(vec2(p.x*4.0+warp*2.0,p.y*2.0-t*0.2));
    float edge=pow(max(0.0,1.0-dot(p,p)*0.65),2.0)*(1.0-smoothstep(0.65,1.0,abs(p.x)));
    alpha=(filament*0.46+veil*0.30)*edge;
    color=mix(uColor,vec3(0.95),0.14+0.15*veil);
  } else {
    float warp=fbm(vec2(p.x*3.0+uSeed,p.y*3.0-t*0.8));
    float tongues=fbm(vec2(p.x*7.0+warp*2.0,p.y*2.0-t*0.6));
    float height=1.0-vUv.y;
    float body=smoothstep(0.25,0.8,tongues+height*0.6);
    float edge=(1.0-smoothstep(0.65,1.0,abs(p.x)))*sin(vUv.y*3.14159);
    alpha=body*edge*0.85;
    vec3 rainbow=0.55+0.45*cos(vec3(0.0,2.1,4.2)+p.x*3.6+warp*4.0+uSeed);
    color=mix(uColor,rainbow,0.65)*(0.7+body*0.6);
  }
  alpha *= uEnergy*(0.4+uLightness);
  if(alpha<0.004) discard;
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

function makeMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 0 },
      uEnergy: { value: 0 },
      uGlow: { value: 1 },
      uSeed: { value: 0 },
      uLightness: { value: 0.5 },
      uKind: { value: 0 },
      uColor: { value: new Color() },
    },
    vertexShader: planeVertex,
    fragmentShader: atmosphereFragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}
function updateMaterial(material: ShaderMaterial, event: VisualEvent, time: number, kind = 0) {
  const u = material.uniforms;
  u.uTime!.value = time;
  u.uMotion!.value = event.motion;
  u.uEnergy!.value = event.intensity;
  u.uGlow!.value = event.glow;
  u.uSeed!.value = event.id * 3.17;
  u.uKind!.value = kind;
  u.uLightness!.value = event.lightness;
  (u.uColor!.value as Color).set(event.color);
}
function createGeometries() {
  return {
    orb: new SphereGeometry(0.55, 36, 24),
    tube: new CapsuleGeometry(0.26, 1.35, 8, 24),
    neon: new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(-0.8, -0.4, 0),
        new Vector3(-0.35, 0.15, 0.1),
        new Vector3(0.2, 0.18, -0.1),
        new Vector3(0.7, 0.5, 0),
      ]),
      32,
      0.042,
      8,
      false,
    ),
    plane: new PlaneGeometry(1, 1),
  };
}
function SoundForm({
  id,
  frame,
  geometries,
}: {
  id: number;
  frame: RefObject<SceneFrame>;
  geometries: ReturnType<typeof createGeometries>;
}) {
  const group = useRef<Group>(null);
  const orb = useRef<Mesh>(null),
    tube = useRef<Mesh>(null),
    neon = useRef<Mesh>(null),
    mist = useRef<Mesh>(null),
    halo = useRef<Mesh>(null);
  const materials = useMemo(
    () => ({
      surface: new MeshPhysicalMaterial({
        roughness: 0.3,
        metalness: 0.12,
        clearcoat: 0.9,
        clearcoatRoughness: 0.18,
      }),
      neon: new MeshBasicMaterial({ toneMapped: false }),
      air: makeMaterial(),
      halo: makeMaterial(),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(materials).forEach((material) => material.dispose()),
    [materials],
  );
  useFrame(({ viewport }) => {
    const event = frame.current.events.find((event) => event.id === id);
    const g = group.current!;
    g.visible = !!event;
    if (!event) return;
    g.position.set(...event.position);
    g.position.x *= Math.min(1, viewport.width / 14);
    g.scale.setScalar(event.scale);
    const time = frame.current.time;
    g.rotation.z = event.motion * Math.sin(time * 0.25 + id) * 0.08;
    orb.current!.visible = event.form === 'orb';
    tube.current!.visible = event.form === 'tube';
    neon.current!.visible = event.form === 'neon';
    mist.current!.visible = event.form === 'wisp' || event.form === 'flame';
    halo.current!.visible = event.glow > 0;
    const tubeScale = event.form === 'tube' ? 1.4 : 1;
    halo.current!.scale.set(2.8, 2.8 * tubeScale, 1);
    mist.current!.scale.set(
      event.form === 'flame' ? 3.1 : 2.6,
      event.form === 'flame' ? 2.8 : 3.5,
      1,
    );
    const wobble = Math.sin(time * 5 + id) * event.motion * 0.065;
    orb.current!.scale.set(1 + wobble, 1 - wobble, 1);
    materials.surface.color.set(event.color).multiplyScalar(0.45 + event.lightness);
    materials.surface.emissive.copy(materials.surface.color);
    materials.surface.emissiveIntensity = event.glow * 0.13;
    materials.neon.color.set(event.color).multiplyScalar(0.7 + event.lightness);
    updateMaterial(materials.air, event, time, event.form === 'wisp' ? 1 : 2);
    updateMaterial(materials.halo, event, time);
  });
  return (
    <group ref={group} visible={false}>
      <mesh
        ref={halo}
        geometry={geometries.plane}
        material={materials.halo}
        position={[0, 0, -0.15]}
      />
      <mesh ref={orb} geometry={geometries.orb} material={materials.surface} />
      <mesh
        ref={tube}
        geometry={geometries.tube}
        material={materials.surface}
        rotation={[0.1, 0, 0.45]}
      />
      <mesh ref={neon} geometry={geometries.neon} material={materials.neon} scale={1.45} />
      <mesh ref={mist} geometry={geometries.plane} material={materials.air} />
    </group>
  );
}
function World({ frame }: { frame: RefObject<SceneFrame> }) {
  const geometries = useMemo(createGeometries, []);
  useEffect(
    () => () => Object.values(geometries).forEach((geometry) => geometry.dispose()),
    [geometries],
  );
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[-4, 6, 8]} intensity={3} />
      <directionalLight position={[4, -1, -3]} intensity={1.2} color="#647dff" />
      {Array.from({ length: 15 }, (_, id) => (
        <SoundForm key={id} id={id} frame={frame} geometries={geometries} />
      ))}
    </>
  );
}
export function SynestheticScene({
  frame,
  paused = false,
}: {
  frame: RefObject<SceneFrame>;
  paused?: boolean;
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
      <World frame={frame} />
    </Canvas>
  );
}
