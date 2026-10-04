import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { FormKind } from '@chromesthesia/core';
import { dyeFlow } from './flow';

const shared = `
uniform float uPhase, uEnergy, uImpulse, uMotion, uGlow, uWeight, uLightness, uSeed;
uniform vec3 uColor;
uniform vec3 uPulseAges, uPulseStrengths;
varying vec3 vNormal, vView;
varying vec2 vUv;
varying float vLane;
const float PI = 3.14159265359;
float bell(float x, float width) { return exp(-x*x*width); }
float musicalPulse(float position) {
  float result=0.0;
  for(int i=0;i<3;i++) {
    float age=uPulseAges[i];
    float envelope=(1.0-exp(-age*55.0))*exp(-age*3.5);
    result+=bell(position-age*1.7,70.0)*uPulseStrengths[i]*envelope;
  }
  return result;
}
`;

const vertex = `
${shared}
${dyeFlow}
float tubeRadius(float u) {
  float cap=min(clamp(u,0.0,1.0),1.0-clamp(u,0.0,1.0))*3.5;
  float radius=0.32+0.055*uEnergy;
  return radius*sqrt(max(0.00001,1.0-pow(max(0.0,1.0-cap/radius),2.0)));
}
vec3 curve(float u, float lane) {
  float t = uPhase;
  #ifdef FORM_TUBE
    return vec3(sin(u*4.5+t*0.6)*0.36*uMotion, (u-0.5)*3.5,
      cos(u*3.8+t*0.5)*0.28*uMotion);
  #endif
  #ifdef FORM_NEON
    vec3 p=dyeCurve(u,lane*1.6,2.4);
    p.y*=0.85;
    return p;
  #endif
  #ifdef FORM_WISP
    return dyeCurve(u,lane,2.45);
  #endif
  #ifdef FORM_FLAME
    vec3 p=dyeCurve(1.0-u,lane,4.8);
    p.y=-p.y;
    return p;
  #endif
  return vec3(0.0);
}
void main() {
  vec3 p, n;
  #ifdef FORM_ORB
    vUv=uv; vLane=0.0;
    float ripple = sin(position.y*5.0-uPhase*8.0)*uImpulse*0.045;
    float squeeze = uImpulse*0.16;
    p = position*(1.0+ripple);
    p *= vec3(1.0+squeeze*0.5, 1.0-squeeze, 1.0+squeeze*0.5);
    n = normalize(normal / vec3(1.0+squeeze*0.5,1.0-squeeze,1.0+squeeze*0.5));
    #ifdef AURA
      p = position;
      n = vec3(0.0,0.0,1.0);
    #endif
  #else
    float u=position.x, v=position.y, lane=position.z;
    vUv=vec2(u,v); vLane=lane;
    vec3 center=curve(u,lane);
    vec3 tangent=normalize(curve(u+0.001,lane)-curve(u-0.001,lane));
    // Keep a well-defined frame even where an eddy turns toward the camera.
    vec3 reference=abs(tangent.z)>0.98?vec3(0.0,1.0,0.0):vec3(0.0,0.0,1.0);
    vec3 side=normalize(cross(tangent,reference));
    vec3 binormal=normalize(cross(side,tangent));
    float taper=pow(max(0.0001,sin(PI*u)),0.38);
    #if defined(FORM_TUBE) || defined(FORM_NEON)
      n=side*cos(v*PI*2.0)+binormal*sin(v*PI*2.0);
      #ifdef FORM_TUBE
        float radius=tubeRadius(u);
        radius *= 1.0+sin(u*7.0-uPhase*7.0)*uImpulse*0.08;
      #else
        float radius=(0.014+flowHash(lane+14.0)*0.016)*taper;
        radius *= 1.0+musicalPulse(u)*uMotion*0.3;
      #endif
      p=center+n*radius;
      #ifdef FORM_TUBE
        n=normalize(n-tangent*(tubeRadius(u+0.001)-tubeRadius(u-0.001))/0.007);
      #endif
      #ifdef AURA
        p=center + side*(v-0.5)*radius*8.0;
        n=vec3(0.0,0.0,1.0);
      #endif
    #else
      float r=flowHash(floor(lane/3.0)+21.0);
      float downstream=u;
      #ifdef FORM_FLAME
        downstream=1.0-u;
      #endif
      float eddy=smoothstep(0.2,0.95,downstream);
      float twist=downstream*(4.0+r*4.0)-uPhase*0.22+r*6.28+mod(lane,3.0)*0.21;
      float billow=0.75+0.25*sin(downstream*(8.0+r*5.0)-uPhase*0.65+r*9.0);
      #ifdef FORM_WISP
        float width=(0.035+eddy*(0.38+r*0.25))*taper*billow;
      #else
        float width=(0.08+eddy*(0.4+r*0.2))*taper*billow;
      #endif
      width*=0.65+flowHash(lane+47.0)*0.6;
      // A continuous sheet orientation avoids a Frenet-frame flip at an inflection.
      vec3 ribbonSide=normalize(vec3(cos(twist),sin(twist*0.7+r)*0.22,sin(twist)));
      n=normalize(cross(tangent,ribbonSide));
      p=center + ribbonSide*(v-0.5)*width*2.0;
      // Rounded cross sections roll the broad plume into a thin trailing edge.
      vec3 foldNormal=vec3(-sin(twist),0.0,cos(twist));
      p+=foldNormal*sin(v*PI)*width*(0.45+eddy*0.45);
      p+=foldNormal*sin(v*PI)*flowNoise(vec2(downstream*8.0-uPhase*0.3,lane))*0.065*taper;
    #endif
  #endif
  vec4 view=modelViewMatrix*vec4(p,1.0);
  vNormal=normalize(normalMatrix*n);
  vView=view.xyz;
  gl_Position=projectionMatrix*view;
}
`;

