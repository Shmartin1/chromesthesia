import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
  NormalBlending,
  ShaderMaterial,
} from 'three';
import type { FormKind } from '@chromesthesia/core';

const shared = `
uniform float uPhase, uEnergy, uImpulse, uTravel, uMotion, uGlow, uWeight, uLightness, uSeed;
uniform vec3 uColor;
varying vec3 vNormal, vView;
varying vec2 vUv;
varying float vLane;
const float PI = 3.14159265359;
float bell(float x, float width) { return exp(-x*x*width); }
`;

const vertex = `
${shared}
float tubeRadius(float u) {
  float cap=min(clamp(u,0.0,1.0),1.0-clamp(u,0.0,1.0))*3.5;
  float radius=0.32+0.055*uEnergy;
  return radius*sqrt(max(0.00001,1.0-pow(max(0.0,1.0-cap/radius),2.0)));
}
vec3 curve(float u, float lane) {
  float s = sin(PI*u), t = uPhase, seed = uSeed*0.31;
  #ifdef FORM_TUBE
    return vec3(sin(u*4.5+t*0.6)*0.36*uMotion, (u-0.5)*3.5,
      cos(u*3.8+t*0.5)*0.28*uMotion);
  #endif
  #ifdef FORM_NEON
    float angle = u*5.2-2.6;
    return vec3(sin(angle)*1.65 + (lane-2.0)*0.105,
      (u-0.5)*2.35 + (lane-2.0)*0.085 + sin(u*6.2-t)*0.16*uMotion,
      cos(angle)*0.65 + (lane-2.0)*0.07 + sin(u*9.0-t*1.5)*uImpulse*0.08);
  #endif
  #ifdef FORM_WISP
    float angle = u*6.4-t*0.48+seed+(lane-4.0)*0.12;
    float width = 0.52 + s*0.28;
    return vec3(sin(angle)*width + (lane-4.0)*0.10*s,
      (u-0.5)*4.25 + sin(u*5.0-t+lane*0.3)*0.1*uMotion,
      cos(angle)*width*0.7 + (lane-4.0)*0.08);
  #endif
  #ifdef FORM_FLAME
    float spread = (lane-7.0)/7.0;
    return vec3(spread*2.45 + sin(u*5.5-t*0.9+lane*0.6)*0.26*s*uMotion,
      (u-0.5)*(3.5+0.8*cos(lane*0.9)) + sin(lane*1.3)*0.16,
      sin(u*4.4-t*0.6+lane*0.5)*0.4 + spread*spread*0.25);
  #endif
  return vec3(0.0);
}
void main() {
  vec3 p, n;
  #ifdef FORM_ORB
    vUv=uv; vLane=0.0;
    float ripple = sin(position.y*6.0-uTravel*12.0)*uImpulse*0.06;
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
    vec3 side=normalize(cross(tangent,vec3(0.0,0.0,1.0)));
    vec3 binormal=normalize(cross(side,tangent));
    float taper=pow(max(0.0001,sin(PI*u)),0.38);
    #if defined(FORM_TUBE) || defined(FORM_NEON)
      n=side*cos(v*PI*2.0)+binormal*sin(v*PI*2.0);
      #ifdef FORM_TUBE
        float radius=tubeRadius(u);
        radius *= 1.0+sin(u*9.0-uTravel*11.0)*uImpulse*0.10;
      #else
        float radius=(lane==2.0?0.036:0.017)*taper;
        radius *= 1.0+bell(u-uTravel*1.7,80.0)*uImpulse*0.8;
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
      float twist=u*5.0-uPhase*0.35+lane*0.35;
      #ifdef FORM_WISP
        float width=(0.22+sin(u*PI)*0.18)*taper;
      #else
        float width=(0.25+sin(lane*0.7)*0.07)*taper*(1.15-u*0.75);
        twist=u*3.2+sin(lane*0.6)-uPhase*0.2;
      #endif
      vec3 ribbonSide=side*cos(twist)+binormal*sin(twist);
      n=normalize(cross(tangent,ribbonSide));
      p=center + ribbonSide*(v-0.5)*width*2.0;
      p+=n*sin(v*PI)*sin(u*15.0-uPhase*1.2+lane)*0.045*taper*uMotion;
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
      float pulse=bell(vUv.x-uTravel*1.7,100.0)*abs(uImpulse);
      float core=pow(facing,7.0);
      color=mix(uColor,vec3(0.92,0.96,1.0),core*0.34)*(1.05+pulse*1.4);
      alpha*=energy*(0.65+core*0.35);
    #endif
    #ifdef FORM_WISP
      float edge=pow(max(0.0,sin(vUv.y*PI)),0.9);
      float ends=pow(max(0.0,sin(vUv.x*PI)),0.65);
      float fiber=pow(0.5+0.5*sin(vUv.y*95.0+sin(vUv.x*13.0-uPhase)*2.0),14.0);
      float fold=0.5+0.5*sin(vUv.x*15.0-uPhase*1.3+vLane*0.7);
      color=mix(uColor,vec3(0.95,0.96,1.0),0.14+fresnel*0.35);
      color*=0.65+fresnel*0.7+fiber*0.22;
      alpha*=edge*ends*(0.12+fold*0.12+fresnel*0.22)*energy;
    #endif
    #ifdef FORM_FLAME
      float edge=pow(max(0.0,sin(vUv.y*PI)),0.7);
      float ends=pow(max(0.0,sin(vUv.x*PI)),0.55);
      float flame=0.5+0.5*sin(vUv.x*19.0-uPhase*2.4+vLane*0.65);
      float thread=pow(0.5+0.5*sin(vUv.y*58.0+vUv.x*14.0-uPhase),12.0);
      vec3 spectrum=0.48+0.42*cos(vec3(0.2,2.3,4.4)+vLane*0.43+vUv.x*1.8);
      color=mix(uColor,spectrum,0.78);
      color=mix(color,vec3(1.0,0.91,0.72),pow(1.0-vUv.x,4.0)*0.4);
      color*=1.2+flame*0.6+thread*0.45+fresnel*0.6;
      alpha*=edge*ends*energy*(0.45+flame*0.24);
    #endif
  #endif
  if(alpha<0.002) discard;
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createMaterial(form: FormKind, aura = false) {
  const additive = aura || form === 'neon' || form === 'wisp' || form === 'flame';
  return new ShaderMaterial({
    defines: { [`FORM_${form.toUpperCase()}`]: 1, ...(aura ? { AURA: 1 } : {}) },
    uniforms: {
      uPhase: { value: 0 },
      uEnergy: { value: 0 },
      uImpulse: { value: 0 },
      uTravel: { value: 0 },
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
    side: additive ? DoubleSide : FrontSide,
    blending: additive ? AdditiveBlending : NormalBlending,
    toneMapped: !additive,
  });
}