const fragment = `
${shared}
${dyeFlow}
void main() {
  vec3 n=normalize(vNormal), eye=normalize(-vView);
  if(!gl_FrontFacing) n=-n;
  float facing=abs(dot(n,eye));
  float fresnel=pow(1.0-facing,2.4);
  float energy=0.4+sqrt(uEnergy)*0.6;
  vec3 color=uColor;
  float alpha=uWeight;
  #ifdef AURA
    color=uColor*(0.8+uLightness);
    #ifdef FORM_ORB
      vec2 p=vUv*2.0-1.0;
      alpha*=exp(-dot(p,p)*7.0)*(1.0-smoothstep(0.65,1.0,length(p)))*uGlow*energy*0.5;
    #else
      float edge=1.0-smoothstep(0.3,0.5,abs(vUv.y-0.5));
      alpha*=exp(-pow(vUv.y-0.5,2.0)*28.0)*edge*pow(max(0.0,sin(vUv.x*PI)),0.4)*uGlow*energy*0.17;
    #endif
  #else
    #if defined(FORM_ORB) || defined(FORM_TUBE)
      vec3 key=normalize(vec3(-0.65,0.9,1.4));
      vec3 fill=normalize(vec3(0.9,-0.2,0.5));
      float diffuse=max(0.0,dot(n,key));
      float spec=pow(max(0.0,dot(n,normalize(key+eye))),65.0);
      float softbox=pow(max(0.0,dot(n,normalize(fill+eye))),26.0);
      float silk=0.997+0.003*sin(vUv.x*80.0)*sin(vUv.y*70.0);
      color=uColor*(0.16+diffuse*0.85+fresnel*0.9)*silk*(0.7+uLightness);
      color+=vec3(0.62,0.76,1.0)*spec*0.9 + uColor*softbox*0.45;
      color+=uColor*fresnel*uGlow*0.35;
      color*=energy;
    #endif
    #ifdef FORM_NEON
      float pulse=musicalPulse(vUv.x)*uMotion;
      float core=pow(facing,7.0);
      color=uColor*(0.85+core*0.3+pulse*0.35);
      alpha*=energy*(0.65+core*0.35);
    #endif
    #ifdef FORM_WISP
      float edge=pow(max(0.0,sin(vUv.y*PI)),1.35);
      float ends=pow(max(0.0,sin(vUv.x*PI)),0.5);
      float cloud=flowNoise(vec2(vUv.x*8.0-uPhase*0.4,vUv.y*4.0+vLane*0.3));
      float warp=flowNoise(vec2(vUv.x*4.0-uPhase*0.22,vUv.y*3.0+vLane*0.2));
      float fiber=pow(0.5+0.5*sin(vUv.y*105.0+warp*12.0+vUv.x*8.0),18.0);
      float detail=flowNoise(vec2(vUv.x*19.0-uPhase*0.65,vUv.y*8.0+warp*2.0+vLane));
      float density=smoothstep(-0.65,0.8,cloud+detail*0.3);
      color=uColor*(0.85+fresnel*0.2+fiber*0.08);
      alpha*=edge*ends*(0.08+density*0.48+fiber*0.05+fresnel*0.08)*energy;
    #endif
    #ifdef FORM_FLAME
      float edge=pow(max(0.0,sin(vUv.y*PI)),0.7);
      float ends=pow(max(0.0,sin(vUv.x*PI)),0.55);
      float cloud=flowNoise(vec2(vUv.x*6.0+uPhase*0.4,vUv.y*3.0+vLane*0.3));
      float flame=0.5+cloud*0.5;
      float thread=pow(0.5+0.5*sin(vUv.y*83.0+cloud*9.0+vUv.x*11.0),15.0);
      vec3 spectrum=0.48+0.42*cos(vec3(0.2,2.3,4.4)+vLane*0.43+vUv.x*1.8);
      color=uColor*mix(vec3(1.0),spectrum,0.22);
      color*=0.85+flame*0.25+thread*0.12+fresnel*0.15;
      alpha*=edge*ends*energy*(0.26+flame*0.2);
    #endif
  #endif
  if(alpha<0.002) discard;
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createMaterial(form: FormKind, aura = false) {
  const additive = aura;
  const twoSided = aura || form === 'neon' || form === 'wisp' || form === 'flame';
  return new ShaderMaterial({
    defines: { [`FORM_${form.toUpperCase()}`]: 1, ...(aura ? { AURA: 1 } : {}) },
    uniforms: {
      uPhase: { value: 0 },
      uEnergy: { value: 0 },
      uImpulse: { value: 0 },
      uPulseAges: { value: new Vector3(10, 10, 10) },
      uPulseStrengths: { value: new Vector3() },
      uMotion: { value: 0 },
      uGlow: { value: 0 },
      uWeight: { value: 0 },
      uLightness: { value: 0.5 },
      uSeed: { value: 0 },
      uColor: { value: new Color() },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: twoSided ? DoubleSide : FrontSide,
    // Same-pigment sheets compose in one pass without bleaching overlapping layers.
    forceSinglePass: twoSided,
    blending: additive ? AdditiveBlending : NormalBlending,
    toneMapped: form === 'orb' || form === 'tube',
  });
}
